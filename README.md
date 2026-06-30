# Hearth

**A universal web terminal.** Open a browser on any device — a $80 phone, a borrowed laptop, a library PC — and get a real, full Linux terminal running in the cloud. Everything a terminal can do, you do from the web.

> An [ENUID Labs](https://github.com/ENUID) product. Build for people.

---

## Why

There are ~6.8 billion smartphone users but only ~2 billion personal computers. Real computing — development, command-line tools, AI CLIs — assumes you own a capable machine. That assumption excludes most of humanity.

Hearth removes the hardware requirement. The computer lives in the cloud; your device is just a window to it.

## What Hearth is (and isn't)

Hearth is **just the terminal** — the best, most complete web terminal we can build, backed by a real persistent Linux machine. That's the whole product.

It is **not** an AI app, a chat tool, or a curated bundle. It doesn't ship models, agents, or opinions about what you should run. Whatever you want — any LLM CLI, any API, any language, any tool — you install it and pay for it yourself, exactly like you would on your own computer:

```bash
$ pip install aider-chat        # bring any AI CLI you like
$ npm i -g @anthropic-ai/claude-code
$ curl https://api.openai.com/… # use any API with your own key
$ ollama run llama3             # run a model yourself
$ git clone … && cargo build    # or just… do normal computer things
```

Hearth gives you the computer and the terminal. What runs on it is entirely yours. You get `sudo`, the usual package managers, and a home directory that persists — so installing AI agents/CLIs (and their API keys) works just like on a real machine. See **[docs/installing-tools.md](docs/installing-tools.md)** for copy-paste recipes (aider, Claude Code, Gemini CLI, ollama, …).

## Principles

- **Just the terminal.** A real shell on a real Linux box. Nothing bundled, nothing in the way.
- **Maximally capable.** Whatever a Linux terminal can do — interactive programs, colors, editors, long-running processes, package installs — works here.
- **Device-agnostic, web-first.** Runs in any modern browser as an installable PWA.
- **Yours.** Persistent filesystem, your tools, your keys, your bill. We don't sit between you and what you run.

## Features

- **Run open-source models in one tap** — pick a model (Llama, Qwen, Mistral, Gemma, DeepSeek…); Hearth rents the GPU, serves it, and gives you a **chat UI + an OpenAI-compatible API endpoint**. The terminal is the power layer underneath.

A complete terminal, not a demo:

- **Full terminal emulation** — 24-bit truecolor, Unicode/emoji/CJK, full-screen TUIs (vim, htop, less), mouse, job control (Ctrl-C/Z/D), 10k scrollback, clickable links, bell.
- **Copy / paste / search** — Ctrl+Shift+C/V, OSC-52 programmatic clipboard, in-terminal search (Ctrl+Shift+F).
- **GPU rendering** — WebGL renderer with automatic fallback.
- **Multiple tabs** — independent concurrent sessions, persisted across reloads.
- **File upload / download** — buttons + drag-and-drop, relative to the shell's live working directory.
- **Reconnect & persistence** — scrollback replays on reconnect and survives a server restart; the home directory persists.
- **Auth** — optional password login (JWT), off by default for local dev.
- **Mobile** — on-screen key bar (Esc/Tab/Ctrl/Alt/arrows), installable PWA.
- **Machine control (Phase 2)** — resize CPU/RAM tiers, provision/release a GPU on demand, scale-to-zero when idle (wake on use), live usage metering and cost, optional Stripe billing. Pluggable backends: local (dev), Docker, Kubernetes.

## What's in this repo

| Path | What it is |
|------|-----------|
| `client/` | React 19 + Vite PWA: xterm.js terminal, tabs, file transfer, login. |
| `server/` | Node.js bridge: WebSocket ⇄ PTY, persistence, auth, file endpoints. |
| `docker/` | The container image (a capable Linux workspace) and Compose setup. |
| `deploy/k8s/` | Kubernetes manifests for production (control plane + GPU nodes). |
| `docs/hearth-spec.md` | Full technical spec. |
| `docs/installing-tools.md` | How to install AI agents/CLIs and persist keys. |
| `docs/running-ai-clis.md` | Step-by-step: Claude Code, bigger models, GPU, APIs. |

## Run it

### Fastest: GitHub Codespaces (works on a phone/iPad)

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/ENUID/hearth)

