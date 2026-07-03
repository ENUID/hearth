import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { modelChat } from "../lib/api";
import { getSettings } from "../lib/settings";

// The unified prompt — terminal and AI as ONE interface. There is a single
// input: type a shell command and it runs in the PTY; type plain language and
// the AI answers *inside the terminal scrollback* as styled text. No second
// window, no chat panel — one surface, one stream. Hearth detects which kind
// of input you're typing live (the mode pill flips as you type; Tab overrides).
//
// What makes it sticky:
//  · the AI sees your screen — the last lines of the terminal ride along as
//    context, so "why did that fail?" just works
//  · when the AI suggests a command, a one-tap ▶ run chip appears — ask,
//    run, see, ask again, without leaving the prompt
type Props = {
  ws: string;
  runningModel: string | null;
  /** Serving backend ("stub" = demo placeholders, "ollama"/"http" = real). */
  modelBackend?: string;
  machineState: string;
  onOpenModels: () => void;
  /** Send raw bytes to the active terminal's PTY stdin (runs commands). */
  runCmd: (data: string) => void;
  /** Write display-only styled text into the active terminal's scrollback. */
  aiWrite: (text: string) => void;
  /** Read the last N lines of the active terminal screen (AI context). */
  readContext: (lines: number) => string;
  children: ReactNode; // the terminal pane(s) — the prompt docks under them
};

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "run" | "ask";

const WORK_PHASES = ["Thinking", "Reading your terminal", "Reasoning", "Composing"];

// Commands people actually type — first token in this set means "run".
const CMDS = new Set([
  "ls","cd","cat","git","npm","npx","node","python","python3","pip","pipx","vim","nvim","nano",
  "curl","wget","sudo","apt","apt-get","docker","make","grep","find","ssh","tar","mkdir","rmdir",
  "rm","mv","cp","touch","chmod","chown","kill","ps","top","htop","clear","export","source","echo",
  "which","man","less","head","tail","history","df","du","free","uname","whoami","pwd","env",
  "alias","ollama","cargo","go","rustc","gcc","java","mvn","bash","sh","zsh","tmux","screen","hearth",
  // AI agent CLIs — launching an agent is a run, not a question
  "claude","aider","codex","goose","gemini","opencode","interpreter","openhands",
]);

