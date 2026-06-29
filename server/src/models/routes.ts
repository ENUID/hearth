import { Readable } from "stream";
import type { Express, Request, Response } from "express";
import { MODEL_CATALOG, findModel } from "./catalog";
import { modelManager } from "./manager";

type AuthFn = (req: Request) => boolean;

function wsId(req: Request): string {
  const id = String(req.query.ws ?? req.body?.ws ?? "workspace").trim();
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "workspace";
}

function sse(res: Response, obj: unknown) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// Deterministic OpenAI-style stream so chat works without a real model (sandbox).
function stubChat(res: Response, modelName: string, messages: { role: string; content?: string }[]) {
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const said = (lastUser?.content ?? "").slice(0, 200);
  const reply = `[${modelName} · stub] You said: "${said}". I'm a placeholder response — attach a GPU and run with ollama (HEARTH_MODEL_BACKEND=ollama) to chat with the real model.`;
  for (const word of reply.split(/(\s+)/)) {
    sse(res, { choices: [{ delta: { content: word }, finish_reason: null }] });
  }
  sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
  res.write("data: [DONE]\n\n");
  res.end();
}

export function mountModels(app: Express, isAuthed: AuthFn): void {
  const guard =
    (handler: (req: Request, res: Response) => void | Promise<void>) =>
    async (req: Request, res: Response) => {
      if (!isAuthed(req)) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      try {
        await handler(req, res);
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
      }
    };

  app.get("/api/models", guard(async (req, res) => {
    res.json({
      catalog: MODEL_CATALOG,
      running: modelManager.get(wsId(req)),
      backend: modelManager.runner.name,
      apiPath: "/api/models/v1", // OpenAI-compatible base (use your token as the key)
    });
  }));

  app.post("/api/models/start", guard(async (req, res) => {
    const running = await modelManager.start(wsId(req), String(req.body?.modelId ?? ""));
    res.json({ running });
  }));

  app.post("/api/models/stop", guard(async (req, res) => {
    const running = await modelManager.stop(wsId(req));
    res.json({ running });
  }));

  // OpenAI-compatible chat against the workspace's running model.
  // POST /api/models/v1/chat/completions   (Authorization: Bearer <your token>)
  app.post("/api/models/v1/chat/completions", guard(async (req, res) => {
    const ws = wsId(req);
    const running = modelManager.get(ws);
    if (!running || running.status !== "running") {
      res.status(409).json({ error: "no model is running for this workspace" });
      return;
    }
    const messages = req.body?.messages ?? [];
    const endpoint = modelManager.runner.endpoint();

    if (!endpoint) {
      const model = findModel(running.modelId);
      stubChat(res, model?.name ?? running.modelId, messages);
      return;
    }

    const upstream = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: running.modelId, messages, stream: true, temperature: 0.7 }),
    });
    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: `model endpoint ${upstream.status}` });
      return;
    }
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
  }));
}
