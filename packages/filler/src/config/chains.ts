export interface ChainConfig { chainId: number; name: string; rpcUrl: string; executorAddress: string; adapterAddress: string; }

export const CHAIN_CONFIG = {
  unichain: {
    chainId: 1301,
    name: "Unichain Sepolia",
    rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org",
    hookAddress: process.env.LIQUIDSHIELD_HOOK_ADDRESS || "0x008E3fDE34a243F1aa18CC0f381040063eCC95C0",
    settlerAddress: process.env.LIQUIDSHIELD_SETTLER_ADDRESS || "0xF540054007966371d338D337d73A08A34649aB76",
  },
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com",
    executorAddress: process.env.DEFENSE_EXECUTOR_BASE_ADDRESS || "0xf02cB2bC2121b7688EE87eE546D2f819ae1C2c67",
    adapterAddress: process.env.AAVE_V3_ADAPTER_BASE_ADDRESS || "0x1eB7638CAa7053833Ad9cd7E8276f3E3574AD106",
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    executorAddress: process.env.DEFENSE_EXECUTOR_ARBITRUM_ADDRESS || "0xf02cB2bC2121b7688EE87eE546D2f819ae1C2c67",
    adapterAddress: process.env.AAVE_V3_ADAPTER_ARBITRUM_ADDRESS || "0x1eB7638CAa7053833Ad9cd7E8276f3E3574AD106",
  },
} as const;

export function getChainConfig(chainId: number): ChainConfig | undefined {
  if (chainId === 84532) return CHAIN_CONFIG.baseSepolia as unknown as ChainConfig;
  if (chainId === 421614) return CHAIN_CONFIG.arbitrumSepolia as unknown as ChainConfig;
  return undefined;
}
