import type { Express, Request } from "express";
import { manager, billing, provider, WORKSPACE_ID } from "./index";
import { buildInvoice } from "./billing";
import { GPU_CATALOG, TIERS, type Tier } from "./types";

type AuthFn = (req: Request) => boolean;

function snapshot() {
  const machine = manager.get(WORKSPACE_ID) ?? null;
  const usage = manager.usageFor(WORKSPACE_ID);
  return {
    machine,
    usage,
    tiers: TIERS,
    gpuCatalog: GPU_CATALOG,
    provider: provider.name,
    gpuBackend: manager.gpuBackendName(),
    billing: { name: billing.name, live: billing.live },
  };
}

export function mountControlPlane(app: Express, isAuthed: AuthFn): void {
  const guard =
    (handler: (req: Request, res: import("express").Response) => void | Promise<void>) =>
    async (req: Request, res: import("express").Response) => {
      if (!isAuthed(req)) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      try {
        await handler(req, res);
      } catch (e) {
        res.status(400).json({ error: (e as Error).message });
      }
    };

  app.get("/api/machine", guard(async (_req, res) => {
    await manager.getOrCreate(WORKSPACE_ID);
    res.json(snapshot());
  }));

  app.post("/api/machine/resize", guard(async (req, res) => {
    const tier = String(req.body?.tier ?? "") as Tier;
    if (!TIERS[tier]) throw new Error("invalid tier");
    await manager.resize(WORKSPACE_ID, tier);
    res.json(snapshot());
  }));

  app.post("/api/machine/wake", guard(async (_req, res) => {
    await manager.touch(WORKSPACE_ID);
    res.json(snapshot());
  }));

  app.post("/api/machine/sleep", guard(async (_req, res) => {
    await manager.sleep(WORKSPACE_ID);
    res.json(snapshot());
  }));

  app.post("/api/machine/gpu", guard(async (req, res) => {
    const type = String(req.body?.type ?? "");
    await manager.provisionGpu(WORKSPACE_ID, type);
    res.json(snapshot());
  }));

  app.delete("/api/machine/gpu", guard(async (_req, res) => {
    await manager.releaseGpu(WORKSPACE_ID);
    res.json(snapshot());
  }));

  app.get("/api/usage", guard(async (_req, res) => {
    const usage = manager.usageFor(WORKSPACE_ID);
    res.json({ usage, invoice: buildInvoice(usage) });
  }));

  app.post("/api/billing/charge", guard(async (_req, res) => {
    const usage = manager.usageFor(WORKSPACE_ID);
    const invoice = buildInvoice(usage);
    const result = await billing.charge(invoice.totalCents, "Hearth usage");
    res.json({ invoice, result });
  }));
}
