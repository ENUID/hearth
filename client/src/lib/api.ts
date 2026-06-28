const TOKEN_KEY = "hearth_token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

/** `&token=...` suffix for URLs that can't carry an Authorization header (WS, links). */
export function tokenParam(): string {
  const t = getToken();
  return t ? `&token=${encodeURIComponent(t)}` : "";
}

export async function getConfig(): Promise<{ authRequired: boolean }> {
  const r = await fetch("/api/config");
  return r.json();
}

export async function login(password: string): Promise<void> {
  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!r.ok) throw new Error("Invalid password");
  const j = (await r.json()) as { token?: string };
  if (j.token) setToken(j.token);
}

export async function uploadFile(sid: string, file: File): Promise<{ ok?: boolean; path?: string; error?: string }> {
  const r = await fetch(
    `/api/files/upload?sid=${encodeURIComponent(sid)}&name=${encodeURIComponent(file.name)}`,
    { method: "POST", headers: authHeaders(), body: file }
  );
  return r.json();
}

export function downloadUrl(sid: string, path: string): string {
  return `/api/files/download?sid=${encodeURIComponent(sid)}&path=${encodeURIComponent(path)}${tokenParam()}`;
}

export async function killSession(sid: string): Promise<void> {
  await fetch(`/api/session/kill?sid=${encodeURIComponent(sid)}`, {
    method: "POST",
    headers: authHeaders(),
  }).catch(() => {});
}

// --- Phase 2 control plane ---

async function authedJson(path: string, opts: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { ...authHeaders() };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
  return r.json();
}

export interface MachineSnapshot {
  machine: {
    id: string;
    tier: "free" | "pro" | "max";
    resources: { cpu: number; memoryMb: number };
    state: string;
    gpu: { id: string; spec: { type: string; label: string; vramGb: number; hourlyCents: number }; state: string } | null;
  } | null;
  usage: { machineMinutes: number; machineCents: number; gpuMinutes: number; gpuCents: number; totalCents: number };
  tiers: Record<string, { label: string; resources: { cpu: number; memoryMb: number }; hourlyCents: number }>;
  gpuCatalog: Record<string, { type: string; label: string; vramGb: number; hourlyCents: number }>;
  provider: string;
  billing: { name: string; live: boolean };
}

const W = (ws: string) => encodeURIComponent(ws);
export const getMachine = (ws = "workspace"): Promise<MachineSnapshot> => authedJson(`/api/machine?ws=${W(ws)}`);
export const resizeMachine = (tier: string, ws = "workspace"): Promise<MachineSnapshot> => authedJson("/api/machine/resize", { method: "POST", body: { tier, ws } });
export const provisionGpu = (type: string, ws = "workspace"): Promise<MachineSnapshot> => authedJson("/api/machine/gpu", { method: "POST", body: { type, ws } });
export const releaseGpu = (ws = "workspace"): Promise<MachineSnapshot> => authedJson(`/api/machine/gpu?ws=${W(ws)}`, { method: "DELETE" });
export const sleepMachine = (ws = "workspace"): Promise<MachineSnapshot> => authedJson("/api/machine/sleep", { method: "POST", body: { ws } });
export const wakeMachine = (ws = "workspace"): Promise<MachineSnapshot> => authedJson("/api/machine/wake", { method: "POST", body: { ws } });
export const getWorkspaces = (): Promise<{ workspaces: { id: string; state: string; tier: string }[] }> => authedJson("/api/workspaces");
export const chargeNow = (): Promise<{ invoice: { totalCents: number }; result: { status: string; provider: string; amountCents: number } }> =>
  authedJson("/api/billing/charge", { method: "POST" });
