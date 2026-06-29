import type { Express, Request } from "express";
import { manager, billing, provider, WORKSPACE_ID } from "./index";
import { buildInvoice } from "./billing";
import { GPU_CATALOG, TIERS, type Tier } from "./types";
import { scopeId, userIdOf } from "../auth";
import { multiUserEnabled } from "../accounts";

type AuthFn = (req: Request) => boolean;

// In multi-user mode machine ids are "<userId>::<ws>". These helpers keep each
// user's listing and billing to their own workspaces.
function mine(req: Request, id: string): boolean {
  return !multiUserEnabled || id.startsWith(`${userIdOf(req)}::`);
}
function bareWs(id: string): string {
  const i = id.indexOf("::");
  return i >= 0 ? id.slice(i + 2) : id;
}

// Phase 3: each workspace is its own machine. The workspace id comes from the
// request (?ws= or body.ws); defaults to the single legacy workspace. In
// multi-user mode it's namespaced per user so machines/usage never collide.
function wsId(req: Request): string {
  const raw = String(req.query.ws ?? req.body?.ws ?? WORKSPACE_ID).trim();
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || WORKSPACE_ID;
  return scopeId(req, undefined, clean);
}

function snapshot(ws: string) {
  return {
    machine: manager.get(ws) ?? null,
    usage: manager.usageFor(ws),
    tiers: TIERS,
    gpuCatalog: GPU_CATALOG,
    provider: provider.name,
    gpuBackend: manager.gpuBackendName(),
    billing: { name: billing.name, live: billing.live },
    workspace: ws,
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

  app.get("/api/machine", guard(async (req, res) => {
    const ws = wsId(req);
    await manager.getOrCreate(ws);
    res.json(snapshot(ws));
  }));

  app.post("/api/machine/resize", guard(async (req, res) => {
    const tier = String(req.body?.tier ?? "") as Tier;
    if (!TIERS[tier]) throw new Error("invalid tier");
    await manager.resize(wsId(req), tier);
    res.json(snapshot(wsId(req)));
  }));

  app.post("/api/machine/wake", guard(async (req, res) => {
    await manager.touch(wsId(req));
    res.json(snapshot(wsId(req)));
  }));

  app.post("/api/machine/sleep", guard(async (req, res) => {
    await manager.sleep(wsId(req));
    res.json(snapshot(wsId(req)));
  }));

  app.post("/api/machine/gpu", guard(async (req, res) => {
    await manager.provisionGpu(wsId(req), String(req.body?.type ?? ""));
    res.json(snapshot(wsId(req)));
  }));

  app.delete("/api/machine/gpu", guard(async (req, res) => {
    await manager.releaseGpu(wsId(req));
    res.json(snapshot(wsId(req)));
  }));

  // All workspaces (for the switcher) with light status — only the caller's.
  app.get("/api/workspaces", guard(async (req, res) => {
    res.json({
      workspaces: manager
        .list()
        .filter((m) => mine(req, m.id))
        .map((m) => ({ id: bareWs(m.id), state: m.state, tier: m.tier })),
    });
  }));

  app.get("/api/usage", guard(async (req, res) => {
    const usage = manager.usageFor(wsId(req));
    res.json({ usage, invoice: buildInvoice(usage) });
  }));

  app.post("/api/billing/charge", guard(async (req, res) => {
    // Bill across the caller's workspaces (one account).
    let total = 0;
    for (const m of manager.list()) if (mine(req, m.id)) total += manager.usageFor(m.id).totalCents;
    const result = await billing.charge(Math.round(total), "Hearth usage");
    res.json({ invoice: { totalCents: Math.round(total) }, result });
  }));
}
