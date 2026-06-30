import zlib from "zlib";

// Image generation runner. Chat models speak the OpenAI chat API; image models
// need their own serving stack. ComfyUIRunner is the real deploy path (talks to
// a ComfyUI server over HTTP); StubImageRunner synthesizes a real PNG so the
// images endpoint works in any environment (no GPU / weights needed to demo).
export interface GenResult {
  b64: string; // base64 PNG
  note?: string;
}
export interface ImageRunner {
  name: string;
  generate(prompt: string, model: string): Promise<GenResult>;
}

// --- minimal PNG encoder (solid color derived from the prompt) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function solidPng(size: number, rgb: [number, number, number]): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
function colorFromPrompt(prompt: string): [number, number, number] {
  let h = 2166136261;
  for (let i = 0; i < prompt.length; i++) h = (h ^ prompt.charCodeAt(i)) * 16777619;
  return [(h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff];
}

class StubImageRunner implements ImageRunner {
  name = "stub";
  async generate(prompt: string): Promise<GenResult> {
    const png = solidPng(256, colorFromPrompt(prompt || "hearth"));
    return { b64: png.toString("base64"), note: "placeholder — set HEARTH_IMAGE_BACKEND=comfyui + COMFYUI_URL to render for real" };
  }
}

// Real path: drive a ComfyUI server. Provision the GPU (control plane already
// does this when an image model starts), point COMFYUI_URL at the server, and
// this submits a FLUX-style text-to-image workflow, waits, and returns the PNG.
class ComfyUIRunner implements ImageRunner {
  name = "comfyui";
  private base = (process.env.COMFYUI_URL ?? "").replace(/\/$/, "");

  async generate(prompt: string, model: string): Promise<GenResult> {
    const clientId = "hearth-" + Math.random().toString(36).slice(2);
    const workflow = this.fluxWorkflow(prompt, model);
    const submit = await fetch(`${this.base}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
    if (!submit.ok) throw new Error(`comfyui /prompt ${submit.status}`);
    const { prompt_id } = (await submit.json()) as { prompt_id: string };

    // Poll history until the run produces an output image.
    for (let i = 0; i < 120; i++) {
      const h = await fetch(`${this.base}/history/${prompt_id}`);
      const hist = (await h.json()) as Record<string, { outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }>;
      const entry = hist[prompt_id];
      const img = entry && Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
      if (img) {
        const view = await fetch(`${this.base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`);
        const buf = Buffer.from(await view.arrayBuffer());
        return { b64: buf.toString("base64") };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("comfyui timed out");
  }

  // A standard FLUX text-to-image graph in ComfyUI's API format.
  private fluxWorkflow(prompt: string, model: string) {
    const ckpt = model.includes("schnell") ? "flux1-schnell.safetensors" : "flux1-dev.safetensors";
    return {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
      "3": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
      "4": { class_type: "KSampler", inputs: { seed: Math.floor(Math.random() * 1e9), steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 1, model: ["1", 0], positive: ["2", 0], negative: ["2", 0], latent_image: ["3", 0] } },
      "5": { class_type: "VAEDecode", inputs: { samples: ["4", 0], vae: ["1", 2] } },
      "6": { class_type: "SaveImage", inputs: { images: ["5", 0], filename_prefix: "hearth" } },
    };
  }
}

export function makeImageRunner(): ImageRunner {
  if (process.env.HEARTH_IMAGE_BACKEND === "comfyui" && process.env.COMFYUI_URL) return new ComfyUIRunner();
  return new StubImageRunner();
}

export const imageRunner: ImageRunner = makeImageRunner();
