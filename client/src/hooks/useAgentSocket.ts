import { useEffect, useRef, useCallback, useState } from "react";

export type AgentMessageRole = "user" | "assistant" | "tool";

export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; streaming?: boolean }
  | { role: "tool"; name: string; result: string };

export type AgentStatus = "idle" | "thinking" | "error";

export type AgentSocket = {
  send: (text: string) => void;
  messages: AgentMessage[];
  status: AgentStatus;
};

type ServerEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "done" }
  | { type: "error"; message: string };

export function useAgentSocket(sessionId: string): AgentSocket {
  const ws = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/agent?sid=${sessionId}`;

    function connect() {
      const socket = new WebSocket(url);
      ws.current = socket;

      socket.onmessage = (ev) => {
        const event = JSON.parse(ev.data as string) as ServerEvent;

        if (event.type === "token") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.streaming) {
              return [
                ...prev.slice(0, -1),
                { role: "assistant", content: last.content + event.content, streaming: true },
              ];
            }
            return [...prev, { role: "assistant", content: event.content, streaming: true }];
          });
        } else if (event.type === "tool_call") {
          setMessages((prev) => [
            ...prev,
            { role: "tool", name: event.name, result: `calling ${event.name}(${JSON.stringify(event.args)})` },
          ]);
        } else if (event.type === "tool_result") {
          setMessages((prev) => [
            ...prev,
            { role: "tool", name: event.name, result: event.result },
          ]);
        } else if (event.type === "done") {
          setStatus("idle");
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.streaming) {
              return [...prev.slice(0, -1), { role: "assistant", content: last.content }];
            }
            return prev;
          });
        } else if (event.type === "error") {
          setStatus("error");
        }
      };

      socket.onclose = () => {
        ws.current = null;
        setTimeout(connect, 2000);
      };

      socket.onerror = () => socket.close();
    }

    connect();
    return () => ws.current?.close();
  }, [sessionId]);

  const send = useCallback((text: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setStatus("thinking");
      ws.current.send(JSON.stringify({ type: "user", content: text }));
    }
  }, []);

  return { send, messages, status };
}
