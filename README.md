# Hearth

**A universal cloud terminal.** Open a browser on any device — a $80 phone, a borrowed laptop, a library PC — and get a real Linux terminal running in the cloud. Everything you'd do from a command line, you do from the web.

> An [ENUID Labs](https://github.com/ENUID) product. Build for people.

---

## Why

There are ~6.8 billion smartphone users but only ~2 billion personal computers. Development and AI tooling assume you own a capable machine. That assumption excludes most of humanity.

Hearth removes the hardware requirement. The computer lives in the cloud; your device is just a window to it. The terminal is the whole interface — and through it you can use everything that already exists on the command line today.

## The idea

A terminal in the browser, wired to a persistent Linux container in the cloud. That's it. Because it's a *real* shell, you use it the way you already use a CLI:

```bash
$ python app.py
$ git clone … && cd … && npm install
$ pip install <anything>
$ ollama run llama3
$ hermes "build me a fastapi app and run it"   # ← AI is just a command
$ aider                                         # ← so is any other agent
```

**AI agents are not a special feature — they're CLI tools you run in the terminal.** Hearth ships one (`hermes`) preinstalled so there's something useful on day one, but you can install any other agent and use it exactly the same way. The terminal is the platform; agents are apps on it.

## Principles

- **The terminal is the product.** Not a chat box with a terminal bolted on — a real shell, first.
- **Device-agnostic, web-first.** Runs in any modern browser as a PWA.
- **Real, not a toy.** Genuine Linux, persistent filesystem, real packages and git.
- **Open by default.** Bring any CLI, any agent, any model. Nothing is locked in.

## What's in this repo

| Path | What it is |
|------|-----------|
| `client/` | React 19 + Vite PWA. A full-screen xterm.js terminal over a WebSocket. |
| `server/` | Node.js terminal bridge: WebSocket ⇄ PTY (`node-pty`) in the container. |
| `hermes-cli/` | The `hermes` AI agent as a CLI — preinstalled in the container, run from the terminal. |
| `docker/` | Container image (bridge + toolchain + `hermes`) and Compose setup. |
| `docs/hearth-spec.md` | Full technical spec. |

## Run it

```bash
# 1. install deps for all packages
npm install && npm run install:all

# 2. dev mode (client + terminal bridge with live reload)
npm run dev
# client →  http://localhost:5173
# bridge →  ws://localhost:3001/pty

# try the agent CLI directly (mock model, no endpoint needed):
STUB_INFERENCE=true npm run dev --prefix hermes-cli -- "hello"
```

For the full containerized experience (terminal + `hermes` preinstalled on PATH):

```bash
docker compose -f docker/docker-compose.yml up --build
```

## Status

🚧 Early development — **Phase 1 vertical slice**: browser terminal → WebSocket → persistent container, with `hermes` preinstalled as the first CLI agent. Inference runs in stub mode out of the box; point it at a real Hermes endpoint to go live.

### Roadmap

- **Phase 1** — A real cloud terminal from any device, with CLI agents available inside it.
- **Phase 2** — Spin up a GPU on demand from your pocket (on-demand, scale-to-zero) for heavier models.
- **Phase 3** — Fine-tuning, teams, and self-host.

## Tech

React 19 + Vite (PWA) · xterm.js · WebSocket · node-pty · Docker → Firecracker/gVisor · OpenAI-compatible inference (vLLM) · Hermes.

---

*Part of ENUID — an AI lab building intelligence that works rather than merely performs.*
