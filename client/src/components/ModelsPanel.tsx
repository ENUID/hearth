import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getModels, startModel, stopModel, modelChat, type ModelsSnapshot, type ModelInfo } from "../lib/api";

type ChatMsg = { role: "user" | "assistant"; content: string; streaming?: boolean };

const gpuBadge: Record<string, string> = { cpu: "CPU", a10g: "A10G", a100: "A100" };

export default function ModelsPanel({ ws, onClose }: { ws: string; onClose: () => void }) {
  const [snap, setSnap] = useState<ModelsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setSnap(await getModels(ws));
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [ws]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [chat]);

  const running = snap?.running && snap.running.status !== "stopped" ? snap.running : null;
  const isRunning = running?.status === "running";

  async function run(m: ModelInfo) {
    setBusy(true);
    setMsg(m.gpu === "cpu" ? `starting ${m.name}…` : `renting ${gpuBadge[m.gpu]} + starting ${m.name}…`);
    try {
      const r = await startModel(m.id, ws);
      setSnap((s) => (s ? { ...s, running: r.running } : s));
      setChat([]);
      setMsg("");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    setBusy(true);
    setMsg("stopping…");
    try {
      const r = await stopModel(ws);
      setSnap((s) => (s ? { ...s, running: r.running } : s));
      setMsg("");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !isRunning) return;
    setInput("");
    const history: ChatMsg[] = [...chat, { role: "user", content: text }];
    setChat([...history, { role: "assistant", content: "", streaming: true }]);
    setBusy(true);
    try {
      const res = await modelChat(history.map((m) => ({ role: m.role, content: m.content })), ws);
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `error ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (!line.startsWith("data:")) continue;
          const p = line.slice(5).trim();
          if (p === "[DONE]") continue;
          try {
            acc += JSON.parse(p).choices?.[0]?.delta?.content ?? "";
          } catch {
            /* ignore */
          }
        }
        setChat([...history, { role: "assistant", content: acc, streaming: true }]);
      }
      setChat([...history, { role: "assistant", content: acc }]);
    } catch (err) {
      setChat([...history, { role: "assistant", content: `⚠ ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  const endpoint = snap ? `${location.origin}${snap.apiPath}` : "";

  return (
    <div style={panel}>
      <div style={header}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg)" }}>models</span>
        <span style={{ fontSize: 10, color: "var(--fg-subtle)", marginLeft: 8 }}>{snap?.backend === "ollama" ? "ollama" : "stub"}</span>
        <button onClick={onClose} style={closeBtn} tabIndex={-1}>✕</button>
      </div>

      {!snap ? (
        <div style={{ padding: 14, color: "var(--fg-muted)" }}>loading…</div>
      ) : !running ? (
        // ---- catalog ----
        <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 2 }}>
            Pick an open model. Hearth rents the GPU, runs it, and gives you a chat + API endpoint.
          </div>
          {snap.catalog.map((m) => (
            <div key={m.id} style={card}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 600, color: "var(--fg)" }}>{m.name}</span>
                <span style={{ fontSize: 10, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)" }}>{m.params}</span>
                <span style={badge}>{gpuBadge[m.gpu]}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-muted)", margin: "4px 0 8px" }}>{m.blurb}</div>
              <button disabled={busy} onClick={() => run(m)} style={runBtn}>{m.gpu === "cpu" ? "Run (free)" : `Run on ${gpuBadge[m.gpu]}`}</button>
            </div>
          ))}
          {msg && <div style={{ fontSize: 12, color: "var(--accent)", padding: "4px 2px" }}>{msg}</div>}
        </div>
      ) : (
        // ---- running model: chat + endpoint ----
        <>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: isRunning ? "var(--fg)" : "var(--fg-muted)", fontSize: 8 }}>●</span>
              <span style={{ fontWeight: 600 }}>{running.name}</span>
              {running.gpu && <span style={badge}>{gpuBadge[running.gpu] ?? running.gpu}</span>}
              <button disabled={busy} onClick={stop} style={{ ...runBtn, marginLeft: "auto", width: "auto", padding: "5px 10px" }}>Stop</button>
            </div>
            {running.status === "starting" && <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 6 }}>{msg || "starting…"}</div>}
            {isRunning && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>API endpoint</div>
                <div
                  onClick={() => navigator.clipboard?.writeText(endpoint).then(() => setMsg("copied")).catch(() => {})}
                  title="copy"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "6px 8px", marginTop: 4, cursor: "pointer", wordBreak: "break-all" }}
                >
                  {endpoint}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-subtle)", marginTop: 4 }}>
                  OpenAI-compatible · use your Hearth token as the API key{msg === "copied" ? " · copied ✓" : ""}
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {chat.length === 0 && isRunning && <div style={{ color: "var(--fg-subtle)", fontSize: 13 }}>Chat with {running.name}.</div>}
            {chat.map((m, i) =>
              m.role === "user" ? (
                <div key={i} style={{ alignSelf: "flex-end", maxWidth: "90%", background: "var(--accent-soft)", color: "var(--fg)", borderRadius: "var(--radius)", padding: "7px 10px", fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</div>
              ) : (
                <div key={i} style={{ color: "var(--fg)", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}{m.streaming && <span style={{ opacity: 0.5 }}>▍</span>}</div>
              )
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} style={{ borderTop: "1px solid var(--border)", padding: 10, display: "flex", gap: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={isRunning ? "Message the model…" : "starting…"} disabled={!isRunning || busy}
              style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--fg)", padding: "8px 10px", fontSize: 13, outline: "none" }} />
            <button type="submit" disabled={!isRunning || busy || !input.trim()} style={{ ...runBtn, width: "auto", padding: "8px 12px", opacity: !isRunning || busy || !input.trim() ? 0.4 : 1 }}>Send</button>
          </form>
        </>
      )}
    </div>
  );
}

const panel: React.CSSProperties ={ width: 380, maxWidth: "94vw", flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)", background: "var(--bg-elevated)", minHeight: 0 };
const header: React.CSSProperties = { display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--border)" };
const closeBtn: React.CSSProperties = { marginLeft: "auto", background: "transparent", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 14 };
const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", background: "var(--bg)" };
const badge: React.CSSProperties = { fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--fg-muted)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "1px 5px" };
const runBtn: React.CSSProperties = { width: "100%", background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: "var(--radius-sm)", padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
