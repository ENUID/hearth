// Phase 2 control plane: machines (cloud computers) that can be sized up/down,
// sleep when idle, wake on use, and optionally have a GPU attached — all metered.

export type MachineState =
  | "provisioning"
  | "running"
  | "asleep"
  | "waking"
  | "error"
  | "destroyed";

export type Tier = "free" | "pro" | "max";

export interface ResourceSpec {
  cpu: number; // vCPUs
  memoryMb: number;
}

export interface TierSpec {
  label: string;
  resources: ResourceSpec;
  hourlyCents: number; // compute cost
}

export const TIERS: Record<Tier, TierSpec> = {
  free: { label: "Free", resources: { cpu: 0.5, memoryMb: 1024 }, hourlyCents: 0 },
  pro: { label: "Pro", resources: { cpu: 2, memoryMb: 4096 }, hourlyCents: 3 },
  max: { label: "Max", resources: { cpu: 8, memoryMb: 16384 }, hourlyCents: 12 },
};

export interface GpuSpec {
  type: string; // e.g. "a10g"
  label: string;
  vramGb: number;
  hourlyCents: number; // pass-through + margin
}

export const GPU_CATALOG: Record<string, GpuSpec> = {
  a10g: { type: "a10g", label: "NVIDIA A10G", vramGb: 24, hourlyCents: 90 },
  a100: { type: "a100", label: "NVIDIA A100", vramGb: 80, hourlyCents: 180 },
  h100: { type: "h100", label: "NVIDIA H100", vramGb: 80, hourlyCents: 350 },
};

export type GpuState = "provisioning" | "attached" | "releasing" | "released";

export interface Gpu {
  id: string;
  spec: GpuSpec;
  state: GpuState;
  startedAt: number; // when attached (billing start)
  stoppedAt?: number;
}

export interface Machine {
  id: string;
  tier: Tier;
  resources: ResourceSpec;
  state: MachineState;
  gpu: Gpu | null;
  createdAt: number;
  lastActiveAt: number;
  // accounting checkpoints (epoch ms); null when not accruing
  runningSince: number | null;
}

export interface UsageTotals {
  machineMinutes: number;
  machineCents: number;
  gpuMinutes: number;
  gpuCents: number;
  totalCents: number;
}
