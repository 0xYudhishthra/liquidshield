// ============================================
// Viem Public Client + Deployment Address Reader
// Read-only — backend never signs transactions
// ============================================

import { createPublicClient, http, type PublicClient, type Chain } from "viem";
import { base, unichain } from "viem/chains";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  CHAIN_ADDRESSES,
  getChainName,
  type ChainAddresses,
} from "@aqua0/shared";

// ============================================
// SUPPORTED CHAINS
// ============================================

const RPC_URLS: Record<number, string> = {
  8453: process.env.RPC_URL_BASE ?? "https://mainnet.base.org",
  130: process.env.RPC_URL_UNICHAIN ?? "https://unichain.calderachain.xyz/http",
};

const VIEM_CHAINS: Record<number, Chain> = {
  8453: base,
  130: unichain,
};

// ============================================
// PUBLIC CLIENT (read-only chain interaction)
// ============================================

const clientCache = new Map<number, PublicClient>();

export function getPublicClient(chainId: number): PublicClient {
  let client = clientCache.get(chainId);
  if (client) return client;

  const url = RPC_URLS[chainId];
  if (!url) {
    throw new Error(
      `No RPC URL configured for chainId ${chainId}. ` +
        `Set RPC_URL_BASE or RPC_URL_UNICHAIN env var.`,
    );
  }

  client = createPublicClient({
    chain: VIEM_CHAINS[chainId],
    transport: http(url),
  });
  clientCache.set(chainId, client);
  return client;
}

// ============================================
// DEPLOYMENT ADDRESSES
// ============================================

export interface DeploymentAddresses {
  accountFactory: `0x${string}`;
  accountImpl: `0x${string}`;
  aqua: `0x${string}`;
  aquaAdapter: `0x${string}`;
  beacon: `0x${string}`;
  bridgeRegistry: `0x${string}`;
  cctpAdapter: `0x${string}`;
  cctpComposer: `0x${string}`;
  composer: `0x${string}`;
  deployer: `0x${string}`;
  lzEndpoint: `0x${string}`;
  rebalancer: `0x${string}`;
  rebalancerImpl: `0x${string}`;
  sampleAccount: `0x${string}`;
  stargateAdapter: `0x${string}`;
  stargateEth: `0x${string}`;
  swapVMRouter: `0x${string}`;
  swapper: `0x${string}`;
  usdc: `0x${string}`;
  weth: `0x${string}`;
  wethStrategyHash: `0x${string}`;
}

const addressCache = new Map<number, DeploymentAddresses>();

// Cache for local dev JSON (any chainId maps to same file)
let localDevAddresses: DeploymentAddresses | null = null;

/**
 * Returns deployment addresses for the given chain.
 *
 * Resolution order:
 * 1. DEPLOYMENT_JSON_PATH env var — reads a full deployment JSON (local dev / Anvil).
 *    Returns same addresses for any chainId (local dev uses a single-chain fork).
 * 2. CHAIN_ADDRESSES from @aqua0/shared — production addresses keyed by chain name.
 */
export function getDeploymentAddresses(chainId: number): DeploymentAddresses {
  // Option 1: Explicit JSON path (local dev with Anvil)
  const jsonPath = process.env.DEPLOYMENT_JSON_PATH;
  if (jsonPath) {
    if (localDevAddresses) return localDevAddresses;
    const raw = readFileSync(resolve(process.cwd(), jsonPath), "utf-8");
    localDevAddresses = JSON.parse(raw) as DeploymentAddresses;
    return localDevAddresses;
  }

  // Option 2: Use shared CHAIN_ADDRESSES for production
  const cached = addressCache.get(chainId);
  if (cached) return cached;

  const chainName = getChainName(chainId);
  const addrs = CHAIN_ADDRESSES[chainName] as ChainAddresses | undefined;
  if (!addrs) {
    throw new Error(
      `No addresses configured for chainId ${chainId} (chain "${chainName}"). ` +
        `Supported chains: ${Object.keys(CHAIN_ADDRESSES).join(", ")}`,
    );
  }

  // Map ChainAddresses fields to DeploymentAddresses.
  // Only the fields actually used by services are populated from the shared
  // addresses; the rest are set to zero address as they are not needed at runtime.
  const zero = "0x0000000000000000000000000000000000000000" as const;
  const result: DeploymentAddresses = {
    accountFactory: addrs.accountFactory!,
    rebalancer: addrs.rebalancer!,
    stargateAdapter: addrs.stargateAdapter!,
    composer: addrs.composer!,
    bridgeRegistry: addrs.bridgeRegistry!,
    cctpAdapter: addrs.cctpAdapter!,
    cctpComposer: addrs.cctpComposer!,
    swapVMRouter: addrs.swapVMRouter!,
    aqua: addrs.aquaRouter!,
    lzEndpoint: addrs.layerZeroEndpoint!,
    stargateEth: addrs.stargateEth!,
    // Fields not used by API services at runtime
    accountImpl: zero,
    aquaAdapter: zero,
    beacon: zero,
    deployer: zero,
    rebalancerImpl: zero,
    sampleAccount: zero,
    swapper: zero,
    usdc: zero,
    weth: zero,
    wethStrategyHash: zero,
  };

  addressCache.set(chainId, result);
  return result;
}

// ============================================
// CHAIN ID <-> LAYERZERO EID MAPPINGS
// Re-exported from @aqua0/shared
// ============================================

export {
  CHAIN_ID_TO_LZ_EID,
  LZ_EID_TO_CHAIN_ID,
  eidToChainId,
  chainIdToEid,
} from "@aqua0/shared";

/** Reset cached instances (useful for testing) */
export function resetClients(): void {
  clientCache.clear();
  addressCache.clear();
  localDevAddresses = null;
}
