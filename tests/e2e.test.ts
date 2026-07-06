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

    const subjects = ["o padeiro", "a praça central", "o rio que corta a cidade", "as muralhas antigas", "o mercado de especiarias", "a torre do relógio", "o porto movimentado", "a biblioteca esquecida", "o ferreiro", "a ponte de pedra"];
    const actions = ["revela um segredo guardado por séculos", "muda para sempre naquela manhã", "esconde uma passagem subterrânea", "recebe um visitante misterioso", "desperta com um som estranho", "guarda a chave de tudo"];
    const script = Array.from(
      { length: 30 },
      (_, i) => `Na parte ${i + 1}, ${subjects[i % subjects.length]} ${actions[i % actions.length]}.`,
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
