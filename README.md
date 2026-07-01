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

## Make it public (Fly.io)

A terminal is code execution, so each user needs their own isolated machine. Fly.io
gives every workspace its own Firecracker **microVM** (a serverless host can't do
this). `fly.toml` is preconfigured for multi-user + a machine per workspace.

```bash
fly launch --no-deploy
fly secrets set HEARTH_JWT_SECRET=$(openssl rand -hex 32) FLY_API_TOKEN=$(fly auth token)
fly volumes create hearth_state --size 3
fly deploy
```

For **real cloud AI** (so weak-device users get genuine inference), point
`OLLAMA_HOST` at an ollama server running on a GPU (a Fly GPU machine or RunPod).
**Read [SECURITY.md](./SECURITY.md) before opening it to the public.**

## Status

Built and verified: the terminal, accounts + per-user isolation, on-device AI,
agents, and the cloud (ollama) serving path. The only things left to actually
launch are a GPU running ollama and your Fly account.

## What's in the repo

| Path | What it is |
|------|-----------|
| `client/` | React 19 + Vite PWA — terminal, models/agents panels, login. |
| `server/` | Node bridge — WebSocket ⇄ PTY, accounts, control plane, model runners. |
| `docker/`, `fly.toml` | Local container + Fly deploy. |
| `docs/`, `SECURITY.md` | Guides, spec, and the security/threat model. |

## Tech

React 19 + Vite (PWA) · xterm.js · WebSocket · node-pty · Fly machines / Docker / Kubernetes.

---

*Part of ENUID — building intelligence that works rather than merely performs.*
