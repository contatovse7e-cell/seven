import { z } from "zod";

/**
 * Rigid data contracts for the whole pipeline. Every step validates its
 * input and output against these schemas before proceeding.
 */

// ---------- User input ----------
export const ProjectInputSchema = z.object({
  title: z.string().min(3).max(200),
  niche: z.string().min(2).max(100),
  targetMinutes: z.number().min(1).max(120),
  visualStyle: z.string().min(2).max(200),
  voiceId: z.string().min(1),
  language: z.string().default("pt-BR"),
  // Optional: user pastes a ready script instead of generating one.
  pastedScript: z.string().min(50).optional(),
});
export type ProjectInput = z.infer<typeof ProjectInputSchema>;

// ---------- Script ----------
export const ScriptSectionSchema = z.object({
  id: z.string(),
  role: z.enum(["hook", "intro", "body", "climax", "outro", "cta"]),
  text: z.string().min(1),
});

export const ScriptSchema = z.object({
  language: z.string(),
  sections: z.array(ScriptSectionSchema).min(1),
  fullText: z.string().min(50),
  estimatedWords: z.number().int().positive(),
});
export type Script = z.infer<typeof ScriptSchema>;

// ---------- Audio (real measured duration is the source of truth) ----------
export const WordTimestampSchema = z.object({
  word: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});

export const AudioAssetSchema = z.object({
  filePath: z.string().min(1),
  durationSec: z.number().positive(),
  sampleRate: z.number().int().positive(),
  // Word-level timestamps when the TTS provider supplies them; otherwise
  // timing.ts distributes proportionally by sentence length.
  wordTimestamps: z.array(WordTimestampSchema).optional(),
});
export type AudioAsset = z.infer<typeof AudioAssetSchema>;

// ---------- Scenes ----------
export const SceneSchema = z.object({
  index: z.number().int().nonnegative(),
  sentence: z.string().min(1), // the script sentence this scene covers
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const SceneListSchema = z
  .array(SceneSchema)
  .min(1)
  .superRefine((scenes, ctx) => {
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (s.endSec <= s.startSec) {
        ctx.addIssue({ code: "custom", message: `scene ${i}: endSec <= startSec` });
      }
      if (i > 0 && Math.abs(s.startSec - scenes[i - 1].endSec) > 0.05) {
        ctx.addIssue({ code: "custom", message: `scene ${i}: gap/overlap with previous scene` });
      }
    }
  });

// ---------- Image shots (1 image every ~4s, max 5s each) ----------
export const ShotSchema = z.object({
  id: z.string(),
  sceneIndex: z.number().int().nonnegative(),
  sentence: z.string().min(1), // link back to the script line
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  imagePrompt: z.string().min(30), // specific, never generic
  negativePrompt: z.string().default(""),
  animation: z.object({
    type: z.enum(["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]),
    intensity: z.number().min(0.02).max(0.25),
  }),
  imagePath: z.string().optional(), // filled after generation
});
export type Shot = z.infer<typeof ShotSchema>;

// ---------- Subtitles ----------
export const SubtitleCueSchema = z.object({
  index: z.number().int().positive(),
  startSec: z.number().nonnegative(),
  endSec: z.number().positive(),
  text: z.string().min(1).max(120),
});
export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;

// ---------- Export / QA ----------
export const ExportManifestSchema = z.object({
  audioPath: z.string(),
  musicPath: z.string().optional(),
  subtitlePath: z.string(),
  shots: z.array(ShotSchema).min(1),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.number().int().positive().default(30),
  outputPath: z.string(),
});
export type ExportManifest = z.infer<typeof ExportManifestSchema>;

export const QAReportSchema = z.object({
  passed: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type QAReport = z.infer<typeof QAReportSchema>;

// ---------- YouTube metadata ----------
export const VideoMetadataSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(50).max(5000),
  tags: z.array(z.string().min(2).max(60)).min(5).max(30),
  pinnedComment: z.string().min(10).max(1000),
});
export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;

// ---------- Job state machine ----------
export const PIPELINE_STEPS = [
  "script",
  "tts",
  "timing",
  "prompts",
  "images",
  "subtitles",
  "qa",
  "assemble",
  "metadata",
] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const JobSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  input: ProjectInputSchema,
  status: z.enum(["queued", "running", "failed", "blocked_by_qa", "done"]),
  currentStep: z.enum(PIPELINE_STEPS).nullable(),
  completedSteps: z.array(z.enum(PIPELINE_STEPS)),
  error: z.string().nullable(),
  artifacts: z.record(z.string(), z.unknown()),
  logs: z.array(z.object({ ts: z.string(), level: z.string(), step: z.string(), msg: z.string() })),
});
export type Job = z.infer<typeof JobSchema>;
