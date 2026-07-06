import { LLMProvider, TTSProvider, ImageProvider } from "./index";
import { mockLLM, mockTTS, mockImages } from "./mock";
import { openaiLLM, openaiTTS, openaiImages } from "./openai";
import { togetherImages, togetherLLM } from "./together";

/**
 * Provider selection via env. Each slot (LLM, TTS, images) is independent:
 *  - TOGETHER_API_KEY  → images via FLUX.1 on Together (+ LLM via Together if no OpenAI key)
 *  - OPENAI_API_KEY    → LLM + TTS (and images, if Together absent)
 *  - nothing / PROVIDER_MODE=mock → mocks (dev/tests, no cost)
 */
export function getProviders(): { llm: LLMProvider; tts: TTSProvider; images: ImageProvider } {
  if (process.env.PROVIDER_MODE === "mock") return { llm: mockLLM, tts: mockTTS, images: mockImages };
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasTogether = Boolean(process.env.TOGETHER_API_KEY);
  if (!hasOpenAI && !hasTogether) return { llm: mockLLM, tts: mockTTS, images: mockImages };
  return {
    llm: hasOpenAI ? openaiLLM : togetherLLM,
    tts: hasOpenAI ? openaiTTS : mockTTS, // Together has no TTS; OpenAI (or another vendor) required for real narration
    images: hasTogether ? togetherImages : openaiImages,
  };
}
