import { useCallback, useEffect, useState } from "react";
import { getAgents, getAgentStatus, type AgentInfo, type AgentsSnapshot } from "../lib/api";

// Prefix that points an OpenAI-compatible agent at the workspace's own model
// runner (the free on-device/cloud model). $HEARTH_MODEL_URL is exported into
// every terminal by the bridge; both env names are used by tools in the wild.
const FREE_PREFIX =
  'OPENAI_BASE_URL="$HEARTH_MODEL_URL" OPENAI_API_BASE="$HEARTH_MODEL_URL" OPENAI_API_KEY="${HEARTH_MODEL_KEY:-hearth}" ';

const brainLabel: Record<AgentInfo["brain"], string> = {
  local: "free model",
  byok: "your key",
  both: "free model · your key",
};

export default function AgentsPanel({ onRun, onClose }: { onRun: (cmd: string) => void; onClose: () => void }) {
  const [snap, setSnap] = useState<AgentsSnapshot | null>(null);
  const [msg, setMsg] = useState("");
  const [installed, setInstalled] = useState<Record<string, boolean>>({});

  const refreshStatus = useCallback(() => {
    getAgentStatus().then((s) => setInstalled(s.installed)).catch(() => {});
  }, []);

  useEffect(() => {
    getAgents().then(setSnap).catch((e) => setMsg((e as Error).message));
    refreshStatus();
    // Re-probe periodically so a finished install flips the badge to "installed".
    const t = setInterval(refreshStatus, 5000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  // Send a command into the active terminal (runs it — trailing newline).
  function send(cmd: string) {
    onRun(cmd + "\n");
  }
  // Launching an agent hands it the whole terminal, so close the panel too.
  function launch(cmd: string) {
    send(cmd);
    onClose();
  }
  function install(a: AgentInfo) {
    send(a.install);
    // Stay open: the card flips to "installed ✓" with a Run button once the
    // install finishes (probed every 5s), so the next step is always in view.
    setMsg(`Installing ${a.name} in your terminal — the Run button here lights up when it's ready.`);
  }

  return (
    <div className="hearth-slide-in" style={panel}>
      <div style={headerBar}>
        <span style={iconTile}>◆</span>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>agents</span>
          <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>CLI coding agents · one tap</span>
        </div>
        <button onClick={onClose} className="hearth-act" style={closeBtn} tabIndex={-1}>✕</button>
      </div>

      {!snap ? (
        <div style={{ padding: 14, color: "var(--fg-muted)" }}>loading…</div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 2 }}>
            Install an agent into this workspace's terminal. Open-source ones can run on your{" "}
            <b>free Hearth model</b>; others use your own provider key.
          </div>
          {snap.catalog.map((a) => {
            const canFree = a.brain !== "byok";
            const isIn = installed[a.id];
            return (
              <div key={a.id} className="hearth-card" style={card}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, color: "var(--fg)" }}>{a.name}</span>
                  <span style={{ fontSize: 10, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{a.vendor}</span>
                  {a.openSource && <span style={badge}>open source</span>}
                  <span style={badge}>{brainLabel[a.brain]}</span>
                  {isIn && <span style={{ ...badge, color: "var(--ok, #3fb950)", borderColor: "var(--ok, #3fb950)" }}>installed ✓</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-muted)", margin: "4px 0 6px" }}>{a.blurb}</div>
                {!isIn && <code style={cmdLine}>{a.install}</code>}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {isIn ? (
                    canFree ? (
                      <button onClick={() => launch(FREE_PREFIX + a.run)} className="hearth-act hearth-act-primary" style={runBtn} title="run pointed at your free Hearth model">
                        Run · free model
                      </button>
                    ) : (
                      <button onClick={() => launch(a.run)} className="hearth-act hearth-act-primary" style={runBtn}>Run</button>
                    )
                  ) : (
                    <>
                      <button onClick={() => install(a)} className="hearth-act hearth-act-primary" style={runBtn}>Install</button>
                      {canFree && (
                        <button onClick={() => launch(FREE_PREFIX + a.run)} className="hearth-act" style={secondaryBtn} title="run pointed at your free Hearth model">
                          Run · free model
                        </button>
                      )}
                    </>
                  )}
                </div>
                {a.localNote && <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 6 }}>{a.localNote}</div>}
              </div>
            );
          })}
          {msg && <div style={{ fontSize: 12, color: "var(--accent)", padding: "4px 2px" }}>{msg}</div>}
          <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 4, lineHeight: 1.5 }}>
            A curated few. Don't see your tool? It's a real terminal — install anything
            (npm, pip, brew, curl) and run it. "Run · free model" needs a model running
            (open the <b>models</b> panel first).
          </div>
        </div>
      )}
    </div>
  );
}

const panel: React.CSSProperties = { width: 380, maxWidth: "94vw", flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)", background: "var(--bg-elevated)", minHeight: 0 };
const headerBar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--border)" };
const iconTile: React.CSSProperties = { width: 26, height: 26, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 };
const closeBtn: React.CSSProperties = { marginLeft: "auto", background: "transparent", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 14 };
const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", background: "var(--bg)" };
const badge: React.CSSProperties = { fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--fg-muted)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "1px 5px" };
const cmdLine: React.CSSProperties = { display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "5px 7px", wordBreak: "break-all" };
const runBtn: React.CSSProperties = { flex: 1, background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: "var(--radius-sm)", padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { flex: 1, background: "transparent", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
