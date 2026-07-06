import { AudioAsset } from "@/lib/schemas";

/**
 * Provider interfaces. The pipeline only depends on these; concrete adapters
 * (OpenAI, ElevenLabs, Stability, mocks) are chosen by env config, so
 * swapping vendors never touches pipeline code.
 */

export interface LLMProvider {
  /** Returns plain text completion. */
  complete(system: string, user: string): Promise<string>;
}

export interface TTSProvider {
  /** Synthesizes narration and returns the audio asset with REAL measured duration. */
  synthesize(text: string, voiceId: string, outPath: string): Promise<AudioAsset>;
}

export interface ImageProvider {
  /** Generates one 16:9 image and writes it to outPath. */
  generate(prompt: string, negativePrompt: string, outPath: string): Promise<void>;
}
