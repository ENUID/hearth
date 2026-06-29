import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
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

// Real ollama backend. Activates with HEARTH_MODEL_BACKEND=ollama (ollama must
// be installed in the workspace/GPU container). Serves an OpenAI-compatible API
// at :11434/v1. Not exercised in the build sandbox.
export class OllamaRunner implements ModelRunner {
  readonly name = "ollama";
  private base = process.env.OLLAMA_HOST ?? "http://localhost:11434";

  private async ensureServe(): Promise<void> {
    try {
      await fetch(`${this.base}/api/tags`);
      return; // already up
    } catch {
      const child = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" });
      child.unref();
      // wait for it to come up
      for (let i = 0; i < 20; i++) {
        await delay(500);
        try {
          await fetch(`${this.base}/api/tags`);
          return;
        } catch {
          /* keep waiting */
        }
      }
    }
  }

  async start(modelId: string): Promise<void> {
    await this.ensureServe();
    await execAsync(`ollama pull ${modelId}`, { maxBuffer: 1024 * 1024 * 16 });
  }
  async stop(modelId: string): Promise<void> {
    await execAsync(`ollama stop ${modelId}`).catch(() => {});
  }
  endpoint(): string | null {
    return `${this.base}/v1`;
  }
}

export function makeRunner(): ModelRunner {
  return process.env.HEARTH_MODEL_BACKEND === "ollama" ? new OllamaRunner() : new StubRunner();
}
