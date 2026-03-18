// ============================================
// Chain ID <-> LayerZero EID Mappings
// Unified from api/client.ts + ponder/utils/chainIds.ts
// ============================================

export const CHAIN_ID_TO_LZ_EID: Record<number, number> = {
  8453: 30184, // Base
  42161: 30110, // Arbitrum
  1: 30101, // Ethereum
  10: 30111, // Optimism
  130: 30320, // Unichain
  56: 30102, // BSC
  137: 30109, // Polygon
  43114: 30106, // Avalanche
};

export const LZ_EID_TO_CHAIN_ID: Record<number, number> = {
  30184: 8453, // Base
  30110: 42161, // Arbitrum
  30101: 1, // Ethereum
  30111: 10, // Optimism
  30320: 130, // Unichain
  30102: 56, // BSC
  30109: 137, // Polygon
  30106: 43114, // Avalanche
};

/** Convert LayerZero EID to chain ID */
export function eidToChainId(eid: number): number {
  return LZ_EID_TO_CHAIN_ID[eid] ?? 0;
}

/** Convert chain ID to LayerZero EID */
export function chainIdToEid(chainId: number): number {
  return CHAIN_ID_TO_LZ_EID[chainId] ?? 0;
}

/** Get chain name from chain ID */
export function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    8453: "base",
    42161: "arbitrum",
    1: "ethereum",
    10: "optimism",
    130: "unichain",
    56: "bsc",
    137: "polygon",
    43114: "avalanche",
  };
  return names[chainId] ?? "unknown";
}

/** Check if chain is supported (Base + Unichain) */
export function isSupportedChain(chainId: number): boolean {
  return chainId === 8453 || chainId === 130;
}
