// Re-exports so the orchestrator imports schema types from one place.
export { z } from "zod";
export {
  AudioAssetSchema, SceneListSchema, ShotSchema, SubtitleCueSchema,
} from "@/lib/schemas";
export type {
  AudioAsset, Job, PipelineStep, Scene, Shot, SubtitleCue,
} from "@/lib/schemas";
