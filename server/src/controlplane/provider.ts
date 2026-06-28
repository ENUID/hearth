import type { GpuSpec, Tier } from "./types";

// A backend that can actually realize machines. The control plane talks only to
// this interface, so Local (dev/sandbox), Docker, and Kubernetes are swappable.
export interface MachineProvider {
  readonly name: string;

  /** Provision the machine's compute (called on first create). */
  create(id: string, tier: Tier): Promise<void>;
  /** Wake a sleeping machine. */
  start(id: string): Promise<void>;
  /** Scale the machine to zero (stop compute, keep storage). */
  stop(id: string): Promise<void>;
  /** Change the machine's resource tier. */
  resize(id: string, tier: Tier): Promise<void>;
  /** Permanently delete the machine's compute. */
  destroy(id: string): Promise<void>;

  /** Attach a GPU; resolves when the GPU is ready. Returns a provider GPU id. */
  attachGpu(id: string, spec: GpuSpec): Promise<string>;
  /** Release the attached GPU. */
  detachGpu(id: string): Promise<void>;
}
