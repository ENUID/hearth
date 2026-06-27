# Installing AI agents, CLIs, and anything else

Your Hearth workspace is a real Linux machine. You install tools exactly like you
would on any computer — with `pip`, `npm`, `apt` (via `sudo`), or a `curl`
script. This page shows how, and how to make installs and API keys **persist**.

## What persists (and what doesn't)

Your **home directory (`~`) is a persistent volume** — anything under it survives
across sessions and reconnects. So prefer installs that land in your home:

| Method | Lands in | Persists? |
|--------|----------|-----------|
| `pipx install <tool>` | `~/.local` | ✅ yes |
| `pip install --user <pkg>` | `~/.local` | ✅ yes |
| `npm install -g <pkg>` | `~/.npm-global` (preconfigured) | ✅ yes |
| editing `~/.bashrc`, files in `~` | `~` | ✅ yes |
| `sudo apt install <pkg>` | system (`/usr`) | ⚠️ Phase 1: not yet |

> System-level `apt` installs work (you have passwordless `sudo`) but currently
> reset when the container is rebuilt. Persistent system state lands in Phase 2.
> Until then, prefer `pipx` / `npm -g` / `pip --user` for tools you want to keep,
> or re-run your `apt` setup from a script in your home dir.

`~/.local/bin` and `~/.npm-global/bin` are already on your `PATH`.

## Storing API keys

Add them to `~/.bashrc` so every CLI sees them and they persist:

```bash
echo 'export OPENAI_API_KEY="sk-..."'      >> ~/.bashrc
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc
```

(There's a commented placeholder for keys near the top of `~/.bashrc`.)

## Popular AI CLIs

```bash
# Aider — AI pair programmer
pipx install aider-chat

# Claude Code
npm install -g @anthropic-ai/claude-code

# Gemini CLI
npm install -g @google/gemini-cli

# OpenAI Codex CLI
npm install -g @openai/codex

# llm (Simon Willison) — talk to many models, plugin ecosystem
pipx install llm

# shell-gpt
pipx install shell-gpt

# Ollama — run open models locally on your machine
curl -fsSL https://ollama.com/install.sh | sh
ollama run llama3
```

Each tool uses its own config / API key (yours, billed to you). Hearth doesn't
sit in the middle — it's the same as running these on your laptop.

## Languages & everything else

```bash
sudo apt update && sudo apt install -y <package>   # system packages
pipx install <python-cli>                          # python CLIs
npm install -g <node-cli>                           # node CLIs
curl -fsSL <install-script> | sh                    # vendor installers
```

If a tool runs in a terminal, it runs here.
