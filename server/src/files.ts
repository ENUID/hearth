import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import { getSessionCwd } from "./ptyHandler";

function resolveInSession(sid: string, p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.resolve(getSessionCwd(sid), p);
}

// GET /api/download?sid=<id>&path=<relative-or-absolute>
export function handleDownload(req: Request, res: Response) {
  const sid = String(req.query.sid ?? "default");
  const p = req.query.path ? String(req.query.path) : "";
  if (!p) {
    res.status(400).json({ error: "path required" });
    return;
  }
  const target = resolveInSession(sid, p);
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) {
      res.status(404).json({ error: "not a file" });
      return;
    }
    res.download(target, path.basename(target));
  });
}

// POST /api/upload?sid=<id>&name=<filename>  (raw body = file bytes)
// Writes into the session's current working directory.
export function handleUpload(req: Request, res: Response) {
  const sid = String(req.query.sid ?? "default");
  const name = req.query.name ? path.basename(String(req.query.name)) : "";
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const target = path.join(getSessionCwd(sid), name);
  const out = fs.createWriteStream(target);
  let bytes = 0;
  req.on("data", (chunk) => (bytes += chunk.length));
  req.pipe(out);
  out.on("finish", () => res.json({ ok: true, path: target, bytes }));
  out.on("error", (e) => res.status(500).json({ error: e.message }));
}
