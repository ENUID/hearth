import { readFile, writeFile, readdir, stat, mkdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

// The CLI runs inside the user's own terminal session, so it operates relative
// to the current working directory — just like any other command-line tool.
function resolve(p: string): string {
  return path.resolve(process.cwd(), p);
}

async function fsRead(args: { path: string }): Promise<string> {
  return readFile(resolve(args.path), "utf8");
}

async function fsWrite(args: { path: string; content: string }): Promise<string> {
  const target = resolve(args.path);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, args.content, "utf8");
  return `Wrote ${args.content.length} bytes to ${args.path}`;
}

async function fsList(args: { path?: string }): Promise<string> {
  const dir = resolve(args.path ?? ".");
  const entries = await readdir(dir, { withFileTypes: true });
  const lines = await Promise.all(
    entries.map(async (e) => {
      const s = await stat(path.join(dir, e.name)).catch(() => null);
      const size = s ? `${s.size}` : "?";
      const suffix = e.isDirectory() ? "/" : "";
      return `${e.isDirectory() ? "d" : "-"} ${size.padStart(8)} ${e.name}${suffix}`;
    })
  );
  return lines.join("\n") || "(empty)";
}

const TIMEOUT_MS = 60_000;
const DANGEROUS = /\brm\s+-rf\s+\/(?!\w)|\bdd\s+.*of=\/dev\/(sd|nvme|hd)|\bmkfs\b|:\(\)\s*\{/;

async function shellRun(args: { command: string; cwd?: string }): Promise<string> {
  if (DANGEROUS.test(args.command)) {
    throw new Error("Command blocked: looks destructive at the system level. Run it yourself if you really mean it.");
  }
  const { stdout, stderr } = await execAsync(args.command, {
    cwd: args.cwd ? resolve(args.cwd) : process.cwd(),
    timeout: TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  const out = [stdout, stderr].filter(Boolean).join("\n").trim();
  return out || "(no output)";
}

async function gitStatus(): Promise<string> {
  return shellRun({ command: "git status --short --branch" });
}

async function gitDiff(args: { staged?: boolean }): Promise<string> {
  return shellRun({ command: `git diff ${args.staged ? "--staged" : ""}`.trim() });
}

async function gitCommit(args: { message: string }): Promise<string> {
  return shellRun({ command: `git add -A && git commit -m ${JSON.stringify(args.message)}` });
}

export type ToolName =
  | "fs_read" | "fs_write" | "fs_list"
  | "shell_run"
  | "git_status" | "git_diff" | "git_commit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatchTool(name: ToolName, args: Record<string, any>): Promise<string> {
  switch (name) {
    case "fs_read":    return fsRead(args as { path: string });
    case "fs_write":   return fsWrite(args as { path: string; content: string });
    case "fs_list":    return fsList(args as { path?: string });
    case "shell_run":  return shellRun(args as { command: string; cwd?: string });
    case "git_status": return gitStatus();
    case "git_diff":   return gitDiff(args as { staged?: boolean });
    case "git_commit": return gitCommit(args as { message: string });
    default: throw new Error(`Unknown tool: ${name as string}`);
  }
}

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "fs_read",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path (relative to the current directory)" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_write",
      description: "Write content to a file (creates parent directories as needed)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string", description: "Full file content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_list",
      description: "List files and directories",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Directory path (default: current directory)" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shell_run",
      description: "Run a shell command in the current directory. Returns stdout+stderr.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Show git status (short format)",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show git diff (unstaged by default)",
      parameters: {
        type: "object",
        properties: { staged: { type: "boolean", description: "Show staged diff" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_commit",
      description: "Stage all changes and commit",
      parameters: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
  },
] as const;
