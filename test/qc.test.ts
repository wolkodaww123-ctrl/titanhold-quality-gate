import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qcCheck, parseVerdict, buildPrompt, ollamaBackend, extractFrames } from "../src/index.js";
import { scriptedVision, CLEAN, SIX_FINGERS, MINOR_ONLY } from "./helpers.js";

const dir = mkdtempSync(join(tmpdir(), "qg-test-"));
const img = join(dir, "shot.png");
const vid = join(dir, "clip.mp4");
let hasFfmpeg = true;

beforeAll(() => {
  writeFileSync(img, Buffer.from("89504e470d0a1a0a", "hex")); // bytes only; mock backend does not decode
  try {
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=2", "-pix_fmt", "yuv420p", vid]);
  } catch { hasFfmpeg = false; }
});

describe("parseVerdict", () => {
  it("parses JSON wrapped in prose / code fences", () => {
    const v = parseVerdict('Sure!\n```json\n{"score": 61, "defects":[{"type":"garbled_text","severity":"major","detail":"sign reads TAXl"}]}\n```');
    expect(v.score).toBe(61);
    expect(v.defects[0]).toMatchObject({ type: "garbled_text", severity: "major" });
  });
  it("normalises unknown types and severities and clamps the score", () => {
    const v = parseVerdict('{"score": 140, "defects":[{"type":"weird","severity":"??","detail":"x"}]}', 3);
    expect(v.score).toBe(100);
    expect(v.defects[0]).toMatchObject({ type: "other", severity: "major", frame: 3 });
  });
  it("throws on non-JSON replies", () => {
    expect(() => parseVerdict("looks fine to me")).toThrow();
  });
});

describe("buildPrompt", () => {
  it("mentions the client brief and the key defect classes", () => {
    const p = buildPrompt("red sports car, 4 doors", 2);
    expect(p).toContain("red sports car, 4 doors");
    expect(p).toContain("frame #2");
    for (const k of ["fingers", "doors", "garbled", "shadows"]) expect(p).toContain(k);
  });
});

describe("qcCheck on images", () => {
  it("passes a clean image", async () => {
    const r = await qcCheck(img, { backend: scriptedVision(CLEAN) });
    expect(r).toMatchObject({ kind: "image", framesChecked: 1, pass: true, score: 92 });
  });
  it("fails on a major defect (6 fingers)", async () => {
    const r = await qcCheck(img, { backend: scriptedVision(SIX_FINGERS) });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/extra_fingers/);
  });
  it("minor defects alone do not fail, unless configured", async () => {
    expect((await qcCheck(img, { backend: scriptedVision(MINOR_ONLY) })).pass).toBe(true);
    expect((await qcCheck(img, { backend: scriptedVision(MINOR_ONLY), failOn: ["minor", "major", "critical"] })).pass).toBe(false);
  });
  it("fails when the score is under minScore", async () => {
    const r = await qcCheck(img, { backend: scriptedVision({ score: 60, defects: [] }), minScore: 70 });
    expect(r.pass).toBe(false);
  });
});

describe("qcCheck on video (real ffmpeg frame sampling)", () => {
  it("samples N frames and fails if any single frame is broken", async () => {
    if (!hasFfmpeg) return;
    const vision = scriptedVision(CLEAN, CLEAN, SIX_FINGERS, CLEAN);
    const r = await qcCheck(vid, { backend: vision, videoFrames: 4 });
    expect(r.kind).toBe("video");
    expect(r.framesChecked).toBe(4);
    expect(vision.calls.map((c) => c.frame)).toEqual([0, 1, 2, 3]);
    expect(vision.calls.every((c) => c.bytes > 1000)).toBe(true); // real PNG frames
    expect(r.pass).toBe(false);
    expect(r.defects[0].frame).toBe(2);
  });
  it("extractFrames returns PNGs", async () => {
    if (!hasFfmpeg) return;
    const frames = await extractFrames(vid, 3);
    expect(frames).toHaveLength(3);
    expect(Buffer.from(frames[0].slice(0, 4)).toString("hex")).toBe("89504e47");
  });
});

describe("ollamaBackend (mocked HTTP)", () => {
  it("sends the image to /api/chat and parses the reply", async () => {
    let sent: any;
    const fetchImpl = (async (url: string, init: any) => {
      sent = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ message: { content: '{"score":88,"defects":[]}' } }), { status: 200 });
    }) as any;
    const b = ollamaBackend({ url: "http://mac.local:11434", model: "qwen2.5vl:7b", fetchImpl });
    const v = await b.inspect(new Uint8Array([1, 2, 3]), { prompt: "p" });
    expect(v.score).toBe(88);
    expect(sent.url).toBe("http://mac.local:11434/api/chat");
    expect(sent.body.model).toBe("qwen2.5vl:7b");
    expect(sent.body.messages[0].images[0]).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });
});
