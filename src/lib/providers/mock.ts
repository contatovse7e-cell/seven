import fs from "node:fs/promises";
import { LLMProvider, TTSProvider, ImageProvider } from "./index";
import { AudioAssetSchema } from "@/lib/schemas";

/**
 * Deterministic mock providers: let the whole pipeline run end-to-end with no
 * API keys (dev, tests, demos). TTS duration mimics real narration pace.
 */

export const mockLLM: LLMProvider = {
  async complete(_system, user) {
    return `[mock] ${user.slice(0, 400)}`;
  },
};

export const mockTTS: TTSProvider = {
  async synthesize(text, _voiceId, outPath) {
    const words = text.split(/\s+/).filter(Boolean).length;
    const durationSec = Math.max(1, (words / 150) * 60); // ~150 wpm
    const sampleRate = 24000;
    const buf = silentWav(durationSec, sampleRate);
    await fs.writeFile(outPath, buf);
    return AudioAssetSchema.parse({ filePath: outPath, durationSec, sampleRate });
  },
};

export const mockImages: ImageProvider = {
  async generate(_prompt, _negative, outPath) {
    // 1x1 black PNG placeholder
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    await fs.writeFile(outPath, png);
  },
};

function silentWav(durationSec: number, sampleRate: number): Buffer {
  const numSamples = Math.round(durationSec * sampleRate);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}
