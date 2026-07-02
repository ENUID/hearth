#!/usr/bin/env python3
"""Serve GPT-2 (OpenAI's original open-source model) on CPU with an
OpenAI-compatible API — no GPU, no gated downloads, no external services.

This is Hearth's zero-dependency proof that the model path is real end to end:
point HEARTH_MODEL_BACKEND=http + HEARTH_MODEL_ENDPOINT at it and the whole
product (models panel -> unified prompt -> streaming into the terminal) runs
against genuine open weights.

Assets (fetch once):
  mkdir -p ~/.hearth/gpt2 && cd ~/.hearth/gpt2
  # weights: ONNX export of GPT-2 (124M) with LM head, from the ONNX model zoo
  curl -LO https://media.githubusercontent.com/media/onnx/models/main/validated/text/machine_comprehension/gpt-2/model/gpt2-lm-head-10.onnx
  # tokenizer: GPT-2 BPE vocab, bundled in the gpt-3-encoder npm package
  curl -sS https://registry.npmjs.org/gpt-3-encoder/-/gpt-3-encoder-1.1.4.tgz | tar xz --strip 1 package/encoder.json package/vocab.bpe
  pip install onnxruntime numpy regex

Run:
  python3 scripts/gpt2-server.py --assets ~/.hearth/gpt2 --port 8090

Endpoints (OpenAI-compatible subset):
  GET  /v1/models
  POST /v1/chat/completions          (stream + non-stream)
"""
import argparse
import json
import os
import threading
import time
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import onnxruntime as ort
import regex as re

# ---------------------------------------------------------------------------
# GPT-2 byte-pair encoder (the algorithm from OpenAI's released encoder.py)
# ---------------------------------------------------------------------------

PAT = re.compile(r"""'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+""")


@lru_cache()
def bytes_to_unicode():
    bs = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + list(range(ord("®"), ord("ÿ") + 1))
    cs = bs[:]
    n = 0
    for b in range(2**8):
        if b not in bs:
            bs.append(b)
            cs.append(2**8 + n)
            n += 1
    return dict(zip(bs, [chr(c) for c in cs]))


class Encoder:
    def __init__(self, assets: str):
        with open(os.path.join(assets, "encoder.json")) as f:
            self.encoder = json.load(f)
        self.decoder = {v: k for k, v in self.encoder.items()}
        with open(os.path.join(assets, "vocab.bpe"), encoding="utf-8") as f:
            merges = [tuple(l.split()) for l in f.read().split("\n")[1:] if l and not l.startswith("#")]
        self.bpe_ranks = dict(zip(merges, range(len(merges))))
        self.byte_encoder = bytes_to_unicode()
        self.byte_decoder = {v: k for k, v in self.byte_encoder.items()}
        self.cache = {}

    def bpe(self, token):
        if token in self.cache:
            return self.cache[token]
        word = tuple(token)
        pairs = {(word[i], word[i + 1]) for i in range(len(word) - 1)}
        if not pairs:
            return token
        while True:
            bigram = min(pairs, key=lambda p: self.bpe_ranks.get(p, float("inf")))
            if bigram not in self.bpe_ranks:
                break
            first, second = bigram
            new_word, i = [], 0
            while i < len(word):
                try:
                    j = word.index(first, i)
                    new_word.extend(word[i:j])
                    i = j
                except ValueError:
                    new_word.extend(word[i:])
                    break
                if word[i] == first and i < len(word) - 1 and word[i + 1] == second:
                    new_word.append(first + second)
                    i += 2
                else:
                    new_word.append(word[i])
                    i += 1
            word = tuple(new_word)
            if len(word) == 1:
                break
            pairs = {(word[i], word[i + 1]) for i in range(len(word) - 1)}
        out = " ".join(word)
        self.cache[token] = out
        return out

    def encode(self, text):
        ids = []
        for token in PAT.findall(text):
            token = "".join(self.byte_encoder[b] for b in token.encode("utf-8"))
            ids.extend(self.encoder[t] for t in self.bpe(token).split(" "))
        return ids

    def decode(self, ids):
        text = "".join(self.decoder[i] for i in ids)
        return bytearray([self.byte_decoder[c] for c in text]).decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

END_OF_TEXT = 50256
# The ONNX export has no past-KV inputs, so every token re-runs the full
# sequence — cost grows with prompt length. Keep the context tight so CPU
# latency stays interactive (the model supports 1024).
MAX_CONTEXT = 400


