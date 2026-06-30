import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getUser, getUserByUsername } from "./accounts";

// Teams (Phase 3): a group of users who share workspaces. A team-scoped
// workspace resolves to the same namespace for every member, so they share its
// machine, terminals, and home. Roles: "owner" (can manage members) or
// "member".
export type Role = "owner" | "member";

const STATE_DIR =
  process.env.HEARTH_STATE_DIR
    ? path.dirname(process.env.HEARTH_STATE_DIR)
    : path.join(process.env.HOME ?? "/tmp", ".hearth");
const FILE = path.join(STATE_DIR, "teams.json");

export interface Member {
  userId: string;
  role: Role;
}
export interface Team {
  id: string;
  name: string;
  members: Member[];
  createdAt: number;
}

type Store = { teams: Team[] };

function load(): Store {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    return { teams: [] };
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

export function isMember(teamId: string, userId: string): boolean {
  return load().teams.find((t) => t.id === teamId)?.members.some((m) => m.userId === userId) ?? false;
}

export function roleOf(teamId: string, userId: string): Role | null {
  return load().teams.find((t) => t.id === teamId)?.members.find((m) => m.userId === userId)?.role ?? null;
}

/** Public view of a team, with member usernames resolved. */
function view(t: Team) {
  return {
    id: t.id,
    name: t.name,
    members: t.members.map((m) => ({ userId: m.userId, username: getUser(m.userId)?.username ?? "?", role: m.role })),
  };
}

export function listTeamsForUser(userId: string) {
  return load()
    .teams.filter((t) => t.members.some((m) => m.userId === userId))
    .map((t) => ({ ...view(t), role: roleOf(t.id, userId) }));
}

export function createTeam(ownerId: string, name: string) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 40) throw new Error("team name must be 2–40 characters");
  const store = load();
  const team: Team = { id: crypto.randomUUID(), name: clean, members: [{ userId: ownerId, role: "owner" }], createdAt: Date.now() };
  store.teams.push(team);
  save(store);
  return view(team);
}

export function addMember(teamId: string, actorId: string, username: string, role: Role = "member") {
  const store = load();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) throw new Error("team not found");
  if (team.members.find((m) => m.userId === actorId)?.role !== "owner") throw new Error("only an owner can add members");
  const user = getUserByUsername(username);
  if (!user) throw new Error("no user with that username");
  if (team.members.some((m) => m.userId === user.id)) throw new Error("already a member");
  team.members.push({ userId: user.id, role });
  save(store);
  return view(team);
}

export function removeMember(teamId: string, actorId: string, userId: string) {
  const store = load();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) throw new Error("team not found");
  const actorRole = team.members.find((m) => m.userId === actorId)?.role;
  // Owners can remove anyone; members can remove themselves (leave).
  if (actorRole !== "owner" && actorId !== userId) throw new Error("not allowed");
  if (team.members.find((m) => m.userId === userId)?.role === "owner" && team.members.filter((m) => m.role === "owner").length === 1)
    throw new Error("can't remove the last owner");
  team.members = team.members.filter((m) => m.userId !== userId);
  if (team.members.length === 0) store.teams = store.teams.filter((t) => t.id !== teamId);
  save(store);
  return team.members.length ? view(team) : null;
}
