import { LLMProvider } from "@/lib/providers";
import { ProjectInput, Script, VideoMetadata, VideoMetadataSchema } from "@/lib/schemas";

/** Generates title, description, tags and pinned comment; validated against schema. */
export async function buildMetadata(input: ProjectInput, script: Script, llm: LLMProvider): Promise<VideoMetadata> {
  const system =
    "Você gera metadados de YouTube. Responda SOMENTE com JSON válido no formato: " +
    '{"title": string, "description": string, "tags": string[], "pinnedComment": string}. ' +
    "Título até 100 caracteres, descrição com 2-3 parágrafos e chamada para inscrição, 10-20 tags, comentário fixado que gere engajamento.";
  const user = `Título base: ${input.title}\nNicho: ${input.niche}\nIdioma: ${input.language}\nInício do roteiro: ${script.fullText.slice(0, 600)}`;

  const raw = await llm.complete(system, user);
  const parsed = tryParseJson(raw);
  if (parsed) {
    const result = VideoMetadataSchema.safeParse(parsed);
    if (result.success) return result.data;
  }
  // Deterministic fallback keeps the pipeline unblocked; QA still sees valid metadata.
  return VideoMetadataSchema.parse({
    title: input.title.slice(0, 100),
    description: `${input.title}\n\n${script.fullText.slice(0, 300)}...\n\nInscreva-se no canal para mais conteúdo sobre ${input.niche}.`,
    tags: buildFallbackTags(input),
    pinnedComment: `O que você achou deste vídeo sobre ${input.niche}? Comente abaixo qual tema você quer ver a seguir!`,
  });
}

function buildFallbackTags(input: ProjectInput): string[] {
  const base = [...input.title.toLowerCase().split(/\s+/), ...input.niche.toLowerCase().split(/\s+/)]
    .filter((w) => w.length > 2);
  const generic = ["youtube", "documentário", "vídeo educativo", "curiosidades", "narração"];
  return Array.from(new Set([input.niche.toLowerCase(), ...base, ...generic])).slice(0, 20);
}

function tryParseJson(raw: string): unknown | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
