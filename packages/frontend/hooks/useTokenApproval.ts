"use client";

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { erc20Abi, maxUint256 } from "viem";
import { CONTRACTS } from "@/lib/contracts";

export function useTokenApproval(
  token: `0x${string}` | undefined,
  owner: `0x${string}` | undefined
) {
  const spender = CONTRACTS.router.address;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner && token ? [owner, spender] : undefined,
    chainId: CONTRACTS.router.chainId,
    query: { enabled: !!token && !!owner },
  });

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    onSuccess() {
      refetchAllowance();
    },
  } as any);

  const approve = (amount?: bigint) => {
    if (!token) return;
    writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount ?? maxUint256],
      chainId: CONTRACTS.router.chainId,
    });
  };

  const needsApproval = (amount: bigint) => {
    if (!allowance) return true;
    return allowance < amount;
  };

  return { allowance, approve, needsApproval, hash, isPending, isConfirming, isSuccess, error };
}
