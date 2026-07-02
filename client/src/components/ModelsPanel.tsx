import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getModels, startModel, stopModel, generateImage, generateSpeech, type ModelsSnapshot, type ModelInfo } from "../lib/api";
import { canRunLocally, webgpuAvailable, LocalEngine, type LocalChatMsg } from "../lib/local-llm";

type ChatMsg = { role: "user" | "assistant"; content: string; streaming?: boolean };
type Local = { model: ModelInfo; engine: LocalEngine; status: "loading" | "ready" | "error"; pct: number; note: string };

const gpuBadge: Record<string, string> = { cpu: "CPU", a10g: "A10G", a100: "A100" };
const CATEGORIES: { key: ModelInfo["category"]; label: string }[] = [
  { key: "chat", label: "Chat / LLM" },
  { key: "image", label: "Image" },
  { key: "audio", label: "Audio · speech · music" },
  { key: "video", label: "Video" },
];

export default function ModelsPanel({ ws, onClose }: { ws: string; onClose: () => void }) {
  const [snap, setSnap] = useState<ModelsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [local, setLocal] = useState<Local | null>(null);
  const [imgPrompt, setImgPrompt] = useState("");
  const [img, setImg] = useState<{ url: string; backend: string; note?: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [audPrompt, setAudPrompt] = useState("");
  const [aud, setAud] = useState<{ url: string; note?: string } | null>(null);
  const [audBusy, setAudBusy] = useState(false);
  const localRef = useRef<Local | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  localRef.current = local;

  const refresh = useCallback(async () => {
    try {
      setSnap(await getModels(ws));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [ws]);

  useEffect(() => {
    refresh();
    const t = setInterval(() => {
      if (!localRef.current) refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [chat, local]);

  const cloud = snap?.running && snap.running.status !== "stopped" ? snap.running : null;
  const running = local ?? cloud;

  // ---- run on device (WebGPU / WebLLM) ----
  async function runLocal(model: ModelInfo) {
    if (!model.mlcId) return;
    const engine = new LocalEngine(model.mlcId);
    const rec: Local = { model, engine, status: "loading", pct: 0, note: "preparing…" };
    setLocal(rec);
    setChat([]);
    try {
      await engine.load((pct, text) => setLocal((p) => (p ? { ...p, pct, note: text } : p)));
      setLocal((p) => (p ? { ...p, status: "ready", note: "" } : p));
    } catch (e) {
      setLocal((p) => (p ? { ...p, status: "error", note: (e as Error).message } : p));
    }
  }

  // ---- run in the cloud (rented GPU / CPU) ----
  async function runCloud(model: ModelInfo) {
    setBusy(true);
    setMsg(model.gpu === "cpu" ? `starting ${model.name}…` : `renting ${gpuBadge[model.gpu]} + starting ${model.name}…`);
    try {
      const r = await startModel(model.id, ws);
      setSnap((s) => (s ? { ...s, running: r.running } : s));
      setChat([]);
      setMsg("");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function genImage(e: FormEvent) {
    e.preventDefault();
    const prompt = imgPrompt.trim();
    if (!prompt || imgBusy) return;
    setImgBusy(true);
    setMsg("");
    try {
      setImg(await generateImage(prompt, ws));
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setImgBusy(false);
    }
  }

  async function genSpeech(e: FormEvent) {
    e.preventDefault();
    const input = audPrompt.trim();
    if (!input || audBusy) return;
    setAudBusy(true);
    setMsg("");
    try {
      setAud(await generateSpeech(input, ws));
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setAudBusy(false);
    }
  }

  async function stop() {
    if (local) {
      await local.engine.unload();
      setLocal(null);
      setChat([]);
      return;
    }
    setBusy(true);
    try {
      const r = await stopModel(ws);
      setSnap((s) => (s ? { ...s, running: r.running } : s));
    } finally {
      setBusy(false);
    }
  }

  // In-panel chat only exists for on-device (WebLLM) models: that's the one
  // case with no other way to reach the model (it runs entirely in this
  // browser tab via WebGPU, nothing server-side to point a terminal at).
  // Cloud/network-reachable models are chat-only from the terminal (`hearth`)
  // or the API — see the hint rendered above when a cloud chat model is running.
  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || local?.status !== "ready") return;
    setInput("");
    const history: ChatMsg[] = [...chat, { role: "user", content: text }];
    setChat([...history, { role: "assistant", content: "", streaming: true }]);
    setBusy(true);
    try {
      let acc = "";
      const onTok = () => setChat([...history, { role: "assistant", content: acc, streaming: true }]);
      const msgs: LocalChatMsg[] = history.map((m) => ({ role: m.role, content: m.content }));
      for await (const tok of local!.engine.chat(msgs)) {
        acc += tok;
        onTok();
      }
      setChat([...history, { role: "assistant", content: acc }]);
    } catch (err) {
      setChat([...history, { role: "assistant", content: `⚠ ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  const endpoint = snap ? `${location.origin}${snap.apiPath}` : "";
  const localReady = local?.status === "ready";
  const runningCat = local ? "chat" : snap?.catalog.find((m) => m.id === cloud?.modelId)?.category ?? "chat";
  const isChat = runningCat === "chat";
  const chatEnabled = isChat && (localReady || (!local && cloud?.status === "running"));

  return (
    <div style={panel}>
      <div style={headerBar}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg)" }}>models</span>
        <span style={{ fontSize: 10, color: "var(--fg-subtle)", marginLeft: 8 }}>
          {webgpuAvailable() ? "device-capable" : "cloud only"}
        </span>
        <button onClick={onClose} style={closeBtn} tabIndex={-1}>✕</button>
      </div>

      {!snap ? (
        <div style={{ padding: 14, color: "var(--fg-muted)" }}>loading…</div>
      ) : !running ? (
        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 2 }}>
            Hearth runs chat models on <b>your device</b> when it can (free + private), and rents a GPU
            only when it must. Image / audio / video serve on a cloud GPU.
          </div>
          {CATEGORIES.map(({ key, label }) => {
            const items = snap.catalog.filter((m) => m.category === key);
            if (!items.length) return null;
            return (
              <div key={key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 6 }}>{label}</div>
                {items.map((m) => {
                  const localOk = canRunLocally(m);
                  return (
                    <div key={m.id} style={card}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, color: "var(--fg)" }}>{m.name}</span>
                        <span style={{ fontSize: 10, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{m.params}</span>
                        <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>{m.family}</span>
                        {localOk && <span style={badge}>on-device</span>}
                        <span style={badge}>{gpuBadge[m.gpu]}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--fg-muted)", margin: "4px 0 8px" }}>{m.blurb}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {localOk && <button disabled={busy} onClick={() => runLocal(m)} style={runBtn}>Run here (free)</button>}
                        <button disabled={busy} onClick={() => runCloud(m)} style={localOk ? secondaryBtn : runBtn}>
                          {m.gpu === "cpu" ? "Run in cloud" : `Run on ${gpuBadge[m.gpu]}`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {msg && <div style={{ fontSize: 12, color: "var(--accent)", padding: "4px 2px" }}>{msg}</div>}
          <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 4, lineHeight: 1.5 }}>
            These are a curated few. Want another? It's your machine — pull any Ollama or
            Hugging Face model in the terminal and serve it yourself.
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={chatEnabled ? "hearth-pulse" : undefined} style={{ color: chatEnabled ? "var(--accent)" : "var(--fg-muted)", fontSize: 8, display: "inline-block" }}>●</span>
              <span style={{ fontWeight: 600 }}>{local ? local.model.name : cloud!.name}</span>
              <span style={badge}>{local ? "on your device" : cloud!.gpu ? gpuBadge[cloud!.gpu] ?? cloud!.gpu : "cloud"}</span>
              <button disabled={busy} onClick={stop} style={{ ...secondaryBtn, marginLeft: "auto", width: "auto", padding: "5px 10px" }}>Stop</button>
            </div>

            {local && local.status === "loading" && (
              <div style={{ marginTop: 8 }}>
                <div style={{ height: 4, background: "var(--bg)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${local.pct}%`, height: "100%", background: "var(--accent)", transition: "width 0.2s" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 4 }}>downloading model to your device… {local.pct}%</div>
              </div>
            )}
            {local && local.status === "error" && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>{local.note}</div>}
            {local && local.status === "ready" && <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 6 }}>running privately on your device — no GPU rented.</div>}

            {!local && cloud!.status === "starting" && <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 6 }}>{msg || "starting…"}</div>}
            {!local && cloud!.status === "running" && snap.backend === "stub" && (
              <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5, color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", padding: "7px 9px" }}>
                <b>demo backend</b> — {cloud!.name} isn't actually loaded on this deployment, so replies
                are placeholders. Real serving activates with <code style={{ fontFamily: "var(--font-mono)" }}>HEARTH_MODEL_BACKEND=ollama</code> (or{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>=http</code> + any OpenAI-compatible server).
              </div>
            )}
            {!local && cloud!.status === "running" && isChat && (
              <div style={{ marginTop: 8 }}>
                <div style={{ background: "var(--accent-soft)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 10px", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--fg)" }}>
                    Chat in your terminal — type <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600 }}>hearth</code>
                  </span>
                  <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 2 }}>the model and the terminal, as one</div>
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>API endpoint</div>
                <div onClick={() => navigator.clipboard?.writeText(endpoint).then(() => setMsg("copied")).catch(() => {})} title="copy"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "6px 8px", marginTop: 4, cursor: "pointer", wordBreak: "break-all" }}>
                  {endpoint}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 4 }}>OpenAI-compatible · token = API key{msg === "copied" ? " · copied ✓" : ""}</div>
              </div>
            )}
            {!local && cloud!.status === "running" && !isChat && (
              <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 6, lineHeight: 1.5 }}>
                Serving on a {gpuBadge[cloud!.gpu ?? "a10g"]} GPU. Generate from your terminal or the
                model's API — {runningCat} models don't have an in-panel chat. The serving stack is
                configured on a real deploy.
              </div>
            )}
          </div>

          {isChat && local ? (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {chat.length === 0 && localReady && <div style={{ color: "var(--fg-subtle)", fontSize: 13 }}>Chat with {local.model.name}.</div>}
                {chat.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} style={{ alignSelf: "flex-end", maxWidth: "90%", background: "var(--accent-soft)", color: "var(--fg)", borderRadius: "var(--radius)", padding: "7px 10px", fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</div>
                  ) : (
                    <div key={i} style={{ color: "var(--fg)", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}{m.streaming && <span style={{ opacity: 0.5 }}>▍</span>}</div>
                  )
                )}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} style={{ borderTop: "1px solid var(--border)", padding: 10, display: "flex", gap: 8 }}>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={localReady ? "Message the model…" : "starting…"} disabled={!localReady || busy}
                  style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--fg)", padding: "8px 10px", fontSize: 13, outline: "none" }} />
                <button type="submit" disabled={!localReady || busy || !input.trim()} style={{ ...runBtn, width: "auto", padding: "8px 12px", opacity: !localReady || busy || !input.trim() ? 0.4 : 1 }}>Send</button>
              </form>
            </>
          ) : isChat ? (
            // Cloud/network chat model: no in-panel box — the header above already
            // has the details (endpoint, hint). This is just the terminal-first callout.
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 26, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>›_</div>
              <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>Open a terminal tab and run</div>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "5px 12px" }}>hearth</code>
            </div>
          ) : runningCat === "image" ? (
            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {img ? (
                <>
                  <img src={img.url} alt="generated" style={{ width: "100%", borderRadius: "var(--radius)", border: "1px solid var(--border)" }} />
                  <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>backend: {img.backend}{img.note ? ` · ${img.note}` : ""}</div>
                </>
              ) : (
                <div style={{ color: "var(--fg-subtle)", fontSize: 13 }}>Describe an image, then Generate. Also available as <code style={{ fontFamily: "var(--font-mono)" }}>POST /v1/images/generations</code>.</div>
              )}
              <form onSubmit={genImage} style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                <input value={imgPrompt} onChange={(e) => setImgPrompt(e.target.value)} placeholder="a fox in a snowy forest…" disabled={imgBusy}
                  style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--fg)", padding: "8px 10px", fontSize: 13, outline: "none" }} />
                <button type="submit" disabled={imgBusy || !imgPrompt.trim()} style={{ ...runBtn, width: "auto", padding: "8px 12px", opacity: imgBusy || !imgPrompt.trim() ? 0.4 : 1 }}>{imgBusy ? "…" : "Generate"}</button>
              </form>
            </div>
          ) : runningCat === "audio" && !/whisper/i.test(cloud!.modelId) ? (
            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {aud ? (
                <>
                  <audio src={aud.url} controls style={{ width: "100%" }} />
                  {aud.note && <div style={{ fontSize: 10, color: "var(--fg-subtle)" }}>{aud.note}</div>}
                </>
              ) : (
                <div style={{ color: "var(--fg-subtle)", fontSize: 13 }}>Type text (or a music prompt), then Generate. Also <code style={{ fontFamily: "var(--font-mono)" }}>POST /v1/audio/speech</code>.</div>
              )}
              <form onSubmit={genSpeech} style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                <input value={audPrompt} onChange={(e) => setAudPrompt(e.target.value)} placeholder="hello from hearth…" disabled={audBusy}
                  style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--fg)", padding: "8px 10px", fontSize: 13, outline: "none" }} />
                <button type="submit" disabled={audBusy || !audPrompt.trim()} style={{ ...runBtn, width: "auto", padding: "8px 12px", opacity: audBusy || !audPrompt.trim() ? 0.4 : 1 }}>{audBusy ? "…" : "Generate"}</button>
              </form>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: 16, color: "var(--fg-muted)", fontSize: 13, lineHeight: 1.6 }}>
              <b style={{ color: "var(--fg)" }}>{cloud!.name}</b> is provisioned. {cloud!.name} produces{" "}
              {runningCat}, so you drive it from the terminal (its CLI / the served HTTP API) rather than a
              chat box.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const panel: React.CSSProperties = { width: 380, maxWidth: "94vw", flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)", background: "var(--bg-elevated)", minHeight: 0 };
const headerBar: React.CSSProperties = { display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--border)" };
const closeBtn: React.CSSProperties = { marginLeft: "auto", background: "transparent", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 14 };
const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", background: "var(--bg)" };
const badge: React.CSSProperties = { fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--fg-muted)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "1px 5px" };
const runBtn: React.CSSProperties = { flex: 1, background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: "var(--radius-sm)", padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { flex: 1, background: "transparent", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
