// ============================================
// AQUA0 PONDER CONFIG - PRD 7.3.1 Aligned
// ============================================
//
// PRD 7.3.1 Contract Structure:
//
// Core Protocol Contracts:
// - AquaRouter.sol - Production interface (inherits Aqua + Simulator + Multicall)
//   - Manages virtual balances: balances[maker][app][strategyHash][token]
//   - Strategy lifecycle: ship(), dock()
//   - Token settlement: pull/push pattern
//   - Executes SwapVM bytecode for registered strategies
//
// IMPORTANT: StableswapAMM and ConcentratedLiquiditySwap are NOT separate
// contracts. They are SwapVM bytecode programs registered as strategies
// and executed by AquaRouter. The strategy hash = keccak256(bytecode).
//
// External Integrations:
// - LayerZero V2 - Cross-chain messaging
// - Stargate - Token bridging
// - CCTP v2 - USDC bridging
// ============================================

import { createConfig } from "ponder";
import { http, parseAbiItem } from "viem";

// ABIs — single source of truth from @aqua0/shared
import {
  AquaRouterAbi,
  AccountFactoryAbi,
  AccountAbi,
  RebalancerAbi,
  StargateAdapterAbi,
  ComposerAbi,
  BridgeRegistryAbi,
  CCTPAdapterAbi,
  CCTPComposerAbi,
} from "@aqua0/shared";

// ============================================
// NETWORK MODE
// Set PONDER_NETWORK=anvil to index local Anvil fork
// ============================================

const isAnvil = process.env.PONDER_NETWORK === "anvil";

// ============================================
// CONTRACT ADDRESSES
// ============================================

// For anvil mode, read addresses from env vars (set by deployment script)
const ANVIL_ADDRESSES = {
  aquaRouter:
    (process.env.AQUA_ADDRESS as `0x${string}`) ??
    ("0x499943E74FB0cE105688beeE8Ef2ABec5D936d31" as const),
  accountFactory:
    (process.env.ACCOUNT_FACTORY_ADDRESS as `0x${string}`) ??
    (process.env.LP_ACCOUNT_FACTORY_ADDRESS as `0x${string}`) ??
    ("0x0000000000000000000000000000000000000001" as const),
  rebalancer:
    (process.env.REBALANCER_ADDRESS as `0x${string}`) ??
    ("0x0000000000000000000000000000000000000002" as const),
  stargateAdapter:
    (process.env.STARGATE_ADAPTER_ADDRESS as `0x${string}`) ??
    ("0x0000000000000000000000000000000000000003" as const),
  composer:
    (process.env.COMPOSER_ADDRESS as `0x${string}`) ??
    ("0x0000000000000000000000000000000000000004" as const),
  bridgeRegistry:
    (process.env.BRIDGE_REGISTRY_ADDRESS as `0x${string}`) ??
    ("0x0000000000000000000000000000000000000005" as const),
  cctpAdapter:
    (process.env.CCTP_ADAPTER_ADDRESS as `0x${string}`) ??
    ("0x0000000000000000000000000000000000000006" as const),
  cctpComposer:
    (process.env.CCTP_COMPOSER_ADDRESS as `0x${string}`) ??
    ("0x0000000000000000000000000000000000000007" as const),
};

