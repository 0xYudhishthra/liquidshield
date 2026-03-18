// ============================================
// Zod Validation Schemas
// ============================================

import { z } from "zod";

// ============================================
// COMMON VALIDATORS
// ============================================

// Ethereum address validation
export const ethereumAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

// Strategy hash validation (bytes32)
export const strategyHash = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid strategy hash");

// Chain ID (string — kept for backward compat in admin schemas)
export const chainId = z.enum(["base", "unichain"]);

// Numeric chain ID
export const numericChainId = z.coerce
  .number()
  .refine((n) => [8453, 130].includes(n), "Unsupported chain ID");

// Required chainId query param for chain-dependent endpoints
export const chainIdQuerySchema = z.object({
  chainId: numericChainId,
});

// BigInt as string
export const bigIntString = z.string().regex(/^\d+$/, "Invalid amount");

// ============================================
// USER SCHEMAS
// ============================================

export const createUserSchema = z.object({
  walletAddress: ethereumAddress,
});

export const updatePreferencesSchema = z.object({
  defaultSlippageBps: z.number().min(1).max(5000).optional(),
  preferredChains: z.array(chainId).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationEmail: z.string().email().optional(),
});

// ============================================
// STRATEGY SCHEMAS
// ============================================

export const strategyFiltersSchema = z.object({
  chainId: numericChainId.optional(),
  type: z
    .enum([
      "constant_product",
      "stable_swap",
      "custom",
      "stableswap",
      "concentrated",
      "third_party_uniswap",
      "third_party_curve",
      "third_party_aerodrome",
    ])
    .optional(),
  featured: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  tokenIn: ethereumAddress.optional(),
  tokenOut: ethereumAddress.optional(),
});

// ============================================
// SWAP SCHEMAS
// ============================================

export const swapQuoteSchema = z.object({
  tokenIn: ethereumAddress,
  tokenOut: ethereumAddress,
  amountIn: bigIntString,
  chainId: numericChainId,
  slippageBps: z.number().min(1).max(5000).optional(),
});

export const swapHistorySchema = z.object({
  limit: z.coerce.number().min(1).max(1000).optional(),
  chainId: numericChainId.optional(),
});

// ============================================
// POSITION SCHEMAS
// ============================================

export const positionFiltersSchema = z.object({
  chainId: numericChainId.optional(),
  strategyHash: strategyHash.optional(),
  active: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

// ============================================
// REBALANCER SCHEMAS
// ============================================

export const updateRebalancerConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  rebalancerAddress: ethereumAddress.optional(),
  minRebalanceAmountUsd: z.number().min(0).optional(),
  maxSlippageBps: z.number().min(1).max(5000).optional(),
  preferredSourceChain: chainId.optional(),
  minHoursBetweenRebalances: z.number().min(1).max(168).optional(), // Max 1 week
});

// ============================================
// METRICS SCHEMAS
// ============================================

export const metricsQuerySchema = z.object({
  chainId: numericChainId.optional(),
  days: z.coerce.number().min(1).max(365).optional(),
});

// ============================================
// HEX STRING VALIDATORS
// ============================================

// Generic hex string
export const hexString = z
  .string()
  .regex(/^0x[a-fA-F0-9]*$/, "Invalid hex string");

// Bytes32 value
export const bytes32 = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid bytes32");

// ============================================
// LP ACCOUNT SCHEMAS
// ============================================

export const prepareCreateAccountSchema = z.object({
  owner: ethereumAddress,
  signature: hexString,
});

export const withdrawSchema = z.object({
  token: ethereumAddress,
  amount: bigIntString,
});

export const withdrawETHSchema = z.object({
  amount: bigIntString,
});

export const authorizeRebalancerSchema = z.object({
  rebalancer: ethereumAddress,
});

// ============================================
// REBALANCER OPERATION SCHEMAS
// ============================================

export const triggerRebalanceSchema = z.object({
  lpAccount: ethereumAddress,
  srcChainId: z.number().int().positive(),
  dstChainId: z.number().int().positive(),
  token: ethereumAddress,
  amount: bigIntString,
});

export const executeDockSchema = z.object({
  operationId: bytes32,
  strategyHash: bytes32,
});

export const executeBridgeSchema = z.object({
  operationId: bytes32,
  dstEid: z.number().int().positive(),
  dstComposer: ethereumAddress,
  composeMsg: hexString,
  token: ethereumAddress,
  amount: bigIntString,
  minAmount: bigIntString,
  lzReceiveGas: bigIntString,
  lzComposeGas: bigIntString,
});

