import { exec } from "child_process";
import { promisify } from "util";
import type { MachineProvider } from "../provider";
import { TIERS, type Tier } from "../types";

const execAsync = promisify(exec);

// Real Docker-backed provider. Each machine is a container whose CPU/memory
// limits update on resize and whose home is a named volume. Scale-to-zero
// commits the rootfs to a per-machine image then stops the container, so
// apt-installed system software survives even if the container is recreated
// (not just the home volume). Activates with HEARTH_PROVIDER=docker.
//
// Not exercised in the build sandbox (image registry is blocked), but these are
// the real commands used in a Docker-capable environment.
export class DockerProvider implements MachineProvider {
  readonly name = "docker";
  private baseImage = process.env.HEARTH_WORKSPACE_IMAGE ?? "hearth-workspace:latest";

  private container(id: string) {
    return `hearth-${this.safe(id)}`;
  }
  private volume(id: string) {
    return `hearth-home-${this.safe(id)}`;
  }
  private rootfsImage(id: string) {
    return `hearth-rootfs-${this.safe(id)}`;
  }
  private safe(id: string) {
    return id.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private async exists(cmd: string): Promise<boolean> {
    try {
      await execAsync(cmd);
      return true;
    } catch {
      return false;
    }
  }

  /** Use the committed rootfs image if one exists, else the base image. */
  private async imageFor(id: string): Promise<string> {
    return (await this.exists(`docker image inspect ${this.rootfsImage(id)}`))
      ? this.rootfsImage(id)
      : this.baseImage;
  }

  async create(id: string, tier: Tier): Promise<void> {
    const r = TIERS[tier].resources;
    await execAsync(`docker volume create ${this.volume(id)}`).catch(() => {});
    if (await this.exists(`docker container inspect ${this.container(id)}`)) {
      await this.start(id);
      return;
    }
    const image = await this.imageFor(id);
    await execAsync(
      [
        "docker run -d --restart unless-stopped",
        `--name ${this.container(id)}`,
        `--cpus ${r.cpu} --memory ${r.memoryMb}m`,
        `-v ${this.volume(id)}:/home/hearth`,
        image,
      ].join(" ")
    );
  }

  async start(id: string): Promise<void> {
    if (await this.exists(`docker container inspect ${this.container(id)}`)) {
      await execAsync(`docker start ${this.container(id)}`);
    } else {
      // Container was reaped — recreate from the committed rootfs (apt survives).
      await this.create(id, "pro");
    }
  }

  async stop(id: string): Promise<void> {
    // Snapshot the rootfs so system-level installs persist across recreation,
    // then stop compute. The home volume persists independently.
    await execAsync(`docker commit ${this.container(id)} ${this.rootfsImage(id)}`).catch(() => {});
    await execAsync(`docker stop ${this.container(id)}`).catch(() => {});
  }

  async resize(id: string, tier: Tier): Promise<void> {
    const r = TIERS[tier].resources;
    await execAsync(`docker update --cpus ${r.cpu} --memory ${r.memoryMb}m ${this.container(id)}`);
  }

  async destroy(id: string): Promise<void> {
    await execAsync(`docker rm -f ${this.container(id)}`).catch(() => {});
    await execAsync(`docker image rm -f ${this.rootfsImage(id)}`).catch(() => {});
  }
}
