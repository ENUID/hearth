import { Readable } from "stream";
import type { Express, Request, Response } from "express";
import { MODEL_CATALOG, findModel } from "./catalog";
import { modelManager } from "./manager";
import { imageRunner } from "./image";
import { audioRunner, isGenerativeAudio } from "./audio";
import { scopeId } from "../auth";

type AuthFn = (req: Request) => boolean;

function wsId(req: Request): string {
  const raw = String(req.query.ws ?? req.body?.ws ?? "workspace").trim();
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "workspace";
  return scopeId(req, undefined, clean);
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

  // OpenAI-compatible image generation against the workspace's running image
  // model. POST /api/models/v1/images/generations { prompt }
  app.post("/api/models/v1/images/generations", guard(async (req, res) => {
    const ws = wsId(req);
    const running = modelManager.get(ws);
    if (!running || running.status !== "running") {
      res.status(409).json({ error: "no model is running for this workspace" });
      return;
    }
    const model = findModel(running.modelId);
    if (!model || model.category !== "image") {
      res.status(400).json({ error: "the running model is not an image model" });
      return;
    }
    const prompt = String(req.body?.prompt ?? "");
    const out = await imageRunner.generate(prompt, running.modelId);
    res.json({ created: Math.floor(Date.now() / 1000), backend: imageRunner.name, data: [{ b64_json: out.b64 }], note: out.note });
  }));

  // OpenAI-compatible text-to-speech against the workspace's running audio model.
  // POST /api/models/v1/audio/speech { input } → raw audio bytes.
  app.post("/api/models/v1/audio/speech", guard(async (req, res) => {
    const ws = wsId(req);
    const running = modelManager.get(ws);
    if (!running || running.status !== "running") {
      res.status(409).json({ error: "no model is running for this workspace" });
      return;
    }
    const model = findModel(running.modelId);
    if (!model || model.category !== "audio" || !isGenerativeAudio(running.modelId)) {
      res.status(400).json({ error: "the running model is not a text-to-audio model" });
      return;
    }
    const input = String(req.body?.input ?? req.body?.prompt ?? "");
    const out = await audioRunner.speak(input, running.modelId);
    res.setHeader("content-type", out.contentType);
    // Header values must be ASCII — strip anything else defensively.
    if (out.note) res.setHeader("x-hearth-note", out.note.replace(/[^\x20-\x7E]/g, ""));
    res.send(out.buf);
  }));
}
