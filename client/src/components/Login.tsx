import { useState, FormEvent } from "react";
import { login, signup } from "../lib/api";

export default function Login({ onAuthed, multiUser, instanceName = "hearth", signupsOpen = true }: { onAuthed: () => void; multiUser: boolean; instanceName?: string; signupsOpen?: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (multiUser) {
        if (creating) await signup(username, password);
        else await login(password, username);
      } else {
        await login(password);
      }
      onAuthed();
    } catch (err) {
      setError((err as Error).message || "Failed");
      setBusy(false);
    }
  }

  const canSubmit = multiUser ? username.length >= 2 && password.length >= 6 : password.length > 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, position: "relative", overflow: "hidden" }}>
      {/* ambient hearth-glow behind the card */}
      <div aria-hidden style={{ position: "absolute", width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 62%)", filter: "blur(8px)", pointerEvents: "none" }} />

      {/* the mark, above the card — a moment, not a form */}
      <div className="hearth-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, zIndex: 1 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ filter: "drop-shadow(0 0 14px var(--accent-glow))" }}>
          <defs>
            <linearGradient id="loginFlame" x1="0" y1="24" x2="0" y2="0">
              <stop offset="0%" style={{ stopColor: "var(--accent)" }} />
              <stop offset="100%" style={{ stopColor: "var(--accent-2)" }} />
            </linearGradient>
          </defs>
          <path fill="url(#loginFlame)" d="M12 2c.6 2.6-.4 4.3-2 6-1.8 1.9-3 3.8-3 6.3A5 5 0 0 0 12 19a5 5 0 0 0 5-4.7c.1-1.7-.6-2.9-1.6-4 .1 1.6-.5 2.6-1.4 3.3-.3-1.6-1-2.4-2-3.3-1.1-1-1.4-2.3-1-3.8.9.4 1.6 1 2 2 .8-1.7.7-3.6-1-6.5Z" />
        </svg>
        <div style={{ fontWeight: 600, color: "var(--fg)", fontFamily: "var(--font-mono)", fontSize: 22, letterSpacing: "-0.02em" }}>{instanceName}</div>
        <div style={{ color: "var(--fg-subtle)", fontSize: 12 }}>
          {multiUser ? (creating ? "create your account" : "sign in to your computer") : "your computer, in the browser"}
        </div>
      </div>

      <form onSubmit={submit} className="hearth-elevated hearth-rise" style={{ display: "flex", flexDirection: "column", gap: 12, width: 320, padding: 24, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 14, zIndex: 1 }}>

        {multiUser && (
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="hearth-input" style={field}
          />
        )}
        <input
          type="password"
          autoFocus={!multiUser}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={multiUser && creating ? "password (6+ characters)" : "password"}
          className="hearth-input" style={field}
        />

        {error && <div style={{ color: "var(--danger)", fontSize: 12 }}>{error}</div>}

        <button type="submit" disabled={busy || !canSubmit} className="hearth-act hearth-act-primary" style={{ ...primary, opacity: busy || !canSubmit ? 0.5 : 1 }}>
          {busy ? "…" : multiUser ? (creating ? "Create account" : "Sign in") : "Enter"}
        </button>

        {multiUser && signupsOpen && (
          <button
            type="button"
            onClick={() => { setCreating((c) => !c); setError(""); }}
            style={{ background: "transparent", border: "none", color: "var(--fg-muted)", fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            {creating ? "Have an account? Sign in" : "New here? Create an account"}
          </button>
        )}
        {multiUser && !signupsOpen && (
          <div style={{ color: "var(--fg-subtle)", fontSize: 11 }}>Signups are closed on this instance.</div>
        )}
      </form>
    </div>
  );
}

const field: React.CSSProperties = {
  background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
  color: "var(--fg)", padding: "10px 12px", fontSize: 14, outline: "none",
};
const primary: React.CSSProperties = {
  background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: "var(--radius)",
  padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
