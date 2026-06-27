import Terminal from "./components/Terminal";
import { usePtySocket } from "./hooks/usePtySocket";

const SESSION_ID = "dev-session";

export default function App() {
  const pty = usePtySocket(SESSION_ID);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* header */}
      <div
        style={{
          height: 38,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 10,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-mono)",
          }}
        >
          hearth
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {SESSION_ID}
        </span>
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 11 }}>
          tip: run <code style={{ color: "var(--accent)" }}>hermes "…"</code> for the AI agent
        </span>
      </div>

      {/* terminal fills the rest */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <Terminal ptySocket={pty} />
      </div>
    </div>
  );
}