Open **https://codespaces.new/ENUID/hearth** (signed in to GitHub). The devcontainer
installs, builds, and starts Hearth automatically on port **8080** and forwards it —
the preview URL (`https://…-8080.app.github.dev`) opens in your browser, including on
iPad. No local setup. (Private repo → uses your Codespaces quota.)

**Live preview that auto-updates on every push** — in the Codespace terminal:

```bash
npm run autopreview
```

This builds, serves on port 8080, and then watches the repo: whenever new commits
are pushed it auto-pulls, rebuilds, and restarts — just refresh the tab to see
changes. To expose it publicly (Ports tab → Port Visibility → Public), set a
password first:

```bash
HEARTH_REQUIRE_AUTH=true HEARTH_PASSWORD=secret HEARTH_JWT_SECRET=$(openssl rand -hex 16) npm run autopreview
```

### Local

```bash
# install deps for both packages
npm install && npm run install:all

# dev mode (client + terminal bridge with live reload)
npm run dev
# client →  http://localhost:5173
# bridge →  ws://localhost:3001/pty
```

For the full containerized experience (terminal + persistent Linux workspace):

```bash
docker compose -f docker/docker-compose.yml up --build
```

### Deploy for the public — Fly.io (a microVM per user)

Hearth is a long-lived WebSocket/PTY server, and a terminal is code execution —
so it needs a **container host that gives each user their own isolated machine**,
not a serverless platform (Vercel/Netlify can't hold the WebSocket, and Render
can't isolate strangers). **Fly.io** is the one target: it gives every workspace
its own persistent, OS-isolated Firecracker **microVM**.

```bash
fly launch --no-deploy        # creates the app (pick a name + region)
fly secrets set HEARTH_JWT_SECRET=$(openssl rand -hex 32) FLY_API_TOKEN=$(fly auth token)
fly volumes create hearth_state --size 3
fly deploy                    # uses fly.toml
```

`fly.toml` ships with `HEARTH_MULTIUSER=true` (anyone signs up / signs in to
their own isolated workspaces + teams), `HEARTH_PROVIDER=fly` (a machine per
workspace), and `HEARTH_SHELL_CMD` (the terminal execs *inside* that machine).
**Read [SECURITY.md](./SECURITY.md) first** — it's the threat model and the full
operator checklist (resource caps, egress, TLS, backups, closing signups).

> Just hacking on it yourself? `docker compose -f docker/docker-compose.yml up`
> (see `.env.example`) runs the whole thing locally on one machine.

## Status

🚧 Early development — **Phase 1** is functional end-to-end: browser terminal → WebSocket → persistent Linux container, with tabs, file transfer, auth, and reconnect/persistence. Real shell, real filesystem, install anything.

### Roadmap

- **Phase 1** ✅ — A real, fully-capable cloud terminal from any device.
- **Phase 2** ✅ (control plane) — Resize CPU/RAM/GPU on demand, scale-to-zero, metering + billing. Local backend is built and tested; Docker/Kubernetes/Stripe are real adapters that activate with the matching environment/credentials.
- **Phase 3** ✅ — Multiple workspaces (each its own machine, tabs, and home);
  multi-user accounts with per-user isolation; teams with shared workspaces +
  roles; one-command self-host with instance/org settings. Open-model runner is
  multi-modal (chat · image · audio · video); chat runs on-device or cloud,
  other modalities provision a GPU (per-modality serving stack is
  deploy-configured).

## Tech

React 19 + Vite (PWA) · xterm.js · WebSocket · node-pty · Docker → Firecracker/gVisor.

---

*Part of ENUID — an AI lab building intelligence that works rather than merely performs.*
