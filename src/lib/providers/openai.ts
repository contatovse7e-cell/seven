import fs from "node:fs/promises";
import { LLMProvider, TTSProvider, ImageProvider } from "./index";
import { AudioAsset, AudioAssetSchema } from "@/lib/schemas";
import { withRetry } from "@/lib/retry";

const API = "https://api.openai.com/v1";

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY not set");
  return k;
}

async function post(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

export const openaiLLM: LLMProvider = {
  async complete(system, user) {
    return withRetry(async () => {
      const res = await post("/chat/completions", {
        model: process.env.LLM_MODEL ?? "gpt-4o",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new Error("LLM returned empty completion");
      return text as string;
    });
  },
};

export const openaiTTS: TTSProvider = {
  async synthesize(text, voiceId, outPath): Promise<AudioAsset> {
    return withRetry(async () => {
      const res = await post("/audio/speech", {
        model: process.env.TTS_MODEL ?? "tts-1-hd",
        voice: voiceId,
        input: text,
        response_format: "wav",
      });
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(outPath, buf);
      return AudioAssetSchema.parse({
        filePath: outPath,
        durationSec: wavDurationSec(buf),
        sampleRate: wavSampleRate(buf),
      });
    });
  },
};

export const openaiImages: ImageProvider = {
  async generate(prompt, _negative, outPath) {
    return withRetry(async () => {
      const res = await post("/images/generations", {
        model: process.env.IMAGE_MODEL ?? "dall-e-3",
        prompt,
        size: "1792x1024",
        response_format: "b64_json",
        n: 1,
      });
      const json = await res.json();
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error("image API returned no image");
      await fs.writeFile(outPath, Buffer.from(b64, "base64"));
    });
  },
};

/** Measure REAL duration from the WAV header — never estimated. */
export function wavDurationSec(buf: Buffer): number {
  const byteRate = buf.readUInt32LE(28);
  const dataSize = findDataChunkSize(buf);
  if (!byteRate || !dataSize) throw new Error("invalid WAV: cannot measure duration");
  return dataSize / byteRate;
}

export function wavSampleRate(buf: Buffer): number {
  return buf.readUInt32LE(24);
}

function findDataChunkSize(buf: Buffer): number {
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") return size;
    offset += 8 + size + (size % 2);
  }
  return 0;
}
