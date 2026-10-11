import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseGate } from "../src/index.js";
import { fakeArc, scriptedVision, CLEAN, SIX_FINGERS } from "./helpers.js";

const dir = mkdtempSync(join(tmpdir(), "qg-gate-"));
const a = join(dir, "a.png"); const b = join(dir, "b.png");
writeFileSync(a, "x"); writeFileSync(b, "y");

const req = (sellerAgent: number, files = [a, b]) => ({ orderId: "o1", deliverables: files, sellerAgent, amountUsdc: 25 });

describe("releaseGate", () => {
  it("releases when QC passes and the seller agent is trusted", async () => {
    const r = await releaseGate(req(7), { qc: { backend: scriptedVision(CLEAN) }, trust: { client: fakeArc(), minScore: 80 } });
    expect(r.status).toBe("released");
    expect(r.reasons).toEqual([]);
    expect(r.message).toMatch(/^MOCK/);
  });
  it("holds when one deliverable fails QC, even with a trusted agent", async () => {
    const r = await releaseGate(req(7), { qc: { backend: scriptedVision(CLEAN, SIX_FINGERS) }, trust: { client: fakeArc(), minScore: 80 } });
    expect(r.status).toBe("held");
    expect(r.reasons.every((x) => x.includes("b.png"))).toBe(true); // a.png was clean
    expect(r.reasons.join(" ")).toMatch(/extra_fingers/);
  });
  it("holds when QC passes but the agent's reputation is too low", async () => {
    const r = await releaseGate(req(8), { qc: { backend: scriptedVision(CLEAN) }, trust: { client: fakeArc(), minScore: 80 } });
    expect(r.status).toBe("held");
    expect(r.reasons[0]).toMatch(/^trust: score 40/);
  });
  it("holds when the agent is not registered on Arc", async () => {
    const r = await releaseGate(req(404), { qc: { backend: scriptedVision(CLEAN) }, trust: { client: fakeArc() } });
    expect(r.status).toBe("held");
    expect(r.trust.registered).toBe(false);
  });
  it("refuses an empty delivery", async () => {
    await expect(releaseGate(req(7, []), { trust: { client: fakeArc() } })).rejects.toThrow();
  });
});
