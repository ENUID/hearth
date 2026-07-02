import { useState, type FormEvent, type CSSProperties } from "react";

// The bottom command bar — Hearth's signature input surface. Type a command
// and it runs in the active terminal (PTY), so the bar and the shell are one
// thing, not a parallel console. It carries the workspace + machine context on
// the left and a live status pill on the right, mirroring a modern agent UI's
// input dock while staying a real terminal underneath.
type Props = {
  workspace: string;
  machineState: string;
  runningModel: string | null;
  onRun: (command: string) => void;
  onOpenModels: () => void;
};

const STATE_LABEL: Record<string, string> = {
  running: "running",
  asleep: "asleep",
  waking: "waking",
  provisioning: "starting",
  error: "error",
};
const SPINNING = new Set(["waking", "provisioning"]);

export default function CommandBar({ workspace, machineState, runningModel, onRun, onOpenModels }: Props) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);

  function submit(e: FormEvent) {
    e.preventDefault();
    const cmd = value.trim();
    if (!cmd) return;
    onRun(cmd + "\r");
    setHistory((h) => (h[0] === cmd ? h : [cmd, ...h]).slice(0, 100));
    setHIdx(-1);
    setValue("");
  }

  // ↑/↓ walk command history, like a real shell prompt.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      if (!history.length) return;
      e.preventDefault();
      const next = Math.min(hIdx + 1, history.length - 1);
      setHIdx(next);
      setValue(history[next]);
    } else if (e.key === "ArrowDown") {
      if (hIdx < 0) return;
      e.preventDefault();
      const next = hIdx - 1;
      setHIdx(next);
      setValue(next < 0 ? "" : history[next]);
    }
  }

  const stateLabel = STATE_LABEL[machineState] ?? machineState ?? "";
  const spinning = SPINNING.has(machineState);
  const dotColor =
    machineState === "running" ? "var(--accent)" : machineState === "error" ? "var(--danger)" : "var(--fg-subtle)";

  return (
    <div style={wrap}>
      <form onSubmit={submit} className="hearth-cmdbar" style={bar}>
        {/* context chip — the workspace this command runs in */}
        <span style={ctxChip} title="commands run in this workspace's active terminal">
          <span style={{ color: "var(--fg-subtle)", fontSize: 11 }}>›_</span>
          <span style={{ color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>{workspace}</span>
        </span>

        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Run a command in the terminal…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={input}
          aria-label="run a command"
        />

        {/* running-model chip (or a shortcut to start one), like a model selector */}
        <button
          type="button"
          onClick={onOpenModels}
          title={runningModel ? `${runningModel} running — open models` : "run an open-source model"}
          style={modelChip}
        >
          <span style={{ color: runningModel ? "var(--accent)" : "var(--fg-subtle)", fontSize: 10 }}>✦</span>
          <span style={{ color: "var(--fg-muted)" }}>{runningModel ?? "models"}</span>
        </button>

        {/* live machine status pill */}
        {stateLabel && (
          <span style={statusPill} title={`machine ${stateLabel}`}>
            {spinning ? (
              <span className="hearth-spin" />
            ) : (
              <span className={machineState === "running" ? "hearth-pulse" : undefined} style={{ width: 7, height: 7, borderRadius: 999, background: dotColor, display: "inline-block" }} />
            )}
            <span style={{ color: "var(--fg-muted)", fontSize: 11 }}>{stateLabel}</span>
          </span>
        )}

        <button type="submit" disabled={!value.trim()} style={{ ...sendBtn, opacity: value.trim() ? 1 : 0.4 }} aria-label="run">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}

const wrap: CSSProperties = {
  flexShrink: 0,
  padding: "8px 10px",
  background: "var(--bg)",
  borderTop: "1px solid var(--border)",
};
const bar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "6px 6px 6px 10px",
};
const ctxChip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  padding: "3px 8px",
  borderRadius: 8,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--fg)",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
  padding: "4px 2px",
};
const modelChip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12,
  padding: "4px 9px",
  borderRadius: 8,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--fg-muted)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
const statusPill: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 9px",
  borderRadius: 8,
  background: "var(--bg)",
  border: "1px solid var(--border)",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
const sendBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: 999,
  border: "none",
  background: "var(--accent)",
  color: "var(--bg)",
  cursor: "pointer",
  flexShrink: 0,
};
