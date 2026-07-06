import { describe, it, expect } from "vitest";
import { runQA } from "@/lib/pipeline/qa";
import { Shot } from "@/lib/schemas";

const shot = (over: Partial<Shot> = {}): Shot => ({
  id: "shot-0001",
  sceneIndex: 0,
  sentence: "Uma frase específica do roteiro.",
  startSec: 0,
  endSec: 4,
  imagePrompt: "epic oil painting of a roman general standing on marble steps at dawn, golden light",
  negativePrompt: "",
  animation: { type: "zoom_in", intensity: 0.1 },
  imagePath: "/tmp/img.png",
  ...over,
});

const audio = { filePath: "a.wav", durationSec: 8, sampleRate: 24000 };
const cues = [{ index: 1, startSec: 0, endSec: 8, text: "Uma frase específica do roteiro." }];

describe("qa gate", () => {
  it("passes a valid timeline", () => {
    const shots = [shot(), shot({ id: "shot-0002", startSec: 4, endSec: 8, imagePrompt: "close-up of a bronze eagle standard, battlefield smoke behind, dramatic rim light" })];
    expect(runQA({ shots, audio, cues }).passed).toBe(true);
  });

  it("blocks when timeline does not match audio duration", () => {
    const r = runQA({ shots: [shot({ endSec: 4 })], audio, cues });
    expect(r.passed).toBe(false);
    expect(r.errors.join()).toContain("audio lasts");
  });

  it("blocks near-identical prompts (visual repetition)", () => {
    const p = "epic oil painting of a roman general standing on marble steps at dawn, golden light";
    const shots = [shot({ imagePrompt: p }), shot({ id: "shot-0002", startSec: 4, endSec: 8, imagePrompt: p })];
    const r = runQA({ shots, audio, cues });
    expect(r.passed).toBe(false);
    expect(r.errors.join()).toContain("near-identical");
  });

  it("blocks generic prompts", () => {
    const r = runQA({ shots: [shot({ endSec: 8, imagePrompt: "cinematic scene with beautiful epic lighting and amazing composition" })], audio, cues });
    expect(r.passed).toBe(false);
    expect(r.errors.join()).toContain("generic prompt");
  });

  it("blocks shots longer than 5 seconds", () => {
    const r = runQA({ shots: [shot({ endSec: 8 })], audio, cues });
    expect(r.errors.join()).toContain("max 5s");
  });

  it("blocks missing images", () => {
    const r = runQA({ shots: [shot({ endSec: 8, imagePath: undefined })], audio, cues });
    expect(r.errors.join()).toContain("image not generated");
  });
});
