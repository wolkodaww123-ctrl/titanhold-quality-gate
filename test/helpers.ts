import type { Address } from "viem";
import type { VisionBackend, FrameVerdict } from "../src/index.js";

export const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const C1 = "0x2222222222222222222222222222222222222222" as Address;

/** id -> reputation summary. 7 = good (87.5), 8 = weak (40). */
const agents: Record<string, { count: bigint; value: bigint; decimals: number }> = {
  "7": { count: 4n, value: 8750n, decimals: 2 },
  "8": { count: 1n, value: 4000n, decimals: 2 },
};

export function fakeArc() {
  return {
    async readContract({ functionName, args }: any) {
      const id = args?.[0]?.toString();
      if (functionName === "ownerOf") { if (!agents[id]) throw new Error("nonexistent"); return OWNER; }
      if (functionName === "getAgentWallet") return OWNER;
      if (functionName === "getClients") return [C1];
      if (functionName === "getSummary") return [agents[id].count, agents[id].value, agents[id].decimals];
      throw new Error("unexpected " + functionName);
    },
  };
}

/** Mock vision model: returns scripted verdicts in order (last one repeats). */
export function scriptedVision(...verdicts: FrameVerdict[]): VisionBackend & { calls: { prompt: string; frame?: number; bytes: number }[] } {
  const calls: { prompt: string; frame?: number; bytes: number }[] = [];
  return {
    name: "mock-vision",
    calls,
    async inspect(png, ctx) {
      calls.push({ prompt: ctx.prompt, frame: ctx.frame, bytes: png.length });
      return verdicts[Math.min(calls.length - 1, verdicts.length - 1)];
    },
  };
}

export const CLEAN: FrameVerdict = { score: 92, defects: [] };
export const SIX_FINGERS: FrameVerdict = {
  score: 55,
  defects: [{ type: "extra_fingers", severity: "major", detail: "left hand has 6 fingers" }],
};
export const MINOR_ONLY: FrameVerdict = { score: 85, defects: [{ type: "artifact", severity: "minor", detail: "slight blur in corner" }] };
