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

// --- active scope (personal "me" or "team:<id>") ---
const SCOPE_KEY = "hearth_scope";
export function getScope(): string {
  try {
    return localStorage.getItem(SCOPE_KEY) || "me";
  } catch {
    return "me";
  }
}
export function setScope(scope: string): void {
  try {
    if (!scope || scope === "me") localStorage.removeItem(SCOPE_KEY);
    else localStorage.setItem(SCOPE_KEY, scope);
  } catch {
    /* ignore */
  }
}
/** `&scope=...` suffix for URLs (empty in personal scope). */
export function scopeParam(): string {
  const s = getScope();
  return s && s !== "me" ? `&scope=${encodeURIComponent(s)}` : "";
}
/** Append the active scope to a request path as a query param. */
function withScope(path: string): string {
  const s = getScope();
  if (!s || s === "me") return path;
  return path + (path.includes("?") ? "&" : "?") + "scope=" + encodeURIComponent(s);
}

export async function getConfig(): Promise<{ authRequired: boolean; multiUser: boolean; instanceName?: string; signupsOpen?: boolean }> {
  const r = await fetch("/api/config");
  return r.json();
}

export async function login(password: string, username?: string): Promise<void> {
  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password, username }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Invalid credentials");
  const j = (await r.json()) as { token?: string };
  if (j.token) setToken(j.token);
}

export async function signup(username: string, password: string): Promise<void> {
  const r = await fetch("/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Sign up failed");
  const j = (await r.json()) as { token?: string };
  if (j.token) setToken(j.token);
}

export async function getMe(): Promise<{ user: { username: string } | null }> {
  const r = await fetch("/api/me", { headers: authHeaders() });
  return r.json();
}

// --- teams ---
export interface TeamMember { userId: string; username: string; role: "owner" | "member" }
export interface Team { id: string; name: string; members: TeamMember[]; role?: "owner" | "member" }
export const getTeams = (): Promise<{ teams: Team[] }> => authedJson("/api/teams");
export const createTeam = (name: string): Promise<{ team: Team }> => authedJson("/api/teams", { method: "POST", body: { name } });
export const addTeamMember = (id: string, username: string): Promise<{ team: Team }> =>
  authedJson(`/api/teams/${encodeURIComponent(id)}/members`, { method: "POST", body: { username } });
export const removeTeamMember = (id: string, userId: string): Promise<{ team: Team | null }> =>
  authedJson(`/api/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });

export function logout(): void {
  setToken(null);
}

export async function uploadFile(sid: string, file: File): Promise<{ ok?: boolean; path?: string; error?: string }> {
  const r = await fetch(
    `/api/files/upload?sid=${encodeURIComponent(sid)}&name=${encodeURIComponent(file.name)}${scopeParam()}`,
    { method: "POST", headers: authHeaders(), body: file }
  );
  return r.json();
}

export function downloadUrl(sid: string, path: string): string {
  return `/api/files/download?sid=${encodeURIComponent(sid)}&path=${encodeURIComponent(path)}${tokenParam()}${scopeParam()}`;
}

export async function killSession(sid: string): Promise<void> {
  await fetch(`/api/session/kill?sid=${encodeURIComponent(sid)}${scopeParam()}`, {
    method: "POST",
    headers: authHeaders(),
  }).catch(() => {});
}

// --- Phase 2 control plane ---

async function authedJson(path: string, opts: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { ...authHeaders() };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(withScope(path), {
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

// --- open-model runner ---
export interface ModelInfo {
  id: string; name: string; params: string; family: string; gpu: "cpu" | "a10g" | "a100"; sizeGb: number; blurb: string;
  category: "chat" | "image" | "audio" | "video";
  localTier: "easy" | "heavy" | "none"; mlcId?: string;
}
export interface RunningModel {
  workspace: string; modelId: string; name: string; status: string; startedAt: number; gpu: string | null; error?: string;
}
export interface ModelsSnapshot {
  catalog: ModelInfo[]; running: RunningModel | null; backend: string; apiPath: string;
}
export const getModels = (ws = "workspace"): Promise<ModelsSnapshot> => authedJson(`/api/models?ws=${W(ws)}`);
export const startModel = (modelId: string, ws = "workspace"): Promise<{ running: RunningModel }> => authedJson("/api/models/start", { method: "POST", body: { modelId, ws } });
export const stopModel = (ws = "workspace"): Promise<{ running: RunningModel | null }> => authedJson("/api/models/stop", { method: "POST", body: { ws } });

/** Streaming OpenAI-compatible chat against the workspace's running model. */
export function modelChat(messages: { role: string; content: string }[], ws = "workspace"): Promise<Response> {
  return fetch("/api/models/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ ws, messages, stream: true }),
  });
}
export const chargeNow = (): Promise<{ invoice: { totalCents: number }; result: { status: string; provider: string; amountCents: number } }> =>
  authedJson("/api/billing/charge", { method: "POST" });

// --- CLI agent catalog ---
export interface AgentInfo {
  id: string; name: string; vendor: string; blurb: string;
  install: string; run: string; bin: string;
  brain: "local" | "byok" | "both"; openSource: boolean; docs: string; localNote?: string;
}
export interface AgentsSnapshot { catalog: AgentInfo[]; localModelApi: string }
export const getAgents = (): Promise<AgentsSnapshot> => authedJson("/api/agents");
export const getAgentStatus = (): Promise<{ installed: Record<string, boolean> }> => authedJson("/api/agents/status");
