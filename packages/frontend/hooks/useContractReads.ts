"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS, HOOK_ABI } from "@/lib/contracts";

export function useReserveBalances() {
  return useReadContract({
    address: CONTRACTS.hook.address,
    abi: HOOK_ABI,
    functionName: "getReserveBalances",
    chainId: CONTRACTS.hook.chainId,
    query: { refetchInterval: 30_000 },
  });
}

export function useAccumulatedPremiums() {
  return useReadContract({
    address: CONTRACTS.hook.address,
    abi: HOOK_ABI,
    functionName: "getAccumulatedPremiums",
    chainId: CONTRACTS.hook.chainId,
    query: { refetchInterval: 30_000 },
  });
}

export function useProtectedPosition(positionId: `0x${string}` | undefined) {
  return useReadContract({
    address: CONTRACTS.hook.address,
    abi: HOOK_ABI,
    functionName: "getPosition",
    args: positionId ? [positionId] : undefined,
    chainId: CONTRACTS.hook.chainId,
    query: {
      enabled: !!positionId,
      refetchInterval: 15_000,
    },
  });
}