export const recordBridgingSchema = z.object({
  operationId: bytes32,
  messageGuid: bytes32,
});

export const operationIdSchema = z.object({
  operationId: bytes32,
});

export const failRebalanceSchema = z.object({
  operationId: bytes32,
  reason: z.string().min(1).max(500),
});

// ============================================
// BRIDGE FEE SCHEMAS
// ============================================

export const quoteBridgeFeeSchema = z.object({
  token: ethereumAddress,
  dstEid: z.number().int().positive(),
  recipient: ethereumAddress,
  amount: bigIntString,
  minAmount: bigIntString,
});

export const quoteBridgeWithComposeFeeSchema = z.object({
  token: ethereumAddress,
  dstEid: z.number().int().positive(),
  dstComposer: ethereumAddress,
  composeMsg: hexString,
  amount: bigIntString,
  minAmount: bigIntString,
  lzReceiveGas: bigIntString,
  lzComposeGas: bigIntString,
});

// ============================================
// STRATEGY BUILD SCHEMAS
// ============================================

// --- Individual instruction schemas (discriminated on "opcode") ---

// Controls
const jumpInstr = z.object({
  opcode: z.literal("jump"),
  nextPC: z.number().int().min(0).max(65535),
});
const jumpIfTokenInInstr = z.object({
  opcode: z.literal("jumpIfTokenIn"),
  token: ethereumAddress,
  nextPC: z.number().int().min(0).max(65535),
});
const jumpIfTokenOutInstr = z.object({
  opcode: z.literal("jumpIfTokenOut"),
  token: ethereumAddress,
  nextPC: z.number().int().min(0).max(65535),
});
const deadlineInstr = z.object({
  opcode: z.literal("deadline"),
  timestamp: bigIntString,
});
const onlyTakerTokenBalanceNonZeroInstr = z.object({
  opcode: z.literal("onlyTakerTokenBalanceNonZero"),
  token: ethereumAddress,
});
const onlyTakerTokenBalanceGteInstr = z.object({
  opcode: z.literal("onlyTakerTokenBalanceGte"),
  token: ethereumAddress,
  minAmount: bigIntString,
});
const onlyTakerTokenSupplyShareGteInstr = z.object({
  opcode: z.literal("onlyTakerTokenSupplyShareGte"),
  token: ethereumAddress,
  minShareE18: bigIntString,
});
const saltInstr = z.object({
  opcode: z.literal("salt"),
  value: bigIntString.optional(),
});

// Balances
const staticBalancesInstr = z.object({
  opcode: z.literal("staticBalances"),
  tokens: z.array(ethereumAddress).min(1).max(4),
  balances: z.array(bigIntString).min(1).max(4),
});
const dynamicBalancesInstr = z.object({
  opcode: z.literal("dynamicBalances"),
  tokens: z.array(ethereumAddress).min(1).max(4),
  balances: z.array(bigIntString).min(1).max(4),
});

// Invalidators
const invalidateBit1DInstr = z.object({
  opcode: z.literal("invalidateBit1D"),
  bitIndex: z.number().int().min(0),
});
const invalidateTokenIn1DInstr = z.object({
  opcode: z.literal("invalidateTokenIn1D"),
});
const invalidateTokenOut1DInstr = z.object({
  opcode: z.literal("invalidateTokenOut1D"),
});

// Swaps
const xycSwapInstr = z.object({ opcode: z.literal("xycSwap") });
const xycConcentrateGrowLiquidityXDInstr = z.object({
  opcode: z.literal("xycConcentrateGrowLiquidityXD"),
  tokens: z.array(ethereumAddress).min(1).max(4),
  deltas: z.array(bigIntString).min(1).max(4),
  liquidity: bigIntString,
});
const xycConcentrateGrowLiquidity2DInstr = z.object({
  opcode: z.literal("xycConcentrateGrowLiquidity2D"),
  deltaIn: bigIntString,
  deltaOut: bigIntString,
  initialLiquidity: bigIntString,
});
const xycConcentrateGrowPriceRangeXDInstr = z.object({
  opcode: z.literal("xycConcentrateGrowPriceRangeXD"),
  tokens: z.array(ethereumAddress).min(1).max(4),
  deltas: z.array(bigIntString).min(1).max(4),
});
const xycConcentrateGrowPriceRange2DInstr = z.object({
  opcode: z.literal("xycConcentrateGrowPriceRange2D"),
  deltaIn: bigIntString,
  deltaOut: bigIntString,
  unused: bigIntString,
});

