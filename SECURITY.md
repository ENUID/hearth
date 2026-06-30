# Hearth — Security

Hearth gives people a real shell in the browser. That power is the whole point,
and it's also the thing to secure carefully. This document is the threat model
and the **checklist for running Hearth safely for untrusted users**.

> No system is "unhackable." The goal here is a strong, layered, defensible
> posture, kept current. Treat this as living: review it on every release.

## The one rule that matters most

**A terminal is code execution.** Whoever opens a terminal can run anything the
shell can run. So isolation is not optional — it is the security model.

- **Single user / self-host (just you):** the shell is *your* box. App auth +
  HTTPS + a strong secret is enough.
- **Trusted team:** multi-user accounts isolate each person's *data*
  (workspaces, sessions, files) at the app layer. Terminals still share the host
  OS — fine among people who already trust each other.
- **Untrusted / public users:** app-level isolation is **not** enough. Two
  strangers must never share a host. You **must** run **one container or microVM
  per workspace** so one user's shell cannot touch another's files, processes,
  or network. This is the trust boundary.

Hearth prints a startup warning in multi-user mode to make this explicit.

## Required setup for untrusted multi-tenant

1. **Container/microVM per workspace.** Use the Docker or Kubernetes machine
   provider (`HEARTH_PROVIDER=docker|kubernetes`), or host on **Fly.io**
   (Firecracker microVMs). The PTY for a workspace must exec **inside that
   workspace's container**, never on the host. The in-process `local` provider
   is for development and single-user only.
2. **Resource caps per container:** CPU, memory, PIDs (fork-bomb guard), and
   disk quota via cgroups. Set an idle timeout (scale-to-zero) and a hard
   per-tier quota.
3. **Egress controls:** restrict outbound network from workspaces (no internal
   metadata endpoints, e.g. block 169.254.169.254; allowlist as needed) to limit
   abuse and SSRF.
4. **No shared secrets in the workspace:** the bridge's `HEARTH_JWT_SECRET`,
   Stripe keys, etc. live in the **control plane**, never inside a user
   container.
5. **HTTPS/WSS only.** Terminate TLS at a reverse proxy (Caddy/nginx/Cloudflare)
   or the platform. Tokens and terminal I/O must never travel in plaintext.
   `Strict-Transport-Security` is already sent.

## What Hearth enforces at the app layer (built in)

- **Auth:** HMAC-SHA256 signed tokens; scrypt-hashed passwords; constant-time
  comparisons. The server **refuses to boot** with a weak/default
  `HEARTH_JWT_SECRET` when auth is on (override only with
  `HEARTH_ALLOW_WEAK_SECRET=1` for local dev).
- **Token revocation:** per-user token version. Changing a password or "sign out
  everywhere" invalidates all existing tokens immediately.
- **Per-user / per-team isolation of data:** every request is namespaced by the
  caller's verified identity; a forged team scope falls back to the caller's own
  namespace and cannot reach another tenant's data.
- **Brute-force protection:** rate limiting on `/api/login`, `/api/signup`, and
  password change (per client IP; `trust proxy` honors `X-Forwarded-For`).
- **Hardening headers:** Content-Security-Policy, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS, COOP.
- **Path-traversal guard:** in multi-user mode, file upload/download is confined
  to the workspace home (no `..` or absolute-path escape).
- **Request limits:** JSON body capped; same-origin only (no open CORS).
- **Dependencies:** `npm audit` reports 0 production vulnerabilities; re-run on
  every dependency change.

## Operator checklist (untrusted, production)

- [ ] `HEARTH_MULTIUSER=true`
- [ ] `HEARTH_JWT_SECRET` = `openssl rand -hex 32` (kept out of version control)
- [ ] Container/microVM **per workspace**; PTY execs inside it
- [ ] CPU / memory / PID / disk caps + idle timeout per container
- [ ] Egress restrictions from workspaces (block metadata IP; allowlist)
- [ ] HTTPS/WSS only; HSTS on; valid certificate
- [ ] Reverse proxy sets `X-Forwarded-For`; `HEARTH_TRUST_PROXY` left on
- [ ] `HEARTH_SIGNUPS_OPEN=false` after bootstrapping admins (if invite-only)
- [ ] Persistent volumes for state **and** off-host backups (see below)
- [ ] Log auth events; alert on rate-limit spikes
- [ ] Keep dependencies patched (`npm audit`), rebuild images regularly

## Persistence ("preserved always")

- Session scrollback, accounts, and teams persist under `HEARTH_STATE_DIR`
  (a mounted volume) and survive restarts/redeploys.
- For durability, put that volume on managed/replicated storage **and** take
  regular off-host backups (e.g. snapshot or `restic`/`rclone` to object
  storage). A volume is not a backup.
- User home directories live in their workspace containers; back those up too if
  you promise persistence.

## Reporting a vulnerability

Email the maintainers (ENUID Labs) privately. Please don't open a public issue
for an unfixed vulnerability.
