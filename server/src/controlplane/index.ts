import { MachineManager } from "./manager";
import { makeBilling } from "./billing";
import { LocalProvider } from "./providers/local";
import { DockerProvider } from "./providers/docker";
import { KubernetesProvider } from "./providers/kubernetes";
import { FlyProvider } from "./providers/fly";
import type { MachineProvider } from "./provider";

function makeProvider(): MachineProvider {
  switch (process.env.HEARTH_PROVIDER) {
    case "docker":
      return new DockerProvider();
    case "kubernetes":
      return new KubernetesProvider();
    case "fly":
      return new FlyProvider();
    default:
      return new LocalProvider();
  }
}

// A single workspace machine backs all of a user's terminal tabs. (Multi-user
// workspaces are Phase 3.)
export const WORKSPACE_ID = "workspace";

export const provider = makeProvider();
export const manager = new MachineManager(provider);
export const billing = makeBilling();

manager.start();
