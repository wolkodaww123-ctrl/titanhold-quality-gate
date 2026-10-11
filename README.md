# titanhold-quality-gate

**Don't pay an AI agent for broken work.** A small payment-release gate for AI-generated images and video:

1. **Quality check** — every delivered image (or sampled video frames) goes through a *local* vision model (Ollama, e.g. Qwen2.5-VL) that looks for typical generation defects: extra/fused fingers, extra limbs, melted faces, garbled text on signs, wrong number of car doors/wheels, impossible shadows/physics, flicker between frames.
2. **Trust check** — the seller agent's identity and reputation are read from the canonical **ERC-8004** registries on **Arc** (Circle's L1, USDC as gas).
3. **Release** — the escrowed USDC is released only if *both* pass. Otherwise it stays held, with machine-readable reasons.

> **Status: prototype.** QC and the ERC-8004 reads are real; the USDC release is **mocked** (no funds move). Vision models miss things and sometimes flag clean images, so treat a QC "fail" as "needs a human look", not as a final verdict.

## Why

[TITANHOLD](https://titanhold.app) is a pay-on-acceptance marketplace for AI-made images, video and motion design: the client pays only after accepting the result. We already run an automatic nightly QC step on our own renders. This repo opens that QC step and connects it to on-chain agent trust, so any marketplace or agent can answer *"is this delivery good, and is this agent who it claims to be?"* before USDC moves. Our generation pipeline, scheduler and platform stay closed; only QC + gate are open.

## Install

```bash
git clone https://github.com/wolkodaww123-ctrl/titanhold-quality-gate
cd titanhold-quality-gate && npm install && npm run build
# local vision model (nothing leaves your machine)
ollama pull qwen2.5vl:7b
```

Video sampling needs `ffmpeg`/`ffprobe` on PATH. Node 20+.

## CLI

```bash
# 1. QC only
node dist/cli.js qc render.png clip.mp4 --brief "red 2-door coupe at night" --min-score 70 --frames 6

# 2. Trust only (Arc mainnet; add --testnet for Arc Testnet)
node dist/cli.js trust 14 --min-rep 60

# 3. Full gate: QC + trust, then MOCK release
node dist/cli.js gate render.png clip.mp4 --agent 14 --pay 25 --min-rep 60
```

Exit codes: `0` pass / released, `2` fail / held, `1` error. Env: `OLLAMA_URL` (default `http://127.0.0.1:11434`), `QG_MODEL` (default `qwen2.5vl:7b`).

## Library

```ts
import { releaseGate } from "titanhold-quality-gate";

const decision = await releaseGate(
  { orderId: "A-1042", deliverables: ["out/poster.png", "out/reel.mp4"], sellerAgent: 14, amountUsdc: 25 },
  { qc: { minScore: 70, brief: "red coupe, two doors" }, trust: { minScore: 60, network: "mainnet" } },
);
// decision.status: "released" | "held"
// decision.reasons: ["QC out/reel.mp4: major vehicle_geometry (frame 3): car has 3 doors on one side", ...]
```

Lower-level pieces: `qcCheck(file, opts)`, `checkAgent(agentIdOrAddress, { minScore })`, and a pluggable `VisionBackend` if you want another model.

### QC result

```json
{ "file": "reel.mp4", "kind": "video", "framesChecked": 6, "score": 55, "pass": false,
  "defects": [{ "type": "extra_fingers", "severity": "major", "detail": "left hand has 6 fingers", "frame": 2 }],
  "reasons": ["quality score 55 is below 70", "major extra_fingers (frame 2): left hand has 6 fingers"] }
```

Defect classes: `extra_fingers, extra_limbs, face_distortion, garbled_text, vehicle_geometry, physics, object_merge, temporal_flicker, artifact, other`. Major/critical defects or a score under `minScore` fail the check; a video fails if any sampled frame fails.

### Trust result

`checkAgent` reads `ownerOf` / `getAgentWallet` from the Identity Registry and `getClients` + `getSummary` from the Reputation Registry. `score` is `summaryValue / 10^decimals` over the chosen clients (pass `trustedClients` to use your own allow-list against sybil feedback; `tag1`/`tag2` to filter). An address input only checks that it owns an agent identity (the registry is not enumerable).

## Networks (canonical ERC-8004 registries)

| | Arc mainnet (5042) | Arc Testnet (5042002) |
|---|---|---|
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Identity | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

Sources: [Arc docs – contract addresses](https://docs.arc.io/arc/references/contract-addresses), [ArcID docs](https://arcusid.com/docs), [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004).

## Tests

```bash
npm test
```

Tests use a mocked vision model, a mocked registry client and a mocked JSON-RPC transport (real ABI encoding), plus real `ffmpeg` frame sampling on a generated test clip. No network or GPU needed.

## Roadmap

- Real USDC escrow on Arc (release / refund) instead of the mock
- Write QC outcomes back as ERC-8004 feedback (`giveFeedback`, tag `qc`) so quality becomes part of the agent's on-chain record
- ArcID Trust Score as an optional second trust source
- Small labelled set of defective vs clean renders to measure QC precision/recall

## License

MIT
