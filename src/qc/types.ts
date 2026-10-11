/** Defect classes the QC step looks for in AI-generated images and video frames. */
export const DEFECT_TYPES = [
  "extra_fingers",      // >5 fingers, fused or missing fingers, broken hands
  "extra_limbs",        // extra/missing arms, legs, duplicated body parts
  "face_distortion",    // melted/asymmetric face, wrong eyes or teeth
  "garbled_text",       // unreadable or misspelled signs, logos, captions
  "vehicle_geometry",   // wrong number/placement of car doors, wheels, mirrors, handles
  "physics",            // floating objects, impossible shadows/reflections, broken perspective
  "object_merge",       // objects melting into each other or into people
  "temporal_flicker",   // (video) identity/shape changes between frames
  "artifact",           // blur patches, noise, tiling, watermark remnants
  "other",
] as const;
export type DefectType = (typeof DEFECT_TYPES)[number];
export type Severity = "minor" | "major" | "critical";

export interface Defect {
  type: DefectType;
  severity: Severity;
  detail: string;
  /** Frame index for video (0-based); undefined for still images. */
  frame?: number;
}

/** What a vision backend returns for one image. */
export interface FrameVerdict {
  /** 0-100 overall visual quality as judged by the model. */
  score: number;
  defects: Defect[];
}

/** Pluggable vision model. Default: local Ollama. Tests use a mock. */
export interface VisionBackend {
  name: string;
  inspect(imagePng: Uint8Array, context: { prompt: string; frame?: number }): Promise<FrameVerdict>;
}

export interface QcOptions {
  backend?: VisionBackend;
  /** Fail if overall score is below this. Default 70. */
  minScore?: number;
  /** Severities that fail the check. Default ["major","critical"]. */
  failOn?: Severity[];
  /** Frames sampled from a video. Default 6. */
  videoFrames?: number;
  /** What the client ordered, so the model can judge against the brief. */
  brief?: string;
}

export interface QcResult {
  file: string;
  kind: "image" | "video";
  backend: string;
  framesChecked: number;
  /** Lowest per-frame score (a single broken frame is enough to reject a video). */
  score: number;
  defects: Defect[];
  pass: boolean;
  reasons: string[];
}
