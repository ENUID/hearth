import { Component, type ReactNode } from "react";
import HearthMark from "./HearthMark";

type Props = { children: ReactNode };
type State = { error: Error | null };

// A last line of defense: without this, any render-time exception anywhere in
// the tree unmounts the whole app and leaves a blank white page. Here we catch
// it and show a calm, recoverable screen instead — the terminal session and
// files live on the server, so a reload restores everything.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface it for debugging; the UI stays usable.
    console.error("[hearth] a screen crashed:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={wrap}>
        <div style={card}>
          <HearthMark size={40} glow />
          <h1 style={h1}>Something on this screen hit a snag.</h1>
          <p style={p}>
            Your terminal session and files are safe on the server — reloading
            reconnects you right where you left off.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button className="hearth-act hearth-act-primary" style={primary} onClick={() => window.location.reload()}>
              Reload Hearth
            </button>
            <button className="hearth-act" style={secondary} onClick={() => this.setState({ error: null })}>
              Try to continue
            </button>
          </div>
          <details style={details}>
            <summary style={{ cursor: "pointer", color: "var(--fg-subtle)" }}>Technical details</summary>
            <pre style={pre}>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}

const wrap: React.CSSProperties = { position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24, zIndex: 9999 };
const card: React.CSSProperties = { maxWidth: 460, width: "100%", display: "flex", flexDirection: "column", gap: 12, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 16, padding: "26px 24px", boxShadow: "var(--shadow-lg)" };
const h1: React.CSSProperties = { margin: 0, fontSize: 19, fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.01em" };
const p: React.CSSProperties = { margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-muted)" };
const primary: React.CSSProperties = { background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const secondary: React.CSSProperties = { background: "transparent", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const details: React.CSSProperties = { marginTop: 6, fontSize: 12 };
const pre: React.CSSProperties = { marginTop: 8, maxHeight: 180, overflow: "auto", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" };
