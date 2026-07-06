import { describe, it, expect } from "vitest";
import { buildScenes } from "@/lib/pipeline/timing";
import { buildShots, fallbackPromptWriter, jaccardSimilarity } from "@/lib/pipeline/prompts";

describe("prompts", () => {
  it("every shot is linked to a script sentence and has a timestamp", async () => {
    const scenes = buildScenes(
      "O império nasceu de uma vila pobre. As legiões marcharam pelo deserto. O senado tremia diante do general.",
      { filePath: "a.wav", durationSec: 30, sampleRate: 24000 },
    );
    const shots = await buildShots(scenes, "epic digital painting", "história", fallbackPromptWriter);
    for (const s of shots) {
      expect(s.sentence.length).toBeGreaterThan(0);
      expect(s.endSec).toBeGreaterThan(s.startSec);
      expect(s.imagePrompt).toContain(s.sentence.replace(/[.!?…]+$/, ""));
    }
  });

  it("rejects near-duplicate prompts from a lazy writer", async () => {
    const scenes = buildScenes("Frase um aqui. Frase dois aqui. Frase três aqui.", {
      filePath: "a.wav", durationSec: 12, sampleRate: 24000,
    });
    // Writer that always returns the same generic prompt.
    const lazy = async () => "epic cinematic scene with dramatic lighting and beautiful composition in the frame";
    const shots = await buildShots(scenes, "style", "niche", lazy);
    const prompts = shots.map((s) => s.imagePrompt);
    expect(new Set(prompts).size).toBe(prompts.length); // all textually unique
  });

  it("consecutive shots get different camera animations", async () => {
    const scenes = buildScenes("Um. Dois. Três. Quatro. Cinco. Seis. Sete.", {
      filePath: "a.wav", durationSec: 28, sampleRate: 24000,
    });
    const shots = await buildShots(scenes, "style", "niche", fallbackPromptWriter);
    for (let i = 1; i < shots.length; i++) {
      expect(shots[i].animation.type).not.toBe(shots[i - 1].animation.type);
    }
  });

  it("jaccard similarity detects duplicates", () => {
    expect(jaccardSimilarity("a red house on a hill", "a red house on a hill")).toBe(1);
    expect(jaccardSimilarity("a red house", "blue ocean waves crashing")).toBe(0);
  });
});
