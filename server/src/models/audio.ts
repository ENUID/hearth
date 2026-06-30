// Audio generation runner (text-to-speech / music). Like the image runner, the
// real path talks to a serving stack; the stub synthesizes a real WAV so the
// endpoint works anywhere (no GPU / weights needed to demo). Speech-to-text
// (Whisper) is a different direction (audio in) and is driven from the terminal.
export interface AudioResult {
  buf: Buffer;
  contentType: string;
  note?: string;
}
export interface AudioRunner {
  name: string;
  speak(input: string, model: string): Promise<AudioResult>;
}

// --- minimal WAV synth (a short tone whose pitch derives from the text) ---
function toneWav(seconds: number, freq: number, sampleRate = 8000): Buffer {
  const n = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    // gentle fade in/out so it doesn't click
    const env = Math.min(1, i / 400, (n - i) / 400);
    const s = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.3 * env;
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
function freqFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = (h ^ text.charCodeAt(i)) * 16777619;
  return 180 + (Math.abs(h) % 480); // 180–660 Hz
}

class StubAudioRunner implements AudioRunner {
  name = "stub";
  async speak(input: string): Promise<AudioResult> {
    const seconds = Math.min(4, 0.8 + input.length / 40);
    return {
      buf: toneWav(seconds, freqFromText(input || "hearth")),
      contentType: "audio/wav",
      note: "placeholder tone - set HEARTH_AUDIO_BACKEND=openai + HEARTH_AUDIO_URL for real speech",
    };
  }
}

// Real path: any OpenAI-compatible audio server (XTTS/Piper/Bark behind an
// OpenAI `/v1/audio/speech` shim, or a hosted TTS). Gated by HEARTH_AUDIO_URL.
class OpenAIAudioRunner implements AudioRunner {
  name = "openai";
  private base = (process.env.HEARTH_AUDIO_URL ?? "").replace(/\/$/, "");
  async speak(input: string, model: string): Promise<AudioResult> {
    const res = await fetch(`${this.base}/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input, voice: process.env.HEARTH_AUDIO_VOICE ?? "default", response_format: "wav" }),
    });
    if (!res.ok) throw new Error(`audio endpoint ${res.status}`);
    return { buf: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "audio/wav" };
  }
}

export function makeAudioRunner(): AudioRunner {
  if (process.env.HEARTH_AUDIO_BACKEND === "openai" && process.env.HEARTH_AUDIO_URL) return new OpenAIAudioRunner();
  return new StubAudioRunner();
}

export const audioRunner: AudioRunner = makeAudioRunner();

/** Audio models that generate sound from text (vs Whisper, which transcribes). */
export function isGenerativeAudio(modelId: string): boolean {
  return !/whisper/i.test(modelId);
}
