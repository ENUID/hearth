import * as pty from "node-pty";
import { WebSocket } from "ws";

type Session = {
  ptyProcess: pty.IPty;
  lastActive: number;
};

const sessions = new Map<string, Session>();

const RECONNECT_GRACE_MS = 30_000;

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
    env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
  });

  const session: Session = { ptyProcess, lastActive: Date.now() };
  sessions.set(sid, session);
  return session;
}

export function handlePtyConnection(ws: WebSocket, sid: string) {
  const session = getOrCreateSession(sid);
  const { ptyProcess } = session;

  const onData = ptyProcess.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(Buffer.from(data, "binary"), { binary: true });
    }
  });

  ws.on("message", (msg) => {
    if (typeof msg === "string") {
      try {
        const frame = JSON.parse(msg) as { type: string; cols?: number; rows?: number };
        if (frame.type === "resize" && frame.cols && frame.rows) {
          ptyProcess.resize(frame.cols, frame.rows);
          session.lastActive = Date.now();
        }
      } catch {
        ptyProcess.write(msg);
        session.lastActive = Date.now();
      }
    } else {
      const data = msg instanceof Buffer ? msg : Buffer.from(msg as ArrayBuffer);
      ptyProcess.write(data.toString("binary"));
      session.lastActive = Date.now();
    }
  });

  ws.on("close", () => {
    onData.dispose();
    setTimeout(() => {
      const s = sessions.get(sid);
      if (s && Date.now() - s.lastActive >= RECONNECT_GRACE_MS) {
        s.ptyProcess.kill();
        sessions.delete(sid);
      }
    }, RECONNECT_GRACE_MS);
  });

  ws.on("error", () => ws.close());
}
