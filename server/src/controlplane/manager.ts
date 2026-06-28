import fs from "fs";
import path from "path";
import type { MachineProvider } from "./provider";
import {
  GPU_CATALOG,
  TIERS,
  type Machine,
  type Tier,
  type UsageTotals,
} from "./types";

const STATE_DIR =
  process.env.HEARTH_STATE_DIR ?? path.join(process.env.HOME ?? "/tmp", ".hearth", "sessions");
const STATE_FILE = path.join(STATE_DIR, "machines.json");

const IDLE_MS = parseInt(process.env.HEARTH_IDLE_MS ?? `${15 * 60 * 1000}`, 10);
const TICK_MS = parseInt(process.env.HEARTH_TICK_MS ?? "5000", 10);

type Accum = { machineMinutes: number; machineCents: number; gpuMinutes: number; gpuCents: number };
const zero = (): Accum => ({ machineMinutes: 0, machineCents: 0, gpuMinutes: 0, gpuCents: 0 });

export class MachineManager {
  private machines = new Map<string, Machine>();
  private usage = new Map<string, Accum>();
  private lastCheckpoint = new Map<string, number>();
  private timer?: NodeJS.Timeout;

  constructor(private provider: MachineProvider) {
    this.load();
  }

  start() {
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  list(): Machine[] {
    return [...this.machines.values()];
  }

  get(id: string): Machine | undefined {
    return this.machines.get(id);
  }

  async getOrCreate(id: string, tier: Tier = "free"): Promise<Machine> {
    const existing = this.machines.get(id);
    if (existing) return existing;
    const now = Date.now();
    const machine: Machine = {
      id,
      tier,
      resources: TIERS[tier].resources,
      state: "provisioning",
      gpu: null,
      createdAt: now,
      lastActiveAt: now,
      runningSince: null,
    };
    this.machines.set(id, machine);
    this.usage.set(id, zero());
    this.lastCheckpoint.set(id, now);
    await this.provider.create(id, tier);
    machine.state = "running";
    machine.runningSince = Date.now();
    this.save();
    return machine;
  }

  /** Mark activity; wakes the machine if it was asleep. */
  async touch(id: string): Promise<void> {
    const m = this.machines.get(id);
    if (!m) {
      await this.getOrCreate(id);
      return;
    }
    m.lastActiveAt = Date.now();
    if (m.state === "asleep") await this.wake(id);
  }

  /** Cheap, synchronous activity ping (called on every keystroke/output). */
  markActive(id: string): void {
    const m = this.machines.get(id);
    if (m) m.lastActiveAt = Date.now();
  }

  async wake(id: string): Promise<Machine> {
    const m = this.must(id);
    if (m.state === "running" || m.state === "waking") return m;
    m.state = "waking";
    this.save();
    await this.provider.start(id);
    m.state = "running";
    m.runningSince = Date.now();
    m.lastActiveAt = Date.now();
    this.lastCheckpoint.set(id, Date.now());
    this.save();
    return m;
  }

  async sleep(id: string): Promise<Machine> {
    const m = this.must(id);
    if (m.state !== "running") return m;
    this.flush(id);
    // Release GPU on sleep so it stops billing.
    if (m.gpu && m.gpu.state === "attached") await this.releaseGpu(id);
    await this.provider.stop(id);
    m.state = "asleep";
    m.runningSince = null;
    this.save();
    return m;
  }

  async resize(id: string, tier: Tier): Promise<Machine> {
    const m = await this.getOrCreate(id);
    this.flush(id);
    await this.provider.resize(id, tier);
    m.tier = tier;
    m.resources = TIERS[tier].resources;
    m.lastActiveAt = Date.now();
    this.save();
    return m;
  }

  async provisionGpu(id: string, type: string): Promise<Machine> {
    const spec = GPU_CATALOG[type];
    if (!spec) throw new Error(`unknown GPU type: ${type}`);
    const m = await this.getOrCreate(id);
    if (m.state !== "running") await this.wake(id);
    if (m.gpu && m.gpu.state !== "released") throw new Error("a GPU is already attached");
    this.flush(id);
    m.gpu = { id: "", spec, state: "provisioning", startedAt: 0 };
    this.save();
    const gpuId = await this.provider.attachGpu(id, spec);
    m.gpu = { id: gpuId, spec, state: "attached", startedAt: Date.now() };
    m.lastActiveAt = Date.now();
    this.lastCheckpoint.set(id, Date.now());
    this.save();
    return m;
  }

  async releaseGpu(id: string): Promise<Machine> {
    const m = this.must(id);
    if (!m.gpu || m.gpu.state === "released") return m;
    this.flush(id);
    m.gpu.state = "releasing";
    this.save();
    await this.provider.detachGpu(id);
    m.gpu.state = "released";
    m.gpu.stoppedAt = Date.now();
    this.save();
    return m;
  }

  async destroy(id: string): Promise<void> {
    const m = this.machines.get(id);
    if (!m) return;
    this.flush(id);
    await this.provider.destroy(id);
    m.state = "destroyed";
    this.machines.delete(id);
    this.save();
  }

  // --- metering ---

  /** Accrue elapsed cost into the accumulator and reset the checkpoint. */
  private flush(id: string, now = Date.now()): void {
    const m = this.machines.get(id);
    const acc = this.usage.get(id);
    if (!m || !acc) return;
    const last = this.lastCheckpoint.get(id) ?? now;
    const deltaMin = Math.max(0, (now - last) / 60000);

    if (m.state === "running" && m.runningSince != null) {
      acc.machineMinutes += deltaMin;
      acc.machineCents += deltaMin * (TIERS[m.tier].hourlyCents / 60);
    }
    if (m.gpu && m.gpu.state === "attached") {
      acc.gpuMinutes += deltaMin;
      acc.gpuCents += deltaMin * (m.gpu.spec.hourlyCents / 60);
    }
    this.lastCheckpoint.set(id, now);
  }

  /** Current totals including in-progress (uncheckpointed) time. */
  usageFor(id: string, now = Date.now()): UsageTotals {
    const acc = this.usage.get(id) ?? zero();
    const m = this.machines.get(id);
    const last = this.lastCheckpoint.get(id) ?? now;
    const deltaMin = Math.max(0, (now - last) / 60000);
    let machineMinutes = acc.machineMinutes;
    let machineCents = acc.machineCents;
    let gpuMinutes = acc.gpuMinutes;
    let gpuCents = acc.gpuCents;
    if (m?.state === "running" && m.runningSince != null) {
      machineMinutes += deltaMin;
      machineCents += deltaMin * (TIERS[m.tier].hourlyCents / 60);
    }
    if (m?.gpu && m.gpu.state === "attached") {
      gpuMinutes += deltaMin;
      gpuCents += deltaMin * (m.gpu.spec.hourlyCents / 60);
    }
    return {
      machineMinutes: round(machineMinutes),
      machineCents: round(machineCents),
      gpuMinutes: round(gpuMinutes),
      gpuCents: round(gpuCents),
      totalCents: round(machineCents + gpuCents),
    };
  }

  private tick(): void {
    const now = Date.now();
    for (const m of this.machines.values()) {
      if (m.state === "running" && now - m.lastActiveAt > IDLE_MS) {
        void this.sleep(m.id);
      }
    }
  }

  private must(id: string): Machine {
    const m = this.machines.get(id);
    if (!m) throw new Error(`no such machine: ${id}`);
    return m;
  }

  // --- persistence ---

  private save(): void {
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      const data = {
        machines: [...this.machines.values()],
        usage: [...this.usage.entries()],
        checkpoints: [...this.lastCheckpoint.entries()],
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(data));
    } catch {
      /* best effort */
    }
  }

  private load(): void {
    try {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      for (const m of data.machines ?? []) {
        // A machine can't actually be "running" after a restart (compute is gone);
        // mark it asleep so it wakes cleanly on next use, and stop accrual.
        if (m.state === "running" || m.state === "waking" || m.state === "provisioning") {
          m.state = "asleep";
          m.runningSince = null;
        }
        if (m.gpu && m.gpu.state === "attached") m.gpu.state = "released";
        this.machines.set(m.id, m);
      }
      for (const [k, v] of data.usage ?? []) this.usage.set(k, v);
      for (const [k] of data.checkpoints ?? []) this.lastCheckpoint.set(k, Date.now());
    } catch {
      /* no prior state */
    }
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
