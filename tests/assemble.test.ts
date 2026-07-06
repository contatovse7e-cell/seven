import { describe, it, expect } from "vitest";
import { buildFfmpegCommand } from "@/lib/pipeline/assemble";
import { Shot } from "@/lib/schemas";

const shots: Shot[] = [
  {
    id: "shot-0001", sceneIndex: 0, sentence: "Frase um.", startSec: 0, endSec: 4,
    imagePrompt: "epic oil painting of a roman general at dawn, golden light, wide shot",
    negativePrompt: "", animation: { type: "zoom_in", intensity: 0.1 }, imagePath: "/a/1.png",
  },
  {
    id: "shot-0002", sceneIndex: 1, sentence: "Frase dois.", startSec: 4, endSec: 8,
    imagePrompt: "close-up of a bronze eagle standard with smoke, dramatic rim lighting",
    negativePrompt: "", animation: { type: "pan_right", intensity: 0.11 }, imagePath: "/a/2.png",
  },
];

describe("assemble", () => {
  it("builds a full ffmpeg command with zoompan, concat, subtitles and audio map", () => {
    const args = buildFfmpegCommand({
      audioPath: "/a/narr.wav", subtitlePath: "/a/subs.srt", shots,
      width: 1920, height: 1080, fps: 30, outputPath: "/a/final.mp4",
    });
    const joined = args.join(" ");
    expect(joined).toContain("zoompan");
    expect(joined).toContain("concat=n=2");
    expect(joined).toContain("subtitles=");
    expect(joined).toContain("-shortest");
    expect(args[args.length - 1]).toBe("/a/final.mp4");
  });

  it("adds ducked background music when musicPath is set", () => {
    const args = buildFfmpegCommand({
      audioPath: "/a/narr.wav", musicPath: "/a/bgm.mp3", subtitlePath: "/a/subs.srt", shots,
      width: 1920, height: 1080, fps: 30, outputPath: "/a/final.mp4",
    });
    const joined = args.join(" ");
    expect(joined).toContain("sidechaincompress");
    expect(joined).toContain("amix");
  });

  it("throws when an image is missing", () => {
    const broken = [{ ...shots[0], imagePath: undefined }];
    expect(() =>
      buildFfmpegCommand({
        audioPath: "/a/narr.wav", subtitlePath: "/a/subs.srt", shots: broken as Shot[],
        width: 1920, height: 1080, fps: 30, outputPath: "/a/final.mp4",
      }),
    ).toThrow(/no imagePath/);
  });
});
