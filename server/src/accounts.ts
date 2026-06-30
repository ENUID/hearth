import crypto from "crypto";
import fs from "fs";
import path from "path";

// Multi-user accounts (Phase 3). Opt-in: when HEARTH_MULTIUSER=true, Hearth
// keeps a small user store and issues per-user tokens, so each person gets
// their own isolated workspaces. When off, Hearth stays single-tenant (the
// existing optional shared-password mode).
export const multiUserEnabled = process.env.HEARTH_MULTIUSER === "true";

const STATE_DIR =
  process.env.HEARTH_STATE_DIR
    ? path.dirname(process.env.HEARTH_STATE_DIR)
    : path.join(process.env.HOME ?? "/tmp", ".hearth");
const FILE = path.join(STATE_DIR, "accounts.json");

export interface User {
  id: string;
  username: string;
  salt: string; // hex
  hash: string; // hex (scrypt)
  createdAt: number;
}

type Store = { users: User[] };

function load(): Store {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    return { users: [] };
  }
}

function save(store: Store): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch {
    /* best effort */
  }
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function normUser(username: string): string {
  return username.trim().toLowerCase();
}

/** Create a user. Throws if the username is taken or input is invalid. */
export function createUser(username: string, password: string): User {
  const u = normUser(username);
  if (!/^[a-z0-9_.-]{2,32}$/.test(u)) throw new Error("username must be 2–32 chars (a–z, 0–9, . _ -)");
  if (password.length < 6) throw new Error("password must be at least 6 characters");
  const store = load();
  if (store.users.some((x) => x.username === u)) throw new Error("username already taken");
  const salt = crypto.randomBytes(16).toString("hex");
  const user: User = { id: crypto.randomUUID(), username: u, salt, hash: hashPassword(password, salt), createdAt: Date.now() };
  store.users.push(user);
  save(store);
  return user;
}

/** Verify credentials. Returns the user on success, null otherwise (constant-time). */
export function verifyUser(username: string, password: string): User | null {
  const u = normUser(username);
  const user = load().users.find((x) => x.username === u);
  if (!user) {
    // Hash anyway to keep timing roughly uniform whether or not the user exists.
    hashPassword(password, "00000000000000000000000000000000");
    return null;
  }
  const got = Buffer.from(hashPassword(password, user.salt), "hex");
  const want = Buffer.from(user.hash, "hex");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  return user;
}

export function getUser(id: string): User | null {
  return load().users.find((x) => x.id === id) ?? null;
}

export function getUserByUsername(username: string): User | null {
  const u = normUser(username);
  return load().users.find((x) => x.username === u) ?? null;
}

export function userCount(): number {
  return load().users.length;
}
