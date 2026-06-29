import { webgpuAvailable } from "../lib/local-llm";

// First-run welcome. Frames Hearth for a newcomer (technical or not) and points
// at the three things that matter: the terminal, a free model, an agent.
export default function Welcome({
  onClose,
  onOpenModels,
  onOpenAgents,
}: {
  onClose: () => void;
  onOpenModels: () => void;
  onOpenAgents: () => void;
}) {
  const onDevice = webgpuAvailable();

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} className="hearth-fade" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={closeBtn} aria-label="close" tabIndex={-1}>✕</button>

        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-subtle)", letterSpacing: "0.04em" }}>HEARTH</div>
        <h1 style={{ fontSize: 26, fontWeight: 650, color: "var(--fg)", margin: "8px 0 6px", letterSpacing: "-0.02em" }}>
          Your computer in the cloud.
        </h1>
        <p style={{ fontSize: 14, color: "var(--fg-muted)", margin: "0 0 4px", lineHeight: 1.55, maxWidth: 460 }}>
          A real terminal you can reach from any device — even an old phone. Run open-source AI,
          install agent CLIs, keep your sessions. Hearth hosts no AI: you use your own models, free.
        </p>

        <div style={chip}>
          <span style={{ color: onDevice ? "var(--ok, #3fb950)" : "var(--fg-subtle)", fontSize: 9 }}>●</span>
          <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>
            {onDevice
              ? "This device can run AI models locally — free and private."
              : "This device will run models on a rented GPU, only when needed."}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          <Step n="1" title="You're in a real terminal" body="It's a full Linux machine. Type commands, edit files, run anything — from the browser." />
          <Step
            n="2"
            title="Run an open-source model"
            body={onDevice ? "Llama, Qwen, Mistral — on your own device for free, or a cloud GPU for the big ones." : "Llama, Qwen, Mistral and more — Hearth rents a GPU on demand and scales it to zero."}
            action={{ label: "Open models", run: () => { onOpenModels(); onClose(); } }}
          />
          <Step
            n="3"
            title="Install an AI agent"
            body="Claude Code, Aider, Codex, goose — one tap to install, wired to your free model."
            action={{ label: "Browse agents", run: () => { onOpenAgents(); onClose(); } }}
          />
        </div>

        <button onClick={onClose} style={cta}>Start using Hearth →</button>
      </div>
    </div>
  );
}

function Step({ n, title, body, action }: { n: string; title: string; body: string; action?: { label: string; run: () => void } }) {
  return (
    <div style={step}>
      <div style={stepNum}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: "var(--fg)", fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5, marginTop: 2 }}>{body}</div>
      </div>
      {action && (
        <button onClick={action.run} style={stepBtn}>{action.label}</button>
      )}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  backdropFilter: "blur(3px)",
};
const sheet: React.CSSProperties = {
  position: "relative", width: 540, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto",
  background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-lg, 14px)", padding: "26px 28px",
  boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
};
const closeBtn: React.CSSProperties = { position: "absolute", top: 14, right: 14, background: "transparent", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 15 };
const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, padding: "6px 11px", border: "1px solid var(--border)", borderRadius: 999, background: "var(--bg)" };
const step: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg)" };
const stepNum: React.CSSProperties = { width: 24, height: 24, flexShrink: 0, borderRadius: 999, border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" };
const stepBtn: React.CSSProperties = { flexShrink: 0, background: "transparent", color: "var(--fg)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "6px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
const cta: React.CSSProperties = { marginTop: 20, width: "100%", background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: "var(--radius)", padding: "11px", fontSize: 14, fontWeight: 650, cursor: "pointer" };
