# Hearth — Technical Specification

> Version: 0.3 (Phase 1 draft) · ENUID Labs

---

## 1. Mission

A real cloud terminal where people genuinely run open-source AI — any model, any agent CLI — end to end, from the browser, with no local setup.

## 2. The shape of the product

Hearth is **a web terminal** — and nothing more. The terminal is the entire interface and the entire product. Behind it is a real, persistent Linux container. Because it's a real shell on a real machine, anything you can do from a command line, you can do here.

**Hearth ships no AI, no agents, no bundled tools beyond a sensible baseline OS toolchain.** Whatever a user wants — an LLM CLI, an API client, a language runtime, a database — they install it and pay for it themselves, exactly as they would on any computer. This keeps the product radically focused: Hearth maintains a terminal and the machine behind it, and has no opinion about what runs on it.

The design goal is **maximum terminal capability**: interactive TUIs (vim, htop), full color, job control, long-running processes, package installation, persistent state — everything a native terminal offers, faithfully, in the browser, on any device.

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
│   bash + baseline toolchain                     │
│   (git, python, node, build tools, curl, vim…) │
│   └── the user installs anything else they want │
└────────────────────────────────────────────────┘
```

The bridge is deliberately thin: it moves bytes between the browser and a PTY and manages session lifecycle. It contains no application logic beyond that.

### 3.1 Component Responsibilities

| Component | Technology | Role |
|-----------|-----------|------|
| PWA Client | React 19 + Vite + xterm.js | Full-screen browser terminal |
| Terminal Bridge | Node.js + `node-pty` + `ws` | WebSocket ⇄ PTY; session lifecycle |
| Container | Docker → Firecracker/gVisor | The actual Linux machine |
| Persistence | Volume mount (dev) → EFS/S3 | Home directory across sessions |

---

## 4. Client (PWA)

A terminal-first UI: a slim header (tabs + file transfer) over a full-screen terminal.

- **Terminal:** `@xterm/xterm` with addons — `FitAddon`, `WebLinksAddon`, `Unicode11Addon` (wide chars), `SearchAddon`, `ClipboardAddon` (OSC-52), and `WebglAddon` (GPU rendering, with feature-detect + guarded fallback). Truecolor theme, 10k scrollback, copy/paste, in-terminal search.
- **Tabs:** each tab is an independent session (`sid`); all stay mounted so their sessions keep running, persisted in `localStorage`.
- **File transfer:** upload (button + drag-drop) and download, targeting the active session's cwd.
- **Auth:** a login screen appears only when the server reports `authRequired`.
- **Transport:** binary WebSocket to `/pty`. Raw PTY bytes in both directions; resize sent as a JSON control frame `{"type":"resize","cols":N,"rows":N}` on the same socket.
- **Reconnect:** auto-reconnect with backoff; the server keeps the PTY alive briefly so a dropped phone connection doesn't kill the session.
- **PWA:** `manifest.json` (`display: standalone`), service worker for the app shell, installable to the home screen, mobile viewport with `viewport-fit=cover`.

### 4.1 Mobile considerations (Phase 1+)

Phones lack the keys a terminal needs. Planned: an accessory key bar (Esc, Tab, Ctrl, arrows, `|`, `/`, `~`), paste integration, and font-size controls — so the terminal is genuinely usable one-handed.

---

## 5. Terminal Bridge (Server)

```
GET  /health                         → liveness
GET  /api/config                     → { authRequired }
POST /api/login                      → { token }            (when auth enabled)
GET  /api/files/download?sid=&path=  → stream a file (cwd-relative)   [auth]
POST /api/files/upload?sid=&name=    → write raw body to cwd          [auth]
POST /api/session/kill?sid=          → end a session (close tab)      [auth]
WS   /pty?sid=<id>                    → attach a PTY                    [auth]
```

On WS connect:
1. Look up or create the session's PTY (`node-pty` spawning `$SHELL` / `/bin/bash`, `TERM=xterm-256color`).
2. Replay the session's scrollback buffer to the new client (current screen).
3. Broadcast PTY output → all attached clients as binary frames; persist scrollback.
4. Pipe client frames → PTY stdin; intercept `{"type":"resize",...}` JSON control frames.
5. On last client disconnect: keep the PTY alive for a grace window (reconnect), then reap.

### 5.1 Sessions & persistence

Each `sid` is an independent session (the basis for tabs). A session's scrollback is broadcast to all its clients and persisted to disk (`HEARTH_STATE_DIR`, default `$HOME/.hearth/sessions`). On reconnect — even after a server restart — the buffer is replayed so the user returns to their screen. The live PTY process can't survive a restart, but the screen contents and the home directory do.

### 5.2 File transfer

Upload/download resolve paths against the session shell's **live working directory** (read from `/proc/<pid>/cwd`, so it follows `cd`). Uploads stream the raw request body into `cwd/<name>`; downloads stream the file as an attachment.

### 5.3 Auth

Auth is disabled by default. When `HEARTH_REQUIRE_AUTH=true` and `HEARTH_PASSWORD` is set, `POST /api/login` exchanges the password for a short HMAC-signed token (JWT-style, no dependency). The token gates the REST API and the WebSocket (via `Authorization: Bearer` or a `?token=` query param for links/sockets).

---

## 6. The Container (the machine)

Each user gets a persistent Linux container — their computer. Hearth provisions it with a sensible baseline:

- `bash` + core GNU utilities, `sudo`
- `git`, `curl`, `wget`, `ssh`, `ca-certificates`
- `python3` + `pip` + `venv` + `pipx`, `node` + `npm`, `build-essential`
- editors and inspectors: `vim`, `nano`, `less`, `htop`, `tree`, `jq`

Everything else — any LLM CLI, any SDK, any language, any service — the user installs with the normal package managers. They have **passwordless `sudo`** (it's their own isolated box), so `apt install` works just like a real machine.

### 6.1 Installing tools, and what persists

The product promise is that adding AI agents/CLIs "just works" and survives. The container is configured so user-level installs land in the **persistent home volume**:

- `NPM_CONFIG_PREFIX=~/.npm-global` — `npm install -g` needs no sudo and persists.
- `~/.local/bin` on `PATH` — `pip install --user` and `pipx` persist.
- `~/.bashrc` (seeded on first run) is the place for API keys (`export …`), which persist across sessions.

An entrypoint seeds dotfiles and these directories on first launch (the home volume starts empty and would otherwise shadow the image's `/etc/skel`).

System-level `apt` installs work but are not yet persistent (the rootfs is rebuilt); **persistent system state is a Phase 2 item** (overlay / committable rootfs). Until then, tools installed via `pipx` / `npm -g` / `pip --user` persist. See `docs/installing-tools.md`.

---

## 7. Compute Economics

Hearth sells **the computer**, not what runs on it. Costs and pricing track compute, storage, and bandwidth — never third-party AI usage (users bring their own keys and pay their providers directly).

### 7.1 Idle-to-zero containers

Free and low-tier containers sleep when idle and wake on connect. This keeps the marginal cost of an inactive user near zero, which is what makes a free tier sustainable.

### 7.2 More machine on demand (Phase 2)

A user can scale their machine up — more CPU/RAM, or a GPU — when they need it, and back down (to zero) when they don't. GPU pods are leased per-minute from providers; Hearth passes the cost through with margin. This is about giving the *user's* terminal more horsepower (so they can run their own heavy workloads or models), not about Hearth providing inference.

### 7.3 Indicative pricing

| Tier | Machine | Notes |
|------|---------|-------|
| Free | Small, idle-to-zero (e.g. 0.5 vCPU / 1 GB) | Sleeps when idle |
| Pro | Always-on, larger (e.g. 2 vCPU / 4 GB) | Persistent, priority wake |
| On-demand GPU | Add a GPU per-minute | Pass-through + margin (Phase 2) |

---

## 8. Security Model

- **Session isolation:** one Linux container per user (cgroups, namespaces); Phase 1 Docker with resource limits, Phase 2+ Firecracker/gVisor microVMs. No inter-container network.
- **The container is the trust boundary.** The user has root (`sudo`) *inside* their own container by design — it's their machine. Isolation is enforced at the container boundary (cgroups/namespaces, microVM in Phase 2+), not by restricting what they can do within it. Resource caps and egress limits guard against abuse.
- **Auth:** optional in Phase 1 — a password is exchanged for an HMAC-signed token that gates the API and WS. Phase 2: passkeys / OAuth, multi-user accounts.
- **Transport:** WSS everywhere. PTY traffic is relayed browser ⇄ container. Any keys a user stores live in *their* container, never in Hearth's control plane.

---

## 9. Business Model

Hearth monetizes compute and hosting — the cloud computer itself:

| Stream | Mechanism |
|--------|-----------|
| Subscription | Free (idle-to-zero) / Pro (always-on, bigger machine) |
| Compute metering | On-demand CPU/RAM/GPU scale-up, pass-through + margin |
| Storage | Larger / faster persistent volumes |
| Teams | Per-seat workspaces (Phase 3) |
| Self-host / enterprise | License + support for on-prem (Phase 3) |

Users pay their *own* AI/API providers directly — that cost never touches Hearth's books.

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
| Container | Docker → Firecracker/gVisor |
| Orchestration | Kubernetes (Phase 2+) |
| Storage | Docker volumes → EFS/S3 |
| Auth | JWT → passkeys |
| CI/CD | GitHub Actions |

---

## 11. Build Phases

### Phase 1 — A real, fully-capable cloud terminal from any device

- [x] Repo scaffold (spec, README)
- [x] PWA client: full-screen xterm.js terminal
- [x] Node terminal bridge: PTY ⇄ WebSocket, resize, reconnect grace
- [x] Docker image: capable Linux workspace + bridge
- [x] Install-friendly machine: `sudo`, persistent user-level install paths, seeded dotfiles, tool/key recipes
- [x] Full terminal capabilities: truecolor, unicode, TUIs, copy/paste, search, GPU rendering
- [x] Mobile key bar + paste/clipboard
- [x] Multiple tabs / concurrent sessions
- [x] File upload / download (relative to the shell's live cwd)
- [x] Session persistence (scrollback replay across reconnect and restart)
- [x] Optional password auth (JWT)

**Done when:** a developer opens a URL on their phone, gets a real Linux shell, installs whatever they want, and works — with zero local setup.

### Phase 2 — More machine on demand

- [x] Control plane: machine lifecycle (provision → run → sleep → wake) behind a provider interface
- [x] Resize CPU/RAM tiers; provision/release a GPU on demand
- [x] Scale-to-zero on idle, wake on activity (tied to terminal use)
- [x] Usage metering (compute + GPU minutes/cost) and an itemized invoice
- [x] Providers: Local (built + tested), Docker, Kubernetes (real adapters)
- [x] Billing: Stripe test-mode adapter (+ simulated fallback)
- [x] Kubernetes manifests (control plane, RBAC, GPU node template)
- [x] **Persistent system rootfs**: Docker provider commits the rootfs on
      scale-to-zero and recreates from it, so `apt`-installed software survives
- [x] Real GPU backend: GPU is a separate rent-don't-own resource (`gpu.ts`) —
      a mock by default, real **RunPod** on-demand pods when `RUNPOD_API_KEY` is set

#### 11.1 Control plane design

The control plane manages **machines** (one workspace machine backs a user's
terminal tabs) through a `MachineProvider` interface, so the backend is
swappable: `LocalProvider` (in-process, the verified default), `DockerProvider`
(containers with CPU/mem limits, `docker update` resize, stop=scale-to-zero,
`commit` for rootfs), `KubernetesProvider` (a Deployment per machine, PVC home,
`replicas 0↔1` = sleep/wake, `nvidia.com/gpu` for GPUs).

State machine: `provisioning → running → asleep ⇄ waking`. Idle machines sleep
(releasing any GPU to stop billing); the next terminal connection wakes them.
Metering accrues compute-minutes (by tier rate) and GPU-minutes (by GPU rate)
into an invoice; `Billing` is a Stripe (test-mode) adapter or a simulated
fallback. API: `GET /api/machine`, `POST /api/machine/{resize,wake,sleep,gpu}`,
`DELETE /api/machine/gpu`, `GET /api/usage`, `POST /api/billing/charge`.

### Phase 3 — Teams, workspaces, self-host

- [x] Multiple workspaces: each workspace is its own machine + tabs + persistent
      home, switchable in the UI. Sessions are namespaced `<workspace>__<tab>`;
      the control plane keys a machine per workspace; billing aggregates across them.
- [x] One-click open-model runner: catalog → run (provision GPU + serve) →
      chat + OpenAI-compatible endpoint. Backends: stub (default, verified) and
      ollama; ties into the GPU control plane and metering.
- [ ] Multi-user accounts and teams (shared workspaces, roles)
- [ ] Self-host packaging polish (one-command deploy, org settings)

#### 11.2 Open-model runner (the open-AI front door)

A thin layer above the terminal that makes Hearth the place to *use* open models:
a curated **catalog** (`models/catalog.ts`), a **runner** (`StubRunner` /
`OllamaRunner`), and a per-workspace **model manager**. Running a model
provisions its GPU via the control plane (CPU models skip the GPU), serves it,
and exposes `POST /api/models/v1/chat/completions` — an OpenAI-compatible
endpoint clients can point any tool at (token = API key). Stop releases the GPU.
This is the monetizable wedge: people pay for the GPU minutes the model uses.

**The unified prompt — terminal and AI as one interface.** The client has a
single input dock (`CommandBar.tsx`): type a shell command and it runs in the
PTY; type plain language and the AI's reply streams as styled ANSI text *into
the terminal scrollback itself* — commands, output, and conversation are one
stream, not two windows. Mode is detected live as you type (Tab overrides).
The AI reads the last lines of the terminal screen as context, so "why did
that fail?" works; when a reply contains a command, a one-tap ▶ run chip
executes it in the same terminal. The `hearth` CLI (`bin/hearth`) is the same
loop for pure-terminal users, against the same
`/api/models/v1/chat/completions` endpoint.

---

## 12. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| PTY latency over WAN | Medium | Delta updates; WebTransport later |
| Container escape | Low | gVisor/Firecracker; defense in depth |
| Mobile terminal usability | Medium | Accessory key bar; paste integration; font controls |
| Mobile browser WS limits | Low | Reconnect + session persistence |
| Cold-start latency | Medium | Keep-warm pool; "waking…" UX |
| Abuse (crypto mining, etc.) | Medium | Resource caps; egress limits; per-tier quotas |

---

*ENUID Labs — building intelligence that works rather than merely performs.*
