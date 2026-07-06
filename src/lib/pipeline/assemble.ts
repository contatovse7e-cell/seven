import { ExportManifest, ExportManifestSchema, Shot } from "@/lib/schemas";

/**
 * Builds the final FFmpeg command from a validated ExportManifest.
 * Pure function: testable without FFmpeg installed. Each still image gets a
 * Ken Burns (zoompan) camera animation, everything is concatenated, the real
 * narration audio drives the total duration, background music is ducked, and
 * subtitles are burned in.
 */
export function buildFfmpegCommand(manifestInput: ExportManifest): string[] {
  const m = ExportManifestSchema.parse(manifestInput);
  const args: string[] = ["-y"];

  for (const s of m.shots) {
    if (!s.imagePath) throw new Error(`assemble: ${s.id} has no imagePath`);
    args.push("-loop", "1", "-t", (s.endSec - s.startSec).toFixed(2), "-i", s.imagePath);
  }
  const audioIdx = m.shots.length;
  args.push("-i", m.audioPath);
  const musicIdx = m.musicPath ? audioIdx + 1 : -1;
  if (m.musicPath) args.push("-stream_loop", "-1", "-i", m.musicPath);

  const filters: string[] = [];
  m.shots.forEach((s, i) => {
    filters.push(
      `[${i}:v]scale=${m.width * 2}:${m.height * 2},${kenBurns(s, m.fps, m.width, m.height)},setsar=1[v${i}]`,
    );
  });
  const concatInputs = m.shots.map((_, i) => `[v${i}]`).join("");
  filters.push(`${concatInputs}concat=n=${m.shots.length}:v=1:a=0[vcat]`);
  filters.push(`[vcat]subtitles='${m.subtitlePath.replace(/'/g, "\\'")}'[vsub]`);

  let audioMap: string;
  if (m.musicPath) {
    filters.push(
      `[${musicIdx}:a]volume=0.12[bgm]`,
      `[${audioIdx}:a][bgm]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=300[duck]`,
      `[${audioIdx}:a][duck]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    );
    audioMap = "[aout]";
  } else {
    audioMap = `${audioIdx}:a`;
  }

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[vsub]",
    "-map", audioMap,
    "-c:v", "libx264", "-preset", "medium", "-crf", "19",
    "-c:a", "aac", "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    m.outputPath,
  );
  return args;
}

/** Ken Burns zoompan expression for one shot's camera animation. */
function kenBurns(s: Shot, fps: number, w: number, h: number): string {
  const frames = Math.max(1, Math.round((s.endSec - s.startSec) * fps));
  const k = s.animation.intensity;
  const prog = `(on/${frames})`;
  let zoom = "1.0";
  let x = "iw/2-(iw/zoom/2)";
  let y = "ih/2-(ih/zoom/2)";
  switch (s.animation.type) {
    case "zoom_in": zoom = `1+${k}*${prog}`; break;
    case "zoom_out": zoom = `${1 + k}-${k}*${prog}`; break;
    case "pan_left": zoom = `${1 + k}`; x = `(iw-iw/zoom)*(1-${prog})`; break;
    case "pan_right": zoom = `${1 + k}`; x = `(iw-iw/zoom)*${prog}`; break;
    case "pan_up": zoom = `${1 + k}`; y = `(ih-ih/zoom)*(1-${prog})`; break;
    case "pan_down": zoom = `${1 + k}`; y = `(ih-ih/zoom)*${prog}`; break;
  }
  return `zoompan=z='${zoom}':x='${x}':y='${y}':d=${frames}:s=${w}x${h}:fps=${fps}`;
}
