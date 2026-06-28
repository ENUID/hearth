import type { MachineProvider } from "../provider";
import type { Tier } from "../types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Latency simulation so the state machine (provisioning/waking) is exercised
// realistically. Kept tiny by default; override for fast tests.
const LAT = parseInt(process.env.HEARTH_PROVIDER_LATENCY_MS ?? "150", 10);

// In-sandbox provider: the control-plane state is authoritative; this realizes
// the lifecycle without external infra, so the full flow is runnable and
// testable here. Docker/K8s providers implement the same interface for prod.
export class LocalProvider implements MachineProvider {
  readonly name = "local";

  async create(_id: string, _tier: Tier): Promise<void> {
    await delay(LAT);
  }
  async start(_id: string): Promise<void> {
    await delay(LAT);
  }
  async stop(_id: string): Promise<void> {
    await delay(Math.min(LAT, 50));
  }
  async resize(_id: string, _tier: Tier): Promise<void> {
    await delay(LAT);
  }
  async destroy(_id: string): Promise<void> {
    await delay(Math.min(LAT, 50));
  }
}
