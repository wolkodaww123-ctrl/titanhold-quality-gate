import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { extractFrames } from "./frames.js";
import { ollamaBackend } from "./ollama.js";
import { buildPrompt } from "./prompt.js";
import type { QcOptions, QcResult, Defect } from "./types.js";

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v"]);
export const isVideo = (file: string) => VIDEO_EXT.has(extname(file).toLowerCase());

/** Images are sent as-is; videos are sampled into frames and every frame is inspected. */
export async function qcCheck(file: string, opts: QcOptions = {}): Promise<QcResult> {
  const backend = opts.backend ?? ollamaBackend();
  const minScore = opts.minScore ?? 70;
  const failOn = opts.failOn ?? ["major", "critical"];
  const kind = isVideo(file) ? "video" : "image";
  const frames = kind === "video" ? await extractFrames(file, opts.videoFrames ?? 6) : [await readFile(file)];

  let score = 100;
  const defects: Defect[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = kind === "video" ? i : undefined;
    const v = await backend.inspect(frames[i], { prompt: buildPrompt(opts.brief, frame), frame });
    score = Math.min(score, v.score);
    defects.push(...v.defects.map((d) => ({ ...d, ...(frame !== undefined ? { frame } : {}) })));
  }

  const reasons: string[] = [];
  if (score < minScore) reasons.push(`quality score ${score} is below ${minScore}`);
  for (const d of defects.filter((d) => failOn.includes(d.severity))) {
    reasons.push(`${d.severity} ${d.type}${d.frame !== undefined ? ` (frame ${d.frame})` : ""}: ${d.detail}`);
  }
  return { file, kind, backend: backend.name, framesChecked: frames.length, score, defects, pass: reasons.length === 0, reasons };
}