// Decay
const decayInstr = z.object({
  opcode: z.literal("decay"),
  period: z.number().int().min(0).max(65535),
});

// Limit Swaps
const limitSwap1DInstr = z.object({
  opcode: z.literal("limitSwap1D"),
  makerDirectionLt: z.number().int().min(0).max(255),
});
const limitSwapOnlyFull1DInstr = z.object({
  opcode: z.literal("limitSwapOnlyFull1D"),
  makerDirectionLt: z.number().int().min(0).max(255),
});

// Min Rate
const requireMinRate1DInstr = z.object({
  opcode: z.literal("requireMinRate1D"),
  rateLt: bigIntString,
  rateGt: bigIntString,
});
const adjustMinRate1DInstr = z.object({
  opcode: z.literal("adjustMinRate1D"),
  rateLt: bigIntString,
  rateGt: bigIntString,
});

// Dutch Auctions
const dutchAuctionBalanceIn1DInstr = z.object({
  opcode: z.literal("dutchAuctionBalanceIn1D"),
  startTime: bigIntString,
  duration: z.number().int().min(0).max(65535),
  decayFactor: bigIntString,
});
const dutchAuctionBalanceOut1DInstr = z.object({
  opcode: z.literal("dutchAuctionBalanceOut1D"),
  startTime: bigIntString,
  duration: z.number().int().min(0).max(65535),
  decayFactor: bigIntString,
});

// Base Fee Adjuster
const baseFeeAdjuster1DInstr = z.object({
  opcode: z.literal("baseFeeAdjuster1D"),
  baseGasPrice: bigIntString,
  ethToToken1Price: bigIntString,
  gasAmount: z.number().int().min(0),
  maxPriceDecay: bigIntString,
});

// TWAP
const twapInstr = z.object({
  opcode: z.literal("twap"),
  balanceIn: bigIntString,
  balanceOut: bigIntString,
  startTime: bigIntString,
  duration: bigIntString,
  priceBump: bigIntString,
  minTradeAmountOut: bigIntString,
});

// Fees
const flatFeeAmountInInstr = z.object({
  opcode: z.literal("flatFeeAmountIn"),
  feeBps: z.number().int().min(0),
});
const flatFeeAmountOutInstr = z.object({
  opcode: z.literal("flatFeeAmountOut"),
  feeBps: z.number().int().min(0),
});
const progressiveFeeInInstr = z.object({
  opcode: z.literal("progressiveFeeIn"),
  feeBps: z.number().int().min(0),
});
const progressiveFeeOutInstr = z.object({
  opcode: z.literal("progressiveFeeOut"),
  feeBps: z.number().int().min(0),
});
const protocolFeeAmountOutInstr = z.object({
  opcode: z.literal("protocolFeeAmountOut"),
  feeBps: z.number().int().min(0),
  to: ethereumAddress,
});
const aquaProtocolFeeAmountOutInstr = z.object({
  opcode: z.literal("aquaProtocolFeeAmountOut"),
  feeBps: z.number().int().min(0),
  to: ethereumAddress,
});
const peggedSwapGrowPriceRange2DInstr = z.object({
  opcode: z.literal("peggedSwapGrowPriceRange2D"),
  x0: bigIntString,
  y0: bigIntString,
  linearWidth: bigIntString,
  rateLt: bigIntString,
  rateGt: bigIntString,
});
const protocolFeeAmountInInstr = z.object({
  opcode: z.literal("protocolFeeAmountIn"),
  feeBps: z.number().int().min(0),
  to: ethereumAddress,
});
const aquaProtocolFeeAmountInInstr = z.object({
  opcode: z.literal("aquaProtocolFeeAmountIn"),
  feeBps: z.number().int().min(0),
  to: ethereumAddress,
});
const dynamicProtocolFeeAmountInInstr = z.object({
  opcode: z.literal("dynamicProtocolFeeAmountIn"),
  feeProvider: ethereumAddress,
});
const aquaDynamicProtocolFeeAmountInInstr = z.object({
  opcode: z.literal("aquaDynamicProtocolFeeAmountIn"),
  feeProvider: ethereumAddress,
});

