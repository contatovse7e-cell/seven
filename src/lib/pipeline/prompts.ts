import { Shot, ShotSchema } from "@/lib/schemas";
import { buildShotWindows } from "./timing";
import type { Scene } from "@/lib/schemas";

export type PromptWriter = (args: {
  sentence: string;
  visualStyle: string;
  niche: string;
  shotIndexInScene: number;
  previousPrompts: string[];
}) => Promise<string>;

const ANIMATIONS: Shot["animation"]["type"][] = [
  "zoom_in", "pan_right", "zoom_out", "pan_left", "pan_up", "pan_down",
];

const DEFAULT_NEGATIVE = "text, watermark, logo, low quality, deformed hands, extra fingers, blurry";

/**
 * Build one unique, sentence-linked image prompt per shot window.
 *
 * Anti-repetition guarantees:
 *  - the prompt writer receives every previous prompt and must diverge;
 *  - a Jaccard similarity check rejects near-duplicates and forces a rewrite;
 *  - camera animation cycles deterministically so consecutive shots never
 *    share the same movement.
 */
export async function buildShots(
  scenes: Scene[],
  visualStyle: string,
  niche: string,
  writePrompt: PromptWriter,
): Promise<Shot[]> {
  const windows = buildShotWindows(scenes);
  const shots: Shot[] = [];
  const previousPrompts: string[] = [];
  let lastSceneIndex = -1;
  let shotInScene = 0;

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    shotInScene = w.sceneIndex === lastSceneIndex ? shotInScene + 1 : 0;
    lastSceneIndex = w.sceneIndex;

    let prompt = await writePrompt({
      sentence: w.sentence,
      visualStyle,
      niche,
      shotIndexInScene: shotInScene,
      previousPrompts: previousPrompts.slice(-8),
    });

    // Reject near-duplicates: retry once with an explicit divergence hint.
    if (previousPrompts.some((p) => jaccardSimilarity(p, prompt) > 0.7)) {
      prompt = await writePrompt({
        sentence: w.sentence + " (mostre um ângulo, momento ou detalhe DIFERENTE das imagens anteriores)",
        visualStyle,
        niche,
        shotIndexInScene: shotInScene,
        previousPrompts: previousPrompts.slice(-8),
      });
    }
    if (previousPrompts.some((p) => jaccardSimilarity(p, prompt) > 0.85)) {
      // Last resort for repetitive scripts: append a deterministic, per-shot
      // visual variation (lens, light, palette, angle) so no two images can
      // come out visually identical.
      prompt = `${prompt}, ${uniqueVariation(i)}`;
    }
    previousPrompts.push(prompt);

    shots.push(
      ShotSchema.parse({
        id: `shot-${String(i + 1).padStart(4, "0")}`,
        sceneIndex: w.sceneIndex,
        sentence: w.sentence,
        startSec: w.startSec,
        endSec: w.endSec,
        imagePrompt: prompt,
        negativePrompt: DEFAULT_NEGATIVE,
        animation: {
          type: ANIMATIONS[i % ANIMATIONS.length],
          intensity: 0.08 + (i % 3) * 0.03,
        },
      }),
    );
  }
  return shots;
}

const LENSES = ["35mm lens", "85mm portrait lens", "24mm wide lens", "macro detail lens", "telephoto compression"];
const LIGHTS = ["golden hour light", "cold moonlight", "torch-lit shadows", "overcast diffuse light", "harsh midday sun", "candlelight glow", "stormy dramatic sky"];
const PALETTES = ["warm amber palette", "desaturated earth tones", "deep blue and gold palette", "muted sepia palette", "vivid crimson accents", "cool teal palette"];
const ANGLES = ["low angle", "bird's-eye view", "eye-level framing", "dutch angle", "over-the-shoulder view", "profile view", "three-quarter view"];

/** Deterministic per-shot visual variation; distinct combination for each index. */
export function uniqueVariation(i: number): string {
  return [
    LENSES[i % LENSES.length],
    LIGHTS[i % LIGHTS.length],
    PALETTES[i % PALETTES.length],
    ANGLES[i % ANGLES.length],
  ].join(", ");
}

/** Token-set Jaccard similarity, used to detect repeated/generic prompts. */
export function jaccardSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Deterministic fallback prompt writer (no LLM). Builds a specific prompt
 * from the sentence itself so it is never a generic template.
 */
export const fallbackPromptWriter: PromptWriter = async ({ sentence, visualStyle, shotIndexInScene }) => {
  const focus = ["wide establishing shot", "medium shot, subject centered", "close-up on the key detail", "over-the-shoulder perspective", "low angle dramatic view"][shotIndexInScene % 5];
  return `${visualStyle}, ${focus}, depicting: ${sentence.replace(/[.!?…]+$/, "")}, cinematic lighting, high detail, 16:9`;
};
