// On-device model inference via WebLLM (WebGPU). Lets Hearth run small models
// directly on the user's device — free, private, no rented GPU — and fall back
// to the cloud GPU when the device can't handle it.

import type { ModelInfo } from "./api";

export function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

/** Rough device RAM in GB (Chrome exposes deviceMemory; Safari doesn't). */
export function deviceMemoryGb(): number | null {
  const m = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return typeof m === "number" ? m : null;
}

/** Can this model run on THIS device right now? */
export function canRunLocally(model: ModelInfo): boolean {
  if (!webgpuAvailable() || !model.mlcId || model.localTier === "none") return false;
  if (model.localTier === "easy") return true;
  // "heavy" — only if we can tell there's enough RAM (>= 6 GB). Unknown → no.
  const ram = deviceMemoryGb();
  return ram != null && ram >= 6;
}

export interface LocalChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

// Wraps a loaded WebLLM engine. The heavy library is imported lazily so it only
// loads when the user actually runs a model on-device.
export class LocalEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private engine: any = null;
  readonly mlcId: string;

  constructor(mlcId: string) {
    this.mlcId = mlcId;
  }

  async load(onProgress?: (pct: number, text: string) => void): Promise<void> {
    const webllm = await import("@mlc-ai/web-llm");
    this.engine = await webllm.CreateMLCEngine(this.mlcId, {
      initProgressCallback: (r: { progress: number; text: string }) =>
        onProgress?.(Math.round((r.progress ?? 0) * 100), r.text ?? ""),
    });
  }

  async *chat(messages: LocalChatMsg[]): AsyncGenerator<string> {
    if (!this.engine) throw new Error("model not loaded");
    const stream = await this.engine.chat.completions.create({ messages, stream: true });
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) yield delta as string;
    }
  }

  async unload(): Promise<void> {
    try {
      await this.engine?.unload?.();
    } catch {
      /* ignore */
    }
    this.engine = null;
  }
}
