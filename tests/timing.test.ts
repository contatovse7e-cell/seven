import { describe, it, expect } from "vitest";
import { buildScenes, buildShotWindows, splitSentences, MAX_SHOT_SEC, TARGET_SHOT_SEC } from "@/lib/pipeline/timing";

const audio = (durationSec: number) => ({ filePath: "a.wav", durationSec, sampleRate: 24000 });

describe("timing", () => {
  it("splits sentences keeping punctuation", () => {
    expect(splitSentences("Olá mundo. Tudo bem? Sim!")).toEqual(["Olá mundo.", "Tudo bem?", "Sim!"]);
  });

  it("scenes cover exactly the real audio duration with no gaps", () => {
    const text = "Primeira frase do vídeo. Segunda frase um pouco maior que a primeira. Terceira. Quarta frase final do roteiro completo.";
    const scenes = buildScenes(text, audio(60));
    expect(scenes[0].startSec).toBe(0);
    expect(scenes[scenes.length - 1].endSec).toBe(60);
    for (let i = 1; i < scenes.length; i++) {
      expect(scenes[i].startSec).toBeCloseTo(scenes[i - 1].endSec, 2);
    }
  });

  it("longer sentences get proportionally more time", () => {
    const scenes = buildScenes("Curta. Esta frase é muito, muito, muito mais longa que a anterior.", audio(10));
    expect(scenes[1].endSec - scenes[1].startSec).toBeGreaterThan(scenes[0].endSec - scenes[0].startSec);
  });

  it("shot windows never exceed MAX_SHOT_SEC and average near target", () => {
    const scenes = buildScenes(
      Array.from({ length: 20 }, (_, i) => `Frase número ${i} com algum conteúdo interessante aqui.`).join(" "),
      audio(300),
    );
    const windows = buildShotWindows(scenes);
    for (const w of windows) {
      expect(w.endSec - w.startSec).toBeLessThanOrEqual(MAX_SHOT_SEC + 0.01);
      expect(w.endSec - w.startSec).toBeGreaterThan(0);
    }
    const avg = 300 / windows.length;
    expect(avg).toBeGreaterThan(TARGET_SHOT_SEC - 1.5);
    expect(avg).toBeLessThan(TARGET_SHOT_SEC + 1.5);
  });

  it("works for long scripts (60+ minutes)", () => {
    const text = Array.from({ length: 600 }, (_, i) => `Frase ${i} sobre um assunto histórico fascinante e detalhado.`).join(" ");
    const scenes = buildScenes(text, audio(3600));
    const windows = buildShotWindows(scenes);
    expect(scenes.length).toBe(600);
    expect(windows[windows.length - 1].endSec).toBe(3600);
  });
});
