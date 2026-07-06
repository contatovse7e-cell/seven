import path from "node:path";
import fs from "node:fs/promises";
import { createLogger } from "@/lib/logger";
import { getProviders } from "@/lib/providers/registry";
import {
  AudioAsset, AudioAssetSchema, Job, PipelineStep, Scene, SceneListSchema, Shot,
  ShotSchema, SubtitleCue, SubtitleCueSchema, z,
} from "./run-types";
import { saveJob, jobDir } from "@/lib/jobs";
import { buildScript } from "./script";
import { buildScenes } from "./timing";
import { buildShots, fallbackPromptWriter, PromptWriter } from "./prompts";
import { buildCharacterSheet } from "./character";
import { buildSubtitleCues, cuesToSrt } from "./subtitles";
import { runQA } from "./qa";
import { buildFfmpegCommand } from "./assemble";
import { buildMetadata } from "./metadata";
import { withRetry } from "@/lib/retry";
import { spawn } from "node:child_process";

/**
 * Pipeline orchestrator. Each step:
 *   1. validates its inputs (zod),
 *   2. runs with retry around external calls,
 *   3. persists its artifact + job state (resumable after crash),
 *   4. logs start/finish/errors.
 * The QA step BLOCKS assembly when it fails.
 */
export async function runPipeline(job: Job): Promise<Job> {
  const log = createLogger(job.id);
  const { llm, tts, images } = getProviders();
  const assets = path.join(jobDir(job.id), "assets");

  const persist = async (step: PipelineStep | null, patch: Partial<Job>) => {
    Object.assign(job, patch, { currentStep: step, logs: log.entries });
    await saveJob(job);
  };

  try {
    job.status = "running";

    // ---- 1. SCRIPT ----
    await persist("script", {});
    log.info("script", job.input.pastedScript ? "using pasted script" : "generating script with LLM");
    const script = await buildScript(job.input, llm);
    job.artifacts.script = script;
    job.completedSteps.push("script");
    log.info("script", `script ready: ${script.estimatedWords} words, ${script.sections.length} sentences`);

    // ---- 2. TTS ----
    await persist("tts", {});
    const audioPath = path.join(assets, "narration.wav");
    const audio: AudioAsset = await tts.synthesize(script.fullText, job.input.voiceId, audioPath);
    AudioAssetSchema.parse(audio);
    job.artifacts.audio = audio;
    job.completedSteps.push("tts");
    log.info("tts", `narration synthesized: ${audio.durationSec.toFixed(1)}s (REAL measured duration)`);

    // ---- 3. TIMING / SCENES ----
    await persist("timing", {});
    const scenes: Scene[] = buildScenes(script.fullText, audio);
    SceneListSchema.parse(scenes);
    job.artifacts.scenes = scenes;
    job.completedSteps.push("timing");
    log.info("timing", `${scenes.length} scenes synchronized to ${audio.durationSec.toFixed(1)}s of audio`);

    // ---- 4. PROMPTS ----
    await persist("prompts", {});
    const characterSheet = await buildCharacterSheet(job.input, llm);
    job.artifacts.characterSheet = characterSheet;
    log.info("prompts", `character sheet fixed for the whole video: "${characterSheet.slice(0, 80)}..."`);
    const promptWriter = makeLLMPromptWriter(llm);
    const shots: Shot[] = await buildShots(scenes, job.input.visualStyle, job.input.niche, promptWriter, { characterSheet });
    z.array(ShotSchema).parse(shots);
    job.artifacts.shots = shots;
    job.completedSteps.push("prompts");
    log.info("prompts", `${shots.length} unique image prompts (avg ${(audio.durationSec / shots.length).toFixed(1)}s per image)`);

    // ---- 5. IMAGES ----
    await persist("images", {});
    for (const shot of shots) {
      const imgPath = path.join(assets, `${shot.id}.png`);
      await withRetry(() => images.generate(shot.imagePrompt, shot.negativePrompt, imgPath), {
        onRetry: (n, e) => log.warn("images", `${shot.id} attempt ${n} failed: ${String(e)}`),
      });
      shot.imagePath = imgPath;
    }
    job.artifacts.shots = shots;
    job.completedSteps.push("images");
    log.info("images", `${shots.length} images generated`);

    // ---- 6. SUBTITLES ----
    await persist("subtitles", {});
    const cues: SubtitleCue[] = buildSubtitleCues(scenes);
    z.array(SubtitleCueSchema).parse(cues);
    const srtPath = path.join(assets, "subtitles.srt");
    await fs.writeFile(srtPath, cuesToSrt(cues));
    job.artifacts.subtitles = { path: srtPath, cueCount: cues.length };
    job.completedSteps.push("subtitles");
    log.info("subtitles", `${cues.length} subtitle cues written`);

    // ---- 7. QA GATE (blocks bad exports) ----
    await persist("qa", {});
    const qa = runQA({ shots, audio, cues });
    job.artifacts.qa = qa;
    qa.warnings.forEach((w) => log.warn("qa", w));
    if (!qa.passed) {
      qa.errors.forEach((e) => log.error("qa", e));
      await persist("qa", { status: "blocked_by_qa", error: `QA failed: ${qa.errors.join("; ")}` });
      return job;
    }
    job.completedSteps.push("qa");
    log.info("qa", "QA passed — export unlocked");

    // ---- 8. ASSEMBLE ----
    await persist("assemble", {});
    const outputPath = path.join(assets, "final.mp4");
    const musicPath = process.env.BGM_PATH; // optional background music file
    const ffArgs = buildFfmpegCommand({
      audioPath: audio.filePath,
      musicPath,
      subtitlePath: srtPath,
      shots,
      width: 1920,
      height: 1080,
      fps: 30,
      outputPath,
    });
    await fs.writeFile(path.join(assets, "ffmpeg-command.json"), JSON.stringify(ffArgs, null, 2));
    if (await ffmpegAvailable()) {
      log.info("assemble", "running FFmpeg render...");
      await runFfmpeg(ffArgs);
      log.info("assemble", `final video written to ${outputPath}`);
    } else {
      log.warn("assemble", "ffmpeg not installed — command saved to ffmpeg-command.json for manual/CI render");
    }
    job.artifacts.export = { outputPath, ffmpegCommand: ffArgs };
    job.completedSteps.push("assemble");

    // ---- 9. METADATA ----
    await persist("metadata", {});
    const metadata = await buildMetadata(job.input, script, llm);
    job.artifacts.metadata = metadata;
    job.completedSteps.push("metadata");
    log.info("metadata", "YouTube title/description/tags/pinned comment ready");

    await persist(null, { status: "done" });
    return job;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(job.currentStep ?? "pipeline", msg);
    await persist(job.currentStep, { status: "failed", error: msg });
    return job;
  }
}

