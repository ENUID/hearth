import type { MachineProvider } from "../provider";
import { TIERS, type Tier } from "../types";

// Fly.io Machines provider. Each workspace is its own Firecracker microVM —
// persistent, stateful, and OS-isolated, which is what untrusted multi-tenant
// needs (and what serverless platforms can't give: a long-lived box per user
// that keeps its shell, processes, and home). Activates with
// HEARTH_PROVIDER=fly + FLY_API_TOKEN + FLY_APP_NAME.
//
// Pair with HEARTH_SHELL_CMD so the terminal execs into the machine, e.g.
//   HEARTH_SHELL_CMD="flyctl ssh console -a $FLY_APP_NAME -m {workspace} -C /bin/bash"
//
// Not exercised in the build sandbox (no Fly token / egress), but these are the
// real Machines API calls.
export class FlyProvider implements MachineProvider {
  readonly name = "fly";
  private token = process.env.FLY_API_TOKEN ?? "";
  private app = process.env.FLY_APP_NAME ?? "";
  private image = process.env.HEARTH_WORKSPACE_IMAGE ?? "";
  private region = process.env.FLY_REGION ?? "iad";
  private base = (process.env.FLY_API_HOST ?? "https://api.machines.dev").replace(/\/$/, "");

  private machineName(id: string) {
    return `hearth-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 60);
  }

  private guest(tier: Tier) {
    const r = TIERS[tier].resources;
    return { cpus: Math.max(1, Math.round(r.cpu)), memory_mb: r.memoryMb, cpu_kind: "shared" as const };
  }

  private async api(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.base}/v1/apps/${this.app}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`fly ${method} ${path} → ${res.status} ${await res.text().catch(() => "")}`);
    return res.status === 204 ? null : res.json();
  }

  /** Find this workspace's machine id by its deterministic name, if it exists. */
  private async machineId(id: string): Promise<string | null> {
    const list = (await this.api("GET", "/machines")) as { id: string; name: string }[];
    return list.find((m) => m.name === this.machineName(id))?.id ?? null;
  }

  async create(id: string, tier: Tier): Promise<void> {
    const existing = await this.machineId(id);
    if (existing) return this.start(id);
    await this.api("POST", "/machines", {
      name: this.machineName(id),
      region: this.region,
      config: {
        image: this.image,
        guest: this.guest(tier),
        // Keep the machine around when idle; we start/stop it for scale-to-zero.
        auto_destroy: false,
        restart: { policy: "always" },
      },
    });
  }

  async start(id: string): Promise<void> {
    const mid = await this.machineId(id);
    if (mid) await this.api("POST", `/machines/${mid}/start`);
    else await this.create(id, "pro");
  }

  async stop(id: string): Promise<void> {
    const mid = await this.machineId(id);
    if (mid) await this.api("POST", `/machines/${mid}/stop`);
  }

  async resize(id: string, tier: Tier): Promise<void> {
    const mid = await this.machineId(id);
    if (!mid) return this.create(id, tier);
    const cur = (await this.api("GET", `/machines/${mid}`)) as { config: Record<string, unknown> };
    await this.api("POST", `/machines/${mid}`, { config: { ...cur.config, guest: this.guest(tier) } });
  }

  async destroy(id: string): Promise<void> {
    const mid = await this.machineId(id);
    if (mid) await this.api("DELETE", `/machines/${mid}?force=true`).catch(() => {});
  }
}
