import { qcCheck } from "./qc/qcCheck.js";
import type { QcOptions, QcResult } from "./qc/types.js";
import { checkAgent, type CheckOptions, type CheckResult } from "./trust/checkAgent.js";

export interface ReleaseRequest {
  orderId: string;
  /** Delivered image/video files. Every file must pass QC. */
  deliverables: string[];
  /** Seller agent: ERC-8004 agentId on Arc (or owner address). */
  sellerAgent: string | number | bigint;
  amountUsdc: number;
}

export interface ReleaseDecision {
  orderId: string;
  /** released = both checks passed (MOCK: no funds move in this prototype). */
  status: "released" | "held";
  qc: QcResult[];
  trust: CheckResult;
  reasons: string[];
  message: string;
}

/**
 * Payment-release gate for pay-on-acceptance orders:
 *   1. QC every delivered image / video (local vision model)
 *   2. check the seller agent's ERC-8004 identity + reputation on Arc
 *   3. release the escrowed USDC only if both pass; otherwise keep it held.
 * The USDC transfer itself is mocked.
 */
export async function releaseGate(req: ReleaseRequest, opts: { qc?: QcOptions; trust?: CheckOptions } = {}): Promise<ReleaseDecision> {
  if (!req.deliverables.length) throw new Error("no deliverables to check");
  const qc: QcResult[] = [];
  for (const f of req.deliverables) qc.push(await qcCheck(f, opts.qc));
  const trust = await checkAgent(req.sellerAgent, opts.trust);

  const reasons = [
    ...qc.filter((q) => !q.pass).flatMap((q) => q.reasons.map((r) => `QC ${q.file}: ${r}`)),
    ...(trust.allowed ? [] : trust.reasons.map((r) => `trust: ${r}`)),
  ];
  const ok = reasons.length === 0;
  return {
    orderId: req.orderId,
    status: ok ? "released" : "held",
    qc, trust, reasons,
    message: ok
      ? `MOCK: ${req.amountUsdc} USDC released to agent ${trust.agentId ?? trust.input}.`
      : `${req.amountUsdc} USDC stays in escrow: ${reasons.length} problem(s) found.`,
  };
}
