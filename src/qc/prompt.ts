import { DEFECT_TYPES, type FrameVerdict, type Defect, type DefectType, type Severity } from "./types.js";

export function buildPrompt(brief?: string, frame?: number): string {
  return [
    "You are a strict quality inspector for AI-generated commercial images and video frames.",
    brief ? `The client ordered: "${brief}".` : "",
    frame !== undefined ? `This is frame #${frame} of a video.` : "",
    "Look carefully for generation defects:",
    "- hands: count fingers on every visible hand; extra, fused or missing fingers",
    "- bodies: extra or missing arms/legs, duplicated body parts",
    "- faces: melted, asymmetric, wrong eyes or teeth",
    "- text: any sign, logo, label or caption that is garbled or misspelled",
    "- vehicles: wrong number or placement of doors, wheels, mirrors, door handles",
    "- physics: floating objects, impossible shadows or reflections, broken perspective",
    "- objects melting into each other, blur patches, tiling, watermark remnants",
    "Reply with JSON only, no prose:",
    `{"score": <0-100 overall quality>, "defects": [{"type": one of ${JSON.stringify(DEFECT_TYPES)}, "severity": "minor"|"major"|"critical", "detail": "<short>"}]}`,
    "If the image is clean, return an empty defects array. Do not invent defects.",
  ].filter(Boolean).join("\n");
}

const SEVERITIES: Severity[] = ["minor", "major", "critical"];

/** Parse a model reply defensively: models sometimes wrap JSON in prose or code fences. */
export function parseVerdict(text: string, frame?: number): FrameVerdict {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("vision model did not return JSON");
  const raw = JSON.parse(m[0]);
  const score = Math.max(0, Math.min(100, Number(raw.score)));
  if (!Number.isFinite(score)) throw new Error("vision model returned no numeric score");
  const defects: Defect[] = (Array.isArray(raw.defects) ? raw.defects : []).map((d: any) => ({
    type: (DEFECT_TYPES as readonly string[]).includes(d?.type) ? (d.type as DefectType) : "other",
    severity: SEVERITIES.includes(d?.severity) ? d.severity : "major",
    detail: String(d?.detail ?? "").slice(0, 300),
    ...(frame !== undefined ? { frame } : {}),
  }));
  return { score, defects };
}
