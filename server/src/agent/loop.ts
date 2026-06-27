import type { ChatCompletionMessageParam, ChatCompletionToolMessageParam } from "openai/resources/chat/completions";
import { streamChat } from "./inference";
import { dispatchTool, TOOL_DEFINITIONS, type ToolName } from "./tools";

const SYSTEM_PROMPT = `You are Hearth, a powerful AI agent running inside a cloud Linux environment.
You can read/write files, run shell commands, and manage the user's workspace.
Think step by step. Use tools to get real information rather than guessing.
The user's home directory is the current working directory.
You are their pair programmer and operator.`;

const MAX_ITERATIONS = 8;

type SendFn = (event: unknown) => void;

type LoopOptions = {
  history: { role: "user" | "assistant"; content: string }[];
  send: SendFn;
};

export async function runAgentLoop({ history, send }: LoopOptions): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content } as ChatCompletionMessageParam)),
  ];

  let finalContent = "";

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let tokenBuffer = "";
    const pendingToolCalls: { id: string; name: string; args: string }[] = [];
    let finishReason = "stop";

    for await (const event of streamChat(messages, TOOL_DEFINITIONS)) {
      if (event.type === "token") {
        tokenBuffer += event.content;
        send({ type: "token", content: event.content });
      } else if (event.type === "tool_call") {
        pendingToolCalls.push(event);
      } else if (event.type === "finish") {
        finishReason = event.reason;
      }
    }

    if (finishReason !== "tool_calls" || pendingToolCalls.length === 0) {
      finalContent = tokenBuffer;
      break;
    }

    messages.push({
      role: "assistant",
      content: tokenBuffer || null,
      tool_calls: pendingToolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.args },
      })),
    } as unknown as ChatCompletionMessageParam);

    const toolResults: ChatCompletionToolMessageParam[] = [];

    for (const tc of pendingToolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.args);
      } catch {
        parsedArgs = {};
      }

      send({ type: "tool_call", name: tc.name, args: parsedArgs });

      let result: string;
      try {
        result = await dispatchTool(tc.name as ToolName, parsedArgs);
      } catch (err) {
        result = `Error: ${(err as Error).message}`;
      }

      send({ type: "tool_result", name: tc.name, result });

      toolResults.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }

    messages.push(...toolResults);
  }

  return finalContent;
}