class Gpt2:
    def __init__(self, assets: str):
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = os.cpu_count() or 4
        self.session = ort.InferenceSession(os.path.join(assets, "gpt2-lm-head-10.onnx"), opts, providers=["CPUExecutionProvider"])
        self.enc = Encoder(assets)
        self.lock = threading.Lock()  # one generation at a time (CPU box)

    def logits(self, ids):
        x = np.array(ids, dtype=np.int64).reshape(1, 1, -1)
        out = self.session.run(["output1"], {"input1": x})[0]
        return out[0, 0, -1]  # last position, [vocab]

    def generate(self, prompt, max_new=64, temperature=0.8, top_k=40, stops=()):
        """Yield decoded text pieces as tokens are sampled.

        A holdback buffer the length of the longest stop sequence is kept
        un-yielded, so a stop that spans several tokens never leaks its prefix
        into the stream.
        """
        ids = self.enc.encode(prompt)[-MAX_CONTEXT:]
        hold = max((len(s) for s in stops), default=0)
        pending = ""
        first = True
        with self.lock:
            for _ in range(max_new):
                logits = self.logits(ids)
                logits[END_OF_TEXT] -= 10.0  # discourage abrupt end
                if temperature <= 0:
                    tok = int(np.argmax(logits))
                else:
                    logits = logits / temperature
                    top = np.argpartition(logits, -top_k)[-top_k:]
                    probs = np.exp(logits[top] - logits[top].max())
                    probs /= probs.sum()
                    tok = int(np.random.choice(top, p=probs))
                if tok == END_OF_TEXT:
                    break
                ids.append(tok)
                pending += self.enc.decode([tok])
                if first:
                    pending = pending.lstrip()
                hits = [pending.find(s) for s in stops if s in pending]
                if hits:
                    out = pending[: min(hits)]
                    if out:
                        yield out
                    return
                if len(pending) > hold:
                    out, pending = pending[: len(pending) - hold], pending[len(pending) - hold :]
                    if out:
                        first = False
                        yield out
        if pending:
            yield pending


# ---------------------------------------------------------------------------
# OpenAI-compatible HTTP server
# ---------------------------------------------------------------------------

def build_prompt(messages):
    """GPT-2 is a base model — frame the chat as a dialogue transcript.

    Only the last few turns are kept: without past-KV every extra token slows
    every subsequent token, so a short prompt is what keeps CPU chat snappy.
    """
    system = " ".join(m.get("content", "") for m in messages if m.get("role") == "system")
    turns = [m for m in messages if m.get("role") in ("user", "assistant") and m.get("content")][-4:]
    lines = [
        "The following is a conversation with an AI assistant that lives inside a Linux terminal.",
        "The assistant is helpful, brief and factual.",
    ]
    if system:
        lines.append(system[:400])
    lines.append("")
    for m in turns:
        lines.append(("You: " if m["role"] == "user" else "AI: ") + m["content"][:300])
    lines.append("AI:")
    return "\n".join(lines)


class Handler(BaseHTTPRequestHandler):
    model: Gpt2 = None  # set at boot
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print("[gpt2]", fmt % args)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") in ("/v1/models", "/models"):
            self._json(200, {"object": "list", "data": [{"id": "gpt2", "object": "model", "owned_by": "openai (open weights)"}]})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.endswith("/chat/completions"):
            self._json(404, {"error": "not found"})
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0)) or 0) or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "bad json"})
            return
        messages = body.get("messages", [])
        stream = bool(body.get("stream"))
        max_new = min(int(body.get("max_tokens") or 56), 200)
        prompt = build_prompt(messages)
        gen = Handler.model.generate(prompt, max_new=max_new, stops=("\nYou:", "\nAI:", "\n\n\n"))
        rid = f"chatcmpl-gpt2-{int(time.time())}"

        if not stream:
            text = "".join(gen).strip()
            self._json(200, {"id": rid, "object": "chat.completion", "model": "gpt2",
                             "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}]})
            return

        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.end_headers()

        def sse(obj):
            self.wfile.write(b"data: " + json.dumps(obj).encode() + b"\n\n")
            self.wfile.flush()

        try:
            for piece in gen:
                if piece:
                    sse({"id": rid, "object": "chat.completion.chunk", "model": "gpt2",
                         "choices": [{"index": 0, "delta": {"content": piece}, "finish_reason": None}]})
            sse({"id": rid, "object": "chat.completion.chunk", "model": "gpt2",
                 "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]})
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assets", default=os.path.expanduser("~/.hearth/gpt2"), help="dir with gpt2-lm-head-10.onnx + encoder.json + vocab.bpe")
    ap.add_argument("--port", type=int, default=8090)
    args = ap.parse_args()
    print(f"[gpt2] loading model from {args.assets} …")
    Handler.model = Gpt2(args.assets)
    print(f"[gpt2] serving OpenAI-compatible API on http://localhost:{args.port}/v1")
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
