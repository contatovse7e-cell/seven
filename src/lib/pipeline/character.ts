import { LLMProvider } from "@/lib/providers";
import { ProjectInput } from "@/lib/schemas";

/**
 * Character sheet: a fixed English description block repeated VERBATIM at the
 * start of every image prompt. This is what keeps the same face, hair and
 * outfit across all FLUX.1 images without a LoRA.
 */
export async function buildCharacterSheet(input: ProjectInput, llm: LLMProvider): Promise<string> {
  try {
    const system =
      "You write ONE character description block in English for consistent AI image generation. " +
      "Max 40 words, one line, no quotes. Cover: apparent age, face shape, hair/beard, skin tone, " +
      "and typical work outfit with FIXED colors for the given profession/niche. Output only the description.";
    const user = `Video title: ${input.title}\nProfession/niche: ${input.niche}\nVisual style: ${input.visualStyle}`;
    const out = (await llm.complete(system, user)).trim().replace(/^["']|["']$/g, "").replace(/\n[\s\S]*/, "");
    const words = out.split(/\s+/).length;
    if (words >= 8 && words <= 60) return out;
    throw new Error("character sheet out of bounds");
  } catch {
    return `a 40-year-old man with a square face, short dark hair, trimmed beard, medium skin tone, wearing the typical ${input.niche} work outfit in navy blue and gray`;
  }
}