// Production addresses — deployed Feb 23, 2026 to Base and Unichain.
//
// Only Aqua0's own contracts are indexed. Shared infrastructure contracts
// (LayerZero Endpoint, Stargate Pool) are NOT indexed because they emit
// events for ALL protocols, not just Aqua0. Rebalance tracking is fully
// covered by our own contracts: Rebalancer, StargateAdapter, Composer,
// CCTPAdapter, CCTPComposer.
const ADDRESSES = {
  aquaRouter: {
    base: "0x499943E74FB0cE105688beeE8Ef2ABec5D936d31" as const,
    unichain: "0x499943E74FB0cE105688beeE8Ef2ABec5D936d31" as const,
  },
  accountFactory: {
    base: "0x104F0C5D94F7859955bdA70BBD655099b5521172" as const,
    unichain: "0xa668b67F587C28A0956C260005C2d22c1705cF15" as const,
  },
  rebalancer: {
    base: "0x6836c3f788de93d12d1A38834b7D14305eF1D9a0" as const,
    unichain: "0xad1eac0675CF051Ac817575E0dD26dC7DB407521" as const,
  },
  stargateAdapter: {
    base: "0x35aC1003A3f2154DD410F5c1B5eF02Da794783A5" as const,
    unichain: "0x2829F3b04Cc277ee407b819E9552C8d43aCcb215" as const,
  },
  composer: {
    base: "0xa668b67F587C28A0956C260005C2d22c1705cF15" as const,
    unichain: "0xF3eBfB7F87cBA75Edc93741B51355FBaCa335eAa" as const,
  },
  bridgeRegistry: {
    base: "0xD7bdbE32571A48031E1a9699b74EF8E472bD77C3" as const,
    unichain: "0x59cFd5F4DfE8Bc67F9a0700E0aa839BD442dAD06" as const,
  },
  cctpAdapter: {
    base: "0x59f9331A7030F20Dd682FC01C9f661B75b0aEa49" as const,
    unichain: "0x4113d38B9381B93C54a859d34e0cEa5c4624327A" as const,
  },
  cctpComposer: {
    base: "0xf00E02B8768FB6601D70187f31C83Af96Ea0a59A" as const,
    unichain: "0xc69d8fd2E30AAAF0bEe23bC7CB0ECD9d418fac69" as const,
  },
} as const;

// Deployment start blocks (first deployment tx on each chain)
const START_BLOCKS = {
  base: 42528697,
  unichain: 41098693,
} as const;

const anvilStartBlock = parseInt(process.env.ANVIL_START_BLOCK ?? "0", 10);

// ============================================
// HELPERS
// ============================================

/** Returns true if address is a null/placeholder address */
function isNullAddress(addr: string): boolean {
  return /^0x0{30,}[0-9a-fA-F]{0,10}$/.test(addr);
}

type ChainKey = "base" | "unichain";
const CHAINS: ChainKey[] = ["base", "unichain"];

/**
 * Build network config for a contract across all chains.
 * All addresses (including placeholders) are included with real start blocks.
 * Placeholder addresses simply won't match any on-chain events.
 */
function networkForAddress(
  addresses: Record<ChainKey, string>,
): Record<string, { address: `0x${string}`; startBlock: number }> {
  const entries: Record<
    string,
    { address: `0x${string}`; startBlock: number }
  > = {};
  for (const chain of CHAINS) {
    entries[chain] = {
      address: addresses[chain] as `0x${string}`,
      startBlock: START_BLOCKS[chain],
    };
  }
  return entries;
}

/**
 * Build factory-discovered network config (for Account).
 * All addresses included with real start blocks.
 */
function networkForFactory(
  factoryAddresses: Record<ChainKey, string>,
): Record<string, any> {
  const entries: Record<string, any> = {};
  for (const chain of CHAINS) {
    entries[chain] = {
      factory: {
        address: factoryAddresses[chain] as `0x${string}`,
        event: parseAbiItem(
          "event AccountCreated(address indexed account, address indexed owner, bytes32 salt)",
        ),
        parameter: "account",
      },
      startBlock: START_BLOCKS[chain],
    };
  }
  return entries;
}

// ============================================
// CONFIG EXPORT
// ============================================

