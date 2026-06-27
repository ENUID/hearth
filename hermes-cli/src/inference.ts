import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionChunk } from "openai/resources/chat/completions";

const STUB = process.env.STUB_INFERENCE === "true";
const BASE_URL = process.env.INFERENCE_BASE_URL ?? "http://localhost:8000/v1";
const MODEL = process.env.INFERENCE_MODEL ?? "NousResearch/Hermes-3-Llama-3.1-8B";
const API_KEY = process.env.INFERENCE_API_KEY ?? "none";

const client = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY });

export const config = { STUB, BASE_URL, MODEL };

export type StreamEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; id: string; name: string; args: string }
  | { type: "finish"; reason: string };

export async function* streamChat(
  messages: ChatCompletionMessageParam[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: readonly any[]
): AsyncGenerator<StreamEvent> {
  if (STUB) {
    yield* stubStream(messages);
    return;
  }

  const stream = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools: [...tools],
    stream: true,
    temperature: 0.7,
    max_tokens: 2048,
  });

  const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

  for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    const delta = choice.delta;

    if (delta.content) {
      yield { type: "token", content: delta.content };
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const buf = toolCallBuffers.get(tc.index) ?? { id: "", name: "", args: "" };
        if (tc.id) buf.id = tc.id;
        if (tc.function?.name) buf.name = tc.function.name;
        if (tc.function?.arguments) buf.args += tc.function.arguments;
        toolCallBuffers.set(tc.index, buf);
      }
    }

    if (choice.finish_reason) {
      for (const [, tc] of [...toolCallBuffers.entries()].sort(([a], [b]) => a - b)) {
        yield { type: "tool_call", id: tc.id, name: tc.name, args: tc.args };
      }
      yield { type: "finish", reason: choice.finish_reason };
    }
  }
}

async function* stubStream(messages: ChatCompletionMessageParam[]): AsyncGenerator<StreamEvent> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = typeof lastUser?.content === "string" ? lastUser.content : "your request";

  const reply =
    `[stub] I received: "${userText}".\n` +
    `I'm running in STUB mode, so I'm not calling a real model. ` +
    `Point INFERENCE_BASE_URL at a Hermes endpoint and set STUB_INFERENCE=false to go live.`;

  for (const char of reply) {
    yield { type: "token", content: char };
    await new Promise((r) => setTimeout(r, 8));
  }

  yield { type: "finish", reason: "stop" };
}
