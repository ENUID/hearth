#!/usr/bin/env node
import * as readline from "readline";
import { runTurn, type Turn } from "./loop";
import { config } from "./inference";

const HELP = `hermes — an AI agent in your terminal

Usage:
  hermes "do something"      Run a single task and exit
  hermes                     Start an interactive session
  echo "task" | hermes       Read the task from stdin

Options:
  -h, --help                 Show this help

Environment:
  STUB_INFERENCE=true        Use a mock model (no endpoint needed)
  INFERENCE_BASE_URL=...      OpenAI-compatible endpoint (default :8000/v1)
  INFERENCE_MODEL=...         Model name (default Hermes-3-Llama-3.1-8B)

This is just one CLI agent. Install others (aider, etc.) and use them the same way.`;

const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function banner() {
  const mode = config.STUB ? "stub" : `${config.MODEL} @ ${config.BASE_URL}`;
  process.stderr.write(dim(`hermes · ${mode}\n`));
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP + "\n");
    return;
  }

  const messages: Turn[] = [];

  // One-shot: prompt from args, or piped stdin
  const inlinePrompt = args.join(" ").trim();
  const piped = inlinePrompt ? "" : await readStdin();
  const oneShot = inlinePrompt || piped;

  if (oneShot) {
    banner();
    messages.push({ role: "user", content: oneShot });
    await runTurn(messages);
    return;
  }

  // Interactive session
  banner();
  process.stderr.write(dim("Interactive mode — Ctrl+C or 'exit' to quit.\n\n"));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () =>
    new Promise<string>((resolve) => rl.question(cyan("you › "), resolve));

  for (;;) {
    const line = (await ask()).trim();
    if (!line) continue;
    if (line === "exit" || line === "quit") break;

    messages.push({ role: "user", content: line });
    try {
      await runTurn(messages);
    } catch (err) {
      process.stderr.write(`\nerror: ${(err as Error).message}\n`);
    }
    process.stdout.write("\n");
  }

  rl.close();
}

main().catch((err) => {
  process.stderr.write(`hermes: ${(err as Error).message}\n`);
  process.exit(1);
});
