import { useState, type CSSProperties } from "react";
import HearthMark from "./HearthMark";

type Workspace = { id: string; name: string };
type Team = { id: string; name: string };

const STATE_COLOR: Record<string, string> = {
  running: "var(--accent)",
  asleep: "var(--fg-subtle)",
  waking: "var(--fg-muted)",
  provisioning: "var(--fg-muted)",
  error: "var(--danger)",
};

type Props = {
  instanceName: string;
  workspaces: Workspace[];
  activeWs: string;
  activeWsMachineState: string;
  onSelectWs: (id: string) => void;
  onNewWs: () => void;
  onDeleteWs: (id: string) => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  onOpenMachine: () => void;
  // multi-user identity + scope
  multiUser: boolean;
  me: string | null;
  scope: string;
  scopeLabel: string;
  teams: Team[];
  onSwitchScope: (s: string) => void;
  onManageTeams: () => void;
  onChangePassword: () => void;
  onSignOutAll: () => void;
  onSignOut: () => void;
};

export default function Sidebar(p: Props) {
  const [acctMenu, setAcctMenu] = useState(false);
  const [scopeMenu, setScopeMenu] = useState(false);

  return (
    <div style={sidebar} className="hearth-sidebar">
      {/* brand + collapse */}
      <div style={brandRow}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <HearthMark size={20} />
          <span style={{ fontWeight: 600, color: "var(--fg)", fontFamily: "var(--font-mono)", fontSize: 14, letterSpacing: "-0.01em" }}>hearth</span>
        </span>
        <button onClick={p.onCollapse} title="collapse sidebar" className="hearth-act" style={iconBtn} aria-label="collapse sidebar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      </div>

      {/* scope (personal / team) */}
      {p.multiUser && (
        <div style={{ position: "relative", padding: "0 10px 6px" }}>
          <button onClick={() => setScopeMenu((o) => !o)} className="hearth-act" style={scopeBtn}>
            <span style={{ fontSize: 10, color: p.scope === "me" ? "var(--fg-subtle)" : "var(--accent)" }}>{p.scope === "me" ? "◐" : "◆"}</span>
            <span style={{ color: "var(--fg)", flex: 1, textAlign: "left" }}>{p.scopeLabel}</span>
            <span style={{ color: "var(--fg-subtle)", fontSize: 10 }}>▾</span>
          </button>
          {scopeMenu && (
            <>
              <div onClick={() => setScopeMenu(false)} style={overlay} />
              <div style={{ ...menu, top: 38, left: 10, right: 10 }} className="hearth-fade">
                <button onClick={() => { p.onSwitchScope("me"); setScopeMenu(false); }} className="hearth-act" style={{ ...menuItem, color: p.scope === "me" ? "var(--fg)" : "var(--fg-muted)", background: p.scope === "me" ? "var(--accent-soft)" : "transparent" }}>Personal</button>
                {p.teams.map((t) => (
                  <button key={t.id} onClick={() => { p.onSwitchScope(`team:${t.id}`); setScopeMenu(false); }} className="hearth-act" style={{ ...menuItem, color: p.scope === `team:${t.id}` ? "var(--fg)" : "var(--fg-muted)", background: p.scope === `team:${t.id}` ? "var(--accent-soft)" : "transparent" }}>{t.name}</button>
                ))}
                <button onClick={() => { setScopeMenu(false); p.onManageTeams(); }} className="hearth-act" style={{ ...menuItem, color: "var(--fg-muted)", borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 8 }}>⚙ manage teams…</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* workspaces */}
      <div style={sectionRow}>
        <span style={sectionLabel}>Workspaces</span>
        <button onClick={p.onNewWs} title="new workspace" className="hearth-act" style={iconBtn} aria-label="new workspace">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
        {p.workspaces.map((w) => {
          const active = w.id === p.activeWs;
          const st = active ? p.activeWsMachineState : "";
          const spinning = st === "waking" || st === "provisioning";
          return (
            <div key={w.id} className="hearth-ws-row" style={{ ...wsRow, ...(active ? wsRowActive : {}) }} onClick={() => p.onSelectWs(w.id)}>
              {active && <span style={activeBar} />}
              {spinning ? (
                <span className="hearth-spin" style={{ width: 9, height: 9, flexShrink: 0 }} />
              ) : (
                <span className={st === "running" ? "hearth-pulse" : undefined} style={{ width: 7, height: 7, borderRadius: 999, background: active ? (STATE_COLOR[st] ?? "var(--fg-subtle)") : "var(--border-strong)", flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, color: active ? "var(--fg)" : "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
              {active && st && <span style={{ fontSize: 9, color: "var(--fg-subtle)" }}>{st}</span>}
              {p.workspaces.length > 1 && (
                <span
                  className="hearth-ws-del"
                  onClick={(e) => { e.stopPropagation(); p.onDeleteWs(w.id); }}
                  title="delete workspace"
                  style={{ color: "var(--fg-subtle)", cursor: "pointer", fontSize: 14, lineHeight: 1, flexShrink: 0 }}
                >×</span>
              )}
            </div>
          );
        })}
      </div>

      {/* account / identity */}
      <div style={{ position: "relative", borderTop: "1px solid var(--border)", padding: 10 }}>
        {acctMenu && (
          <>
            <div onClick={() => setAcctMenu(false)} style={overlay} />
            <div style={{ ...menu, bottom: 58, left: 10, right: 10 }} className="hearth-fade">
              <button onClick={() => { setAcctMenu(false); p.onOpenMachine(); }} className="hearth-act" style={menuItem}>Machine · size, GPU, usage</button>
              <button onClick={() => { setAcctMenu(false); p.onOpenSettings(); }} className="hearth-act" style={menuItem}>Settings</button>
              {p.multiUser && p.me && <>
                <button onClick={() => { setAcctMenu(false); p.onChangePassword(); }} className="hearth-act" style={{ ...menuItem, borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 8 }}>Change password…</button>
                <button onClick={() => { setAcctMenu(false); p.onSignOutAll(); }} className="hearth-act" style={menuItem}>Sign out everywhere</button>
                <button onClick={() => { setAcctMenu(false); p.onSignOut(); }} className="hearth-act" style={{ ...menuItem, color: "var(--fg)" }}>Sign out</button>
              </>}
            </div>
          </>
        )}
        <button onClick={() => setAcctMenu((o) => !o)} className="hearth-act" style={acctChip}>
          <span style={avatar}>{(p.multiUser && p.me ? p.me : p.instanceName).slice(0, 1)}</span>
          <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, textAlign: "left", lineHeight: 1.3 }}>
            <span style={{ color: "var(--fg)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.multiUser && p.me ? p.me : p.instanceName}</span>
            <span style={{ color: "var(--fg-subtle)", fontSize: 10 }}>{p.multiUser && p.me ? "signed in" : "your computer"}</span>
          </span>
          <span style={{ color: "var(--fg-subtle)", fontSize: 11 }}>⋯</span>
        </button>
      </div>
    </div>
  );
}

const sidebar: CSSProperties = {
  width: 236,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  borderRight: "1px solid var(--border)",
  background: "color-mix(in srgb, var(--bg-elevated) 45%, var(--bg))",
};
const brandRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 12px 10px" };
const iconBtn: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, background: "transparent", border: "none", color: "var(--fg-muted)", cursor: "pointer" };
const scopeBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 7, width: "100%", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg-muted)", cursor: "pointer", fontSize: 12, padding: "7px 9px" };
const sectionRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px 4px" };
const sectionLabel: CSSProperties = { fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" };
const wsRow: CSSProperties = { position: "relative", display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 1 };
const wsRowActive: CSSProperties = { background: "var(--accent-soft)" };
const activeBar: CSSProperties = { position: "absolute", left: -8, top: 8, bottom: 8, width: 2.5, borderRadius: 2, background: "var(--accent)" };
const acctChip: CSSProperties = { display: "flex", alignItems: "center", gap: 9, width: "100%", background: "transparent", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 9px", cursor: "pointer" };
const avatar: CSSProperties = { width: 26, height: 26, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 };
const overlay: CSSProperties = { position: "fixed", inset: 0, zIndex: 40 };
const menu: CSSProperties = { position: "absolute", zIndex: 41, background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: 10, boxShadow: "var(--shadow-md)", padding: 6 };
const menuItem: CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 6, color: "var(--fg-muted)", cursor: "pointer", fontSize: 13, padding: "7px 9px" };
