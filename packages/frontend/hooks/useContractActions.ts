"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, ROUTER_ABI } from "@/lib/contracts";
import type { DefenseStrategy } from "../../../shared/src/types";

const strategyToUint8 = (s: DefenseStrategy): number =>
  s === "COLLATERAL_TOPUP" ? 0 : 1;

export function useRegisterPosition() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const register = (params: {
    positionId: `0x${string}`;
    collateralAsset: `0x${string}`;
    debtAsset: `0x${string}`;
    positionSize: bigint;
    sourceChainId: bigint;
    strategy: DefenseStrategy;
    healthThreshold: bigint;
    lendingAdapter: `0x${string}`;
    premiumMonths: bigint;
    premiumToken: `0x${string}`;
    premiumAmount: bigint;
  }) => {
    writeContract({
      address: CONTRACTS.router.address,
      abi: ROUTER_ABI,
      functionName: "registerAndPayPremium",
      args: [
        params.positionId,
        params.collateralAsset,
        params.debtAsset,
        params.positionSize,
        params.sourceChainId,
        strategyToUint8(params.strategy),
        params.healthThreshold,
        params.lendingAdapter,
        params.premiumMonths,
        params.premiumToken,
        params.premiumAmount,
      ],
      chainId: CONTRACTS.router.chainId,
    });
  };

  return { register, hash, isPending, isConfirming, isSuccess, error };
}

export function useUnregisterPosition() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const unregister = (positionId: `0x${string}`) => {
    writeContract({
      address: CONTRACTS.router.address,
      abi: ROUTER_ABI,
      functionName: "unregister",
      args: [positionId],
      chainId: CONTRACTS.router.chainId,
    });
  };

  return { unregister, hash, isPending, isConfirming, isSuccess, error };
}

export function useTopUpPremium() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const topUp = (params: {
    positionId: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
    months: bigint;
  }) => {
    writeContract({
      address: CONTRACTS.router.address,
      abi: ROUTER_ABI,
      functionName: "topUpPremium",
      args: [params.positionId, params.token, params.amount, params.months],
      chainId: CONTRACTS.router.chainId,
    });
  };

  return { topUp, hash, isPending, isConfirming, isSuccess, error };
}
