import { useEffect, useMemo, useRef, useState } from "react";

export interface Command {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    if (!needle) return commands;
    return commands.filter((c) => (c.title + " " + (c.hint ?? "")).toLowerCase().includes(needle));
  }, [q, commands]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setIdx(0);
  }, [q]);

  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div onClick={onClose} className="hearth-overlay-blur" style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={panel} className="hearth-fade">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(filtered[idx]);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="Type a command…"
          style={input}
        />
        <div ref={listRef} style={{ maxHeight: 320, overflowY: "auto", padding: 6 }}>
          {filtered.length === 0 && <div style={{ padding: "10px 12px", color: "var(--fg-subtle)", fontSize: 13 }}>No commands</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              onMouseEnter={() => setIdx(i)}
              onClick={() => run(c)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                background: i === idx ? "var(--accent-soft)" : "transparent",
                color: i === idx ? "var(--fg)" : "var(--fg-muted)",
              }}
            >
              <span style={{ fontSize: 13 }}>{c.title}</span>
              {c.hint && <span style={{ fontSize: 11, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  paddingTop: "12vh",
  zIndex: 60,
};
const panel: React.CSSProperties = {
  width: 520,
  maxWidth: "92vw",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow-lg)",
  overflow: "hidden",
};
const input: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid var(--border)",
  color: "var(--fg)",
  fontSize: 15,
  padding: "14px 16px",
  outline: "none",
};
