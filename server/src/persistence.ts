import fs from "fs";
import path from "path";

// Where session scrollback is persisted so it can be replayed after a reconnect
// — even across a server restart. The live PTY process can't survive a restart,
// but the screen contents (and the home directory) do, so the user comes back to
// where they were.
const STATE_DIR =
  process.env.HEARTH_STATE_DIR ?? path.join(process.env.HOME ?? "/tmp", ".hearth", "sessions");

try {
  fs.mkdirSync(STATE_DIR, { recursive: true });
} catch {
  /* best effort */
}

function fileFor(sid: string): string {
  const safe = sid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  return path.join(STATE_DIR, `${safe}.log`);
}

export function loadBuffer(sid: string): string {
  try {
    return fs.readFileSync(fileFor(sid), "utf8");
  } catch {
    return "";
  }
}

const pendingWrites = new Map<string, NodeJS.Timeout>();
const latest = new Map<string, string>();

/** Debounced persist (avoid hammering disk on every chunk of output). */
export function saveBuffer(sid: string, buffer: string): void {
  // Always record the newest buffer; the timer writes whatever is latest when it
  // fires (not the value captured when the debounce was first scheduled).
  latest.set(sid, buffer);
  if (pendingWrites.has(sid)) return;
  pendingWrites.set(
    sid,
    setTimeout(() => {
      pendingWrites.delete(sid);
      fs.writeFile(fileFor(sid), latest.get(sid) ?? "", () => {});
    }, 1000)
  );
}

export function deleteBuffer(sid: string): void {
  const t = pendingWrites.get(sid);
  if (t) {
    clearTimeout(t);
    pendingWrites.delete(sid);
  }
  fs.unlink(fileFor(sid), () => {});
}
