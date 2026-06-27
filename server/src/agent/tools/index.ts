import { readFile, writeFile, readdir, stat, mkdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

const HOME = process.env.HOME ?? "/home/hearth";

function resolveSafe(filePath: string): string {
  const resolved = path.resolve(HOME, filePath.startsWith("/") ? filePath.slice(1) : filePath);
  if (!resolved.startsWith(HOME)) {
    throw new Error(`Path '${filePath}' is outside the allowed directory`);
  }
  return resolved;
}

async function fsRead(args: { path: string }): Promise<string> {
  const target = resolveSafe(args.path);
  const content = await readFile(target, "utf8");
  return content;
}

async function fsWrite(args: { path: string; content: string }): Promise<string> {
  const target = resolveSafe(args.path);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, args.content, "utf8");
  return `Written ${target}`;
}

async function fsList(args: { path?: string }): Promise<string> {
  const target = resolveSafe(args.path ?? ".");
  const entries = await readdir(target, { withFileTypes: true });
  const lines = await Promise.all(
    entries.map(async (e) => {
      const s = await stat(path.join(target, e.name)).catch(() => null);
      const size = s ? `${s.size}` : "?";
      const suffix = e.isDirectory() ? "/" : "";
      return `${e.isDirectory() ? "d" : "-"} ${size.padStart(8)} ${e.name}${suffix}`;
    })
  );
  return lines.join("\n");
}

const TIMEOUT_MS = 30_000;
const DANGEROUS = /\brm\s+-rf\s+\/|\bdd\s+.*of=\/dev\/(sd|nvme|hd)/;

async function shellRun(args: { command: string; cwd?: string }): Promise<string> {
  if (DANGEROUS.test(args.command)) {
    throw new Error("Command blocked: potentially destructive system-level operation");
  }
  const cwd = args.cwd ? resolveSafe(args.cwd) : HOME;
  const { stdout, stderr } = await execAsync(args.command, {
    cwd,
    timeout: TIMEOUT_MS,
    maxBuffer: 1024 * 512,
    env: { ...process.env, HOME },
  });
  const out = [stdout, stderr].filter(Boolean).join("\n").trim();
  return out || "(no output)";
}

async function gitStatus(args: { cwd?: string }): Promise<string> {
  return shellRun({ command: "git status --short", cwd: args.cwd });
}

async function gitDiff(args: { cwd?: string; staged?: boolean }): Promise<string> {
  const flag = args.staged ? "--staged" : "";
  return shellRun({ command: `git diff ${flag}`.trim(), cwd: args.cwd });
}

async function gitCommit(args: { message: string; cwd?: string }): Promise<string> {
  return shellRun({ command: `git add -A && git commit -m ${JSON.stringify(args.message)}`, cwd: args.cwd });
}

export type ToolName = "fs_read" | "fs_write" | "fs_list" | "shell_run" | "git_status" | "git_diff" | "git_commit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatchTool(name: ToolName, args: Record<string, any>): Promise<string> {
  switch (name) {
    case "fs_read":    return fsRead(args as { path: string });
    case "fs_write":   return fsWrite(args as { path: string; content: string });
    case "fs_list":    return fsList(args as { path?: string });
    case "shell_run":  return shellRun(args as { command: string; cwd?: string });
    case "git_status": return gitStatus(args as { cwd?: string });
    case "git_diff":   return gitDiff(args as { cwd?: string; staged?: boolean });
    case "git_commit": return gitCommit(args as { message: string; cwd?: string });
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
        properties: { path: { type: "string", description: "File path (relative to home or absolute)" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_write",
      description: "Write content to a file (creates directories as needed)",
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
        properties: { path: { type: "string", description: "Directory path (default: home)" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shell_run",
      description: "Run a shell command in the container. Returns stdout+stderr.",
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
      parameters: {
        type: "object",
        properties: { cwd: { type: "string" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show git diff (unstaged by default)",
      parameters: {
        type: "object",
        properties: {
          cwd: { type: "string" },
          staged: { type: "boolean", description: "Show staged diff" },
        },
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
        properties: {
          message: { type: "string" },
          cwd: { type: "string" },
        },
        required: ["message"],
      },
    },
  },
] as const;
