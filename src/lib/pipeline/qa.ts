import { AudioAsset, QAReport, Shot, SubtitleCue } from "@/lib/schemas";
import { jaccardSimilarity } from "./prompts";
import { MAX_SHOT_SEC } from "./timing";

const GENERIC_PATTERNS = [
  /^(a |an )?(beautiful|nice|amazing) (image|picture|scene)/i,
  /^(cinematic scene|epic scene|scene about)/i,
];

/**
 * Automatic QA gate. Runs BEFORE export; any error blocks the export.
 * Enforces every mandatory rule of the factory.
 */
export function runQA(args: {
  shots: Shot[];
  audio: AudioAsset;
  cues: SubtitleCue[];
  requireImages?: boolean;
}): QAReport {
  const { shots, audio, cues, requireImages = true } = args;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (shots.length === 0) errors.push("no shots generated");

  // 1. Timeline must cover the real audio duration, contiguously.
  const last = shots[shots.length - 1];
  if (last && Math.abs(last.endSec - audio.durationSec) > 0.5) {
    errors.push(`video timeline ends at ${last.endSec}s but audio lasts ${audio.durationSec}s`);
  }
  for (let i = 1; i < shots.length; i++) {
    if (Math.abs(shots[i].startSec - shots[i - 1].endSec) > 0.05) {
      errors.push(`gap/overlap between shot ${i - 1} and ${i}`);
    }
  }

  for (const s of shots) {
    // 2. Every shot must have a timestamp and respect max duration.
    const len = s.endSec - s.startSec;
    if (len <= 0) errors.push(`${s.id}: non-positive duration`);
    if (len > MAX_SHOT_SEC + 0.5) errors.push(`${s.id}: lasts ${len.toFixed(1)}s (max ${MAX_SHOT_SEC}s)`);
    // 3. Every image must be linked to a script sentence.
    if (!s.sentence?.trim()) errors.push(`${s.id}: not linked to a script sentence`);
    // 4. No generic prompts.
    if (GENERIC_PATTERNS.some((re) => re.test(s.imagePrompt))) {
      errors.push(`${s.id}: generic prompt detected: "${s.imagePrompt.slice(0, 60)}..."`);
    }
    if (s.imagePrompt.length < 40) warnings.push(`${s.id}: prompt is very short`);
    // 5. Image asset must exist before assembling.
    if (requireImages && !s.imagePath) errors.push(`${s.id}: image not generated`);
  }

  // 6. No visually repeated images (same prompt => same-looking image).
  // The shared style/character-sheet prefix is stripped first: it is
  // intentionally identical on every prompt and must not mask real dupes.
  const cores = stripCommonPrefix(shots.map((s) => s.imagePrompt));
  for (let i = 0; i < shots.length; i++) {
    for (let j = i + 1; j < shots.length; j++) {
      const sim = jaccardSimilarity(cores[i], cores[j]);
      if (sim > 0.9) errors.push(`${shots[i].id} and ${shots[j].id}: near-identical prompts (${(sim * 100).toFixed(0)}% similar)`);
      else if (sim > 0.75) warnings.push(`${shots[i].id} and ${shots[j].id}: similar prompts (${(sim * 100).toFixed(0)}%)`);
    }
  }

  // 7. Subtitles must exist and stay within the audio.
  if (cues.length === 0) errors.push("no subtitle cues");
  if (cues.length && cues[cues.length - 1].endSec > audio.durationSec + 0.5) {
    errors.push("subtitles extend past the audio");
  }

  return { passed: errors.length === 0, errors, warnings };
}

/** Remove the longest common word-prefix shared by ALL prompts. */
export function stripCommonPrefix(prompts: string[]): string[] {
  if (prompts.length < 2) return prompts;
  const split = prompts.map((p) => p.split(/\s+/));
  let common = 0;
  const min = Math.min(...split.map((w) => w.length));
  while (common < min - 1 && split.every((w) => w[common] === split[0][common])) common++;
  return split.map((w) => w.slice(common).join(" ") || w.join(" "));
}
