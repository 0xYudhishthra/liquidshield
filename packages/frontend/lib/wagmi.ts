import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { sepolia, arbitrumSepolia } from "wagmi/chains";

const unichainSepolia = {
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.unichain.org"] } },
  blockExplorers: { default: { name: "Uniscan", url: "https://sepolia.uniscan.xyz" } },
  testnet: true,
} as const;

export const config = getDefaultConfig({
  appName: "LiquidShield",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [unichainSepolia, arbitrumSepolia, sepolia],
  transports: {
    [unichainSepolia.id]: http("https://sepolia.unichain.org"),
    [arbitrumSepolia.id]: http(),
    [sepolia.id]: http(),
  },
});
