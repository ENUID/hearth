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

🚧 Early development. Building the **Phase 1 vertical slice**: PWA terminal → WebSocket → persistent container → Hermes agent (read/write files, run commands) on shared inference.

### Roadmap

- **Phase 1** — Code from any device with an AI agent (no dedicated GPU).
- **Phase 2** — Spin up a GPU from your pocket (on-demand, scale-to-zero).
- **Phase 3** — Fine-tuning, teams, and self-host.

## Tech (planned)

React 19 + Vite (PWA) · xterm.js · WebSocket PTY · Go control plane · Kubernetes · Firecracker/gVisor isolation · vLLM · Hermes.

---

*Part of ENUID — an AI lab building intelligence that works rather than merely performs.*
