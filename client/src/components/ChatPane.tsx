import { useRef, useEffect, useState, FormEvent } from "react";
import type { AgentMessage, AgentStatus } from "../hooks/useAgentSocket";

type Props = {
  messages: AgentMessage[];
  onSend: (text: string) => void;
  status: AgentStatus;
};

export default function ChatPane({ messages, onSend, status }: Props) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || status === "thinking") return;
    onSend(text);
    setDraft("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface)" }}>
      {/* header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: "var(--green)", fontSize: 8 }}>●</span>
        hermes-agent
        {status === "thinking" && (
          <span style={{ marginLeft: "auto", color: "var(--accent)" }}>thinking…</span>
        )}
      </div>

      {/* messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            Ask Hearth to write code, run commands, or explain anything.
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    background: "var(--accent-dim)",
                    color: "var(--text)",
                    borderRadius: "var(--radius)",
                    padding: "8px 12px",
                    maxWidth: "85%",
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            );
          }

          if (msg.role === "assistant") {
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    color: "var(--text)",
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content}
                  {msg.streaming && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 14,
                        background: "var(--accent)",
                        marginLeft: 2,
                        verticalAlign: "text-bottom",
                        animation: "blink 1s step-end infinite",
                      }}
                    />
                  )}
                </div>
              </div>
            );
          }

          if (msg.role === "tool") {
            return (
              <div
                key={i}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "6px 10px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-muted)",
                }}
              >
                <span style={{ color: "var(--yellow)" }}>{msg.name}</span>
                {" → "}
                <span
                  style={{
                    display: "block",
                    marginTop: 2,
                    color: "var(--text)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 120,
                    overflowY: "auto",
                  }}
                >
                  {msg.result}
                </span>
              </div>
            );
          }

          return null;
        })}

        <div ref={bottomRef} />
      </div>

      {/* input */}
      <form
        onSubmit={handleSubmit}
        style={{
          borderTop: "1px solid var(--border)",
          padding: "10px 14px",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Message Hearth… (Enter to send)"
          style={{
            flex: 1,
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "8px 10px",
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            resize: "none",
            outline: "none",
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: "auto",
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || status === "thinking"}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius)",
            padding: "8px 14px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 600,
            opacity: !draft.trim() || status === "thinking" ? 0.4 : 1,
            transition: "opacity 0.15s",
            whiteSpace: "nowrap",
          }}
        >
          Send
        </button>
      </form>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
