# Hearth — Technical Specification

> Version: 0.1 (Phase 1 draft) · ENUID Labs

---

## 1. Mission

Remove the hardware requirement from software development and AI work. The computer lives in the cloud; the device is just a window. An $80 phone should be a full development and AI workstation.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (Browser PWA)                                           │
│                                                                 │
│   ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐   │
│   │  xterm.js     │  │  Chat pane    │  │  Editor pane     │   │
│   │  (PTY mirror) │  │  (agent UI)   │  │  (CodeMirror 6)  │   │
│   └──────┬────────┘  └──────┬────────┘  └──────────────────┘   │
│          │                  │                                   │
│   WS /pty (binary)   WS /agent (JSON)                          │
└──────────┼──────────────────┼───────────────────────────────────┘
           │                  │
┌──────────▼──────────────────▼───────────────────────────────────┐
│  Control Plane (Node.js / Go)                                   │
│                                                                 │
│   PTY bridge (node-pty)      Agent handler                      │
│   ─────────────────────      ─────────────────────────────────  │
│   spawn /bin/bash            receive message                    │
│   pipe stdin/stdout          → Hermes agent loop                │
│   resize events              → tool dispatch                    │
│                              → stream tokens back               │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
              ┌───────────────────┼────────────────────┐
              │                   │                    │
     ┌────────▼──────┐  ┌─────────▼──────┐  ┌────────▼────────┐
     │  Filesystem   │  │  Shell runner  │  │  Inference API  │
     │  (fs read/    │  │  (exec in ctr) │  │  (vLLM /       │
     │   write)      │  │               │  │   shared pool)  │
     └───────────────┘  └───────────────┘  └─────────────────┘
```

### 2.1 Component Responsibilities

| Component | Technology | Role |
|-----------|-----------|------|
| PWA Client | React 19 + Vite + xterm.js | Browser UI, terminal mirror, chat |
| PTY Bridge | node-pty (Node.js) | Spawn/manage shell sessions |
| Agent Handler | Node.js TypeScript | Route WS messages → agent loop |
| Hermes Agent Loop | TypeScript + OpenAI-compat client | Tool-calling loop over inference |
| Inference Backend | vLLM (Phase 2+) / stub (Phase 1) | Host NousResearch/Hermes model |
| Container Runtime | Docker (dev) → Firecracker/gVisor (prod) | Isolation per session |
| Persistence | Volume mount (dev) → S3/EFS (prod) | Home directory across sessions |

---

## 3. Client (PWA)

### 3.1 Layout

Three-pane layout, collapsible on mobile:

```
┌──────────────┬──────────────────────────────┐
│  Chat pane   │  Terminal                    │
│  (agent UI)  │  (xterm.js, full PTY)        │
│              ├──────────────────────────────│
│              │  Editor (CodeMirror 6)       │
│              │  (Phase 1: optional/hidden)  │
└──────────────┴──────────────────────────────┘
```

On small screens (phone), chat and terminal stack vertically with a tab bar to switch.

### 3.2 PWA Requirements

- `manifest.json` with `display: standalone`
- Service worker (Vite PWA plugin) for offline shell of the UI
- Theme color, icons for home-screen install
- Viewport meta for mobile

### 3.3 Terminal (xterm.js)

- Binary WebSocket to `/pty` — raw PTY bytes, no encoding
- `FitAddon` to resize terminal to container element
- Resize events sent as JSON frame over the same WS: `{"type":"resize","cols":N,"rows":N}`
- `WebLinksAddon` for clickable URLs

### 3.4 Agent Chat

- JSON WebSocket to `/agent`
- Message types:
  - `{type: "user", content: string}` — user turn
  - `{type: "token", content: string}` — streamed assistant token
  - `{type: "tool_call", name: string, args: object}` — tool being executed
  - `{type: "tool_result", name: string, result: string}` — tool output
  - `{type: "done"}` — assistant turn complete
  - `{type: "error", message: string}` — error

---

## 4. Server

### 4.1 PTY Handler

```
POST /sessions        → create session, return session_id
WS   /pty?sid=<id>   → attach PTY
```

On WS connect:
1. Spawn `node-pty` shell (`/bin/bash` or `$SHELL`) with env from session
2. Pipe PTY output → WS as binary frames
3. Pipe WS binary frames → PTY stdin
4. Handle `{"type":"resize","cols":N,"rows":N}` JSON frames specially
5. On WS close: keep PTY alive for reconnect (30 s grace, then kill)

### 4.2 Agent Handler

```
WS /agent?sid=<id>   → agent session
```

On WS message:
1. Parse `{type: "user", content}` turn
2. Append to message history
3. Start Hermes agent loop (section 5)
4. Stream tokens and tool events back over WS
5. Append final assistant message to history

---

## 5. Hermes Agent Loop

Hearth's AI is built on [NousResearch Hermes](https://github.com/NousResearch/hermes-agent), a tool-calling model fine-tuned on function use.

### 5.1 System Prompt

```
You are Hearth, a powerful AI agent running inside a cloud Linux environment.
You can read/write files, run shell commands, and manage the user's workspace.
Always think step by step. Use tools to get real information rather than guessing.
The user's home directory is /home/hearth. You are their pair programmer and operator.
```

### 5.2 Tool Registry (Phase 1)

| Tool | Description |
|------|-------------|
| `fs_read` | Read a file; returns content or error |
| `fs_write` | Write/overwrite a file |
| `fs_list` | List directory contents |
| `shell_run` | Execute shell command, return stdout/stderr/exit |
| `git_status` | Git status in a directory |
| `git_diff` | Git diff (staged or unstaged) |
| `git_commit` | Stage all and commit with message |

### 5.3 Loop Algorithm

```
messages = [system] + history + [new user message]

