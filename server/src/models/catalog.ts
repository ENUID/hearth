// A curated catalog of open-source models you can run on Hearth with one tap.
// `gpu` maps to the control-plane GPU type to provision ("cpu" = no GPU).
export type ModelGpu = "cpu" | "a10g" | "a100";

export interface ModelInfo {
  id: string; // ollama id, e.g. "llama3.1:8b"
  name: string;
  params: string;
  family: string;
  gpu: ModelGpu;
  sizeGb: number;
  blurb: string;
}

export const MODEL_CATALOG: ModelInfo[] = [
  { id: "llama3.2:1b", name: "Llama 3.2 1B", params: "1B", family: "Meta Llama", gpu: "cpu", sizeGb: 1.3, blurb: "Tiny + fast. Runs on CPU — great for a free first try." },
  { id: "llama3.1:8b", name: "Llama 3.1 8B", params: "8B", family: "Meta Llama", gpu: "a10g", sizeGb: 4.7, blurb: "Strong general-purpose assistant." },
  { id: "qwen2.5:7b", name: "Qwen2.5 7B", params: "7B", family: "Qwen", gpu: "a10g", sizeGb: 4.7, blurb: "Excellent at code and reasoning." },
  { id: "mistral:7b", name: "Mistral 7B", params: "7B", family: "Mistral", gpu: "a10g", sizeGb: 4.1, blurb: "Fast, capable, popular open model." },
  { id: "gemma2:9b", name: "Gemma 2 9B", params: "9B", family: "Google Gemma", gpu: "a10g", sizeGb: 5.4, blurb: "Google's open model, solid all-rounder." },
  { id: "deepseek-r1:8b", name: "DeepSeek-R1 8B", params: "8B", family: "DeepSeek", gpu: "a10g", sizeGb: 4.9, blurb: "Reasoning model that thinks step by step." },
  { id: "llama3.1:70b", name: "Llama 3.1 70B", params: "70B", family: "Meta Llama", gpu: "a100", sizeGb: 40, blurb: "Frontier-class open model. Needs a big GPU." },
];

export function findModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}
