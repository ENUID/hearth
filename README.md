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

A complete terminal, not a demo:

- **Full terminal emulation** — 24-bit truecolor, Unicode/emoji/CJK, full-screen TUIs (vim, htop, less), mouse, job control (Ctrl-C/Z/D), 10k scrollback, clickable links, bell.
- **Copy / paste / search** — Ctrl+Shift+C/V, OSC-52 programmatic clipboard, in-terminal search (Ctrl+Shift+F).
- **GPU rendering** — WebGL renderer with automatic fallback.
- **Multiple tabs** — independent concurrent sessions, persisted across reloads.
- **File upload / download** — buttons + drag-and-drop, relative to the shell's live working directory.
- **Reconnect & persistence** — scrollback replays on reconnect and survives a server restart; the home directory persists.
- **Auth** — optional password login (JWT), off by default for local dev.
- **Mobile** — on-screen key bar (Esc/Tab/Ctrl/Alt/arrows), installable PWA.

## What's in this repo

| Path | What it is |
|------|-----------|
| `client/` | React 19 + Vite PWA: xterm.js terminal, tabs, file transfer, login. |
| `server/` | Node.js bridge: WebSocket ⇄ PTY, persistence, auth, file endpoints. |
| `docker/` | The container image (a capable Linux workspace) and Compose setup. |
| `docs/hearth-spec.md` | Full technical spec. |
| `docs/installing-tools.md` | How to install AI agents/CLIs and persist keys. |

## Run it

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

To require a password, set `HEARTH_REQUIRE_AUTH=true`, `HEARTH_PASSWORD`, and `HEARTH_JWT_SECRET` (see `.env.example`).

## Status

🚧 Early development — **Phase 1** is functional end-to-end: browser terminal → WebSocket → persistent Linux container, with tabs, file transfer, auth, and reconnect/persistence. Real shell, real filesystem, install anything.

### Roadmap

- **Phase 1** — A real, fully-capable cloud terminal from any device.
- **Phase 2** — A more powerful machine on demand: scale up CPU/RAM/GPU from your pocket when you need it, scale to zero when you don't.
- **Phase 3** — Teams, multiple workspaces, and self-host.

## Tech

React 19 + Vite (PWA) · xterm.js · WebSocket · node-pty · Docker → Firecracker/gVisor.

---

*Part of ENUID — an AI lab building intelligence that works rather than merely performs.*
