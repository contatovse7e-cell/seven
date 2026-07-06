import fs from "node:fs/promises";
import { ImageProvider, LLMProvider } from "./index";
import { withRetry } from "@/lib/retry";

const API = "https://api.together.xyz/v1";

function key(): string {
  const k = process.env.TOGETHER_API_KEY;
  if (!k) throw new Error("TOGETHER_API_KEY not set");
  return k;
}

async function post(path: string, body: unknown): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Together ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

/**
 * FLUX.1 on Together AI. FLUX takes natural-language prompts and has no
 * negative prompt — all constraints must be described positively in the
 * prompt itself (the prompt builder handles that).
 */
export const togetherImages: ImageProvider = {
  async generate(prompt, _negative, outPath) {
    return withRetry(async () => {
      const res = await post("/images/generations", {
        model: process.env.IMAGE_MODEL ?? "black-forest-labs/FLUX.1-schnell",
        prompt,
        width: 1280,
        height: 720,
        steps: Number(process.env.FLUX_STEPS ?? 4),
        n: 1,
        response_format: "base64",
      });
      const json = await res.json();
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error("Together image API returned no image");
      await fs.writeFile(outPath, Buffer.from(b64, "base64"));
    });
  },
};

/** Together also serves chat models (OpenAI-compatible), usable for script/prompt/metadata generation. */
export const togetherLLM: LLMProvider = {
  async complete(system, user) {
    return withRetry(async () => {
      const res = await post("/chat/completions", {
        model: process.env.LLM_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new Error("Together LLM returned empty completion");
      return text as string;
    });
  },
};
