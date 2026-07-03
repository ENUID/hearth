// A curated, multi-modal catalog of open models you can run on Hearth with one
// tap. `gpu` maps to the control-plane GPU type to provision ("cpu" = no GPU).
export type ModelGpu = "cpu" | "a10g" | "a100";

// localTier: how easily this runs on-device in the browser (WebGPU/WebLLM).
//   "easy"  — runs on most phones/laptops
//   "heavy" — only strong devices (lots of RAM)
//   "none"  — too big / wrong shape for a device; cloud GPU only
export type LocalTier = "easy" | "heavy" | "none";

// What the model produces. Only "chat" has an in-browser chat UI + on-device
// path today; image/audio/video provision a GPU and serve (the per-modality
// runner is configured on a real deploy, like the ollama/RunPod path).
export type ModelCategory = "chat" | "image" | "audio" | "video";

export interface ModelInfo {
  id: string;
  name: string;
  params: string;
  family: string;
  gpu: ModelGpu;
  sizeGb: number;
  blurb: string;
  category: ModelCategory;
  localTier: LocalTier;
  mlcId?: string; // WebLLM model id for on-device inference (chat only)
}

export const MODEL_CATALOG: ModelInfo[] = [
  // ---- Chat / LLM (text) ----
  { id: "gpt2", name: "GPT-2", params: "124M", family: "OpenAI (open weights)", gpu: "cpu", sizeGb: 0.7, blurb: "The 2019 classic. Runs on plain CPU — see scripts/gpt2-server.py.", category: "chat", localTier: "none" },
  { id: "llama3.2:1b", name: "Llama 3.2 1B", params: "1B", family: "Meta Llama", gpu: "cpu", sizeGb: 1.3, blurb: "Tiny + fast. Runs right on your device.", category: "chat", localTier: "easy", mlcId: "Llama-3.2-1B-Instruct-q4f16_1-MLC" },
  { id: "llama3.1:8b", name: "Llama 3.1 8B", params: "8B", family: "Meta Llama", gpu: "a10g", sizeGb: 4.7, blurb: "Strong general-purpose assistant.", category: "chat", localTier: "heavy", mlcId: "Llama-3.1-8B-Instruct-q4f16_1-MLC" },
  { id: "qwen2.5:7b", name: "Qwen2.5 7B", params: "7B", family: "Alibaba Qwen", gpu: "a10g", sizeGb: 4.7, blurb: "Excellent at code and reasoning.", category: "chat", localTier: "heavy", mlcId: "Qwen2.5-7B-Instruct-q4f16_1-MLC" },
  { id: "mistral:7b", name: "Mistral 7B", params: "7B", family: "Mistral", gpu: "a10g", sizeGb: 4.1, blurb: "Fast, capable, popular open model.", category: "chat", localTier: "heavy", mlcId: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC" },
  { id: "gemma2:9b", name: "Gemma 2 9B", params: "9B", family: "Google Gemma", gpu: "a10g", sizeGb: 5.4, blurb: "Google's open model, solid all-rounder.", category: "chat", localTier: "heavy", mlcId: "gemma-2-9b-it-q4f16_1-MLC" },
  { id: "deepseek-r1:8b", name: "DeepSeek-R1 8B", params: "8B", family: "DeepSeek", gpu: "a10g", sizeGb: 4.9, blurb: "Reasoning model that thinks step by step.", category: "chat", localTier: "heavy", mlcId: "DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC" },
  { id: "hermes3:8b", name: "Hermes 3 8B", params: "8B", family: "Nous Research", gpu: "a10g", sizeGb: 4.7, blurb: "Steerable, candid fine-tune of Llama 3.1.", category: "chat", localTier: "heavy", mlcId: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC" },
  { id: "glm4:9b", name: "GLM-4 9B", params: "9B", family: "Zhipu AI", gpu: "a10g", sizeGb: 5.5, blurb: "Strong bilingual (EN/中文) chat, long context, tool use.", category: "chat", localTier: "none" },
  { id: "qwen2.5:72b", name: "Qwen2.5 72B", params: "72B", family: "Alibaba Qwen", gpu: "a100", sizeGb: 41, blurb: "Frontier-class. Top open model for code + reasoning.", category: "chat", localTier: "none" },
  { id: "llama3.3:70b", name: "Llama 3.3 70B", params: "70B", family: "Meta Llama", gpu: "a100", sizeGb: 40, blurb: "Meta's latest 70B — near-405B quality.", category: "chat", localTier: "none" },
  { id: "mixtral:8x7b", name: "Mixtral 8x7B", params: "47B MoE", family: "Mistral", gpu: "a100", sizeGb: 26, blurb: "Mixture-of-experts; fast for its strength.", category: "chat", localTier: "none" },
  { id: "glm-4.5-air", name: "GLM-4.5 Air", params: "106B MoE (12B active)", family: "Zhipu AI", gpu: "a100", sizeGb: 60, blurb: "Zhipu's 2025 flagship-class MoE — built for agentic coding + tool use.", category: "chat", localTier: "none" },
  { id: "command-r-plus", name: "Command R+", params: "104B", family: "Cohere", gpu: "a100", sizeGb: 59, blurb: "Built for RAG and tool use.", category: "chat", localTier: "none" },

  // ---- Image generation ----
  { id: "flux.1-schnell", name: "FLUX.1 [schnell]", params: "12B", family: "Black Forest Labs", gpu: "a10g", sizeGb: 24, blurb: "Best fast open image model. A few steps.", category: "image", localTier: "none" },
  { id: "flux.1-dev", name: "FLUX.1 [dev]", params: "12B", family: "Black Forest Labs", gpu: "a100", sizeGb: 24, blurb: "Highest-quality open text-to-image.", category: "image", localTier: "none" },
  { id: "sd3.5-large", name: "Stable Diffusion 3.5 Large", params: "8B", family: "Stability AI", gpu: "a100", sizeGb: 16, blurb: "Stability's flagship image model.", category: "image", localTier: "none" },
  { id: "sdxl", name: "SDXL", params: "3.5B", family: "Stability AI", gpu: "a10g", sizeGb: 7, blurb: "Reliable, huge ecosystem of fine-tunes.", category: "image", localTier: "none" },

  // ---- Audio (speech / music) ----
  { id: "whisper-v3", name: "Whisper Large v3", params: "1.5B", family: "OpenAI", gpu: "a10g", sizeGb: 3, blurb: "Best open speech-to-text, many languages.", category: "audio", localTier: "none" },
  { id: "xtts-v2", name: "XTTS v2", params: "—", family: "Coqui", gpu: "a10g", sizeGb: 2, blurb: "Text-to-speech with voice cloning.", category: "audio", localTier: "none" },
  { id: "musicgen", name: "MusicGen", params: "3.3B", family: "Meta", gpu: "a10g", sizeGb: 3.3, blurb: "Generate music from a text prompt.", category: "audio", localTier: "none" },
  { id: "bark", name: "Bark", params: "1B", family: "Suno", gpu: "a10g", sizeGb: 4, blurb: "Expressive speech, sound effects, song.", category: "audio", localTier: "none" },

  // ---- Video generation ----
  { id: "ltx-video", name: "LTX-Video", params: "2B", family: "Lightricks", gpu: "a10g", sizeGb: 9, blurb: "Fast, real-time-ish open text-to-video.", category: "video", localTier: "none" },
  { id: "mochi-1", name: "Mochi 1", params: "10B", family: "Genmo", gpu: "a100", sizeGb: 20, blurb: "High-fidelity open video generation.", category: "video", localTier: "none" },
  { id: "hunyuan-video", name: "HunyuanVideo", params: "13B", family: "Tencent", gpu: "a100", sizeGb: 25, blurb: "Tencent's large open video model.", category: "video", localTier: "none" },
  { id: "cogvideox-5b", name: "CogVideoX 5B", params: "5B", family: "Zhipu AI", gpu: "a100", sizeGb: 10, blurb: "Text- and image-to-video.", category: "video", localTier: "none" },
];

export function findModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}
