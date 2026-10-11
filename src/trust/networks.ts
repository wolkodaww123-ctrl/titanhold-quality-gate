import { defineChain, type Address } from "viem";

/**
 * Canonical ERC-8004 registries on Arc.
 * Sources (checked 2026-10-11):
 *  - https://docs.arc.io/arc/references/contract-addresses
 *  - https://arcusid.com/docs
 *  - https://docs.arc.io/arc/references/rpc-endpoints
 */
export interface ArcNetwork {
  chainId: number;
  name: string;
  rpcUrl: string;
  identityRegistry: Address;
  reputationRegistry: Address;
}

export const ARC_MAINNET: ArcNetwork = {
  chainId: 5042,
  name: "Arc",
  rpcUrl: "https://rpc.mainnet.arc.io",
  identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
};

export const ARC_TESTNET: ArcNetwork = {
  chainId: 5042002,
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
};

export const NETWORKS = { mainnet: ARC_MAINNET, testnet: ARC_TESTNET } as const;
export type NetworkName = keyof typeof NETWORKS;

export function toViemChain(n: ArcNetwork) {
  return defineChain({
    id: n.chainId,
    name: n.name,
    // Arc uses USDC as the native gas token (18 decimals natively).
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [n.rpcUrl] } },
  });
}
