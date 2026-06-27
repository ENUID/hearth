# Hearth — Technical Specification

> Version: 0.2 (Phase 1 draft) · ENUID Labs

---

## 1. Mission

Remove the hardware requirement from computing. The computer lives in the cloud; the device is just a window. An $80 phone should be a full Linux workstation through the browser.

## 2. The shape of the product

Hearth is **a cloud terminal**, not an AI chat app. The terminal is the entire interface. Because it's a real shell on a real Linux container, anything that exists on the command line today works — including AI.

**Agents are CLI tools, not a built-in feature.** Hearth ships one agent (`hermes`) preinstalled so there's value on first launch, but it lives on `PATH` like any other command. Users can install other agents (`aider`, etc.) or models (`ollama`) and use them identically. This keeps the platform open and keeps the surface area small: Hearth maintains a terminal, not an opinion about which AI you use.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────┐
│  Client (Browser PWA)                         │
│   ┌────────────────────────────────────────┐ │
│   │  xterm.js — full-screen terminal       │ │
│   └────────────────────────────────────────┘ │
│              │  WS /pty (binary)              │
└──────────────┼─────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────┐
│  Terminal bridge (Node.js)                     │
│   spawn /bin/bash · pipe stdin/stdout · resize │
└──────────────┬─────────────────────────────────┘
               │ PTY
┌──────────────▼─────────────────────────────────┐
│  Container (persistent Linux)                  │
│   bash + toolchain (git, python, node, curl)   │
│   ├── hermes        ← preinstalled CLI agent   │
│   ├── aider / etc.  ← user-installed agents    │
│   └── any CLI / model the user installs        │
│                                                │
│   hermes ──► OpenAI-compatible inference API   │
│             (shared vLLM pool / stub / BYO)    │
└────────────────────────────────────────────────┘
```

The bridge is deliberately thin: it moves bytes between the browser and a PTY. It knows nothing about AI. The agent (`hermes`) runs *inside* the container as a subprocess of the user's shell, and it — not the server — talks to the inference endpoint.

### 3.1 Component Responsibilities

| Component | Technology | Role |
|-----------|-----------|------|
| PWA Client | React 19 + Vite + xterm.js | Full-screen browser terminal |
| Terminal Bridge | Node.js + `node-pty` + `ws` | WebSocket ⇄ PTY; session lifecycle |
| Container | Docker → Firecracker/gVisor | The actual Linux machine |
| `hermes` CLI | Node.js + OpenAI-compat client | Shipped agent; runs in the terminal |
| Inference Backend | vLLM (shared) / stub / BYO | Hosts the model `hermes` calls |
| Persistence | Volume mount (dev) → EFS/S3 | Home directory across sessions |

---

## 4. Client (PWA)

A single full-screen terminal. No chat pane, no editor chrome — the shell is the UI.

- **Terminal:** `@xterm/xterm` with `FitAddon` (resize to viewport) and `WebLinksAddon` (clickable URLs).
- **Transport:** binary WebSocket to `/pty`. Raw PTY bytes in both directions; resize sent as a JSON control frame `{"type":"resize","cols":N,"rows":N}` on the same socket.
- **Reconnect:** auto-reconnect with backoff; the server keeps the PTY alive briefly so a dropped phone connection doesn't kill the session.
- **PWA:** `manifest.json` (`display: standalone`), service worker for the app shell, installable to the home screen, mobile viewport with `viewport-fit=cover`.

---

## 5. Terminal Bridge (Server)

```
GET  /health          → liveness
WS   /pty?sid=<id>    → attach a PTY
```

On WS connect:
1. Look up or create the session's PTY (`node-pty` spawning `$SHELL` / `/bin/bash`).
2. Pipe PTY output → WS as binary frames.
3. Pipe WS binary frames → PTY stdin.
4. Intercept `{"type":"resize",...}` JSON frames and resize the PTY.
5. On WS close: keep the PTY alive for a grace window (reconnect), then reap.

That's the entire server responsibility. No agent logic lives here.

---

## 6. Agents as CLI tools

### 6.1 Model

An agent in Hearth is just a program on `PATH`. It reads a task, does work in the current directory (files, shell, git), and prints results. This is the normal CLI contract, so every existing terminal agent already fits.

### 6.2 The shipped agent: `hermes`

`hermes-cli` is built on [NousResearch Hermes](https://github.com/NousResearch/hermes-agent), a tool-calling fine-tune. It is `npm install -g`'d into the container image so `hermes` is available immediately.

```bash
hermes "write a fastapi hello-world and run it"   # one-shot
hermes                                            # interactive session
echo "summarize README.md" | hermes               # stdin
```

**Tools** (operate relative to the current working directory):

| Tool | Description |
|------|-------------|
| `fs_read` / `fs_write` / `fs_list` | File operations |
| `shell_run` | Execute a shell command (returns stdout+stderr) |
| `git_status` / `git_diff` / `git_commit` | Git operations |

**Loop:**

```
messages = [system] + history
loop (max N):
  stream completion (tools enabled) → print tokens to stdout
  if finish_reason == "tool_calls":
    for each call: run tool, print activity, append result
    continue
  else: append assistant message, return
