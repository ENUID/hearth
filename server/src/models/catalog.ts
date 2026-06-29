// A curated catalog of open-source models you can run on Hearth with one tap.
// `gpu` maps to the control-plane GPU type to provision ("cpu" = no GPU).
export type ModelGpu = "cpu" | "a10g" | "a100";

// localTier: how easily this runs on-device in the browser (WebGPU/WebLLM).
//   "easy"  — runs on most phones/laptops
//   "heavy" — only strong devices (lots of RAM)
//   "none"  — too big for a device; cloud GPU only
export type LocalTier = "easy" | "heavy" | "none";

export interface ModelInfo {
  id: string; // ollama id, e.g. "llama3.1:8b"
  name: string;
  params: string;
  family: string;
  gpu: ModelGpu;
  sizeGb: number;
  blurb: string;
  localTier: LocalTier;
  mlcId?: string; // WebLLM model id for on-device inference
}

export const MODEL_CATALOG: ModelInfo[] = [
  { id: "llama3.2:1b", name: "Llama 3.2 1B", params: "1B", family: "Meta Llama", gpu: "cpu", sizeGb: 1.3, blurb: "Tiny + fast. Runs right on your device.", localTier: "easy", mlcId: "Llama-3.2-1B-Instruct-q4f16_1-MLC" },
  { id: "llama3.1:8b", name: "Llama 3.1 8B", params: "8B", family: "Meta Llama", gpu: "a10g", sizeGb: 4.7, blurb: "Strong general-purpose assistant.", localTier: "heavy", mlcId: "Llama-3.1-8B-Instruct-q4f16_1-MLC" },
  { id: "qwen2.5:7b", name: "Qwen2.5 7B", params: "7B", family: "Qwen", gpu: "a10g", sizeGb: 4.7, blurb: "Excellent at code and reasoning.", localTier: "heavy", mlcId: "Qwen2.5-7B-Instruct-q4f16_1-MLC" },
  { id: "mistral:7b", name: "Mistral 7B", params: "7B", family: "Mistral", gpu: "a10g", sizeGb: 4.1, blurb: "Fast, capable, popular open model.", localTier: "heavy", mlcId: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC" },
  { id: "gemma2:9b", name: "Gemma 2 9B", params: "9B", family: "Google Gemma", gpu: "a10g", sizeGb: 5.4, blurb: "Google's open model, solid all-rounder.", localTier: "heavy", mlcId: "gemma-2-9b-it-q4f16_1-MLC" },
  { id: "deepseek-r1:8b", name: "DeepSeek-R1 8B", params: "8B", family: "DeepSeek", gpu: "a10g", sizeGb: 4.9, blurb: "Reasoning model that thinks step by step.", localTier: "heavy", mlcId: "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC" },
  { id: "hermes3:8b", name: "Hermes 3 8B", params: "8B", family: "Nous Research", gpu: "a10g", sizeGb: 4.7, blurb: "Steerable, candid assistant fine-tune of Llama 3.1.", localTier: "heavy", mlcId: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC" },
  { id: "llama3.1:70b", name: "Llama 3.1 70B", params: "70B", family: "Meta Llama", gpu: "a100", sizeGb: 40, blurb: "Frontier-class open model. Needs a big GPU.", localTier: "none" },
];

export function findModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}
