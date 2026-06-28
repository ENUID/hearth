import { useState, FormEvent } from "react";
import { login } from "../lib/api";

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(password);
      onAuthed();
    } catch {
      setError("Invalid password");
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: 280,
          padding: 24,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
        }}
      >
        <div style={{ fontWeight: 700, color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 18 }}>
          hearth
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Sign in to your terminal</div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--text)",
            padding: "10px 12px",
            fontSize: 14,
            outline: "none",
          }}
        />
        {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
        <button
          type="submit"
          disabled={busy || !password}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius)",
            padding: "10px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            opacity: busy || !password ? 0.5 : 1,
          }}
        >
          {busy ? "…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
