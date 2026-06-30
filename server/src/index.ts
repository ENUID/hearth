import fs from "fs";
import path from "path";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { URL } from "url";
import { handlePtyConnection, killSession } from "./ptyHandler";
import { handleDownload, handleUpload } from "./files";
import { authEnabled, checkPassword, issueToken, isAuthorized, scopeId, decodeToken, tokenFromRequest } from "./auth";
import { multiUserEnabled, createUser, verifyUser, getUser, userCount } from "./accounts";
import { listTeamsForUser, createTeam, addMember, removeMember } from "./teams";
import { mountControlPlane } from "./controlplane/routes";
import { mountModels } from "./models/routes";
import { mountAgents } from "./agents/routes";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

// --- instance / org settings (self-host) ---
const INSTANCE_NAME = process.env.HEARTH_INSTANCE_NAME ?? "Hearth";
// Open signups by default; an admin can close them (HEARTH_SIGNUPS_OPEN=false)
// once the team is set up. The very first account is always allowed (bootstrap).
const signupsOpen = (): boolean => process.env.HEARTH_SIGNUPS_OPEN !== "false" || userCount() === 0;

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Tells the client whether it must authenticate, and which mode, plus the
// instance name and whether new signups are allowed (self-host org settings).
app.get("/api/config", (_req, res) => {
  res.json({ authRequired: authEnabled, multiUser: multiUserEnabled, instanceName: INSTANCE_NAME, signupsOpen: signupsOpen() });
});

// Create an account (multi-user mode only).
app.post("/api/signup", (req, res) => {
  if (!multiUserEnabled) {
    res.status(404).json({ error: "signups are disabled" });
    return;
  }
  if (!signupsOpen()) {
    res.status(403).json({ error: "signups are closed on this instance" });
    return;
  }
  try {
    const user = createUser(String(req.body?.username ?? ""), String(req.body?.password ?? ""));
    res.json({ token: issueToken(user.id), username: user.username });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Exchange credentials for a token. Multi-user → username+password; single
// tenant → the shared password.
app.post("/api/login", (req, res) => {
  if (multiUserEnabled) {
    const user = verifyUser(String(req.body?.username ?? ""), String(req.body?.password ?? ""));
    if (user) res.json({ token: issueToken(user.id), username: user.username });
    else res.status(401).json({ error: "invalid username or password" });
    return;
  }
  if (!authEnabled) {
    res.json({ token: null, authRequired: false });
    return;
  }
  const password = String(req.body?.password ?? "");
  if (checkPassword(password)) {
    res.json({ token: issueToken(), authRequired: true });
  } else {
    res.status(401).json({ error: "invalid password" });
  }
});

// Who am I (multi-user). Returns null when not signed in / single-tenant.
app.get("/api/me", (req, res) => {
  if (!multiUserEnabled) {
    res.json({ user: null });
    return;
  }
  const decoded = decodeToken(tokenFromRequest(req, reqUrl(req)));
  const user = decoded ? getUser(decoded.sub) : null;
  res.json({ user: user ? { username: user.username } : null });
});

// Auth check that also accepts a `?token=` query param (browser download links
// and WebSockets can't set an Authorization header).
const reqUrl = (req: express.Request) => new URL(req.url, "http://localhost");

// Auth gate for the REST API.
app.use("/api/files", (req, res, next) => {
  if (isAuthorized(req, reqUrl(req))) return next();
  res.status(401).json({ error: "unauthorized" });
});
app.get("/api/files/download", handleDownload);
app.post("/api/files/upload", handleUpload);

// End a session (close a tab).
app.post("/api/session/kill", (req, res) => {
  if (!isAuthorized(req, reqUrl(req))) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  killSession(scopeId(req, reqUrl(req), String(req.query.sid ?? "")));
  res.json({ ok: true });
});

// Teams (Phase 3): shared workspaces + roles. Multi-user mode only.
const currentUserId = (req: express.Request): string | null => {
  const decoded = decodeToken(tokenFromRequest(req, reqUrl(req)));
  return decoded && getUser(decoded.sub) ? decoded.sub : null;
};
const teamGuard = (handler: (req: express.Request, res: express.Response, uid: string) => void) =>
  (req: express.Request, res: express.Response) => {
    if (!multiUserEnabled) return res.status(404).json({ error: "teams are disabled" });
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    try {
      handler(req, res, uid);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  };

app.get("/api/teams", teamGuard((_req, res, uid) => res.json({ teams: listTeamsForUser(uid) })));
app.post("/api/teams", teamGuard((req, res, uid) => res.json({ team: createTeam(uid, String(req.body?.name ?? "")) })));
app.post("/api/teams/:id/members", teamGuard((req, res, uid) =>
  res.json({ team: addMember(String(req.params.id), uid, String(req.body?.username ?? ""), req.body?.role === "owner" ? "owner" : "member") })
));
app.delete("/api/teams/:id/members/:userId", teamGuard((req, res, uid) =>
  res.json({ team: removeMember(String(req.params.id), uid, String(req.params.userId)) })
));

// Phase 2 control plane: machine sizing, scale-to-zero, GPU, metering, billing.
mountControlPlane(app, (req) => isAuthorized(req, reqUrl(req)));

// One-click open-model runner: catalog → run (provision GPU + serve) → chat + API.
mountModels(app, (req) => isAuthorized(req, reqUrl(req)));

// One-tap CLI agent catalog (Claude Code, Aider, Codex, …) installed into the terminal.
mountAgents(app, (req) => isAuthorized(req, reqUrl(req)));

// Serve the built client so a single port serves the whole app (production /
// single-origin). In dev you use the Vite server on :5173 instead.
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health") return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
  console.log(`  serving client from ${clientDist}`);
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname !== "/pty") {
    socket.destroy();
    return;
  }
  if (!isAuthorized(req, url)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  // Namespace the session per user so two accounts never share a terminal.
  const sid = scopeId(req, url, url.searchParams.get("sid") ?? "default");
  wss.handleUpgrade(req, socket, head, (ws) => {
    handlePtyConnection(ws, sid);
  });
});

httpServer.listen(PORT, () => {
  console.log(`hearth terminal bridge listening on :${PORT}`);
  console.log(`  PTY  → ws://localhost:${PORT}/pty?sid=<id>`);
  console.log(`  auth → ${authEnabled ? "required" : "disabled (dev)"}`);
});
