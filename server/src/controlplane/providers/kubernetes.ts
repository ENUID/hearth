import { exec } from "child_process";
import { promisify } from "util";
import type { MachineProvider } from "../provider";
import { GPU_CATALOG, TIERS, type GpuSpec, type Tier } from "../types";

const execAsync = promisify(exec);

// Real Kubernetes provider (kubectl-based). Each machine is a Deployment backed
// by a PVC for its home directory; scale-to-zero sets replicas to 0; GPUs are
// requested via nvidia.com/gpu with a node selector. Activates when
// HEARTH_PROVIDER=kubernetes. Not exercised in the build sandbox (no cluster),
// but these are the real commands used against a cluster.
export class KubernetesProvider implements MachineProvider {
  readonly name = "kubernetes";
  private ns = process.env.HEARTH_K8S_NAMESPACE ?? "hearth";
  private image = process.env.HEARTH_WORKSPACE_IMAGE ?? "hearth-workspace:latest";

  private dep(id: string): string {
    return `ws-${id.replace(/[^a-zA-Z0-9-]/g, "-")}`.toLowerCase();
  }
  private async k(args: string): Promise<string> {
    const { stdout } = await execAsync(`kubectl -n ${this.ns} ${args}`);
    return stdout;
  }

  async create(id: string, tier: Tier): Promise<void> {
    const r = TIERS[tier].resources;
    const name = this.dep(id);
    const manifest = JSON.stringify({
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name, labels: { app: "hearth-workspace", machine: name } },
      spec: {
        replicas: 1,
        selector: { matchLabels: { machine: name } },
        template: {
          metadata: { labels: { app: "hearth-workspace", machine: name } },
          spec: {
            containers: [
              {
                name: "workspace",
                image: this.image,
                resources: {
                  requests: { cpu: String(r.cpu), memory: `${r.memoryMb}Mi` },
                  limits: { cpu: String(r.cpu), memory: `${r.memoryMb}Mi` },
                },
                volumeMounts: [{ name: "home", mountPath: "/home/hearth" }],
              },
            ],
            volumes: [{ name: "home", persistentVolumeClaim: { claimName: `${name}-home` } }],
          },
        },
      },
    });
    // PVC (home) is created once and kept across scale-to-zero / restarts.
    const pvc = JSON.stringify({
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: { name: `${name}-home` },
      spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "10Gi" } } },
    });
    await execAsync(`echo '${pvc}' | kubectl -n ${this.ns} apply -f -`).catch(() => {});
    await execAsync(`echo '${manifest}' | kubectl -n ${this.ns} apply -f -`);
  }
  async start(id: string): Promise<void> {
    await this.k(`scale deployment ${this.dep(id)} --replicas=1`);
  }
  async stop(id: string): Promise<void> {
    await this.k(`scale deployment ${this.dep(id)} --replicas=0`);
  }
  async resize(id: string, tier: Tier): Promise<void> {
    const r = TIERS[tier].resources;
    await this.k(
      `set resources deployment ${this.dep(id)} ` +
        `--limits=cpu=${r.cpu},memory=${r.memoryMb}Mi --requests=cpu=${r.cpu},memory=${r.memoryMb}Mi`
    );
  }
  async destroy(id: string): Promise<void> {
    await this.k(`delete deployment ${this.dep(id)} --ignore-not-found`);
  }
  async attachGpu(id: string, spec: GpuSpec): Promise<string> {
    const known = GPU_CATALOG[spec.type] ? spec.type : "a10g";
    const patch = JSON.stringify({
      spec: {
        template: {
          spec: {
            nodeSelector: { "hearth.io/gpu": known },
            containers: [{ name: "workspace", resources: { limits: { "nvidia.com/gpu": "1" } } }],
          },
        },
      },
    });
    await this.k(`patch deployment ${this.dep(id)} --type merge -p '${patch}'`);
    return `k8s-gpu-${known}`;
  }
  async detachGpu(id: string): Promise<void> {
    const patch = JSON.stringify({
      spec: { template: { spec: { nodeSelector: null, containers: [{ name: "workspace", resources: { limits: { "nvidia.com/gpu": null } } }] } } },
    });
    await this.k(`patch deployment ${this.dep(id)} --type merge -p '${patch}'`);
  }
}
