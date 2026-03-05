import { SUPPORTED_CHAINS } from "@/lib/chains";
export function ChainBadge({ chainId }: { chainId: number }) {
  const chain = SUPPORTED_CHAINS[chainId as keyof typeof SUPPORTED_CHAINS];
  if (!chain) return <span className="text-gray-500">Unknown</span>;
  return <span className="inline-flex items-center gap-1 text-sm text-gray-300">{chain.name}</span>;
}