export const instructionSchema = z.discriminatedUnion("opcode", [
  // Controls
  jumpInstr,
  jumpIfTokenInInstr,
  jumpIfTokenOutInstr,
  deadlineInstr,
  onlyTakerTokenBalanceNonZeroInstr,
  onlyTakerTokenBalanceGteInstr,
  onlyTakerTokenSupplyShareGteInstr,
  saltInstr,
  // Balances
  staticBalancesInstr,
  dynamicBalancesInstr,
  // Invalidators
  invalidateBit1DInstr,
  invalidateTokenIn1DInstr,
  invalidateTokenOut1DInstr,
  // Swaps
  xycSwapInstr,
  xycConcentrateGrowLiquidityXDInstr,
  xycConcentrateGrowLiquidity2DInstr,
  xycConcentrateGrowPriceRangeXDInstr,
  xycConcentrateGrowPriceRange2DInstr,
  // Decay
  decayInstr,
  // Limit Swaps
  limitSwap1DInstr,
  limitSwapOnlyFull1DInstr,
  // Min Rate
  requireMinRate1DInstr,
  adjustMinRate1DInstr,
  // Dutch Auctions
  dutchAuctionBalanceIn1DInstr,
  dutchAuctionBalanceOut1DInstr,
  // Base Fee Adjuster
  baseFeeAdjuster1DInstr,
  // TWAP
  twapInstr,
  // Fees
  flatFeeAmountInInstr,
  flatFeeAmountOutInstr,
  progressiveFeeInInstr,
  progressiveFeeOutInstr,
  protocolFeeAmountOutInstr,
  aquaProtocolFeeAmountOutInstr,
  peggedSwapGrowPriceRange2DInstr,
  protocolFeeAmountInInstr,
  aquaProtocolFeeAmountInInstr,
  dynamicProtocolFeeAmountInInstr,
  aquaDynamicProtocolFeeAmountInInstr,
]);

export const buildStrategySchema = z.discriminatedUnion("template", [
  z.object({
    template: z.literal("constantProduct"),
    maker: ethereumAddress,
    token0: ethereumAddress,
    token1: ethereumAddress,
    balance0: bigIntString,
    balance1: bigIntString,
    feeBps: z.number().int().min(0),
  }),
  z.object({
    template: z.literal("stableSwap"),
    maker: ethereumAddress,
    token0: ethereumAddress,
    token1: ethereumAddress,
    balance0: bigIntString,
    balance1: bigIntString,
    linearWidth: bigIntString,
    rate0: bigIntString,
    rate1: bigIntString,
    feeBps: z.number().int().min(0),
  }),
  z.object({
    template: z.literal("concentratedLiquidity"),
    maker: ethereumAddress,
    token0: ethereumAddress,
    token1: ethereumAddress,
    balance0: bigIntString,
    balance1: bigIntString,
    deltaIn: bigIntString,
    deltaOut: bigIntString,
    feeBps: z.number().int().min(0),
  }),
  z.object({
    template: z.literal("dutchAuction"),
    maker: ethereumAddress,
    token0: ethereumAddress,
    token1: ethereumAddress,
    balance0: bigIntString,
    balance1: bigIntString,
    startTime: bigIntString,
    duration: z.number().int().min(0).max(65535),
    decayFactor: bigIntString,
    feeBps: z.number().int().min(0),
  }),
  z.object({
    template: z.literal("twap"),
    maker: ethereumAddress,
    token0: ethereumAddress,
    token1: ethereumAddress,
    balance0: bigIntString,
    balance1: bigIntString,
    startTime: bigIntString,
    duration: bigIntString,
    priceBump: bigIntString,
    minTradeAmountOut: bigIntString,
    feeBps: z.number().int().min(0),
  }),
  z.object({
    template: z.literal("limitOrder"),
    maker: ethereumAddress,
    token0: ethereumAddress,
    token1: ethereumAddress,
    balance0: bigIntString,
    balance1: bigIntString,
    makerDirectionLt: z.number().int().min(0).max(255),
    fullOnly: z.boolean().default(false),
  }),
  z.object({
    template: z.literal("baseFeeAdjusted"),
    maker: ethereumAddress,
    token0: ethereumAddress,
    token1: ethereumAddress,
    balance0: bigIntString,
    balance1: bigIntString,
    baseGasPrice: bigIntString,
    ethToToken1Price: bigIntString,
    gasAmount: z.number().int().min(0),
    maxPriceDecay: bigIntString,
    feeBps: z.number().int().min(0),
  }),
  z.object({
    template: z.literal("custom"),
    maker: ethereumAddress,
    instructions: z.array(instructionSchema).min(1),
  }),
]);

// ============================================
// ADMIN STRATEGY SCHEMAS
// ============================================

