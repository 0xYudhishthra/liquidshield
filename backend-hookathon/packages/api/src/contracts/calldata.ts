// ============================================
// Calldata Builders
// Encodes function calls into transaction data
// Frontend adds gas, signs, and sends
// ============================================

import {
  encodeFunctionData,
  encodeAbiParameters,
  type Address,
  type Hex,
} from "viem";
import {
  AccountFactoryAbi,
  AccountAbi,
  RebalancerAbi,
  SwapVMRouterAbi,
  ERC20Abi,
} from "./abis";

export interface TransactionCalldata {
  to: Address;
  data: Hex;
  value?: bigint;
}

// ============================================
// ACCOUNT FACTORY
// ============================================

export function buildCreateAccountCalldata(
  accountFactory: Address,
  signature: Hex,
): TransactionCalldata {
  return {
    to: accountFactory,
    data: encodeFunctionData({
      abi: AccountFactoryAbi,
      functionName: "createAccount",
      args: [signature],
    }),
  };
}

// ============================================
// ACCOUNT
// ============================================

export function buildApproveAquaCalldata(
  accountAddress: Address,
  token: Address,
  amount: bigint,
): TransactionCalldata {
  return {
    to: accountAddress,
    data: encodeFunctionData({
      abi: AccountAbi,
      functionName: "approveAqua",
      args: [token, amount],
    }),
  };
}

export function buildShipCalldata(
  accountAddress: Address,
  strategyBytes: Hex,
  tokens: Address[],
  amounts: bigint[],
): TransactionCalldata {
  return {
    to: accountAddress,
    data: encodeFunctionData({
      abi: AccountAbi,
      functionName: "ship",
      args: [strategyBytes, tokens, amounts],
    }),
  };
}

export function buildDockCalldata(
  accountAddress: Address,
  strategyHash: Hex,
): TransactionCalldata {
  return {
    to: accountAddress,
    data: encodeFunctionData({
      abi: AccountAbi,
      functionName: "dock",
      args: [strategyHash],
    }),
  };
}

export function buildWithdrawCalldata(
  accountAddress: Address,
  token: Address,
  amount: bigint,
): TransactionCalldata {
  return {
    to: accountAddress,
    data: encodeFunctionData({
      abi: AccountAbi,
      functionName: "withdraw",
      args: [token, amount],
    }),
  };
}

export function buildWithdrawETHCalldata(
  accountAddress: Address,
  amount: bigint,
): TransactionCalldata {
  return {
    to: accountAddress,
    data: encodeFunctionData({
      abi: AccountAbi,
      functionName: "withdrawETH",
      args: [amount],
    }),
  };
}

export function buildAuthorizeRebalancerCalldata(
  accountAddress: Address,
  rebalancer: Address,
): TransactionCalldata {
  return {
    to: accountAddress,
    data: encodeFunctionData({
      abi: AccountAbi,
      functionName: "authorizeRebalancer",
      args: [rebalancer],
    }),
  };
}

export function buildRevokeRebalancerCalldata(
  accountAddress: Address,
): TransactionCalldata {
  return {
    to: accountAddress,
    data: encodeFunctionData({
      abi: AccountAbi,
      functionName: "revokeRebalancer",
    }),
  };
}

// ============================================
// REBALANCER
// ============================================

export function buildTriggerRebalanceCalldata(
  rebalancerAddress: Address,
  lpAccount: Address,
  srcChainId: number,
  dstChainId: number,
  token: Address,
  amount: bigint,
): TransactionCalldata {
  return {
    to: rebalancerAddress,
    data: encodeFunctionData({
      abi: RebalancerAbi,
      functionName: "triggerRebalance",
      args: [lpAccount, srcChainId, dstChainId, token, amount],
    }),
  };
}

export function buildExecuteDockCalldata(
  rebalancerAddress: Address,
  operationId: Hex,
  strategyHash: Hex,
): TransactionCalldata {
  return {
    to: rebalancerAddress,
    data: encodeFunctionData({
      abi: RebalancerAbi,
      functionName: "executeDock",
      args: [operationId, strategyHash],
    }),
  };
}

