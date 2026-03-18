// ============================================
// Bridge Service — Fee Quoting + Compose Encoding
// Read-only — queries StargateAdapter via publicClient
// ============================================

import { type Address, type Hex } from "viem";
import { StargateAdapterAbi } from "../contracts/abis";
import { getPublicClient, getDeploymentAddresses } from "../contracts/client";
import { encodeComposeMsg } from "../contracts/calldata";

// ============================================
// FEE QUOTING (read-only chain calls)
// ============================================

export async function quoteBridgeFee(
  chainId: number,
  token: Address,
  dstEid: number,
  recipient: Address,
  amount: bigint,
  minAmount: bigint,
): Promise<bigint> {
  const client = getPublicClient(chainId);
  const { stargateAdapter } = getDeploymentAddresses(chainId);

  return client.readContract({
    address: stargateAdapter,
    abi: StargateAdapterAbi,
    functionName: "quoteBridgeFee",
    args: [token, dstEid, recipient, amount, minAmount],
  }) as Promise<bigint>;
}

export async function quoteBridgeWithComposeFee(
  chainId: number,
  token: Address,
  dstEid: number,
  dstComposer: Address,
  composeMsg: Hex,
  amount: bigint,
  minAmount: bigint,
  lzReceiveGas: bigint,
  lzComposeGas: bigint,
): Promise<bigint> {
  const client = getPublicClient(chainId);
  const { stargateAdapter } = getDeploymentAddresses(chainId);

  return client.readContract({
    address: stargateAdapter,
    abi: StargateAdapterAbi,
    functionName: "quoteBridgeWithComposeFee",
    args: [
      token,
      dstEid,
      dstComposer,
      composeMsg,
      amount,
      minAmount,
      lzReceiveGas,
      lzComposeGas,
    ],
  }) as Promise<bigint>;
}

// ============================================
// COMPOSE MESSAGE HELPER
// ============================================

export function buildComposeMsg(
  account: Address,
  strategyBytes: Hex,
  tokens: Address[],
  amounts: bigint[],
): Hex {
  return encodeComposeMsg(account, strategyBytes, tokens, amounts);
}

// ============================================
// STARGATE ADAPTER READ METHODS
// ============================================

export async function getStargatePool(
  chainId: number,
  token: Address,
): Promise<Address> {
  const client = getPublicClient(chainId);
  const { stargateAdapter } = getDeploymentAddresses(chainId);

  return client.readContract({
    address: stargateAdapter,
    abi: StargateAdapterAbi,
    functionName: "getPool",
    args: [token],
  }) as Promise<Address>;
}
