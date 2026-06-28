# Running Claude Code & other AI CLIs (and bigger models, GPU, APIs)

Hearth is a normal Linux machine you reach from a browser. You install AI tools
the same way you would on a laptop — and because your home directory persists,
they stay installed. This is the canonical, copy-paste guide.

## Claude Code — step by step

**1. Open Hearth** → you land at a shell prompt in your persistent container.

**2. Install the CLI** (no `sudo`: Hearth sends global npm installs to
`~/.npm-global`, which is on your `PATH` and persists in your home):

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

**3. Authenticate** — pick one:

- **API key** (simplest on a remote box):
  ```bash
  echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
  source ~/.bashrc
  ```
- **Subscription login:** run `claude`; it prints a URL. Open it on any device,
  approve, paste the code back. The login is saved under `~/.claude` (persists).

**4. Use it:**

```bash
cd ~/projects/my-app
claude
```

Identical to running it locally.

## Other AI CLIs (same pattern)

```bash
pipx install aider-chat                       # Aider
npm install -g @google/gemini-cli             # Gemini CLI
npm install -g @openai/codex                  # OpenAI Codex CLI
pipx install llm                              # llm
```

Each reads its own API key from the environment — add it to `~/.bashrc` so it
persists, e.g. `export OPENAI_API_KEY=...`, `export GEMINI_API_KEY=...`.

## "Bigger models" — two different things

Only one of them needs a GPU.

### A) Bigger *cloud* models — no GPU needed, works today

This is just an API key; the heavy compute runs on the provider's servers. Use
Claude (above), or point any OpenAI-compatible tool at a provider — including
open giants like Llama-405B hosted by Together / Groq / OpenRouter / Fireworks:

```bash
export OPENAI_API_KEY="..."
export OPENAI_BASE_URL="https://api.groq.com/openai/v1"   # or any provider
```

### B) Running *open* models *locally* — needs a GPU

- **Today (Phase 1):** the container is CPU-only. Small models work but slowly:
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ollama run llama3.2:1b
  ```
  Large local models aren't practical without a GPU.
- **GPU on demand (Phase 2 — planned, not yet built):** attach a GPU to your
  machine and run vLLM/ollama on real hardware.
- **Bridge for now:** rent a GPU endpoint anywhere and point your CLI at it via
  base URL + key — exactly like any other API.

## Keeping it reproducible ("same as everyone, no problems")

The container image is identical for everyone, and your home directory persists,
so installs and keys stick across sessions and reconnects.

- **Persists:** `npm -g`, `pip --user`, `pipx`, files in `~`, and `~/.bashrc`. ✅
- **Doesn't persist yet:** `sudo apt install` resets on container rebuild (until
  the Phase 2 persistent rootfs). Prefer the user-level managers above, or keep
  an `apt` block in a setup script you re-run.

A one-time setup script makes a fresh box ready in one command:

```bash
cat > ~/setup.sh <<'EOF'
#!/usr/bin/env bash
set -e
npm install -g @anthropic-ai/claude-code
pipx install aider-chat
# add more tools here…
EOF
chmod +x ~/setup.sh && ~/setup.sh
```

Keep secrets (API keys) in `~/.bashrc` — which is private to your home — not in
shared scripts or repos.

## Requirements & gotchas

- **Node / Python:** Node 20 and Python 3 are preinstalled — Claude Code (Node
  18+) and pip/pipx tools work out of the box.
- **Browser-based logins** (OAuth) work even though the box is remote: the CLI
  prints a URL and accepts a pasted code, so no local browser is required.
- **Multiple tabs:** run `claude` in one tab and a dev server in another — each
  tab is its own independent session.
