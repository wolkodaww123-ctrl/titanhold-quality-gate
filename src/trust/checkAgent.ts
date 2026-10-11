import { createPublicClient, http, isAddress, type Address } from "viem";
import { identityAbi, reputationAbi } from "./abi.js";
import { NETWORKS, toViemChain, type ArcNetwork, type NetworkName } from "./networks.js";

/** Anything with viem's readContract signature (a PublicClient, or a mock in tests). */
export interface ReadClient {
  readContract(args: any): Promise<any>;
}

export interface CheckOptions {
  /** Minimum reputation score (0-100 scale for "starred"-style feedback). Omit to only require registration. */
  minScore?: number;
  /** "mainnet" (default) or "testnet", or a custom network object. */
  network?: NetworkName | ArcNetwork;
  /** Custom RPC URL (defaults to Circle's public Arc endpoint). */
  rpcUrl?: string;
  /** Inject a client (tests, or your own transport). */
  client?: ReadClient;
  /**
   * Only count feedback from these client addresses (sybil resistance).
   * Default: every client returned by getClients(agentId).
   */
  trustedClients?: Address[];
  /** Feedback tag filters passed to getSummary. Default "" = all tags. */
  tag1?: string;
  tag2?: string;
  /** Require at least this many feedback entries before a score counts. Default 1. */
  minFeedbackCount?: number;
}

export interface CheckResult {
  input: string;
  network: string;
  registered: boolean;
  agentId?: string;
  owner?: Address;
  agentWallet?: Address;
  /** Average feedback value from the ERC-8004 Reputation Registry, if any feedback exists. */
  score?: number;
  feedbackCount?: number;
  allowed: boolean;
  reasons: string[];
}

function resolveNetwork(n: CheckOptions["network"]): ArcNetwork {
  if (!n) return NETWORKS.mainnet;
  return typeof n === "string" ? NETWORKS[n] : n;
}

function makeClient(net: ArcNetwork, rpcUrl?: string): ReadClient {
  return createPublicClient({ chain: toViemChain(net), transport: http(rpcUrl ?? net.rpcUrl) });
}

/**
 * Check an agent against the canonical ERC-8004 registries on Arc before paying it.
 *
 * - Numeric input = agentId (ERC-721 tokenId in the Identity Registry): full check incl. reputation.
 * - 0x address = owner wallet: only checks that it owns at least one agent identity
 *   (the registry is not enumerable, so pass the agentId to get a reputation score).
 */
export async function checkAgent(agentAddressOrId: string | number | bigint, opts: CheckOptions = {}): Promise<CheckResult> {
  const net = resolveNetwork(opts.network);
  const client = opts.client ?? makeClient(net, opts.rpcUrl);
  const input = String(agentAddressOrId).trim();
  const res: CheckResult = { input, network: `eip155:${net.chainId}`, registered: false, allowed: false, reasons: [] };

  // --- Address path -------------------------------------------------------
  if (isAddress(input)) {
    const bal = (await client.readContract({
      address: net.identityRegistry, abi: identityAbi, functionName: "balanceOf", args: [input],
    })) as bigint;
    res.registered = bal > 0n;
    if (!res.registered) {
      res.reasons.push("address owns no ERC-8004 agent identity on this network");
    } else if (opts.minScore !== undefined) {
      res.reasons.push("address is registered, but a score needs the agentId; pass the numeric agentId");
    }
    res.allowed = res.registered && opts.minScore === undefined;
    return res;
  }

  // --- agentId path -------------------------------------------------------
  if (!/^\d+$/.test(input)) throw new Error(`Expected a numeric agentId or 0x address, got "${input}"`);
  const agentId = BigInt(input);
  res.agentId = agentId.toString();

  try {
    res.owner = (await client.readContract({
      address: net.identityRegistry, abi: identityAbi, functionName: "ownerOf", args: [agentId],
    })) as Address;
    res.registered = true;
  } catch {
    res.reasons.push("agentId is not registered in the ERC-8004 Identity Registry");
    return res;
  }

  try {
    res.agentWallet = (await client.readContract({
      address: net.identityRegistry, abi: identityAbi, functionName: "getAgentWallet", args: [agentId],
    })) as Address;
  } catch {
    /* older deployments may not expose getAgentWallet */
  }

  const clients =
    opts.trustedClients ??
    ((await client.readContract({
      address: net.reputationRegistry, abi: reputationAbi, functionName: "getClients", args: [agentId],
    })) as Address[]);

  if (clients.length > 0) {
    const [count, value, decimals] = (await client.readContract({
      address: net.reputationRegistry, abi: reputationAbi, functionName: "getSummary",
      args: [agentId, clients, opts.tag1 ?? "", opts.tag2 ?? ""],
    })) as [bigint, bigint, number];
    res.feedbackCount = Number(count);
    if (count >= BigInt(opts.minFeedbackCount ?? 1)) {
      res.score = Number(value) / 10 ** Number(decimals);
    }
  } else {
    res.feedbackCount = 0;
  }

  if (opts.minScore === undefined) {
    res.allowed = true;
  } else if (res.score === undefined) {
    res.reasons.push("no (or not enough) reputation feedback to compare with minScore");
  } else if (res.score < opts.minScore) {
    res.reasons.push(`score ${res.score} is below minScore ${opts.minScore}`);
  } else {
    res.allowed = true;
  }
  return res;
}
