import { exec } from "child_process";
import { promisify } from "util";
import type { MachineProvider } from "../provider";
import { GPU_CATALOG, TIERS, type GpuSpec, type Tier } from "../types";

const execAsync = promisify(exec);

// Real Docker-backed provider. Each machine is a long-lived container whose
// CPU/memory limits are updated on resize, stopped on scale-to-zero (its volume
// persists), and started on wake. Activates when HEARTH_PROVIDER=docker and a
// usable workspace image is available (set HEARTH_WORKSPACE_IMAGE).
//
// NOTE: not exercised in the build sandbox (image registry is blocked there),
// but the commands are the real ones used in a Docker-capable environment.
export class DockerProvider implements MachineProvider {
  readonly name = "docker";
  private image = process.env.HEARTH_WORKSPACE_IMAGE ?? "hearth-workspace:latest";

  private container(id: string): string {
    return `hearth-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  }
  private volume(id: string): string {
    return `hearth-home-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  }

  async create(id: string, tier: Tier): Promise<void> {
    const spec = TIERS[tier].resources;
    const name = this.container(id);
    await execAsync(`docker volume create ${this.volume(id)}`).catch(() => {});
    await execAsync(
      [
        "docker run -d --restart unless-stopped",
        `--name ${name}`,
        `--cpus ${spec.cpu} --memory ${spec.memoryMb}m`,
        `-v ${this.volume(id)}:/home/hearth`,
        this.image,
      ].join(" ")
    );
  }
  async start(id: string): Promise<void> {
    await execAsync(`docker start ${this.container(id)}`);
  }
  async stop(id: string): Promise<void> {
    // Stop compute; the named volume (home) persists.
    await execAsync(`docker stop ${this.container(id)}`).catch(() => {});
  }
  async resize(id: string, tier: Tier): Promise<void> {
    const spec = TIERS[tier].resources;
    await execAsync(`docker update --cpus ${spec.cpu} --memory ${spec.memoryMb}m ${this.container(id)}`);
  }
  async destroy(id: string): Promise<void> {
    // Commit the rootfs so apt-installed software persists, then remove the
    // running container (volume + committed image remain).
    await execAsync(`docker commit ${this.container(id)} hearth-rootfs-${id}`).catch(() => {});
    await execAsync(`docker rm -f ${this.container(id)}`).catch(() => {});
  }
  async attachGpu(id: string, spec: GpuSpec): Promise<string> {
    // Recreate the container with the GPU reserved (Docker can't hot-add GPUs).
    const known = GPU_CATALOG[spec.type] ? spec.type : "a10g";
    await this.stop(id);
    await execAsync(`docker rm ${this.container(id)}`).catch(() => {});
    await execAsync(
      [
        "docker run -d --restart unless-stopped --gpus all",
        `--name ${this.container(id)}`,
        `-v ${this.volume(id)}:/home/hearth`,
        `--label hearth.gpu=${known}`,
        this.image,
      ].join(" ")
    );
    return `docker-gpu-${known}`;
  }
  async detachGpu(id: string): Promise<void> {
    await this.stop(id);
    await execAsync(`docker rm ${this.container(id)}`).catch(() => {});
    await this.create(id, "pro");
  }
}