function detectMode(s: string): Mode {
  const t = s.trim();
  if (!t) return "ask";
  if (t.startsWith("$") || t.startsWith("./") || t.startsWith("~/") || t.startsWith("/")) return "run";
  if (/[|;<>`]|&&|\$\(/.test(t)) return "run";
  if (CMDS.has(t.split(/\s+/)[0].toLowerCase())) return "run";
  return "ask";
}

/** Pull a runnable command out of an AI reply (```fence``` or a `$ line`). */
function extractCommand(reply: string): string | null {
  const fence = reply.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (fence) {
    const first = fence[1].split("\n").map((l) => l.trim()).find(Boolean);
    if (first) return first.replace(/^\$\s*/, "");
  }
  const dollar = reply.match(/^\s*\$\s+(.+)$/m);
  return dollar ? dollar[1].trim() : null;
}

export default function CommandBar({ ws, runningModel, modelBackend, machineState, onOpenModels, runCmd, aiWrite, readContext, children }: Props) {
  const [value, setValue] = useState("");
  const [manualMode, setManualMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [suggested, setSuggested] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Per-workspace conversation memory (display lives in the terminal itself).
  const historyRef = useRef<Record<string, Msg[]>>({});
  const sentRef = useRef<string[]>([]);
  const recallRef = useRef(-1);

  const mode: Mode = manualMode ?? detectMode(value);

  useEffect(() => {
    if (!busy) { setPhase(0); return; }
    const t = setInterval(() => setPhase((p) => (p + 1) % WORK_PHASES.length), 1400);
    return () => clearInterval(t);
  }, [busy]);

  // ⌘J / Ctrl+J focuses the prompt from anywhere (Esc returns to the terminal).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        taRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function grow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }
  useEffect(grow, [value]);

  // ANSI styling for AI turns rendered into the terminal (theme-aware accent).
  function colors() {
    const light = getSettings().resolved === "light";
    return {
      acc: light ? "\x1b[38;2;194;65;12m" : "\x1b[38;2;255;122;69m",
      dim: "\x1b[2m",
      rst: "\x1b[0m",
      bold: "\x1b[1m",
    };
  }

  async function ask(question: string) {
    const { acc, dim, rst, bold } = colors();
    const model = runningModel ?? "hearth";
    // Echo the question and open the AI's turn — inside the terminal itself.
    aiWrite(`\r\n${acc}${bold}you ❯${rst} ${dim}${question}${rst}\r\n${acc}${bold}✦ ${model} ❯${rst}\r\n`);
    const history = historyRef.current[ws] ?? [];
    const tail = readContext(30);
    const messages: { role: string; content: string }[] = [
      {
        role: "system",
        content:
          "You are Hearth, an AI that lives inside the user's cloud Linux terminal. Be concise. When a shell command is the answer, put it in a ```sh fence." +
          (tail ? `\n\nThe user's recent terminal screen:\n${tail}` : ""),
      },
      ...history,
      { role: "user", content: question },
    ];
    setBusy(true);
    setSuggested(null);
    try {
      const res = await modelChat(messages, ws);
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))).error;
        throw new Error(res.status === 409 ? "no model is running — open ✦ models and start one" : err ?? `error ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let reply = "";
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
          try {
            const delta = JSON.parse(p).choices?.[0]?.delta?.content ?? "";
            if (delta) {
              reply += delta;
              aiWrite(delta.replace(/\n/g, "\r\n")); // stream into the scrollback
            }
          } catch { /* keepalive */ }
        }
      }
      aiWrite("\r\n");
      historyRef.current[ws] = [
        ...history,
        { role: "user" as const, content: question },
        { role: "assistant" as const, content: reply },
      ].slice(-20);
      const cmd = extractCommand(reply);
      if (cmd) setSuggested(cmd);
    } catch (e) {
      aiWrite(`${dim}⚠ ${(e as Error).message}${rst}\r\n`);
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    setValue("");
    setManualMode(null);
    sentRef.current = [text, ...sentRef.current.filter((s) => s !== text)].slice(0, 100);
    recallRef.current = -1;
    if (mode === "run") {
      runCmd(text.replace(/^\$\s*/, "") + "\r");
    } else {
      void ask(text);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      setManualMode(mode === "run" ? "ask" : "run"); // flip, sticky until send
    } else if (e.key === "Escape") {
      taRef.current?.blur();
    } else if (e.key === "ArrowUp" && !value) {
      e.preventDefault();
      const next = Math.min(recallRef.current + 1, sentRef.current.length - 1);
      if (next >= 0) { recallRef.current = next; setValue(sentRef.current[next]); }
    } else if (e.key === "ArrowDown" && recallRef.current >= 0) {
      e.preventDefault();
      const next = recallRef.current - 1;
      recallRef.current = next;
      setValue(next < 0 ? "" : sentRef.current[next]);
    }
  }

  const modelLabel = runningModel ?? "no model";
  const isRun = mode === "run";

  return (
    <div style={windowRoot}>
      <div style={termArea}>{children}</div>

      {/* the prompt — docked in the same window, driving the same scrollback */}
      <div style={dock}>
        <div className="hearth-cmdbar" style={promptBox}>
          {suggested && (
            <button className="hearth-rise" onClick={() => { runCmd(suggested + "\r"); setSuggested(null); }} style={suggestChip} title="run the AI's suggested command">
              <span style={{ color: "var(--accent)" }}>▶</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{suggested}</code>
              <span onClick={(e) => { e.stopPropagation(); setSuggested(null); }} style={{ color: "var(--fg-subtle)", marginLeft: 4 }}>✕</span>
            </button>
          )}
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={runningModel ? `Ask ${runningModel} anything, or type a command — Hearth knows which` : "Type a command · start a model in ✦ models to ask AI"}
            rows={1}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{ ...textarea, fontFamily: isRun ? "var(--font-mono)" : "var(--font-sans)" }}
            aria-label="hearth prompt"
          />
          <div style={row}>
            {/* live mode pill — flips as you type; Tab toggles */}
            <span key={mode} className="hearth-rise" style={{ ...modePill, borderColor: isRun ? "var(--border-strong)" : "var(--accent)", color: isRun ? "var(--fg)" : "var(--accent)" }} title="Tab to switch">
              {isRun ? "›_ run" : "✦ ask"}
            </span>
            <button
              type="button"
              onClick={onOpenModels}
              title={runningModel && modelBackend === "stub" ? "demo backend — replies are placeholders until a real model server (ollama / http) is configured" : "models"}
              className={runningModel && !busy ? "hearth-pill-live" : undefined}
              style={modelChip}
            >
              <span style={{ color: runningModel ? "var(--accent)" : "var(--fg-subtle)", fontSize: 10 }}>✦</span>
              <span style={{ color: "var(--fg-muted)" }}>{modelLabel}</span>
              {runningModel && modelBackend === "stub" && (
                <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--bg)", background: "var(--danger)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>demo</span>
              )}
              {machineState === "waking" || machineState === "provisioning" ? <span className="hearth-spin" style={{ width: 8, height: 8 }} /> : null}
            </button>
            <span style={{ flex: 1 }} />
            {busy ? (
              <span style={{ display: "flex", alignItems: "center", gap: 7, marginRight: 4 }}>
                <span className="hearth-shimmer" style={{ fontSize: 11, fontWeight: 500 }}>{WORK_PHASES[phase]}…</span>
                <span style={{ display: "inline-flex", gap: 3 }}>
                  <span className="hearth-dot" /><span className="hearth-dot" /><span className="hearth-dot" />
                </span>
              </span>
            ) : (
              <span style={{ fontSize: 10, color: "var(--fg-subtle)", marginRight: 4 }}>
                ↵ {isRun ? "run" : "send"} · ⇥ mode<span className="hearth-desktop-only"> · ⌘J focus</span>
              </span>
            )}
            <button onClick={submit} disabled={busy || !value.trim()} style={{ ...sendBtn, opacity: busy || !value.trim() ? 0.4 : 1 }} aria-label={isRun ? "run" : "send"}>
              {isRun ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
              )}
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
const dock: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  justifyContent: "center",
  padding: "8px 10px 10px",
  background: "var(--bg)",
};
const promptBox: CSSProperties = {
  width: "100%",
  maxWidth: 760,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: "10px 12px",
};
const suggestChip: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  maxWidth: "100%",
  alignSelf: "flex-start",
  background: "var(--accent-soft)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--fg)",
  cursor: "pointer",
  fontSize: 12,
  padding: "5px 10px",
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
  minHeight: 40,
  maxHeight: 160,
  overflowY: "auto",
};
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const modePill: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 9px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  whiteSpace: "nowrap",
  userSelect: "none",
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
