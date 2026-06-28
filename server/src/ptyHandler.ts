import fs from "fs";
import * as pty from "node-pty";
import { WebSocket } from "ws";
import { loadBuffer, saveBuffer, deleteBuffer } from "./persistence";
import { manager, WORKSPACE_ID } from "./controlplane/index";

// Tab session ids are namespaced as "<workspace>__<tab>"; activity on any tab
// counts toward that workspace's machine (Phase 3).
function workspaceOf(sid: string): string {
  const i = sid.indexOf("__");
  return i > 0 ? sid.slice(0, i) : WORKSPACE_ID;
}

type Session = {
  ptyProcess: pty.IPty;
  lastActive: number;
  /** Recent terminal output, replayed to any client that (re)attaches. */
  buffer: string;
  /** All clients currently attached to this session. */
  sockets: Set<WebSocket>;
  reapTimer?: NodeJS.Timeout;
};

const sessions = new Map<string, Session>();

const RECONNECT_GRACE_MS = 30_000;
// How much recent output to retain for replay on reconnect (~200 KB scrollback).
const MAX_BUFFER = 200_000;

function getOrCreateSession(sid: string): Session {
  const existing = sessions.get(sid);
  if (existing) {
    existing.lastActive = Date.now();
    return existing;
  }

  const shell = process.env.SHELL ?? (process.platform === "win32" ? "cmd.exe" : "/bin/bash");
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME ?? "/",
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor", // advertise 24-bit color to programs
      LANG: process.env.LANG ?? "C.UTF-8", // UTF-8 locale for unicode handling
      TERM_PROGRAM: "Hearth",
    } as Record<string, string>,
  });

  const session: Session = {
    ptyProcess,
    lastActive: Date.now(),
    // Replay prior scrollback (persisted across reconnects and server restarts).
    buffer: loadBuffer(sid).slice(-MAX_BUFFER),
    sockets: new Set(),
  };

  // One reader per session: keep a replay buffer, broadcast to all clients, and
  // persist scrollback to disk so it survives a restart.
  ptyProcess.onData((data) => {
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER) {
      session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER);
    }
    saveBuffer(sid, session.buffer);
    manager.markActive(workspaceOf(sid));
    const bytes = Buffer.from(data, "utf8");
    for (const ws of session.sockets) {
      if (ws.readyState === WebSocket.OPEN) ws.send(bytes, { binary: true });
    }
  });

  sessions.set(sid, session);
  return session;
}

export function handlePtyConnection(ws: WebSocket, sid: string) {
  // Opening a terminal counts as activity: wake the workspace machine if asleep.
  void manager.touch(workspaceOf(sid));
  const session = getOrCreateSession(sid);
  const { ptyProcess } = session;

  if (session.reapTimer) {
    clearTimeout(session.reapTimer);
    session.reapTimer = undefined;
  }

  session.sockets.add(ws);

  // Replay the current screen so a fresh or reconnecting client sees the
  // prompt and recent output immediately (instead of a blank terminal).
  if (session.buffer && ws.readyState === WebSocket.OPEN) {
    ws.send(Buffer.from(session.buffer, "utf8"), { binary: true });
  }

  ws.on("message", (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    const buf = Array.isArray(raw)
      ? Buffer.concat(raw)
      : Buffer.isBuffer(raw)
      ? raw
      : Buffer.from(raw);
    session.lastActive = Date.now();
    manager.markActive(workspaceOf(sid));

    // Text frames may be control frames (JSON) or keystrokes. Binary frames are
    // always raw terminal input. Note: `ws` delivers every frame as a Buffer, so
    // we rely on `isBinary` (not typeof) to tell text from binary.
    if (!isBinary) {
      const str = buf.toString("utf8");
      if (str.charCodeAt(0) === 0x7b /* '{' */) {
        try {
          const frame = JSON.parse(str) as { type?: string; cols?: number; rows?: number };
          if (frame.type === "resize" && frame.cols && frame.rows) {
            ptyProcess.resize(frame.cols, frame.rows);
            return;
          }
        } catch {
          // not a control frame — fall through and treat as input
        }
      }
      ptyProcess.write(str);
      return;
    }

    ptyProcess.write(buf.toString("utf8"));
  });

  ws.on("close", () => {
    session.sockets.delete(ws);
    // When the last client leaves, keep the PTY alive briefly for reconnect.
    if (session.sockets.size === 0) {
      session.reapTimer = setTimeout(() => {
        const s = sessions.get(sid);
        if (s && s.sockets.size === 0 && Date.now() - s.lastActive >= RECONNECT_GRACE_MS) {
          s.ptyProcess.kill();
          sessions.delete(sid);
        }
      }, RECONNECT_GRACE_MS);
    }
  });

  ws.on("error", () => ws.close());
}

/** The live working directory of a session's shell (follows `cd`). */
export function getSessionCwd(sid: string): string {
  const home = process.env.HOME ?? "/";
  const s = sessions.get(sid);
  if (!s) return home;
  try {
    return fs.readlinkSync(`/proc/${s.ptyProcess.pid}/cwd`);
  } catch {
    return home;
  }
}

/** Permanently end a session (used when a user closes a tab). */
export function killSession(sid: string): void {
  const s = sessions.get(sid);
  if (s) {
    if (s.reapTimer) clearTimeout(s.reapTimer);
    for (const ws of s.sockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    try {
      s.ptyProcess.kill();
    } catch {
      /* ignore */
    }
    sessions.delete(sid);
  }
  deleteBuffer(sid);
}
