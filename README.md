# Hearth

**A universal, web-first AI terminal.** Your computer lives in the cloud — with a GPU when you need one — runs open-source AI, and is reachable from *any* device: phone, laptop, tablet, anything with a browser.

> An [ENUID Labs](https://github.com/ENUID) product. Build for people.

---

## Why

There are ~6.8 billion smartphone users but only ~2 billion personal computers. The entire developer and AI world assumes you own a capable laptop. That assumption excludes most of humanity.

Hearth removes the hardware requirement. The computer lives in the cloud; the device is just a window. A cheap phone, a borrowed laptop, a library PC — all become a full development and AI workstation through the browser.

## What it is

- **Shell** — a real, persistent cloud Linux environment, reachable from any device.
- **Agent** — a [Hermes](https://github.com/NousResearch/hermes-agent)-powered AI that operates the environment for you: writes code, runs commands, manages git, deploys, serves models.
- **GPU on demand** — spin up a GPU from any device to run, serve, or fine-tune open-source models; spin it down when idle. Pay for seconds, not hardware.

## Principles

- **Device-agnostic, web-first.** Runs in any modern browser as a PWA. Native wrappers come later.
- **Real, not a toy.** Genuine Linux, persistent filesystem, real packages and git.
- **AI-native.** The agent is a first-class citizen of the terminal.
- **Open and ownable.** Built on open-weight models. Self-hostable for teams and enterprises — data never has to leave their own GPUs.

## Status

🚧 Early development. **Phase 1 vertical slice is scaffolded and runnable.**

### Roadmap

- **Phase 1** — Code from any device with an AI agent (no dedicated GPU). ← *building now*
- **Phase 2** — Spin up a GPU from your pocket (on-demand, scale-to-zero).
- **Phase 3** — Fine-tuning, teams, and self-host.

## Quick Start (dev)

```bash
# 1. Install dependencies
npm run install:all

# 2. Copy env and configure
cp .env.example server/.env
# STUB_INFERENCE=true is the default — no GPU needed to start

# 3. Run server + client in parallel
npm run dev
```

Open `http://localhost:5173` — you'll see a split terminal + chat pane.
The terminal is a real PTY (your local shell). The chat calls the Hermes agent loop (stubbed by default; set `STUB_INFERENCE=false` + `INFERENCE_BASE_URL` to wire a real vLLM endpoint).

### Docker (optional)

```bash
cd docker && docker compose up --build
# server on :3001; point a browser at localhost:5173 (run client separately)
```

## Architecture

```
Browser (PWA)
  xterm.js ──── WS /pty ────  node-pty  ──── /bin/bash
  Chat pane ─── WS /agent ─── agent loop ─── tools (fs, shell, git)
                                    │
                             inference client
                             (vLLM / STUB)
```

Full technical spec: [`docs/hearth-spec.md`](docs/hearth-spec.md)

## Tech

React 19 · Vite 6 PWA · xterm.js v5 · TypeScript · Node.js 20 · node-pty · WebSocket · vLLM · NousResearch/Hermes-3

---

*Part of ENUID — an AI lab building intelligence that works rather than merely performs.*
