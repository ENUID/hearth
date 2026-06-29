// A curated catalog of CLI coding agents you can install into a Hearth
// workspace with one tap. Hearth is a real terminal, so these are just the
// normal CLI tools — we only smooth over "remember the install incantation".
//
// brain:
//   "local" — speaks OpenAI's API, so it can point at the workspace's own
//             model runner (free, on-device/cloud) out of the box.
//   "byok"  — needs the vendor's own API key (bring your own).
//   "both"  — works either way.
export type AgentBrain = "local" | "byok" | "both";

export interface AgentInfo {
  id: string;
  name: string;
  vendor: string;
  blurb: string;
  /** Shell command that installs the agent. */
  install: string;
  /** Command that launches it once installed. */
  run: string;
  /** Executable name, used to detect whether it's installed (`which <bin>`). */
  bin: string;
  brain: AgentBrain;
  openSource: boolean;
  docs: string;
  /** How it picks up the local model when run in "free model" mode. */
  localNote?: string;
}

export const AGENT_CATALOG: AgentInfo[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    vendor: "Anthropic",
    blurb: "Anthropic's official terminal agent. Best-in-class coding.",
    install: "npm install -g @anthropic-ai/claude-code",
    run: "claude",
    bin: "claude",
    brain: "byok",
    openSource: false,
    docs: "https://docs.claude.com/en/docs/claude-code",
    localNote: "Uses your Anthropic API key (Hearth hosts no AI — bring your own).",
  },
  {
    id: "opencode",
    name: "OpenCode",
    vendor: "SST",
    blurb: "Open-source terminal agent. Works with any OpenAI-compatible model.",
    install: "npm install -g opencode-ai",
    run: "opencode",
    bin: "opencode",
    brain: "both",
    openSource: true,
    docs: "https://opencode.ai",
    localNote: "Point it at your Hearth model endpoint, or bring your own key.",
  },
  {
    id: "aider",
    name: "Aider",
    vendor: "Aider",
    blurb: "Pair-programming in your terminal. Edits files via git.",
    install: "python3 -m pip install -U aider-chat",
    run: "aider",
    bin: "aider",
    brain: "both",
    openSource: true,
    docs: "https://aider.chat",
    localNote: "Reads OPENAI_API_BASE — run it against your free Hearth model.",
  },
  {
    id: "codex",
    name: "Codex CLI",
    vendor: "OpenAI",
    blurb: "OpenAI's open-source terminal coding agent.",
    install: "npm install -g @openai/codex",
    run: "codex",
    bin: "codex",
    brain: "both",
    openSource: true,
    docs: "https://github.com/openai/codex",
    localNote: "Supports OpenAI-compatible providers — your model or your key.",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    vendor: "Google",
    blurb: "Google's open-source terminal agent for Gemini models.",
    install: "npm install -g @google/gemini-cli",
    run: "gemini",
    bin: "gemini",
    brain: "byok",
    openSource: true,
    docs: "https://github.com/google-gemini/gemini-cli",
    localNote: "Uses your Google AI / Gemini API key.",
  },
  {
    id: "goose",
    name: "goose",
    vendor: "Block",
    blurb: "Open-source agent that runs tasks, not just chat.",
    install: "curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash",
    run: "goose session",
    bin: "goose",
    brain: "both",
    openSource: true,
    docs: "https://block.github.io/goose",
    localNote: "Configure an OpenAI-compatible provider pointed at your model.",
  },
];

export function findAgent(id: string): AgentInfo | undefined {
  return AGENT_CATALOG.find((a) => a.id === id);
}
