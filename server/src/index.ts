import fs from "fs";
import path from "path";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { URL } from "url";
import { handlePtyConnection, killSession } from "./ptyHandler";
import { handleDownload, handleUpload } from "./files";
import { authEnabled, checkPassword, issueToken, isAuthorized } from "./auth";
import { mountControlPlane } from "./controlplane/routes";
import { mountModels } from "./models/routes";
import { mountAgents } from "./agents/routes";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Tells the client whether it must authenticate.
app.get("/api/config", (_req, res) => {
  res.json({ authRequired: authEnabled });
});

// Exchange a password for a token (only meaningful when auth is enabled).
app.post("/api/login", (req, res) => {
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
  killSession(String(req.query.sid ?? ""));
  res.json({ ok: true });
});

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
  const sid = url.searchParams.get("sid") ?? "default";

  if (url.pathname !== "/pty") {
    socket.destroy();
    return;
  }
  if (!isAuthorized(req, url)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    handlePtyConnection(ws, sid);
  });
});

httpServer.listen(PORT, () => {
  console.log(`hearth terminal bridge listening on :${PORT}`);
  console.log(`  PTY  → ws://localhost:${PORT}/pty?sid=<id>`);
  console.log(`  auth → ${authEnabled ? "required" : "disabled (dev)"}`);
});
