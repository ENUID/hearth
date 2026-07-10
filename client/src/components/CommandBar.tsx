import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { modelChat, startModel } from "../lib/api";
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
  /** Upload files into the active session's cwd. Returns each file's result. */
  onAttach: (files: FileList | File[]) => Promise<{ name: string; ok: boolean; path?: string }[]>;
  children: ReactNode; // the terminal pane(s) — the prompt docks under them
};

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "run" | "ask";

const WORK_PHASES = ["Thinking", "Reading your terminal", "Reasoning", "Composing"];

// Zero-config default: a small, free, CPU-only model, so a first "ask" with
// nothing running just works in one step instead of erroring out.
const AUTO_MODEL = "llama3.2:1b";
const AUTO_MODEL_NAME = "Llama 3.2 1B";

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

// Openers that read as natural language — a question or a request for the AI.
const ASK_WORDS =
  /^(how|what|why|when|where|who|whose|which|can|could|would|should|shall|may|might|is|are|am|was|were|do|does|did|will|explain|write|tell|help|show|give|create|generate|summarize|summarise|translate|describe|compare|suggest|recommend|draft|plan|brainstorm|fix|improve|review|rewrite|refactor|please|hey|hi|hello)\b/i;

function detectMode(s: string): Mode {
  const t = s.trim();
  if (!t) return "ask";
  // unmistakably shell
  if (t.startsWith("$") || t.startsWith("./") || t.startsWith("~/") || t.startsWith("/")) return "run";
  if (/[|;<>`]|&&|\$\(/.test(t)) return "run";
  if (t.endsWith("?")) return "ask";
  if (CMDS.has(t.split(/\s+/)[0].toLowerCase())) return "run";
  if (ASK_WORDS.test(t)) return "ask";
  // sentence-shaped input (several words, nothing flag/path-like) reads as a
  // question; anything else defaults to RUN — so any CLI you install works
  // from the prompt without being on a list. Tab always overrides.
  const flaggy = /(^|\s)-{1,2}[a-zA-Z]|[=/\\]/.test(t);
  if (t.split(/\s+/).length >= 4 && !flaggy) return "ask";
  return "run";
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

export default function CommandBar({ ws, runningModel, modelBackend, machineState, onOpenModels, runCmd, aiWrite, readContext, onAttach, children }: Props) {
  const [value, setValue] = useState("");
  const [manualMode, setManualMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Per-workspace conversation memory (display lives in the terminal itself).
  const historyRef = useRef<Record<string, Msg[]>>({});
  const sentRef = useRef<string[]>([]);
  const recallRef = useRef(-1);

  const mode: Mode = manualMode ?? detectMode(value);

  // Attach files right from the prompt — upload into the active session's cwd,
  // then drop each uploaded name into the composer so it's ready to reference
  // ("what's in screenshot.png?", "run this: data.csv").
  async function attach(files: FileList | File[]) {
    if (!files || files.length === 0) return;
    setAttaching(true);
    try {
      const results = await onAttach(files);
      const names = results.filter((r) => r.ok).map((r) => r.name);
      if (names.length) {
        setValue((v) => (v.trim() ? v.replace(/\s*$/, " ") : "") + names.map((n) => `\`${n}\``).join(" ") + " ");
        taRef.current?.focus();
      }
    } finally {
      setAttaching(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) void attach(e.dataTransfer.files);
  }

  // Paste an image (screenshot, copied file) straight into the prompt.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      void attach(files);
    }
  }

  useEffect(() => {
    if (!busy) { setPhase(0); setElapsed(0); return; }
    const start = Date.now();
    // Advance through the phases and hold on the last, so the step pills
    // accumulate (they don't loop back to the start).
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, WORK_PHASES.length - 1)), 1400);
    const e = setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
    return () => { clearInterval(t); clearInterval(e); };
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
    const model = runningModel ?? AUTO_MODEL_NAME;
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
      // One-step ask: if nothing is running, spin up the free CPU default first.
      if (!runningModel) {
        aiWrite(`${dim}· starting ${AUTO_MODEL_NAME}…${rst}\r\n`);
        await startModel(AUTO_MODEL, ws).catch(() => {});
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const res = await modelChat(messages, ws, ctrl.signal);
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))).error;
        throw new Error(res.status === 409 ? "couldn't start a model — open ✦ models and pick one" : err ?? `error ${res.status}`);
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
      if ((e as Error).name === "AbortError") aiWrite(`${dim}⏹ stopped${rst}\r\n`);
      else aiWrite(`${dim}⚠ ${(e as Error).message}${rst}\r\n`);
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  // Stop the in-flight AI turn (aborts the streaming request).
  function stop() {
    abortRef.current?.abort();
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
        <div style={dockInner}>
          {suggested && (
            <button className="hearth-rise hearth-act" onClick={() => { runCmd(suggested + "\r"); setSuggested(null); }} style={suggestChip} title="run the AI's suggested command">
              <span style={{ color: "var(--accent)" }}>▶</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{suggested}</code>
              <span onClick={(e) => { e.stopPropagation(); setSuggested(null); }} style={{ color: "var(--fg-subtle)", marginLeft: 4 }}>✕</span>
            </button>
          )}

          {/* thinking steps — accumulate as animated pills while the AI works,
              like a CLI agent's Run / Thought / Read log. The last pill carries
              the live timer and a [stop]. */}
          {busy && (
            <div style={thinkBox}>
              {WORK_PHASES.slice(0, phase + 1).map((ph, i) => {
                const active = i === phase;
                return (
                  <div key={i} className="hearth-rise" style={{ ...stepPill, ...(active ? stepPillActive : {}) }}>
                    {active
                      ? <span className="hearth-spin" style={{ width: 10, height: 10, flexShrink: 0 }} />
                      : <span style={{ color: "var(--accent)", fontSize: 11, flexShrink: 0 }}>✓</span>}
                    <span style={{ color: active ? "var(--fg)" : "var(--fg-subtle)", fontWeight: active ? 600 : 400 }}>{ph}</span>
                    <span style={{ flex: 1 }} />
                    {active && <span style={{ color: "var(--fg-subtle)" }}>{elapsed.toFixed(1)}s</span>}
                    {active && <button type="button" onClick={stop} style={stopLink} title="stop (Esc)">[stop]</button>}
                  </div>
                );
              })}
            </div>
          )}

          <div
            className="hearth-cmdbar"
            style={{ ...promptBox, ...(dragOver ? promptBoxDragOver : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) void attach(e.target.files); e.target.value = ""; }} />
            {dragOver && (
              <div style={dropOverlay}><span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>drop to attach</span></div>
            )}
            <div style={inputRow}>
              {/* caret reflects the live mode: › run, ✦ ask */}
              <span style={caret} aria-hidden>{isRun ? "›" : "✦"}</span>
              <textarea
                ref={taRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={runningModel ? `Message ${runningModel}, or type a command` : "Ask anything, or type a command"}
                rows={1}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{ ...textarea, fontFamily: isRun ? "var(--font-mono)" : "var(--font-sans)" }}
                aria-label="hearth prompt"
              />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attaching} title="attach a file or image" className="hearth-act" style={{ ...attachBtn, opacity: attaching ? 0.5 : 1 }}>
                {attaching ? <span className="hearth-spin" style={{ width: 12, height: 12 }} /> : <ClipIcon />}
              </button>
              <button type="button" onClick={submit} disabled={busy || !value.trim()} className="hearth-act hearth-act-primary" style={{ ...sendBtn, opacity: busy || !value.trim() ? 0.4 : 1 }} aria-label={isRun ? "run" : "send"}>
                {isRun ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
                )}
              </button>
            </div>
          </div>

          {/* status line — working / shortcuts (left) · model · mode (right) */}
          <div style={metaRow}>
            <span style={metaLeft}>
              <span style={kbd}>⏎</span> {isRun ? "run" : "send"}<span style={sep}>·</span><span style={kbd}>⇥</span> mode
              <span className="hearth-desktop-only"><span style={sep}>·</span><span style={kbd}>⌘J</span> focus</span>
            </span>
            <button
              type="button"
              onClick={onOpenModels}
              title={runningModel && modelBackend === "stub" ? "demo backend — placeholder replies until a real model server (ollama / http) is set" : "models"}
              className={"hearth-act" + (runningModel && !busy ? " hearth-pill-live" : "")}
              style={metaModel}
            >
              <span style={{ color: runningModel ? "var(--accent)" : "var(--fg-subtle)" }}>✦</span>
              <span style={{ color: "var(--fg-muted)" }}>{modelLabel}</span>
              <span style={sep}>·</span>
              <span style={{ color: isRun ? "var(--fg-muted)" : "var(--accent)", fontWeight: 600 }}>{isRun ? "run" : "ask"}</span>
              {runningModel && modelBackend === "stub" && <span style={demoBadge}>demo</span>}
              {(machineState === "waking" || machineState === "provisioning") && <span className="hearth-spin" style={{ width: 8, height: 8 }} />}
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
const dockInner: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const promptBox: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px 8px 12px",
  position: "relative",
};
// thinking steps stack — animated pills above the input while the AI works
const thinkBox: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, padding: "0 2px 2px" };
const stepPill: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 8,
  background: "color-mix(in srgb, var(--bg-elevated) 55%, transparent)",
  border: "1px solid var(--border)",
  color: "var(--fg-muted)",
};
const stepPillActive: CSSProperties = { borderColor: "var(--accent)", background: "var(--accent-soft)" };
const inputRow: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 8 };
const caret: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 15,
  lineHeight: "24px",
  fontWeight: 700,
  color: "var(--accent)",
  userSelect: "none",
  flexShrink: 0,
};
const promptBoxDragOver: CSSProperties = {
  borderColor: "var(--accent)",
  boxShadow: "0 0 0 1px var(--accent-soft)",
};
const dropOverlay: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--accent-soft)",
  border: "1.5px dashed var(--accent)",
  borderRadius: 16,
  zIndex: 2,
  pointerEvents: "none",
};
const attachBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: 8,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--fg-muted)",
  cursor: "pointer",
  flexShrink: 0,
  alignSelf: "flex-end",
};

function ClipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
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
  flex: 1,
  minWidth: 0,
  resize: "none",
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--fg)",
  fontSize: 14,
  lineHeight: 1.5,
  minHeight: 24,
  maxHeight: 160,
  overflowY: "auto",
  paddingTop: 1,
};
// meta line under the box — terminal-native: shortcuts / working (left), model · mode (right)
const metaRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "0 4px",
  minHeight: 16,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--fg-subtle)",
};
const metaLeft: CSSProperties = { display: "flex", alignItems: "center", whiteSpace: "nowrap", overflow: "hidden", minWidth: 0, color: "var(--fg-subtle)" };
const metaModel: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 11.5,
  padding: "3px 6px",
  borderRadius: 7,
  flexShrink: 0,
  whiteSpace: "nowrap",
};
const sep: CSSProperties = { color: "var(--fg-subtle)", margin: "0 6px" };
const kbd: CSSProperties = { color: "var(--fg-muted)", fontWeight: 700 };
const stopLink: CSSProperties = { background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11, padding: 0 };
const demoBadge: CSSProperties = { fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--bg)", background: "var(--danger)", borderRadius: 4, padding: "1px 5px", fontWeight: 700, marginLeft: 2 };
const sendBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: "var(--accent)",
  color: "var(--bg)",
  cursor: "pointer",
  flexShrink: 0,
  alignSelf: "flex-end",
};
