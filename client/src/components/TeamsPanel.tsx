import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getTeams, createTeam, addTeamMember, removeTeamMember, getScope, type Team } from "../lib/api";

// Manage teams (shared workspaces). Switching scope reloads so every terminal
// and the workspace list reconnect in the chosen namespace.
export default function TeamsPanel({ me, onClose, onSwitchScope }: { me: string | null; onClose: () => void; onSwitchScope: (scope: string) => void }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const current = getScope();

  const refresh = useCallback(() => {
    getTeams().then((r) => setTeams(r.teams)).catch((e) => setMsg((e as Error).message));
  }, []);
  useEffect(refresh, [refresh]);

  async function doCreate(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    try {
      await createTeam(name.trim());
      setName("");
      setMsg("");
      refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }
  async function doInvite(team: Team) {
    const u = (invite[team.id] ?? "").trim();
    if (!u) return;
    try {
      await addTeamMember(team.id, u);
      setInvite((p) => ({ ...p, [team.id]: "" }));
      setMsg("");
      refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }
  async function doRemove(team: Team, userId: string) {
    try {
      await removeTeamMember(team.id, userId);
      setMsg("");
      refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} className="hearth-fade" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--fg)" }}>teams</span>
          <button onClick={onClose} style={closeBtn} aria-label="close" tabIndex={-1}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 12, lineHeight: 1.5 }}>
          A team shares workspaces — same machines, terminals, and home. Switch to a team to work in it.
        </div>

        {/* scope switch: personal */}
        <button onClick={() => onSwitchScope("me")} style={{ ...scopeRow, borderColor: current === "me" ? "var(--accent)" : "var(--border)" }}>
          <span style={{ fontWeight: 600, color: "var(--fg)" }}>Personal</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: current === "me" ? "var(--accent)" : "var(--fg-subtle)" }}>{current === "me" ? "active" : "switch"}</span>
        </button>

        {teams === null ? (
          <div style={{ color: "var(--fg-muted)", fontSize: 13, padding: 8 }}>loading…</div>
        ) : (
          teams.map((t) => {
            const scope = `team:${t.id}`;
            const iAmOwner = t.members.find((m) => m.username === me)?.role === "owner";
            const mine = t.members.find((m) => m.username === me);
            return (
              <div key={t.id} style={teamCard}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, color: "var(--fg)" }}>{t.name}</span>
                  {iAmOwner && <span style={badge}>owner</span>}
                  <button onClick={() => onSwitchScope(scope)} style={{ ...miniBtn, marginLeft: "auto", borderColor: current === scope ? "var(--accent)" : "var(--border-strong)", color: current === scope ? "var(--accent)" : "var(--fg)" }}>
                    {current === scope ? "active" : "switch to"}
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                  {t.members.map((m) => (
                    <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <span style={{ color: "var(--fg)" }}>{m.username}{m.username === me ? " (you)" : ""}</span>
                      <span style={{ fontSize: 9, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{m.role}</span>
                      {iAmOwner && m.username !== me && (
                        <span onClick={() => doRemove(t, m.userId)} title="remove" style={{ marginLeft: "auto", color: "var(--fg-subtle)", cursor: "pointer", fontSize: 14 }}>×</span>
                      )}
                    </div>
                  ))}
                </div>
                {iAmOwner && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <input value={invite[t.id] ?? ""} onChange={(e) => setInvite((p) => ({ ...p, [t.id]: e.target.value }))} placeholder="invite by username"
                      onKeyDown={(e) => { if (e.key === "Enter") doInvite(t); }} style={field} />
                    <button onClick={() => doInvite(t)} style={miniBtn}>Invite</button>
                  </div>
                )}
                {mine && (
                  <button onClick={() => doRemove(t, mine.userId)} style={{ ...leaveBtn }}>Leave team</button>
                )}
              </div>
            );
          })
        )}

        <form onSubmit={doCreate} style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="new team name" style={field} />
          <button type="submit" style={primaryBtn}>Create</button>
        </form>
        {msg && <div style={{ color: "var(--accent)", fontSize: 12, marginTop: 8 }}>{msg}</div>}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(3px)" };
const sheet: React.CSSProperties = { position: "relative", width: 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-lg, 14px)", padding: "22px 24px", boxShadow: "0 24px 70px rgba(0,0,0,0.45)" };
const closeBtn: React.CSSProperties = { marginLeft: "auto", background: "transparent", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 15 };
const scopeRow: React.CSSProperties = { display: "flex", alignItems: "center", width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 8, cursor: "pointer" };
const teamCard: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 14px", marginBottom: 8, background: "var(--bg)" };
const badge: React.CSSProperties = { fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--fg-muted)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "1px 5px" };
const field: React.CSSProperties = { flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--fg)", padding: "7px 9px", fontSize: 12, outline: "none" };
const miniBtn: React.CSSProperties = { background: "transparent", color: "var(--fg)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
const primaryBtn: React.CSSProperties = { background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: "var(--radius-sm)", padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const leaveBtn: React.CSSProperties = { background: "transparent", color: "var(--fg-subtle)", border: "none", padding: "6px 0 0", fontSize: 11, cursor: "pointer", textDecoration: "underline" };
