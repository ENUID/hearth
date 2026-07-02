const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LAT = parseInt(process.env.HEARTH_PROVIDER_LATENCY_MS ?? "150", 10);

// Pulls + serves an open model and exposes an OpenAI-compatible endpoint.
// `endpoint()` returns the base URL to proxy chat to, or null to use the
// built-in deterministic stub (sandbox / no GPU).
export interface ModelRunner {
  readonly name: string;
  start(modelId: string): Promise<void>;
  stop(modelId: string): Promise<void>;
  endpoint(): string | null;
}

// Default: simulate the lifecycle so the whole flow is testable without a GPU.
export class StubRunner implements ModelRunner {
  readonly name = "stub";
  async start(_modelId: string): Promise<void> {
    await delay(LAT * 4); // models take a bit to pull + load
  }
  async stop(_modelId: string): Promise<void> {
    await delay(Math.min(LAT, 50));
  }
  endpoint(): string | null {
    return null;
  }
}

// Real ollama backend. Activates with HEARTH_MODEL_BACKEND=ollama. Talks to
// ollama over HTTP only — so it works whether ollama runs locally or on a
// separate GPU box (OLLAMA_HOST). Serves an OpenAI-compatible API at /v1.
export class OllamaRunner implements ModelRunner {
  readonly name = "ollama";
  private base = (process.env.OLLAMA_HOST ?? "http://localhost:11434").replace(/\/$/, "");

  /** Confirm the ollama server is reachable. */
  private async ensureServe(): Promise<void> {
    const res = await fetch(`${this.base}/api/tags`).catch(() => null);
    if (!res || !res.ok) throw new Error(`ollama not reachable at ${this.base} (start it or set OLLAMA_HOST)`);
  }

  async start(modelId: string): Promise<void> {
    await this.ensureServe();
    // Pull the model on the ollama server (no local CLI needed). Streaming
    // response — drain it so we only resolve once the pull finishes.
    const res = await fetch(`${this.base}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: modelId, stream: false }),
    });
    if (!res.ok) throw new Error(`ollama pull ${modelId} → ${res.status}`);
    await res.text();
  }

  async stop(modelId: string): Promise<void> {
    // Ask ollama to unload the model (free VRAM) by setting keep_alive to 0.
    await fetch(`${this.base}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: modelId, keep_alive: 0 }),
    }).catch(() => {});
  }

  endpoint(): string | null {
    return `${this.base}/v1`;
  }
}

// Generic OpenAI-compatible backend. Activates with HEARTH_MODEL_BACKEND=http
// and HEARTH_MODEL_ENDPOINT=<base>/v1 — point it at anything that speaks the
// OpenAI chat API: llama.cpp server, vLLM, LM Studio, text-generation-webui,
// or Hearth's own scripts/gpt2-server.py (a real open model on plain CPU).
export class HttpRunner implements ModelRunner {
  readonly name = "http";
  private base = (process.env.HEARTH_MODEL_ENDPOINT ?? "http://localhost:8090/v1").replace(/\/$/, "");

  async start(_modelId: string): Promise<void> {
    const res = await fetch(`${this.base}/models`).catch(() => null);
    if (!res || !res.ok) throw new Error(`no OpenAI-compatible server at ${this.base} (set HEARTH_MODEL_ENDPOINT)`);
  }

  async stop(_modelId: string): Promise<void> {
    /* external server owns its lifecycle */
  }

  endpoint(): string | null {
    return this.base;
  }
}

export function makeRunner(): ModelRunner {
  switch (process.env.HEARTH_MODEL_BACKEND) {
    case "ollama": return new OllamaRunner();
    case "http": return new HttpRunner();
    default: return new StubRunner();
  }
}
