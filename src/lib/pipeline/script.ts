import { LLMProvider } from "@/lib/providers";
import { ProjectInput, Script, ScriptSchema } from "@/lib/schemas";
import { splitSentences } from "./timing";

const WORDS_PER_MINUTE = 150;

/**
 * Generates a retention-optimized script, or normalizes a pasted one.
 * Output always passes ScriptSchema.
 */
export async function buildScript(input: ProjectInput, llm: LLMProvider): Promise<Script> {
  const fullText = input.pastedScript
    ? normalize(input.pastedScript)
    : await generateScript(input, llm);

  const sentences = splitSentences(fullText);
  if (sentences.length < 3) throw new Error("script: too short after normalization (need at least 3 sentences)");

  // Section roles: hook = first sentence, cta = last, body = rest.
  const sections = sentences.map((text, i) => ({
    id: `sec-${i + 1}`,
    role: (i === 0 ? "hook" : i === sentences.length - 1 ? "cta" : "body") as "hook" | "body" | "cta",
    text,
  }));

  return ScriptSchema.parse({
    language: input.language,
    sections,
    fullText,
    estimatedWords: fullText.split(/\s+/).filter(Boolean).length,
  });
}

async function generateScript(input: ProjectInput, llm: LLMProvider): Promise<string> {
  const targetWords = Math.round(input.targetMinutes * WORDS_PER_MINUTE);
  const system = [
    "Você é um roteirista profissional de YouTube especializado em retenção.",
    "Escreva APENAS o texto da narração, sem marcações de cena, sem títulos, sem listas.",
    "Estrutura: gancho forte nos primeiros 15 segundos; loops abertos; promessa entregue; CTA no final.",
    "Frases curtas e claras. Nunca copie o estilo de um canal específico.",
  ].join(" ");
  const user = `Título: ${input.title}\nNicho: ${input.niche}\nIdioma: ${input.language}\nTamanho alvo: ~${targetWords} palavras (${input.targetMinutes} minutos de narração).`;
  const text = normalize(await llm.complete(system, user));
  if (text.split(/\s+/).length < targetWords * 0.5) {
    // Long-form protection: ask for a continuation instead of shipping a short video.
    const more = await llm.complete(system, `${user}\nO roteiro abaixo ficou curto. Continue-o até atingir o tamanho alvo, mantendo o fluxo:\n${text}`);
    return normalize(`${text} ${more}`);
  }
  return text;
}

function normalize(text: string): string {
  return text.replace(/\r/g, "").replace(/\n{2,}/g, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}
