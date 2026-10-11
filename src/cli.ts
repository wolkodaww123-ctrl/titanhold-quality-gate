#!/usr/bin/env node
import { qcCheck } from "./qc/qcCheck.js";
import { checkAgent } from "./trust/checkAgent.js";
import { releaseGate } from "./gate.js";

const HELP = `titanhold-quality-gate <command>

  qc <file...> [--min-score N] [--brief TEXT] [--frames N]
      QC images/videos with a local Ollama vision model ($OLLAMA_URL, $QG_MODEL).
  trust <agentId|0xAddress> [--min-rep N] [--testnet]
      Read the ERC-8004 Identity + Reputation registries on Arc.
  gate <file...> --agent <agentId> --pay <USDC> [--min-score N] [--min-rep N] [--testnet]
      QC + trust check; MOCK-releases the payment only if both pass.

Exit code: 0 pass/released, 2 fail/held, 1 error.`;

const argv = process.argv.slice(2);
const flag = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const num = (f: string) => (flag(f) !== undefined ? Number(flag(f)) : undefined);
const FLAGS_WITH_VALUE = new Set(["--min-score", "--brief", "--frames", "--min-rep", "--agent", "--pay", "--rpc"]);
const positional = () => {
  const out: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    if (FLAGS_WITH_VALUE.has(argv[i])) { i++; continue; }
    if (!argv[i].startsWith("--")) out.push(argv[i]);
  }
  return out;
};

async function main() {
  const cmd = argv[0];
  const qcOpts = { minScore: num("--min-score"), brief: flag("--brief"), videoFrames: num("--frames") };
  const trustOpts = { minScore: num("--min-rep"), network: argv.includes("--testnet") ? ("testnet" as const) : ("mainnet" as const), rpcUrl: flag("--rpc") };
  let ok: boolean;
  if (cmd === "qc") {
    const results = [];
    for (const f of positional()) results.push(await qcCheck(f, qcOpts));
    console.log(JSON.stringify(results, null, 2));
    ok = results.length > 0 && results.every((r) => r.pass);
  } else if (cmd === "trust") {
    const r = await checkAgent(positional()[0], trustOpts);
    console.log(JSON.stringify(r, null, 2));
    ok = r.allowed;
  } else if (cmd === "gate") {
    const agent = flag("--agent"), pay = num("--pay");
    if (agent === undefined || pay === undefined) throw new Error("gate needs --agent and --pay");
    const r = await releaseGate({ orderId: `demo-${Date.now()}`, deliverables: positional(), sellerAgent: agent, amountUsdc: pay }, { qc: qcOpts, trust: trustOpts });
    console.log(JSON.stringify(r, null, 2));
    ok = r.status === "released";
  } else {
    console.log(HELP);
    return;
  }
  process.exitCode = ok ? 0 : 2;
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1; });
