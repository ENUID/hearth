import type { ChatCompletionMessageParam, ChatCompletionToolMessageParam } from "openai/resources/chat/completions";
import { streamChat } from "./inference";
import { dispatchTool, TOOL_DEFINITIONS, type ToolName } from "./tools";

const SYSTEM_PROMPT = `You are Hermes, an AI agent running inside a Linux terminal.
You can read/write files, run shell commands, and use git in the user's current directory.
Think step by step. Prefer using tools to get real information over guessing.
Be concise in your prose; let the tools do the work.`;

const MAX_ITERATIONS = 12;

// ANSI helpers (no dependency)
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

export type Turn = ChatCompletionMessageParam;

/**
 * Run one user turn through the agent loop, streaming output to stdout.
 * Mutates `messages` in place (appends assistant + tool turns) so the caller
 * can keep conversational history across turns.
 */
export async function runTurn(messages: Turn[]): Promise<void> {
  if (messages.length === 0 || messages[0].role !== "system") {
    messages.unshift({ role: "system", content: SYSTEM_PROMPT });
  }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let tokenBuffer = "";
    const pendingToolCalls: { id: string; name: string; args: string }[] = [];
    let finishReason = "stop";

    for await (const event of streamChat(messages, TOOL_DEFINITIONS)) {
      if (event.type === "token") {
        tokenBuffer += event.content;
        process.stdout.write(event.content);
      } else if (event.type === "tool_call") {
        pendingToolCalls.push(event);
      } else if (event.type === "finish") {
        finishReason = event.reason;
      }
    }

    if (tokenBuffer && !tokenBuffer.endsWith("\n")) process.stdout.write("\n");

    if (finishReason !== "tool_calls" || pendingToolCalls.length === 0) {
      messages.push({ role: "assistant", content: tokenBuffer });
      return;
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

      process.stdout.write(dim(`\n• ${cyan(tc.name)} ${dim(JSON.stringify(parsedArgs))}\n`));

      let result: string;
      try {
        result = await dispatchTool(tc.name as ToolName, parsedArgs);
      } catch (err) {
        result = `Error: ${(err as Error).message}`;
      }

      const preview = result.length > 800 ? result.slice(0, 800) + "\n…(truncated)" : result;
      process.stdout.write(dim(preview.split("\n").map((l) => "  " + l).join("\n")) + "\n");

      toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
    }

    messages.push(...toolResults);
  }

  process.stdout.write(yellow(`\n(stopped after ${MAX_ITERATIONS} steps)\n`));
}
