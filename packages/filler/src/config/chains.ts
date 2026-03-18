export interface ChainConfig { chainId: number; name: string; rpcUrl: string; executorAddress: string; adapterAddress: string; }

export const CHAIN_CONFIG = {
  unichain: {
    chainId: 1301,
    name: "Unichain Sepolia",
    rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org",
    hookAddress: process.env.LIQUIDSHIELD_HOOK_ADDRESS || "0x0AA6345204931FE6E5748BdB0A17C8DfeD25d5c0",
    settlerAddress: process.env.LIQUIDSHIELD_SETTLER_ADDRESS || "0xdC2E7C04c7E742d3e116aC2ce787B59C75a1523e",
  },
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com",
    executorAddress: process.env.DEFENSE_EXECUTOR_BASE_ADDRESS || "0x4459b385544c752922940ba87e86c6DbA8f4CDEF",
    adapterAddress: process.env.AAVE_V3_ADAPTER_BASE_ADDRESS || "0x560010aEA084A62B3e666f7e48A190A299049129",
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    executorAddress: process.env.DEFENSE_EXECUTOR_ARBITRUM_ADDRESS || "0x4459b385544c752922940ba87e86c6DbA8f4CDEF",
    adapterAddress: process.env.AAVE_V3_ADAPTER_ARBITRUM_ADDRESS || "0x560010aEA084A62B3e666f7e48A190A299049129",
  },
} as const;

export function getChainConfig(chainId: number): ChainConfig | undefined {
  if (chainId === 84532) return CHAIN_CONFIG.baseSepolia as unknown as ChainConfig;
  if (chainId === 421614) return CHAIN_CONFIG.arbitrumSepolia as unknown as ChainConfig;
  return undefined;
}
