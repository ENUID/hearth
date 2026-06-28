import { useSettings, setSettings } from "../lib/settings";
import type { Command } from "./CommandPalette";

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { label: string; value: T }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            padding: "7px 8px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid " + (value === o.value ? "var(--border-strong)" : "var(--border)"),
            background: value === o.value ? "var(--accent-soft)" : "transparent",
            color: value === o.value ? "var(--fg)" : "var(--fg-muted)",
            cursor: "pointer",
            fontSize: 12,
            textTransform: "capitalize",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPanel({ onClose, commands = [] }: { onClose: () => void; commands?: Command[] }) {
  const s = useSettings();
  // Actions live here now (no command-palette button in the header). Hide the
  // entries that just open/duplicate this panel.
  const actions = commands.filter((c) => c.id !== "settings" && c.id !== "theme");
  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={drawer}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontFamily: "var(--font-mono)", color: "var(--fg)" }}>settings</h2>
          <button onClick={onClose} style={closeBtn} tabIndex={-1}>✕</button>
        </div>

        {actions.length > 0 && (
          <>
            <div style={section}>actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {actions.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onClose();
                    c.run();
                  }}
                  style={actionRow}
                >
                  <span>{c.title}</span>
                  {c.hint && <span style={{ fontSize: 11, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{c.hint}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={section}>theme</div>
        <Segmented
          value={s.theme}
          onChange={(v) => setSettings({ theme: v })}
          options={[{ label: "system", value: "system" }, { label: "light", value: "light" }, { label: "dark", value: "dark" }]}
        />

        <div style={section}>font size</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={stepBtn} onClick={() => setSettings({ fontSize: Math.max(9, s.fontSize - 1) })}>−</button>
          <span style={{ fontFamily: "var(--font-mono)", minWidth: 40, textAlign: "center" }}>{s.fontSize}px</span>
          <button style={stepBtn} onClick={() => setSettings({ fontSize: Math.min(28, s.fontSize + 1) })}>＋</button>
        </div>

        <div style={section}>cursor</div>
        <Segmented
          value={s.cursorStyle}
          onChange={(v) => setSettings({ cursorStyle: v })}
          options={[{ label: "block", value: "block" }, { label: "bar", value: "bar" }, { label: "underline", value: "underline" }]}
        />

        <div style={section}>key bar (mobile)</div>
        <Segmented
          value={s.keyBar}
          onChange={(v) => setSettings({ keyBar: v })}
          options={[{ label: "auto", value: "auto" }, { label: "on", value: "on" }, { label: "off", value: "off" }]}
        />

        <div style={{ marginTop: 22, fontSize: 11, color: "var(--fg-subtle)" }}>Saved on this device.</div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 55,
};
const drawer: React.CSSProperties = {
  width: 320,
  maxWidth: "90vw",
  height: "100%",
  background: "var(--bg-elevated)",
  borderLeft: "1px solid var(--border)",
  padding: 20,
  overflowY: "auto",
  color: "var(--fg)",
  fontSize: 13,
};
const section: React.CSSProperties = {
  marginTop: 20,
  marginBottom: 8,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--fg-subtle)",
  fontFamily: "var(--font-mono)",
};
const closeBtn: React.CSSProperties = { marginLeft: "auto", background: "transparent", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 14 };
const stepBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", cursor: "pointer", fontSize: 16 };
const actionRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--fg)", cursor: "pointer", fontSize: 13, padding: "9px 10px" };
