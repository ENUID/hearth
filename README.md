# Hearth

**A cloud terminal for open-source AI.** A real Linux terminal in your browser,
built for genuinely running open-source models and agent CLIs — end to end, with
no local setup.

> An [ENUID Labs](https://github.com/ENUID) product. Built for people.

## The idea

Open-source AI is powerful but a pain to actually use — models to serve, agents to
install, environments to wrangle. Hearth is a real terminal in the cloud where you
just run it: pick a model, install an agent, go. Bring your own weights or keys;
Hearth gives you the machine and the tools.

## What you get

- **A real terminal** — a full Linux shell on a machine that persists. Install
  anything (`pip`, `npm`, `apt`), run editors and TUIs, keep your home directory.
  Works on a phone (installable PWA + on-screen keys, tabs, file upload/download,
  reconnect).
- **Open-source AI, one tap** — run Llama, Qwen, Mistral, Gemma, DeepSeek and more.
  Small models run **free on your device** (WebGPU), chatting right in the panel;
  bigger ones run on a **cloud GPU** — chat with those from the terminal
  (`hearth`, one command) or the **OpenAI-compatible API**. Image / audio /
  video models too.
- **AI agents, one tap** — install Claude Code, Aider, Codex, goose… already wired
  to your model (or your own provider key).
- **Bring your own AI** — Hearth hosts no models of its own. You run open weights,
  or use your own API keys — exactly like on a real computer.
- **Multi-user & secure** — public sign-up, an isolated machine per user, teams,
  rate limiting, token revocation. See **[SECURITY.md](./SECURITY.md)**.

## Run it locally

```bash
npm install && npm run install:all
npm run dev          # client → http://localhost:5173 · bridge → :3001
```

Or the full containerized version (terminal + persistent Linux box):

```bash
docker compose -f docker/docker-compose.yml up --build
```

## Make it public (Render)

The repo ships a Render Blueprint (`render.yaml`): no CLI, works from any
device's browser — including an iPad.

1. [render.com](https://render.com) → **New → Blueprint** → connect this repo
   → pick your branch → **Apply**.
2. Render builds `./Dockerfile` and gives you `https://<name>.onrender.com`,
   auto-redeploying on every push.
3. Auth is on: your generated password is in the service's **Environment** tab
   (`HEARTH_PASSWORD`).

The default is the free plan (sleeps when idle, no persistent disk). For real
persistence, switch to `plan: starter` and uncomment the disk block in
`render.yaml`. Prefer Fly.io (per-workspace Firecracker microVMs, `fly.toml`
is preconfigured)? `fly launch --no-deploy && fly deploy` works too.

For **real cloud AI** (so weak-device users get genuine inference), point
`OLLAMA_HOST` at an ollama server running on a GPU (or RunPod).
Or bring **any OpenAI-compatible server** (llama.cpp, vLLM, LM Studio) with
`HEARTH_MODEL_BACKEND=http` + `HEARTH_MODEL_ENDPOINT`. No GPU anywhere?
`scripts/gpt2-server.py` serves a real open model (GPT-2) on plain CPU —
the whole pipeline runs against genuine weights.
**Read [SECURITY.md](./SECURITY.md) before opening it to the public.**

## Status

Built and verified: the terminal, accounts + per-user isolation, on-device AI,
agents, and the cloud (ollama) serving path. The only things left to actually
launch are a GPU running ollama and a Render (or Fly) account.

## What's in the repo

| Path | What it is |
|------|-----------|
| `client/` | React 19 + Vite PWA — terminal, models/agents panels, login. |
| `server/` | Node bridge — WebSocket ⇄ PTY, accounts, control plane, model runners. |
| `docker/`, `render.yaml`, `fly.toml` | Local container + Render / Fly deploy. |
| `docs/`, `SECURITY.md` | Guides, spec, and the security/threat model. |

## Tech

React 19 + Vite (PWA) · xterm.js · WebSocket · node-pty · Fly machines / Docker / Kubernetes.

---

*Part of ENUID — building intelligence that works rather than merely performs.*