loop:
  response = inference.chat(messages, tools=TOOLS, stream=true)
  stream tokens to client as {type:"token"}

  if response.finish_reason == "tool_calls":
    for each tool_call in response.tool_calls:
      send {type:"tool_call", name, args} to client
      result = dispatch(tool_call.name, tool_call.args)
      send {type:"tool_result", name, result} to client
      messages.append(tool_result message)
    continue loop

  if response.finish_reason == "stop":
    send {type:"done"}
    break
```

### 5.4 Tool Execution Sandboxing

Phase 1 (dev): tools run in the same process as the server, within the container.

Phase 2+: tools run inside a gVisor-isolated microVM per session. Shell commands are limited to the session's mount namespace. Network access is controlled by policy.

### 5.5 Inference Client

The inference client speaks the OpenAI Chat Completions API (`POST /v1/chat/completions`).

Configuration (env vars):
```
INFERENCE_BASE_URL   = http://localhost:8000/v1   (vLLM endpoint)
INFERENCE_MODEL      = NousResearch/Hermes-3-Llama-3.1-8B
INFERENCE_API_KEY    = none                        (no auth for self-hosted)
```

For Phase 1 development without a running model, set `STUB_INFERENCE=true` to get a deterministic mock response.

---

## 6. GPU / Inference Economics

### 6.1 Shared Pool (Always-On, Phase 1)

- A small cluster of shared vLLM instances hosts Hermes 8B
- All free-tier users share capacity; queuing via request batching in vLLM
- Cost per token is low at 8B scale; shared across all concurrent users
- No GPU cost to the user; covered by Hearth's baseline SaaS margin

### 6.2 Dedicated GPU Pods (Phase 2)

- User triggers `gpu.provision()` from the agent or UI
- A GPU pod (A10G, A100, H100) spins up in <90 s on a Kubernetes cluster
- Pod is leased per-minute; scale-to-zero after idle timeout
- Larger models (70B, 405B) or user's own fine-tuned weights run here
- Revenue model: pass-through GPU cost + margin; no GPU ownership

### 6.3 Cost Model (estimates)

| Tier | Inference | Container | GPU |
|------|-----------|-----------|-----|
| Free | Shared 8B | Always-on 0.5 vCPU, 1 GB | None |
| Pro $20/mo | Shared 8B priority | 2 vCPU, 4 GB | 5 GPU-hrs/mo included |
| GPU on-demand | Same | Same | ~$0.80–3.50/hr depending on GPU |

---

## 7. Security Model

### 7.1 Session Isolation

- Each user gets an isolated Linux container (cgroups, namespaces)
- Phase 1: Docker with resource limits; Phase 2+: Firecracker microVMs
- No network access between containers
- Agent tool execution is always inside the user's own container

### 7.2 Authentication

- Phase 1: JWT-based sessions; tokens passed as `?token=` on WS connect
- Phase 2: Passkey / OAuth (GitHub, Google)

### 7.3 Tool Safety

- `shell_run` uses a configurable timeout (default 30 s)
- `shell_run` enforces a cgroup memory cap
- `fs_write` is scoped to the session home directory (path traversal blocked)
- Dangerous patterns (e.g., `rm -rf /`) are pattern-matched and require confirmation

### 7.4 Network

- TLS everywhere; WebSocket over WSS in production
- PTY traffic is end-to-end between browser and container; server is a relay
- Inference API calls are server-side only; inference keys never reach the browser

---

## 8. Business Model

| Stream | Mechanism |
|--------|----------|
| SaaS subscription | Free / Pro tiers; Pro for power users |
| GPU usage metering | Pass-through + margin on on-demand GPU pods |
| Enterprise / self-host | License + support for on-prem deployments |
| Fine-tuning jobs | Metered GPU time for fine-tuning runs (Phase 3) |

---

## 9. Tech Stack (Full)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Client UI | React 19, Vite 5, TypeScript | |
| PWA | vite-plugin-pwa, Workbox | Offline shell, home-screen install |
| Terminal | @xterm/xterm v5 | With FitAddon, WebLinksAddon |
| Editor | CodeMirror 6 | Phase 1: hidden/optional |
| WebSocket | Native WS API (client), `ws` (server) | |
| PTY | node-pty | Maps WS to OS PTY |
| Server runtime | Node.js 20 + TypeScript | Potential Go rewrite for control plane |
| Inference | vLLM, OpenAI-compat API | |
| Model | NousResearch/Hermes-3-Llama-3.1-8B | Tool-calling fine-tune |
| Container | Docker → Firecracker/gVisor | |
| Orchestration | Kubernetes (Phase 2+) | |
| Storage | Docker volumes → EFS/S3 | |
| Auth | JWT → Passkeys | |
| CI/CD | GitHub Actions | |

---

## 10. Build Phases

### Phase 1 — Code from any device

Deliverables:
- [x] Repository scaffold (this spec, README)
- [ ] PWA client with xterm.js terminal + chat pane
- [ ] Node.js server with PTY WebSocket bridge
- [ ] Hermes agent loop with fs/shell tools
- [ ] Shared inference integration (or stub)
- [ ] Docker Compose dev setup
- [ ] Session management (in-memory, Phase 1)

Definition of done: A developer can open a URL on their phone, get a real Linux shell, and ask the AI agent to write and run a Python script — with zero local setup.

### Phase 2 — GPU from your pocket

- On-demand GPU pod provisioning API
- GPU billing / metering
- Larger model support (70B+)
- Kubernetes-native session scheduling

### Phase 3 — Teams, fine-tuning, self-host

- Multi-user workspaces
- Fine-tuning job runner
- Self-hosted enterprise deployment
- Bring-your-own model

---

## 11. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| PTY latency over WAN | Medium | Delta compression; WebTransport (future) |
| Container escape | Low | gVisor/Firecracker; defense in depth |
| GPU supply / cost | Medium | Multi-provider (RunPod, Lambda, AWS); spot |
| Model quality (8B) | Medium | Hermes fine-tune; RAG for context; upgrade path |
| Mobile browser WS limits | Low | Reconnect + session persistence |
| Cold-start latency | Medium | Keep-warm pool; stream "connecting…" UX |

---

*ENUID Labs — building intelligence that works rather than merely performs.*
