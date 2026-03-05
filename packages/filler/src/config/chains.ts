export interface ChainConfig { chainId: number; name: string; rpcUrl: string; executorAddress: string; adapterAddress: string; }

export const CHAIN_CONFIG = {
  unichain: { chainId: 1301, name: "Unichain Sepolia", rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org", hookAddress: process.env.LIQUIDSHIELD_HOOK_ADDRESS || "", settlerAddress: process.env.LIQUIDSHIELD_SETTLER_ADDRESS || "" },
  arbitrumSepolia: { chainId: 421614, name: "Arbitrum Sepolia", rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc", executorAddress: process.env.DEFENSE_EXECUTOR_ARBITRUM_ADDRESS || "", adapterAddress: process.env.AAVE_V3_ADAPTER_ADDRESS || "" },
  ethereumSepolia: { chainId: 11155111, name: "Ethereum Sepolia", rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC_URL || "https://rpc.sepolia.org", executorAddress: process.env.DEFENSE_EXECUTOR_ETHEREUM_ADDRESS || "", adapterAddress: process.env.MORPHO_BLUE_ADAPTER_ADDRESS || "" },
} as const;

export function getChainConfig(chainId: number): ChainConfig | undefined {
  if (chainId === 421614) return CHAIN_CONFIG.arbitrumSepolia as unknown as ChainConfig;
  if (chainId === 11155111) return CHAIN_CONFIG.ethereumSepolia as unknown as ChainConfig;
  return undefined;
}
