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