```

**Inference client** speaks OpenAI Chat Completions (`POST /v1/chat/completions`). Configured by env (`INFERENCE_BASE_URL`, `INFERENCE_MODEL`, `INFERENCE_API_KEY`). `STUB_INFERENCE=true` gives a deterministic mock so the CLI is usable with no model running.

### 6.3 Safety

`shell_run` enforces a timeout and an output cap, and pattern-blocks obviously destructive system-level commands (e.g. `rm -rf /`, `mkfs`, fork bombs). The agent runs with the user's own permissions inside the user's own container — the real isolation boundary is the container itself (section 8), not the agent.

---

## 7. GPU / Inference Economics

### 7.1 Shared pool (Phase 1)

A small cluster of shared vLLM instances hosts Hermes 8B. Free-tier users share capacity via vLLM request batching. Per-token cost at 8B scale is low and amortized across concurrent users; covered by baseline SaaS margin. `hermes` points here by default.

### 7.2 Dedicated GPU pods (Phase 2)

A user spins up a GPU pod (A10G/A100/H100) on demand in <90 s, leased per-minute, scale-to-zero after idle. Larger models (70B/405B) or the user's own weights run here. Revenue = pass-through GPU cost + margin; Hearth owns no GPUs.

### 7.3 Cost model (estimates)

| Tier | Inference | Container | GPU |
|------|-----------|-----------|-----|
| Free | Shared 8B | Always-on 0.5 vCPU / 1 GB | None |
| Pro $20/mo | Shared 8B, priority | 2 vCPU / 4 GB | 5 GPU-hrs/mo included |
| GPU on-demand | — | — | ~$0.80–3.50/hr by GPU |

---

## 8. Security Model

- **Session isolation:** one Linux container per user (cgroups, namespaces); Phase 1 Docker with resource limits, Phase 2+ Firecracker/gVisor microVMs. No inter-container network.
- **The container is the trust boundary.** The agent and any user-installed CLI run inside it with the user's permissions; nothing they do escapes the sandbox.
- **Auth:** Phase 1 JWT passed on WS connect; Phase 2 passkeys / OAuth.
- **Transport:** WSS everywhere. PTY traffic is relayed browser ⇄ container. Inference API keys live in the container/server, never in the browser.

---

## 9. Business Model

| Stream | Mechanism |
|--------|-----------|
| SaaS subscription | Free / Pro tiers |
| GPU metering | Pass-through + margin on on-demand pods |
| Enterprise / self-host | License + support for on-prem |
| Fine-tuning jobs | Metered GPU time (Phase 3) |

---

## 10. Tech Stack

| Layer | Technology |
|-------|-----------|
| Client | React 19, Vite 6, TypeScript |
| PWA | vite-plugin-pwa / Workbox |
| Terminal | @xterm/xterm v5 (+ FitAddon, WebLinksAddon) |
| WebSocket | native WS (client), `ws` (server) |
| PTY | node-pty |
| Server | Node.js 20 + TypeScript (Go control plane later) |
| Agent CLI | Node.js + OpenAI SDK (`hermes`) |
| Inference | vLLM, OpenAI-compatible API |
| Model | NousResearch/Hermes-3-Llama-3.1-8B |
| Container | Docker → Firecracker/gVisor |
| Orchestration | Kubernetes (Phase 2+) |
| Storage | Docker volumes → EFS/S3 |
| Auth | JWT → passkeys |
| CI/CD | GitHub Actions |

---

## 11. Build Phases

### Phase 1 — A real cloud terminal from any device

- [x] Repo scaffold (spec, README)
- [x] PWA client: full-screen xterm.js terminal
- [x] Node terminal bridge: PTY ⇄ WebSocket
- [x] `hermes` CLI agent (fs/shell/git tools) + stub inference
- [x] Docker image with `hermes` preinstalled + Compose
- [ ] Session persistence and auth
- [ ] Hosted shared inference pool

**Done when:** a developer opens a URL on their phone, gets a real Linux shell, and can run `hermes "…"` (or any CLI) to build and run a program — zero local setup.

### Phase 2 — GPU from your pocket

On-demand GPU pod provisioning, metering/billing, larger models, Kubernetes-native scheduling.

### Phase 3 — Teams, fine-tuning, self-host

Multi-user workspaces, fine-tuning job runner, self-hosted enterprise deployments, bring-your-own model.

---

## 12. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| PTY latency over WAN | Medium | Delta updates; WebTransport later |
| Container escape | Low | gVisor/Firecracker; defense in depth |
| GPU supply / cost | Medium | Multi-provider (RunPod, Lambda, AWS); spot |
| 8B model quality | Medium | Hermes fine-tune; RAG; easy upgrade path; BYO model |
| Mobile browser WS limits | Low | Reconnect + session persistence |
| Cold-start latency | Medium | Keep-warm pool; "connecting…" UX |

---

*ENUID Labs — building intelligence that works rather than merely performs.*
