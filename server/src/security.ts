import type { Request, Response, NextFunction } from "express";

// Dependency-free security middleware: hardening headers + a simple in-memory
// rate limiter for auth endpoints (brute-force protection).

const CSP = [
  "default-src 'self'",
  // WebLLM needs wasm eval + blob workers; React uses inline style attributes.
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' https: data:",
  // same-origin API/WS, plus https/wss for on-device model weight downloads.
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // Tell browsers to stick to HTTPS once seen over TLS (harmless on plain http).
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (process.env.HEARTH_DISABLE_CSP !== "1") res.setHeader("Content-Security-Policy", CSP);
  next();
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter keyed by client IP. In-memory (per process) — fine
 * for a single instance; front a multi-instance deploy with a shared limiter.
 */
export function rateLimit(opts: { windowMs: number; max: number; message?: string }) {
  const buckets = new Map<string, Bucket>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > opts.max) {
      res.setHeader("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
      res.status(429).json({ error: opts.message ?? "too many requests — slow down" });
      return;
    }
    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    next();
  };
}
