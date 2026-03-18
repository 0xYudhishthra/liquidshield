// ============================================
// Swap Service — Quote + Calldata Preparation
// ============================================

import { type Address, type Hex } from "viem";
import { SwapVMRouterAbi } from "../contracts/abis";
import { getPublicClient, getDeploymentAddresses } from "../contracts/client";
import {
  buildSwapCalldata,
  buildERC20ApproveCalldata,
  type SwapOrder,
  type TransactionCalldata,
} from "../contracts/calldata";

// ============================================
// QUOTE (read-only via simulateContract)
// ============================================

export async function quote(
  chainId: number,
  params: {
    order: SwapOrder;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    takerData: Hex;
  },
): Promise<{ amountIn: bigint; amountOut: bigint; strategyHash: Hex }> {
  const client = getPublicClient(chainId);
  const { swapVMRouter } = getDeploymentAddresses(chainId);

  const result = await client.readContract({
    address: swapVMRouter,
    abi: SwapVMRouterAbi,
    functionName: "quote",
    args: [
      params.order,
      params.tokenIn,
      params.tokenOut,
      params.amountIn,
      params.takerData,
    ],
  });

  const [amountIn, amountOut, strategyHash] = result as [
    bigint,
    bigint,
    Hex,
  ];

  return { amountIn, amountOut, strategyHash };
}

// ============================================
// CALLDATA BUILDERS
// ============================================

export function prepareSwap(
  chainId: number,
  params: {
    order: SwapOrder;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    takerData: Hex;
  },
): { calldata: TransactionCalldata } {
  const { swapVMRouter } = getDeploymentAddresses(chainId);

  return {
    calldata: buildSwapCalldata(
      swapVMRouter,
      params.order,
      params.tokenIn,
      params.tokenOut,
      params.amountIn,
      params.takerData,
    ),
  };
}

export function prepareSwapperApproval(
  token: Address,
  spender: Address,
  amount: bigint,
): { calldata: TransactionCalldata } {
  return {
    calldata: buildERC20ApproveCalldata(token, spender, amount),
  };
}
