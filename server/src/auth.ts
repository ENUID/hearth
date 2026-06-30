import crypto from "crypto";
import type { IncomingMessage } from "http";
import { multiUserEnabled, getUser } from "./accounts";
import { isMember } from "./teams";

// Minimal, dependency-free HMAC-signed token (JWT-style: header.payload.sig).
const SECRET = process.env.HEARTH_JWT_SECRET ?? "dev-insecure-secret-change-me";
const PASSWORD = process.env.HEARTH_PASSWORD ?? "";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Auth is enforced in multi-user mode (per-user accounts), or in single-tenant
 * mode when explicitly enabled AND a shared password is configured.
 */
export const authEnabled =
  multiUserEnabled || (process.env.HEARTH_REQUIRE_AUTH === "true" && PASSWORD.length > 0);

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

/** Issue a token. `sub` identifies the user (multi-user) or defaults to "hearth". */
export function issueToken(sub = "hearth"): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub, iat: now, exp: now + TTL_SECONDS }));
  const data = `${header}.${payload}`;
  return `${data}.${hmac(data)}`;
}

/** Returns the decoded payload if the token is valid (signature + expiry), else null. */
export function decodeToken(token: string | undefined | null): { sub: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = hmac(`${header}.${payload}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number; sub?: string };
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: typeof decoded.sub === "string" ? decoded.sub : "hearth" };
  } catch {
    return null;
  }
}

export function verifyToken(token: string | undefined | null): boolean {
  return decodeToken(token) !== null;
}

export function checkPassword(password: string): boolean {
  if (!PASSWORD) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Extract a bearer token from the Authorization header or a `token` query param. */
export function tokenFromRequest(req: IncomingMessage, url?: URL): string | null {
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7);
  if (url) return url.searchParams.get("token");
  return null;
}

/** True if the request may proceed (auth disabled, or a valid token is present). */
export function isAuthorized(req: IncomingMessage, url?: URL): boolean {
  if (!authEnabled) return true;
  const decoded = decodeToken(tokenFromRequest(req, url));
  if (!decoded) return false;
  // In multi-user mode the token's subject must still resolve to a real user.
  if (multiUserEnabled) return getUser(decoded.sub) !== null;
  return true;
}

/**
 * The acting user's id for this request. In multi-user mode this comes from the
 * token's subject and is used to isolate each user's workspaces/sessions. When
 * auth is disabled or single-tenant, everyone shares the "default" namespace.
 */
export function userIdOf(req: IncomingMessage, url?: URL): string {
  const decoded = decodeToken(tokenFromRequest(req, url));
  return decoded?.sub && decoded.sub !== "hearth" ? decoded.sub : "default";
}

/** Reads the requested scope ("me" or "team:<id>") from the query or body. */
function scopeParam(req: IncomingMessage, url?: URL): string | undefined {
  if (url) {
    const s = url.searchParams.get("scope");
    if (s) return s;
  }
  const anyReq = req as unknown as { query?: Record<string, unknown>; body?: Record<string, unknown> };
  const v = anyReq.query?.scope ?? anyReq.body?.scope;
  return typeof v === "string" ? v : undefined;
}

/**
 * The namespace this request acts in: the acting user, or a team the user
 * actually belongs to (membership is verified — a forged team scope falls back
 * to the user's own namespace). Null in single-tenant mode.
 */
export function activeNamespace(req: IncomingMessage, url?: URL): string | null {
  if (!multiUserEnabled) return null;
  const uid = userIdOf(req, url);
  const scope = scopeParam(req, url);
  if (scope && scope.startsWith("team:")) {
    const teamId = scope.slice(5);
    if (isMember(teamId, uid)) return `team_${teamId}`;
  }
  return uid;
}

/**
 * Prefix an id (workspace / session) with the active namespace (user or team).
 * No-op unless multi-user mode is on, so single-tenant deployments are unchanged.
 */
export function scopeId(req: IncomingMessage, url: URL | undefined, id: string): string {
  const ns = activeNamespace(req, url);
  return ns ? `${ns}::${id}` : id;
}
