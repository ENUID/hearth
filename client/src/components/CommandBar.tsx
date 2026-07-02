import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { modelChat } from "../lib/api";

// One window: the terminal, the AI conversation, and the composer live in a
// single surface. The terminal fills the window; when you chat, the
// conversation overlays the lower part of the *same* window (not a separate
// box), and the composer is docked at its bottom. Type, press Enter, and the
// AI streams its reply — user and assistant on opposite sides.
type Props = {
  ws: string;
  runningModel: string | null;
  machineState: string;
  onOpenModels: () => void;
  children: ReactNode; // the terminal pane(s)
};

type Msg = { role: "user" | "assistant"; content: string; streaming?: boolean };

const WORK_PHASES = ["Thinking", "Searching", "Reasoning", "Composing"];

export default function CommandBar({ ws, runningModel, machineState, onOpenModels, children }: Props) {
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!busy) { setPhase(0); return; }
    const t = setInterval(() => setPhase((p) => (p + 1) % WORK_PHASES.length), 1400);
    return () => clearInterval(t);
  }, [busy]);

  function grow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }
  useEffect(grow, [value]);

  async function send() {
    const text = value.trim();
    if (!text || busy) return;
    setValue("");
    const history: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "", streaming: true }]);
    setBusy(true);
    try {
      const res = await modelChat(history.map((m) => ({ role: m.role, content: m.content })), ws);
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))).error;
        throw new Error(res.status === 409 ? "No model is running — open ✦ models to start one." : err ?? `error ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      let buf = "";
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buf += dec.decode(chunk, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const p = line.slice(5).trim();
          if (p === "[DONE]") continue;
          try { acc += JSON.parse(p).choices?.[0]?.delta?.content ?? ""; } catch { /* keepalive */ }
        }
        setMessages([...history, { role: "assistant", content: acc, streaming: true }]);
      }
      setMessages([...history, { role: "assistant", content: acc || "(no response)" }]);
    } catch (e) {
      setMessages([...history, { role: "assistant", content: `⚠ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const modelLabel = runningModel ?? "no model";

  return (
    <div style={windowRoot}>
      {/* the terminal fills the window; the conversation overlays its lower part */}
      <div style={termArea}>
        {children}

        {messages.length > 0 && (
          <div style={convoOverlay} className="hearth-fade">
            <div style={convoInner}>
              <div style={convoHead}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: runningModel ? "var(--accent)" : "var(--fg-subtle)", fontSize: 10 }}>✦</span>
                  <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{modelLabel}</span>
                </span>
                <button onClick={() => setMessages([])} title="clear conversation" style={clearBtn}>clear ✕</button>
              </div>
              <div style={scroll}>
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="hearth-rise" style={userRow}>
                      <div style={userBubble}>{m.content}</div>
                    </div>
                  ) : (
                    <div key={i} className="hearth-rise" style={aiRow}>
                      <span style={{ color: "var(--accent)", fontSize: 11, marginTop: 3, flexShrink: 0 }}>✦</span>
                      {m.streaming && !m.content ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="hearth-shimmer" style={{ fontSize: 13, fontWeight: 500 }}>{WORK_PHASES[phase]}…</span>
                            <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
                              <span className="hearth-dot" /><span className="hearth-dot" /><span className="hearth-dot" />
                            </span>
                          </span>
                          <span className="hearth-scan" style={{ height: 3, borderRadius: 2, background: "var(--bg-inset)", width: 160 }} />
                        </div>
                      ) : (
                        <div style={aiText}>
                          {m.content}
                          {m.streaming && <span style={{ opacity: 0.5 }}>▍</span>}
                        </div>
                      )}
                    </div>
                  )
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* composer, docked at the bottom of the same window */}
      <div style={composerDock}>
        <div className="hearth-cmdbar" style={composer}>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={runningModel ? `Message ${runningModel}…` : "Ask the AI…  (start a model in ✦ models)"}
            rows={1}
            style={textarea}
            aria-label="message the ai"
          />
          <div style={row}>
            <button
              type="button"
              onClick={onOpenModels}
              title="models"
              className={runningModel && !busy ? "hearth-pill-live" : undefined}
              style={modelChip}
            >
              <span style={{ color: runningModel ? "var(--accent)" : "var(--fg-subtle)", fontSize: 10 }}>✦</span>
              <span style={{ color: "var(--fg-muted)" }}>{modelLabel}</span>
              {machineState === "waking" || machineState === "provisioning" ? <span className="hearth-spin" style={{ width: 8, height: 8 }} /> : null}
            </button>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: "var(--fg-subtle)", marginRight: 4 }}>↵ send · ⇧↵ newline</span>
            <button onClick={send} disabled={busy || !value.trim()} style={{ ...sendBtn, opacity: busy || !value.trim() ? 0.4 : 1 }} aria-label="send">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const windowRoot: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  position: "relative",
  background: "var(--bg)",
  overflow: "hidden",
};
const termArea: CSSProperties = { flex: 1, position: "relative", minHeight: 0, display: "flex", overflow: "hidden" };

// conversation overlay — sits inside the terminal window, over its lower part
const convoOverlay: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  maxHeight: "64%",
  display: "flex",
  justifyContent: "center",
  padding: "0 10px",
  background: "var(--bg-glass)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  borderTop: "1px solid var(--border)",
};
const convoInner: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};
const convoHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 4px",
  flexShrink: 0,
};
const clearBtn: CSSProperties = { background: "transparent", border: "none", color: "var(--fg-subtle)", cursor: "pointer", fontSize: 11 };
const scroll: CSSProperties = { overflowY: "auto", paddingBottom: 12, display: "flex", flexDirection: "column", gap: 12 };
const userRow: CSSProperties = { display: "flex", justifyContent: "flex-end" };
const userBubble: CSSProperties = {
  maxWidth: "82%",
  background: "var(--accent-soft)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: "12px 12px 3px 12px",
  padding: "8px 11px",
  fontSize: 13.5,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const aiRow: CSSProperties = { display: "flex", gap: 8, alignItems: "flex-start" };
const aiText: CSSProperties = {
  maxWidth: "92%",
  color: "var(--fg)",
  fontSize: 13.5,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const composerDock: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  justifyContent: "center",
  padding: "8px 10px",
  background: "var(--bg)",
  borderTop: "1px solid var(--border)",
};
const composer: CSSProperties = {
  width: "100%",
  maxWidth: 720,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: "10px 12px",
};
const textarea: CSSProperties = {
  width: "100%",
  resize: "none",
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--fg)",
  fontSize: 14,
  lineHeight: 1.5,
  fontFamily: "var(--font-sans)",
  minHeight: 44,
  maxHeight: 180,
  overflowY: "auto",
};
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
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
};
const sendBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 999,
  border: "none",
  background: "var(--accent)",
  color: "var(--bg)",
  cursor: "pointer",
  flexShrink: 0,
};
