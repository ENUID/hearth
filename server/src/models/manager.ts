import fs from "fs";
import path from "path";
import { manager as controlPlane } from "../controlplane/index";
import { findModel } from "./catalog";
import { makeRunner, type ModelRunner } from "./runner";

const STATE_DIR =
  process.env.HEARTH_STATE_DIR ?? path.join(process.env.HOME ?? "/tmp", ".hearth", "sessions");
const STATE_FILE = path.join(STATE_DIR, "models.json");

export type ModelStatus = "starting" | "running" | "stopped" | "error";

export interface RunningModel {
  workspace: string;
  modelId: string;
  name: string;
  status: ModelStatus;
  startedAt: number;
  gpu: string | null;
  error?: string;
}

class ModelManager {
  readonly runner: ModelRunner = makeRunner();
  private running = new Map<string, RunningModel>();

  constructor() {
    this.load();
  }

  get(ws: string): RunningModel | null {
    return this.running.get(ws) ?? null;
  }

  /** Run a model for a workspace: provision a GPU if needed, then serve it. */
  async start(ws: string, modelId: string): Promise<RunningModel> {
    const model = findModel(modelId);
    if (!model) throw new Error(`unknown model: ${modelId}`);

    // Switching models: release the previous one (and its GPU) first, so we
    // don't double-provision a GPU for the workspace.
    const prev = this.running.get(ws);
    if (prev && prev.status !== "stopped") await this.stop(ws).catch(() => {});

    const rec: RunningModel = {
      workspace: ws,
      modelId,
      name: model.name,
      status: "starting",
      startedAt: Date.now(),
      gpu: model.gpu === "cpu" ? null : model.gpu,
    };
    this.running.set(ws, rec);
    this.save();

    try {
      if (model.gpu === "cpu") {
        await controlPlane.touch(ws); // make sure the machine is awake
      } else {
        await controlPlane.provisionGpu(ws, model.gpu); // rent the GPU
      }
      await this.runner.start(modelId);
      rec.status = "running";
      rec.startedAt = Date.now();
    } catch (e) {
      rec.status = "error";
      rec.error = (e as Error).message;
    }
    this.save();
    return rec;
  }

  async stop(ws: string): Promise<RunningModel | null> {
    const rec = this.running.get(ws);
    if (!rec) return null;
    try {
      await this.runner.stop(rec.modelId);
      if (rec.gpu) await controlPlane.releaseGpu(ws); // stop GPU billing
    } catch {
      /* best effort */
    }
    rec.status = "stopped";
    this.save();
    return rec;
  }

  private save() {
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify([...this.running.values()]));
    } catch {
      /* best effort */
    }
  }
  private load() {
    try {
      const arr = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as RunningModel[];
      for (const r of arr) {
        // A model can't still be running after a restart — mark stopped.
        if (r.status === "running" || r.status === "starting") r.status = "stopped";
        this.running.set(r.workspace, r);
      }
    } catch {
      /* none */
    }
  }
}

export const modelManager = new ModelManager();
