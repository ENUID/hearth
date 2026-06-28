import type { GpuSpec } from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LAT = parseInt(process.env.HEARTH_PROVIDER_LATENCY_MS ?? "150", 10);

// A GPU is a separately-billed, rent-don't-own resource — its own backend, not
// tied to the machine provider. Mock by default; real RunPod when RUNPOD_API_KEY
// is set.
export interface GpuBackend {
  readonly name: string;
  provision(machineId: string, spec: GpuSpec): Promise<string>; // returns a GPU id
  release(machineId: string, gpuId: string): Promise<void>;
}

export class MockGpu implements GpuBackend {
  readonly name = "mock";
  async provision(): Promise<string> {
    await delay(LAT * 3); // GPUs take longer to come up
    return `mock-gpu-${Math.random().toString(36).slice(2, 8)}`;
  }
  async release(): Promise<void> {
    await delay(Math.min(LAT, 50));
  }
}

// RunPod on-demand GPU pods via their GraphQL API. Real integration; activates
// when RUNPOD_API_KEY is set. Not exercised in the sandbox (no key / egress).
const RUNPOD_GPU_TYPE: Record<string, string> = {
  a10g: "NVIDIA A10",
  a100: "NVIDIA A100 80GB PCIe",
  h100: "NVIDIA H100 80GB HBM3",
};

export class RunPodGpu implements GpuBackend {
  readonly name = "runpod";
  constructor(private key: string, private image = process.env.RUNPOD_IMAGE ?? "runpod/base:latest") {}

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://api.runpod.io/graphql?api_key=${this.key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(`runpod: ${json.errors[0].message}`);
    if (!json.data) throw new Error("runpod: empty response");
    return json.data;
  }

  async provision(machineId: string, spec: GpuSpec): Promise<string> {
    const gpuTypeId = RUNPOD_GPU_TYPE[spec.type] ?? RUNPOD_GPU_TYPE.a10g;
    const data = await this.gql<{ podFindAndDeployOnDemand: { id: string } }>(
      `mutation($input: PodFindAndDeployOnDemandInput!){
         podFindAndDeployOnDemand(input:$input){ id }
       }`,
      {
        input: {
          name: `hearth-${machineId}`,
          imageName: this.image,
          gpuTypeId,
          gpuCount: 1,
          cloudType: "SECURE",
          volumeInGb: 0,
          containerDiskInGb: 20,
        },
      }
    );
    return data.podFindAndDeployOnDemand.id;
  }

  async release(_machineId: string, gpuId: string): Promise<void> {
    await this.gql(`mutation($input: PodTerminateInput!){ podTerminate(input:$input) }`, {
      input: { podId: gpuId },
    });
  }
}

export function makeGpuBackend(): GpuBackend {
  const key = process.env.RUNPOD_API_KEY;
  return key ? new RunPodGpu(key) : new MockGpu();
}
