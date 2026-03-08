export type DefenseStrategy = "COLLATERAL_TOPUP" | "BATCHED_UNWIND";
export type PositionStatus = "ACTIVE" | "DEFENDING" | "UNWINDING" | "CLOSED";
export type Protocol = "aave" | "morpho";

export interface Position {
  positionId: string; owner: string; protocol: Protocol; chainId: number;
  collateralAsset: string; collateralSymbol: string; collateralAmount: string; collateralUsd: number;
  debtAsset: string; debtSymbol: string; debtAmount: string; debtUsd: number;
  healthFactor: number; liquidationThreshold: number;
}

export interface ProtectedPosition extends Position {
  strategy: DefenseStrategy; healthThreshold: number; premiumPaidUntil: number;
  status: PositionStatus; lendingAdapter: string;
}

export interface DefenseEvent {
  positionId: string; strategy: DefenseStrategy; defenseAmount: string; defenseFee: string;
  healthBefore: number; healthAfter: number; timestamp: number; txHash: string; chainId: number;
}

export interface LPEarnings {
  swapFees: string; premiumYield: string; defenseFeeYield: string; totalYield: string; apy: number;
}

export interface DefenseIntent {
  orderId: string; positionId: string; collateralAsset: string; amount: string;
  sourceChainId: number; lendingAdapter: string; strategy: DefenseStrategy;
  user: string; fillDeadline: number;
}
