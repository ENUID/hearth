import { WebSocket } from "ws";
import { runAgentLoop } from "./agent/loop";

type ClientMessage = { type: "user"; content: string };

type MessageHistory = { role: "user" | "assistant"; content: string }[];

const histories = new Map<string, MessageHistory>();

export function handleAgentConnection(ws: WebSocket, sid: string) {
  if (!histories.has(sid)) histories.set(sid, []);

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }

    if (msg.type !== "user" || !msg.content) return;

    const history = histories.get(sid)!;
    history.push({ role: "user", content: msg.content });

    function send(event: unknown) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    }

    runAgentLoop({ history, send })
      .then((assistantReply) => {
        history.push({ role: "assistant", content: assistantReply });
        send({ type: "done" });
      })
      .catch((err: Error) => {
        console.error("agent loop error:", err);
        send({ type: "error", message: err.message });
      });
  });

  ws.on("error", () => ws.close());
}
