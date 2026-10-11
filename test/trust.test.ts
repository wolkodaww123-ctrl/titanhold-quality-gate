import { describe, it, expect } from "vitest";
import { createPublicClient, custom, decodeFunctionData, encodeFunctionResult, type Address } from "viem";
import { checkAgent, ARC_TESTNET, toViemChain, identityAbi, reputationAbi } from "../src/index.js";

const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const C1 = "0x2222222222222222222222222222222222222222" as Address;
const C2 = "0x3333333333333333333333333333333333333333" as Address;
const NOBODY = "0x4444444444444444444444444444444444444444" as Address;

/** In-memory fake of the two registries. agents: id -> {owner, feedback avg x100, count} */
export const agents: Record<string, { owner: Address; clients: Address[]; value: bigint; decimals: number; count: bigint }> = {
  "7": { owner: OWNER, clients: [C1, C2], value: 8750n, decimals: 2, count: 4n }, // 87.50
  "8": { owner: OWNER, clients: [C1], value: 4000n, decimals: 2, count: 1n }, // 40.00
  "9": { owner: OWNER, clients: [], value: 0n, decimals: 0, count: 0n }, // no feedback
};

function fakeClient() {
  const calls: string[] = [];
  return {
    calls,
    async readContract({ functionName, args }: any) {
      calls.push(functionName);
      const id = args?.[0]?.toString();
      switch (functionName) {
        case "ownerOf":
          if (!agents[id]) throw new Error("ERC721NonexistentToken");
          return agents[id].owner;
        case "getAgentWallet": return agents[id].owner;
        case "balanceOf": return (args[0] as string).toLowerCase() === OWNER.toLowerCase() ? 3n : 0n;
        case "getClients": return agents[id].clients;
        case "getSummary": return [agents[id].count, agents[id].value, agents[id].decimals];
        default: throw new Error("unexpected " + functionName);
      }
    },
  };
}

describe("checkAgent (mock client)", () => {
  it("allows a registered agent with score above threshold", async () => {
    const r = await checkAgent(7, { minScore: 80, client: fakeClient() });
    expect(r).toMatchObject({ registered: true, agentId: "7", score: 87.5, feedbackCount: 4, allowed: true, owner: OWNER });
  });

  it("blocks a registered agent below threshold", async () => {
    const r = await checkAgent("8", { minScore: 80, client: fakeClient() });
    expect(r.registered).toBe(true);
    expect(r.score).toBe(40);
    expect(r.allowed).toBe(false);
    expect(r.reasons[0]).toMatch(/below minScore/);
  });

  it("blocks an unregistered agentId", async () => {
    const r = await checkAgent(999, { minScore: 10, client: fakeClient() });
    expect(r).toMatchObject({ registered: false, allowed: false });
  });

  it("blocks when minScore is set but there is no feedback", async () => {
    const r = await checkAgent(9, { minScore: 1, client: fakeClient() });
    expect(r.registered).toBe(true);
    expect(r.score).toBeUndefined();
    expect(r.allowed).toBe(false);
  });

  it("allows any registered agent when no minScore is given", async () => {
    expect((await checkAgent(9, { client: fakeClient() })).allowed).toBe(true);
  });

  it("uses trustedClients instead of getClients when provided", async () => {
    const c = fakeClient();
    await checkAgent(7, { minScore: 50, client: c, trustedClients: [C1] });
    expect(c.calls).not.toContain("getClients");
  });

  it("address input: registered owner vs unknown address", async () => {
    expect((await checkAgent(OWNER, { client: fakeClient() })).allowed).toBe(true);
    const r = await checkAgent(NOBODY, { client: fakeClient() });
    expect(r).toMatchObject({ registered: false, allowed: false });
  });

  it("address input with minScore asks for agentId instead of guessing", async () => {
    const r = await checkAgent(OWNER, { minScore: 50, client: fakeClient() });
    expect(r.registered).toBe(true);
    expect(r.allowed).toBe(false);
  });

  it("rejects garbage input", async () => {
    await expect(checkAgent("hello", { client: fakeClient() })).rejects.toThrow();
  });
});

describe("checkAgent over a mock JSON-RPC transport (real ABI encoding)", () => {
  // Answers eth_call with properly ABI-encoded results, so viem's real encode/decode path is exercised.
  const transport = custom({
    async request({ method, params }: any) {
      if (method === "eth_chainId") return "0x" + ARC_TESTNET.chainId.toString(16);
      if (method !== "eth_call") throw new Error("unsupported " + method);
      const { to, data } = params[0];
      const abi = to.toLowerCase() === ARC_TESTNET.identityRegistry.toLowerCase() ? identityAbi : reputationAbi;
      const { functionName, args } = decodeFunctionData({ abi, data }) as any;
      const id = args?.[0]?.toString();
      if (functionName === "ownerOf" && !agents[id]) {
        // revert ERC721NonexistentToken(uint256)
        const err: any = new Error("execution reverted");
        err.code = 3;
        err.data = "0x7e273289" + BigInt(id).toString(16).padStart(64, "0");
        throw err;
      }
      const result =
        functionName === "ownerOf" || functionName === "getAgentWallet" ? agents[id].owner
        : functionName === "getClients" ? agents[id].clients
        : functionName === "getSummary" ? [agents[id].count, agents[id].value, agents[id].decimals]
        : 0n;
      return encodeFunctionResult({ abi, functionName, result } as any);
    },
  });
  const client = createPublicClient({ chain: toViemChain(ARC_TESTNET), transport });

  it("decodes a real summary from the reputation registry", async () => {
    const r = await checkAgent(7, { network: "testnet", minScore: 80, client });
    expect(r).toMatchObject({ network: "eip155:5042002", registered: true, score: 87.5, allowed: true });
  });

  it("treats a reverted ownerOf as unregistered", async () => {
    const r = await checkAgent(4242, { network: "testnet", minScore: 1, client });
    expect(r).toMatchObject({ registered: false, allowed: false });
  });
});