/** LLM-backed prompt writer with the deterministic fallback as safety net. */
function makeLLMPromptWriter(llm: { complete(s: string, u: string): Promise<string> }): PromptWriter {
  return async (args) => {
    try {
      const system =
        "Você escreve prompts de geração de imagem para FLUX.1, em inglês, em linguagem natural corrida (sem listas de tags, sem negative prompt). " +
        "Responda com UMA linha apenas (o prompt). Regras: o personagem deve estar FAZENDO a ação da frase, com as mãos visíveis interagindo com um objeto; " +
        "cenário específico da frase (nunca fundo vazio); mãos em pose simples (segurando, apontando, apoiada); no máximo 1 personagem em foco; " +
        "nada de texto, letras ou placas legíveis na imagem. Proibido retrato parado olhando para a câmera. Seja DIFERENTE dos prompts anteriores.";
      const user = `Frase: ${args.sentence}\nEstilo visual: ${args.visualStyle}\nNicho: ${args.niche}\nPrompts anteriores (não repita): ${args.previousPrompts.join(" | ") || "nenhum"}`;
      const out = (await llm.complete(system, user)).trim().replace(/\n[\s\S]*/, "");
      if (out.length < 30) throw new Error("prompt too short");
      return out;
    } catch {
      return fallbackPromptWriter(args);
    }
  };
}

async function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-version"]);
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`)),
    );
  });
}
