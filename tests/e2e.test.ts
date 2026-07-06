import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("pipeline end-to-end (mock providers)", () => {
  beforeAll(async () => {
    process.env.PROVIDER_MODE = "mock";
    process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "factory-"));
  });

  it("runs a full job from input to metadata with a pasted script", async () => {
    const { createJob } = await import("@/lib/jobs");
    const { runPipeline } = await import("@/lib/pipeline/run");

    const script = Array.from(
      { length: 30 },
      (_, i) => `Nesta parte ${i + 1} da história, um evento diferente e surpreendente acontece na cidade antiga.`,
    ).join(" ");

    const job = await createJob({
      title: "A história secreta da cidade perdida",
      niche: "história",
      targetMinutes: 3,
      visualStyle: "epic digital painting, warm tones",
      voiceId: "onyx",
      language: "pt-BR",
      pastedScript: script,
    });
    const result = await runPipeline(job);

    expect(result.error).toBeNull();
    expect(result.status).toBe("done");
    expect(result.completedSteps).toContain("qa");
    expect(result.completedSteps).toContain("assemble");

    const audio = result.artifacts.audio as any;
    const shots = result.artifacts.shots as any[];
    // Timeline matches real audio duration.
    expect(Math.abs(shots[shots.length - 1].endSec - audio.durationSec)).toBeLessThan(0.5);
    // ~1 image per 4s.
    const avg = audio.durationSec / shots.length;
    expect(avg).toBeGreaterThan(2.5);
    expect(avg).toBeLessThanOrEqual(5);
    // Every image generated + linked to a sentence.
    for (const s of shots) {
      expect(s.imagePath).toBeTruthy();
      expect(s.sentence.length).toBeGreaterThan(0);
    }
    // Subtitles + ffmpeg command persisted.
    const assets = path.join(process.env.DATA_DIR!, "jobs", result.id, "assets");
    await fs.access(path.join(assets, "subtitles.srt"));
    await fs.access(path.join(assets, "ffmpeg-command.json"));
    // Metadata present.
    const meta = result.artifacts.metadata as any;
    expect(meta.tags.length).toBeGreaterThanOrEqual(5);
    expect(meta.pinnedComment.length).toBeGreaterThan(10);
  }, 30000);
});
