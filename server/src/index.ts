import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { URL } from "url";
import { handlePtyConnection } from "./ptyHandler";
import { handleAgentConnection } from "./agentHandler";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const httpServer = createServer(app);

const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://localhost`);
  const sid = url.searchParams.get("sid") ?? "default";

  if (url.pathname === "/pty") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      handlePtyConnection(ws, sid);
    });
  } else if (url.pathname === "/agent") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleAgentConnection(ws, sid);
    });
  } else {
    socket.destroy();
  }
});

httpServer.listen(PORT, () => {
  console.log(`hearth server listening on :${PORT}`);
  console.log(`  PTY   → ws://localhost:${PORT}/pty?sid=<id>`);
  console.log(`  Agent → ws://localhost:${PORT}/agent?sid=<id>`);
  if (process.env.STUB_INFERENCE === "true") {
    console.log("  Inference: STUB mode (set INFERENCE_BASE_URL to use real model)");
  } else {
    console.log(`  Inference: ${process.env.INFERENCE_BASE_URL ?? "http://localhost:8000/v1"}`);
  }
});
