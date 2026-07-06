import { describe, it, expect } from "vitest";
import { buildScenes } from "@/lib/pipeline/timing";
import { buildShots, fallbackPromptWriter } from "@/lib/pipeline/prompts";
import { buildCharacterSheet } from "@/lib/pipeline/character";
import { runQA, stripCommonPrefix } from "@/lib/pipeline/qa";
import { mockLLM } from "@/lib/providers/mock";

const CHAR = "a 40-year-old baker with a square face, short dark hair, trimmed beard, wearing a white apron over a navy shirt";

describe("character consistency (FLUX.1)", () => {
  it("every prompt starts with the exact same style + character sheet", async () => {
    const scenes = buildScenes(
      "O padeiro acorda antes do sol. Ele acende o forno a lenha. As mãos sovam a massa com força. O pão dourado sai do forno.",
      { filePath: "a.wav", durationSec: 20, sampleRate: 24000 },
    );
    const shots = await buildShots(scenes, "2D flat illustration, clean vector style", "padeiro", fallbackPromptWriter, { characterSheet: CHAR });
    for (const s of shots) {
      expect(s.imagePrompt.startsWith(`2D flat illustration, clean vector style. ${CHAR}.`)).toBe(true);
      expect(s.imagePrompt).toContain("no readable text");
    }
  });

  it("no two consecutive shots share the same framing", async () => {
    const scenes = buildScenes("Um. Dois. Três. Quatro. Cinco. Seis. Sete. Oito.", {
      filePath: "a.wav", durationSec: 32, sampleRate: 24000,
    });
    const shots = await buildShots(scenes, "style", "niche", fallbackPromptWriter, { characterSheet: CHAR });
    const framingOf = (p: string) => p.split(", ").slice(-4).join(", ");
    for (let i = 1; i < shots.length; i++) {
      expect(framingOf(shots[i].imagePrompt)).not.toBe(framingOf(shots[i - 1].imagePrompt));
    }
  });

  it("QA does not flag the shared character prefix as duplication, but still catches real dupes", async () => {
    const scenes = buildScenes(
      "O chef corta legumes frescos na tábua. A panela ferve no fogão industrial. O prato é finalizado com ervas.",
      { filePath: "a.wav", durationSec: 12, sampleRate: 24000 },
    );
    const shots = await buildShots(scenes, "2D flat illustration", "chef", fallbackPromptWriter, { characterSheet: CHAR });
    shots.forEach((s) => (s.imagePath = "/tmp/x.png"));
    const audio = { filePath: "a.wav", durationSec: 12, sampleRate: 24000 };
    const cues = [{ index: 1, startSec: 0, endSec: 12, text: "legenda" }];
    expect(runQA({ shots, audio, cues }).passed).toBe(true);

    // Real dupe: same core after the shared prefix must still be blocked.
    const dupe = shots.map((s) => ({ ...s, imagePrompt: `${CHAR}. exact same kitchen counter scene with knife` }));
    expect(runQA({ shots: dupe, audio, cues }).passed).toBe(false);
  });

  it("stripCommonPrefix removes only the shared part", () => {
    const out = stripCommonPrefix(["A B C dog runs", "A B C cat sleeps"]);
    expect(out).toEqual(["dog runs", "cat sleeps"]);
  });

  it("character sheet falls back to a valid deterministic description", async () => {
    const sheet = await buildCharacterSheet(
      { title: "Um dia de padeiro", niche: "padeiro", targetMinutes: 5, visualStyle: "flat 2D", voiceId: "onyx", language: "pt-BR" },
      mockLLM,
    );
    const words = sheet.split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(8);
    expect(words).toBeLessThanOrEqual(60);
  });
});
