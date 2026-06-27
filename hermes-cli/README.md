# @hearth/hermes-cli

Hermes as a command-line agent. It reads/writes files, runs shell commands, and
uses git — all in your current directory. It's a normal CLI: you run it inside a
terminal, exactly like `git` or `aider`.

In Hearth, this comes preinstalled in the cloud container so it's available the
moment you open the web terminal. But it's just one agent — install any other
CLI agent and use it the same way.

## Usage

```bash
hermes "write a fastapi hello-world and run it"   # one-shot task
hermes                                            # interactive session
echo "summarize README.md" | hermes               # read task from stdin
hermes --help
```

## Configuration (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `STUB_INFERENCE` | `false` | `true` = use a mock model, no endpoint required |
| `INFERENCE_BASE_URL` | `http://localhost:8000/v1` | OpenAI-compatible endpoint |
| `INFERENCE_MODEL` | `NousResearch/Hermes-3-Llama-3.1-8B` | Model name |
| `INFERENCE_API_KEY` | `none` | API key if your endpoint needs one |

## Develop

```bash
npm install
STUB_INFERENCE=true npm run dev -- "hello"
npm run build      # emits dist/cli.js (the `hermes` binary)
```
