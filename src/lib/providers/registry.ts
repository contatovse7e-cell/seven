import { LLMProvider, TTSProvider, ImageProvider } from "./index";
import { mockLLM, mockTTS, mockImages } from "./mock";
import { openaiLLM, openaiTTS, openaiImages } from "./openai";

/** Provider selection via env. Defaults to mocks when no key is configured. */
export function getProviders(): { llm: LLMProvider; tts: TTSProvider; images: ImageProvider } {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const mode = process.env.PROVIDER_MODE ?? (hasOpenAI ? "openai" : "mock");
  if (mode === "openai") return { llm: openaiLLM, tts: openaiTTS, images: openaiImages };
  return { llm: mockLLM, tts: mockTTS, images: mockImages };
}