export const strategyTypeEnum = z.enum([
  "constant_product",
  "stable_swap",
  "custom",
  "stableswap",
  "concentrated",
  "third_party_uniswap",
  "third_party_curve",
  "third_party_aerodrome",
]);

export const createStrategyMetadataSchema = z.object({
  strategy_hash: strategyHash,
  strategy_type: strategyTypeEnum,
  display_name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  risk_level: z.enum(["low", "medium", "high"]).optional(),
  amplification_factor: z.number().optional(),
  price_lower: z.number().optional(),
  price_upper: z.number().optional(),
  fee_bps: z.number().int().min(0).optional(),
  range_multiplier: z.number().optional(),
  token_in: ethereumAddress.optional(),
  token_out: ethereumAddress.optional(),
  linear_width: z.string().optional(),
  rate0: z.string().optional(),
  rate1: z.string().optional(),
  program_bytecode: hexString.optional(),
  underlying_protocol: z.string().optional(),
  underlying_pool_address: ethereumAddress.optional(),
  hooks_address: ethereumAddress.optional(),
  supported_chains: z.array(chainId).optional(),
  is_featured: z.boolean().optional(),
  is_proprietary: z.boolean().optional(),
});

export const updateStrategyMetadataSchema = z.object({
  display_name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  strategy_type: strategyTypeEnum.optional(),
  risk_level: z.enum(["low", "medium", "high"]).optional(),
  amplification_factor: z.number().nullable().optional(),
  price_lower: z.number().nullable().optional(),
  price_upper: z.number().nullable().optional(),
  fee_bps: z.number().int().min(0).nullable().optional(),
  range_multiplier: z.number().nullable().optional(),
  token_in: ethereumAddress.nullable().optional(),
  token_out: ethereumAddress.nullable().optional(),
  linear_width: z.string().nullable().optional(),
  rate0: z.string().nullable().optional(),
  rate1: z.string().nullable().optional(),
  program_bytecode: hexString.nullable().optional(),
  underlying_protocol: z.string().nullable().optional(),
  underlying_pool_address: ethereumAddress.nullable().optional(),
  hooks_address: ethereumAddress.nullable().optional(),
  supported_chains: z.array(chainId).optional(),
  is_featured: z.boolean().optional(),
  is_proprietary: z.boolean().optional(),
  is_deprecated: z.boolean().optional(),
  apy_24h: z.number().nullable().optional(),
  apy_7d: z.number().nullable().optional(),
  apy_30d: z.number().nullable().optional(),
  tvl_usd: z.number().nullable().optional(),
  volume_24h_usd: z.number().nullable().optional(),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type StrategyFilters = z.infer<typeof strategyFiltersSchema>;
export type SwapQuoteInput = z.infer<typeof swapQuoteSchema>;
export type SwapHistoryInput = z.infer<typeof swapHistorySchema>;
export type PositionFilters = z.infer<typeof positionFiltersSchema>;
export type UpdateRebalancerConfigInput = z.infer<
  typeof updateRebalancerConfigSchema
>;
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
export type InstructionInput = z.infer<typeof instructionSchema>;
export type BuildStrategyInput = z.infer<typeof buildStrategySchema>;

// LP Account types
export type PrepareCreateAccountInput = z.infer<
  typeof prepareCreateAccountSchema
>;
export type WithdrawInput = z.infer<typeof withdrawSchema>;
export type WithdrawETHInput = z.infer<typeof withdrawETHSchema>;
export type AuthorizeRebalancerInput = z.infer<
  typeof authorizeRebalancerSchema
>;
// Rebalancer operation types
export type TriggerRebalanceInput = z.infer<typeof triggerRebalanceSchema>;
export type ExecuteDockInput = z.infer<typeof executeDockSchema>;
export type ExecuteBridgeInput = z.infer<typeof executeBridgeSchema>;
export type RecordBridgingInput = z.infer<typeof recordBridgingSchema>;
export type OperationIdInput = z.infer<typeof operationIdSchema>;
export type FailRebalanceInput = z.infer<typeof failRebalanceSchema>;

// Bridge fee types
export type QuoteBridgeFeeInput = z.infer<typeof quoteBridgeFeeSchema>;
export type QuoteBridgeWithComposeFeeInput = z.infer<
  typeof quoteBridgeWithComposeFeeSchema
>;

// Admin types
export type CreateStrategyMetadataInput = z.infer<
  typeof createStrategyMetadataSchema
>;
export type UpdateStrategyMetadataInput = z.infer<
  typeof updateStrategyMetadataSchema
>;
