import { Scene, SubtitleCue, SubtitleCueSchema } from "@/lib/schemas";

const MAX_CUE_CHARS = 84; // ~2 lines of 42 chars

/** Build SRT cues from scenes, splitting long sentences into readable chunks. */
export function buildSubtitleCues(scenes: Scene[]): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const scene of scenes) {
    const chunks = chunkText(scene.sentence, MAX_CUE_CHARS);
    const len = scene.endSec - scene.startSec;
    const per = len / chunks.length;
    chunks.forEach((text, i) => {
      cues.push(
        SubtitleCueSchema.parse({
          index: cues.length + 1,
          startSec: round2(scene.startSec + i * per),
          endSec: round2(i === chunks.length - 1 ? scene.endSec : scene.startSec + (i + 1) * per),
          text,
        }),
      );
    });
  }
  return cues;
}

export function cuesToSrt(cues: SubtitleCue[]): string {
  return cues
    .map((c) => `${c.index}\n${fmt(c.startSec)} --> ${fmt(c.endSec)}\n${c.text}\n`)
    .join("\n");
}

function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > max && current) {
      chunks.push(current.trim());
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