export function buildExecuteBridgeStargateCalldata(
  rebalancerAddress: Address,
  operationId: Hex,
  dstEid: number,
  dstComposer: Address,
  composeMsg: Hex,
  token: Address,
  amount: bigint,
  minAmount: bigint,
  lzReceiveGas: bigint,
  lzComposeGas: bigint,
  value: bigint,
): TransactionCalldata {
  return {
    to: rebalancerAddress,
    data: encodeFunctionData({
      abi: RebalancerAbi,
      functionName: "executeBridgeStargate",
      args: [
        operationId,
        dstEid,
        dstComposer,
        composeMsg,
        token,
        amount,
        minAmount,
        lzReceiveGas,
        lzComposeGas,
      ],
    }),
    value,
  };
}

export function buildExecuteBridgeCCTPCalldata(
  rebalancerAddress: Address,
  operationId: Hex,
  dstDomain: number,
  dstComposer: Address,
  hookData: Hex,
  token: Address,
  amount: bigint,
  maxFee: bigint,
  minFinalityThreshold: number,
  value: bigint,
): TransactionCalldata {
  return {
    to: rebalancerAddress,
    data: encodeFunctionData({
      abi: RebalancerAbi,
      functionName: "executeBridgeCCTP",
      args: [
        operationId,
        dstDomain,
        dstComposer,
        hookData,
        token,
        amount,
        maxFee,
        minFinalityThreshold,
      ],
    }),
    value,
  };
}

export function buildRecordBridgingCalldata(
  rebalancerAddress: Address,
  operationId: Hex,
  messageGuid: Hex,
): TransactionCalldata {
  return {
    to: rebalancerAddress,
    data: encodeFunctionData({
      abi: RebalancerAbi,
      functionName: "recordBridging",
      args: [operationId, messageGuid],
    }),
  };
}

export function buildConfirmRebalanceCalldata(
  rebalancerAddress: Address,
  operationId: Hex,
): TransactionCalldata {
  return {
    to: rebalancerAddress,
    data: encodeFunctionData({
      abi: RebalancerAbi,
      functionName: "confirmRebalance",
      args: [operationId],
    }),
  };
}

export function buildFailRebalanceCalldata(
  rebalancerAddress: Address,
  operationId: Hex,
  reason: string,
): TransactionCalldata {
  return {
    to: rebalancerAddress,
    data: encodeFunctionData({
      abi: RebalancerAbi,
      functionName: "failRebalance",
      args: [operationId, reason],
    }),
  };
}

// ============================================
// COMPOSE MESSAGE ENCODING
// ============================================

export function encodeComposeMsg(
  account: Address,
  strategyBytes: Hex,
  tokens: Address[],
  amounts: bigint[],
): Hex {
  return encodeAbiParameters(
    [
      { type: "address" },
      { type: "bytes" },
      { type: "address[]" },
      { type: "uint256[]" },
    ],
    [account, strategyBytes, tokens, amounts],
  );
}

// ============================================
// SWAP VM ROUTER
// ============================================

export interface SwapOrder {
  maker: Address;
  traits: bigint;
  data: Hex;
}

export function buildSwapCalldata(
  routerAddress: Address,
  order: SwapOrder,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  takerData: Hex,
): TransactionCalldata {
  return {
    to: routerAddress,
    data: encodeFunctionData({
      abi: SwapVMRouterAbi,
      functionName: "swap",
      args: [order, tokenIn, tokenOut, amountIn, takerData],
    }),
  };
}

// ============================================
// ERC20
// ============================================

export function buildERC20ApproveCalldata(
  token: Address,
  spender: Address,
  amount: bigint,
): TransactionCalldata {
  return {
    to: token,
    data: encodeFunctionData({
      abi: ERC20Abi,
      functionName: "approve",
      args: [spender, amount],
    }),
  };
}
