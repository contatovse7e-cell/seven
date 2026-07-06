import { AudioAsset, Scene, SceneListSchema, Shot } from "@/lib/schemas";

/** Split text into sentences, keeping punctuation. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Build scenes synchronized to the REAL audio duration.
 *
 * If the TTS provider returned word timestamps, sentence boundaries come from
 * them (exact sync). Otherwise, the audio duration is distributed
 * proportionally to sentence character length — still anchored to the real
 * measured duration, never to a words-per-minute estimate.
 */
export function buildScenes(fullText: string, audio: AudioAsset): Scene[] {
  const sentences = splitSentences(fullText);
  if (sentences.length === 0) throw new Error("timing: script has no sentences");

  let scenes: Scene[];
  if (audio.wordTimestamps && audio.wordTimestamps.length > 0) {
    scenes = scenesFromWordTimestamps(sentences, audio);
  } else {
    scenes = scenesProportional(sentences, audio.durationSec);
  }
  return SceneListSchema.parse(scenes);
}

function scenesProportional(sentences: string[], durationSec: number): Scene[] {
  const totalChars = sentences.reduce((a, s) => a + s.length, 0);
  const scenes: Scene[] = [];
  let cursor = 0;
  for (let i = 0; i < sentences.length; i++) {
    const share = (sentences[i].length / totalChars) * durationSec;
    const end = i === sentences.length - 1 ? durationSec : cursor + share;
    scenes.push({ index: i, sentence: sentences[i], startSec: round2(cursor), endSec: round2(end) });
    cursor = end;
  }
  return scenes;
}

function scenesFromWordTimestamps(sentences: string[], audio: AudioAsset): Scene[] {
  const words = audio.wordTimestamps!;
  const scenes: Scene[] = [];
  let wordIdx = 0;
  let cursor = 0;
  for (let i = 0; i < sentences.length; i++) {
    const sentenceWordCount = sentences[i].split(/\s+/).length;
    const lastWordIdx = Math.min(wordIdx + sentenceWordCount - 1, words.length - 1);
    const end = i === sentences.length - 1 ? audio.durationSec : words[lastWordIdx].end;
    scenes.push({ index: i, sentence: sentences[i], startSec: round2(cursor), endSec: round2(Math.max(end, cursor + 0.1)) });
    cursor = scenes[i].endSec;
    wordIdx = lastWordIdx + 1;
  }
  return scenes;
}

export const TARGET_SHOT_SEC = 4;
export const MAX_SHOT_SEC = 5;

/**
 * Slice scenes into image shots: average ~1 image per 4s, hard max 5s per
 * image. Every shot stays inside its scene, so every image remains linked to
 * one script sentence.
 */
export function buildShotWindows(scenes: Scene[]): Array<Pick<Shot, "sceneIndex" | "sentence" | "startSec" | "endSec">> {
  const windows: Array<Pick<Shot, "sceneIndex" | "sentence" | "startSec" | "endSec">> = [];
  for (const scene of scenes) {
    const len = scene.endSec - scene.startSec;
    const count = Math.max(1, Math.round(len / TARGET_SHOT_SEC));
    const per = len / count;
    // If rounding produced windows above the max, add one more slice.
    const finalCount = per > MAX_SHOT_SEC ? Math.ceil(len / MAX_SHOT_SEC) : count;
    const finalPer = len / finalCount;
    for (let i = 0; i < finalCount; i++) {
      windows.push({
        sceneIndex: scene.index,
        sentence: scene.sentence,
        startSec: round2(scene.startSec + i * finalPer),
        endSec: round2(i === finalCount - 1 ? scene.endSec : scene.startSec + (i + 1) * finalPer),
      });
    }
  }
  return windows;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