// Log status of contract addresses
if (!isAnvil) {
  const realCount = Object.values(ADDRESSES)
    .flatMap((addrs) => Object.values(addrs))
    .filter((addr) => !isNullAddress(addr)).length;

  if (realCount === 0) {
    console.log(
      "[ponder] All contract addresses are placeholders — indexer will idle.\n" +
        "Update ADDRESSES in ponder.config.ts after deploying contracts.",
    );
  } else {
    console.log(`[ponder] ${realCount} real contract address(es) configured.`);
  }
}

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: process.env.PONDER_DATABASE_URL!,
  },

  networks: isAnvil
    ? {
        anvil: {
          chainId: 8453,
          transport: http(
            process.env.PONDER_RPC_ANVIL ?? "http://127.0.0.1:8545",
          ),
        },
      }
    : {
        base: {
          chainId: 8453,
          transport: http(
            process.env.PONDER_RPC_BASE ?? "https://mainnet.base.org",
          ),
        },
        unichain: {
          chainId: 130,
          transport: http(
            process.env.PONDER_RPC_UNICHAIN ??
              "https://unichain.calderachain.xyz/http",
          ),
        },
      },

  contracts: isAnvil
    ? {
        AquaRouter: {
          abi: AquaRouterAbi,
          network: {
            anvil: {
              address: ANVIL_ADDRESSES.aquaRouter,
              startBlock: anvilStartBlock,
            },
          },
        },
        AccountFactory: {
          abi: AccountFactoryAbi,
          network: {
            anvil: {
              address: ANVIL_ADDRESSES.accountFactory,
              startBlock: anvilStartBlock,
            },
          },
        },
        Account: {
          abi: AccountAbi,
          network: {
            anvil: {
              factory: {
                address: ANVIL_ADDRESSES.accountFactory,
                event: parseAbiItem(
                  "event AccountCreated(address indexed account, address indexed owner, bytes32 salt)",
                ),
                parameter: "account",
              },
              startBlock: anvilStartBlock,
            },
          },
        },
        Rebalancer: {
          abi: RebalancerAbi,
          network: {
            anvil: {
              address: ANVIL_ADDRESSES.rebalancer,
              startBlock: anvilStartBlock,
            },
          },
        },
        StargateAdapter: {
          abi: StargateAdapterAbi,
          network: {
            anvil: {
              address: ANVIL_ADDRESSES.stargateAdapter,
              startBlock: anvilStartBlock,
            },
          },
        },
        Composer: {
          abi: ComposerAbi,
          network: {
            anvil: {
              address: ANVIL_ADDRESSES.composer,
              startBlock: anvilStartBlock,
            },
          },
        },
        BridgeRegistry: {
          abi: BridgeRegistryAbi,
          network: {
            anvil: {
              address: ANVIL_ADDRESSES.bridgeRegistry,
              startBlock: anvilStartBlock,
            },
          },
        },
        CCTPAdapter: {
          abi: CCTPAdapterAbi,
          network: {
            anvil: {
              address: ANVIL_ADDRESSES.cctpAdapter,
              startBlock: anvilStartBlock,
            },
          },
        },
        CCTPComposer: {
          abi: CCTPComposerAbi,
          network: {
            anvil: {
              address: ANVIL_ADDRESSES.cctpComposer,
              startBlock: anvilStartBlock,
            },
          },
        },
      }
    : {
        AquaRouter: {
          abi: AquaRouterAbi,
          network: networkForAddress(ADDRESSES.aquaRouter),
        },
        AccountFactory: {
          abi: AccountFactoryAbi,
          network: networkForAddress(ADDRESSES.accountFactory),
        },
        Account: {
          abi: AccountAbi,
          network: networkForFactory(ADDRESSES.accountFactory),
        },
        Rebalancer: {
          abi: RebalancerAbi,
          network: networkForAddress(ADDRESSES.rebalancer),
        },
        StargateAdapter: {
          abi: StargateAdapterAbi,
          network: networkForAddress(ADDRESSES.stargateAdapter),
        },
        Composer: {
          abi: ComposerAbi,
          network: networkForAddress(ADDRESSES.composer),
        },
        BridgeRegistry: {
          abi: BridgeRegistryAbi,
          network: networkForAddress(ADDRESSES.bridgeRegistry),
        },
        CCTPAdapter: {
          abi: CCTPAdapterAbi,
          network: networkForAddress(ADDRESSES.cctpAdapter),
        },
        CCTPComposer: {
          abi: CCTPComposerAbi,
          network: networkForAddress(ADDRESSES.cctpComposer),
        },
      },
});
