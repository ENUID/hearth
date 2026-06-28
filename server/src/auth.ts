import crypto from "crypto";
import type { IncomingMessage } from "http";

// Minimal, dependency-free HMAC-signed token (JWT-style: header.payload.sig).
const SECRET = process.env.HEARTH_JWT_SECRET ?? "dev-insecure-secret-change-me";
const PASSWORD = process.env.HEARTH_PASSWORD ?? "";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Auth is only enforced when explicitly enabled AND a password is configured. */
export const authEnabled =
  process.env.HEARTH_REQUIRE_AUTH === "true" && PASSWORD.length > 0;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function issueToken(): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub: "hearth", iat: now, exp: now + TTL_SECONDS }));
  const data = `${header}.${payload}`;
  return `${data}.${hmac(data)}`;
}

export function verifyToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [header, payload, sig] = parts;
  const expected = hmac(`${header}.${payload}`);
  // constant-time comparison
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return false;
  } catch {
    return false;
  }
  return true;
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
  return verifyToken(tokenFromRequest(req, url));
}
