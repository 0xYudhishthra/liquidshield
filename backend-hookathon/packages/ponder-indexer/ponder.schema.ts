// ============================================
// AQUA0 PONDER SCHEMA - PRD 7.3.1 Aligned
// ============================================
//
// PRD 7.3.1 Contract Structure:
//
// AquaRouter.sol (1inch):
// - Manages virtual balances: balances[maker][app][strategyHash][token]
// - Registers SwapVM bytecode as strategies
// - Executes swaps by interpreting SwapVM
// - Handles ship/dock lifecycle
// - Token settlement via pull/push pattern
//
// IMPORTANT: StableswapAMM and ConcentratedLiquiditySwap are
// SwapVM bytecode programs, NOT separate deployed contracts.
// strategyHash = keccak256(bytecode)
//
// External: LayerZero V2, Stargate
// ============================================

import { onchainTable, index, primaryKey } from "ponder";

// ============================================
// LP SMART ACCOUNTS (ERC-4337)
// PRD: LP Smart Account as Maker
// Tokens remain in LP wallet (non-custodial)
// ============================================

export const lpAccount = onchainTable(
  "lp_account",
  (t) => ({
    address: t.hex().notNull(),
    chainId: t.integer().notNull(),

    // Owner wallet that controls this smart account
    owner: t.hex().notNull(),

    // ERC-4337 deployment
    salt: t.bigint(),

    // Rebalancer authorization
    rebalancerAuthorized: t.boolean().default(false),
    rebalancerAddress: t.hex(),

    createdAtBlock: t.bigint().notNull(),
    createdAtTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.address, table.chainId] }),
    ownerIdx: index().on(table.owner),
    chainIdx: index().on(table.chainId),
  }),
);

// ============================================
// STRATEGIES (SwapVM Bytecode Programs)
// PRD 7.3.1: Strategies are NOT separate contracts.
// They are bytecode programs registered with AquaRouter.
// strategyHash = keccak256(bytecode)
// ============================================

/**
 * Registered strategies - SwapVM bytecode programs
 *
 * Strategy types (StableswapAMM, ConcentratedLiquidity, etc.)
 * are differentiated by their bytecode logic, not by contract.
 * Parameters like amplificationFactor or priceLower/Upper are
 * encoded in the bytecode itself.
 */
export const strategy = onchainTable(
  "strategy",
  (t) => ({
    // Strategy hash = keccak256(bytecode)
    strategyHash: t.hex().primaryKey(),

    // App address that registered this strategy
    app: t.hex().notNull(),

    // Token pair this strategy handles
    tokenIn: t.hex().notNull(),
    tokenOut: t.hex().notNull(),

    chainId: t.integer().notNull(),

    // The actual SwapVM bytecode
    bytecode: t.text(),

    // Fee configuration (may be encoded in bytecode or set separately)
    feeRecipient: t.hex(),
    feeBps: t.integer(),

    isActive: t.boolean().notNull().default(true),

    // Registration info
    registeredAtBlock: t.bigint().notNull(),
    registeredAtTimestamp: t.bigint().notNull(),
    registrationTxHash: t.hex().notNull(),
  }),
  (table) => ({
    appIdx: index().on(table.app),
    chainIdx: index().on(table.chainId),
    tokenPairIdx: index().on(table.tokenIn, table.tokenOut),
  }),
);

// ============================================
// VIRTUAL BALANCES (Core Aqua State)
// PRD 7.3.1: balances[maker][app][strategyHash][token]
// ============================================

/**
 * Virtual balance registry - core of Aqua's liquidity model
 *
 * PRD: "LP capital stays in their smart account (non-custodial)
 * but backs strategies via virtual balance accounting."
 *
 * Key structure from Aqua.sol: balances[maker][app][strategyHash][token]
 */
export const virtualBalance = onchainTable(
  "virtual_balance",
  (t) => ({
    // PRD structure: maker + app + strategyHash + token + chain
    maker: t.hex().notNull(),
    app: t.hex().notNull(),
    strategyHash: t.hex().notNull(),
    token: t.hex().notNull(),
    chainId: t.integer().notNull(),

    // Current virtual balance
    balance: t.bigint().notNull(),

    lastUpdatedBlock: t.bigint().notNull(),
    lastUpdatedTimestamp: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({
      columns: [
        table.maker,
        table.app,
        table.strategyHash,
        table.token,
        table.chainId,
      ],
    }),
    makerIdx: index().on(table.maker),
    appIdx: index().on(table.app),
    strategyIdx: index().on(table.strategyHash),
    chainIdx: index().on(table.chainId),
  }),
);

// ============================================
// SWAP EVENTS
// From AquaRouter executing SwapVM bytecode
// ============================================

/**
 * Executed swaps - AquaRouter interprets SwapVM bytecode
 * and emits SwapExecuted events for each trade
 */
export const swapEvent = onchainTable(
  "swap_event",
  (t) => ({
    id: t.text().primaryKey(), // txHash-logIndex-chainId

    chainId: t.integer().notNull(),

    // Participants
    taker: t.hex().notNull(),
    maker: t.hex(), // LP smart account (nullable for direct swaps)

    // Strategy used
    strategyHash: t.hex().notNull(),
    app: t.hex(),

    // Token flow
    tokenIn: t.hex().notNull(),
    tokenOut: t.hex().notNull(),
    amountIn: t.bigint().notNull(),
    amountOut: t.bigint().notNull(),

    // Fees (PRD: 0.07% protocol fee)
    protocolFee: t.bigint().default(0n),
    lpFee: t.bigint().default(0n),

    // Execution price
    effectivePrice: t.text(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
    logIndex: t.integer().notNull(),
  }),
  (table) => ({
    chainTimeIdx: index().on(table.chainId, table.blockTimestamp),
    strategyIdx: index().on(table.strategyHash),
    takerIdx: index().on(table.taker),
    makerIdx: index().on(table.maker),
  }),
);

// ============================================
// STRATEGY LIFECYCLE: SHIP / DOCK
// PRD 7.3.1: "Strategy lifecycle: ship(), dock()"
// ============================================

/**
 * Strategy shipped - LP activates strategy with capital
 * Creates/updates virtual balances
 */
export const strategyShippedEvent = onchainTable(
  "strategy_shipped_event",
  (t) => ({
    id: t.text().primaryKey(),

    maker: t.hex().notNull(),
    app: t.hex().notNull(),
    strategyHash: t.hex().notNull(),
    chainId: t.integer().notNull(),

    // Tokens and amounts shipped
    tokens: t.text().notNull(), // JSON array of addresses
    amounts: t.text().notNull(), // JSON array of bigint strings

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    makerIdx: index().on(table.maker),
    strategyIdx: index().on(table.strategyHash),
    appIdx: index().on(table.app),
    timeIdx: index().on(table.blockTimestamp),
  }),
);

/**
 * Strategy docked - LP deactivates strategy
 * Removes virtual balances
 */
export const strategyDockedEvent = onchainTable(
  "strategy_docked_event",
  (t) => ({
    id: t.text().primaryKey(),

    maker: t.hex().notNull(),
    app: t.hex().notNull(),
    strategyHash: t.hex().notNull(),
    chainId: t.integer().notNull(),

    // Amounts returned
    tokens: t.text(),
    amounts: t.text(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    makerIdx: index().on(table.maker),
    timeIdx: index().on(table.blockTimestamp),
  }),
);

// ============================================
// PULL / PUSH PATTERN
// PRD 7.3.1: "Implements pull/push pattern for token transfers"
// ============================================

/**
 * Token pulled from maker during settlement
 * Tokens flow: Maker wallet -> Taker
 */
export const tokenPulledEvent = onchainTable(
  "token_pulled_event",
  (t) => ({
    id: t.text().primaryKey(),

    maker: t.hex().notNull(),
    app: t.hex().notNull(),
    token: t.hex().notNull(),
    amount: t.bigint().notNull(),
    chainId: t.integer().notNull(),

    // Associated swap
    swapEventId: t.text(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    makerIdx: index().on(table.maker),
    tokenIdx: index().on(table.token),
  }),
);

/**
 * Token pushed to maker during settlement
 * Tokens flow: Taker -> Maker wallet
 */
export const tokenPushedEvent = onchainTable(
  "token_pushed_event",
  (t) => ({
    id: t.text().primaryKey(),

    maker: t.hex().notNull(),
    app: t.hex().notNull(),
    token: t.hex().notNull(),
    amount: t.bigint().notNull(),
    chainId: t.integer().notNull(),

    swapEventId: t.text(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    makerIdx: index().on(table.maker),
    tokenIdx: index().on(table.token),
  }),
);

// ============================================
// DELEGATE SYSTEM
// PRD 7.3.1: "Trusted delegate system for cross-chain operations"
// ============================================

/**
 * Delegate authorization updates
 * Allows cross-chain operations via trusted delegates
 */
export const delegateUpdatedEvent = onchainTable(
  "delegate_updated_event",
  (t) => ({
    id: t.text().primaryKey(),

    maker: t.hex().notNull(),
    delegate: t.hex().notNull(),
    authorized: t.boolean().notNull(),
    chainId: t.integer().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    makerIdx: index().on(table.maker),
    delegateIdx: index().on(table.delegate),
  }),
);

// ============================================
// LP ACCOUNT CAPITAL EVENTS
// Withdrawals from LP smart accounts
// NOTE: Deposited event is defined in Events.sol but never emitted — table removed
// ============================================

export const withdrawalEvent = onchainTable(
  "withdrawal_event",
  (t) => ({
    id: t.text().primaryKey(),

    lpAccount: t.hex().notNull(),
    token: t.hex().notNull(),
    amount: t.bigint().notNull(),
    to: t.hex().notNull(),
    chainId: t.integer().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    lpAccountIdx: index().on(table.lpAccount),
    timeIdx: index().on(table.blockTimestamp),
  }),
);

// ============================================
// CROSS-CHAIN: LAYERZERO V2
// PRD: Cross-chain messaging for rebalancing
// ============================================

export const lzPacketSent = onchainTable(
  "lz_packet_sent",
  (t) => ({
    guid: t.hex().primaryKey(),

    srcChainId: t.integer().notNull(),
    dstEid: t.integer().notNull(),
    dstChainId: t.integer().notNull(),

    sender: t.hex().notNull(),
    nonce: t.bigint().notNull(),

    payloadHash: t.hex(),
    nativeFee: t.bigint(),
    lzTokenFee: t.bigint(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    senderIdx: index().on(table.sender),
    dstChainIdx: index().on(table.dstChainId),
    timeIdx: index().on(table.blockTimestamp),
  }),
);

export const lzPacketReceived = onchainTable(
  "lz_packet_received",
  (t) => ({
    id: t.text().primaryKey(),

    guid: t.hex().notNull(),
    srcEid: t.integer().notNull(),
    srcChainId: t.integer().notNull(),
    dstChainId: t.integer().notNull(),

    receiver: t.hex().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    guidIdx: index().on(table.guid),
    receiverIdx: index().on(table.receiver),
  }),
);

// ============================================
// CROSS-CHAIN: STARGATE BRIDGING
// PRD: Token bridging during rebalance
// ============================================

export const stargateOftSent = onchainTable(
  "stargate_oft_sent",
  (t) => ({
    id: t.text().primaryKey(),

    guid: t.hex().notNull(),
    srcChainId: t.integer().notNull(),
    dstEid: t.integer().notNull(),
    dstChainId: t.integer().notNull(),

    token: t.hex().notNull(),
    fromAddress: t.hex().notNull(),

    amountSentLD: t.bigint().notNull(),
    amountReceivedLD: t.bigint().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    guidIdx: index().on(table.guid),
    senderIdx: index().on(table.fromAddress),
    dstChainIdx: index().on(table.dstChainId),
  }),
);

export const stargateOftReceived = onchainTable(
  "stargate_oft_received",
  (t) => ({
    id: t.text().primaryKey(),

    guid: t.hex().notNull(),
    srcEid: t.integer().notNull(),
    srcChainId: t.integer().notNull(),
    dstChainId: t.integer().notNull(),

    token: t.hex().notNull(),
    toAddress: t.hex().notNull(),
    amountReceivedLD: t.bigint().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    guidIdx: index().on(table.guid),
    receiverIdx: index().on(table.toAddress),
  }),
);

// ============================================
// REBALANCE TRACKING
// Correlates LZ + Stargate events
// ============================================

export const rebalanceOperation = onchainTable(
  "rebalance_operation",
  (t) => ({
    id: t.hex().primaryKey(), // LZ GUID

    maker: t.hex().notNull(),

    srcChainId: t.integer().notNull(),
    dstChainId: t.integer().notNull(),

    token: t.hex(),
    amount: t.bigint(),

    // Status: pending -> bridging -> completed -> failed
    status: t.text().notNull().default("pending"),

    // Event references
    lzSentGuid: t.hex(),
    lzReceivedId: t.text(),
    stargateSentId: t.text(),
    stargateReceivedId: t.text(),

    initiatedAt: t.bigint().notNull(),
    completedAt: t.bigint(),

    srcTxHash: t.hex().notNull(),
    dstTxHash: t.hex(),
  }),
  (table) => ({
    makerIdx: index().on(table.maker),
    statusIdx: index().on(table.status),
    timeIdx: index().on(table.initiatedAt),
  }),
);

// ============================================
// ACCOUNT EVENTS (factory-discovered)
// ============================================

/** Account implementation upgraded via beacon */
export const accountUpgradeEvent = onchainTable(
  "account_upgrade_event",
  (t) => ({
    id: t.text().primaryKey(),

    newImplementation: t.hex().notNull(),
    chainId: t.integer().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    timeIdx: index().on(table.blockTimestamp),
  }),
);

/** SwapVM Router address updated on an Account */
export const swapVMRouterSetEvent = onchainTable(
  "swap_vm_router_set_event",
  (t) => ({
    id: t.text().primaryKey(),

    lpAccount: t.hex().notNull(),
    oldRouter: t.hex().notNull(),
    newRouter: t.hex().notNull(),
    chainId: t.integer().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    lpAccountIdx: index().on(table.lpAccount),
  }),
);

// ============================================
// BRIDGE EVENTS (StargateAdapter + Composer + CCTP)
// ============================================

/** Tokens bridged via StargateAdapter */
export const tokensBridgedEvent = onchainTable(
  "tokens_bridged_event",
  (t) => ({
    id: t.text().primaryKey(),

    dstEid: t.integer().notNull(),
    recipient: t.hex().notNull(),
    amountIn: t.bigint().notNull(),
    amountOut: t.bigint().notNull(),
    guid: t.hex().notNull(),
    chainId: t.integer().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    guidIdx: index().on(table.guid),
    recipientIdx: index().on(table.recipient),
    timeIdx: index().on(table.blockTimestamp),
  }),
);

/** Compose message received and processed by Composer */
export const composeReceivedEvent = onchainTable(
  "compose_received_event",
  (t) => ({
    id: t.text().primaryKey(),

    guid: t.hex().notNull(),
    from: t.hex().notNull(),
    amount: t.bigint().notNull(),
    strategyHash: t.hex().notNull(),
    chainId: t.integer().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    guidIdx: index().on(table.guid),
    strategyIdx: index().on(table.strategyHash),
    timeIdx: index().on(table.blockTimestamp),
  }),
);

/** USDC bridged via CCTPAdapter (CCTP v2) */
export const cctpBridgedEvent = onchainTable(
  "cctp_bridged_event",
  (t) => ({
    id: t.text().primaryKey(),

    dstDomain: t.integer().notNull(),
    mintRecipient: t.hex().notNull(),
    token: t.hex().notNull(),
    amount: t.bigint().notNull(),
    nonce: t.bigint().notNull(),
    chainId: t.integer().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    recipientIdx: index().on(table.mintRecipient),
    timeIdx: index().on(table.blockTimestamp),
  }),
);

/** CCTP compose message received and processed by CCTPComposer */
export const cctpComposeReceivedEvent = onchainTable(
  "cctp_compose_received_event",
  (t) => ({
    id: t.text().primaryKey(),

    amount: t.bigint().notNull(),
    strategyHash: t.hex().notNull(),
    chainId: t.integer().notNull(),

    blockNumber: t.bigint().notNull(),
    blockTimestamp: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    strategyIdx: index().on(table.strategyHash),
    timeIdx: index().on(table.blockTimestamp),
  }),
);

// ============================================
// AGGREGATED METRICS
// PRD 8.x: Success Metrics
// ============================================

/**
 * Daily protocol metrics per chain
 * PRD 8.1: vTVL, PRD 8.2: Volume, Revenue, Active LPs
 */
export const dailyChainMetrics = onchainTable(
  "daily_chain_metrics",
  (t) => ({
    id: t.text().primaryKey(), // "chainId-YYYY-MM-DD"

    chainId: t.integer().notNull(),
    date: t.text().notNull(),

    // PRD 8.2: Trading Volume
    swapCount: t.integer().notNull().default(0),
    totalVolumeIn: t.bigint().notNull().default(0n),
    totalVolumeOut: t.bigint().notNull().default(0n),

    // PRD 8.2: Protocol Revenue
    totalProtocolFees: t.bigint().notNull().default(0n),
    totalLpFees: t.bigint().notNull().default(0n),

    // PRD 8.2: Active LPs
    uniqueTakers: t.integer().notNull().default(0),
    uniqueMakers: t.integer().notNull().default(0),

    // PRD 8.1: vTVL snapshot
    vtvlSnapshot: t.bigint(),

    activeStrategies: t.integer().notNull().default(0),
  }),
  (table) => ({
    chainDateIdx: index().on(table.chainId, table.date),
    dateIdx: index().on(table.date),
  }),
);

/**
 * Maker (LP) cumulative statistics
 */
export const makerStats = onchainTable(
  "maker_stats",
  (t) => ({
    id: t.text().primaryKey(), // "maker-chainId"

    maker: t.hex().notNull(),
    chainId: t.integer().notNull(),

    totalSwaps: t.integer().notNull().default(0),
    totalVolumeIn: t.bigint().notNull().default(0n),
    totalVolumeOut: t.bigint().notNull().default(0n),
    totalFeesEarned: t.bigint().notNull().default(0n),

    // PRD 8.1: vTVL per maker
    currentVtvl: t.bigint().notNull().default(0n),

    activeStrategies: t.integer().notNull().default(0),

    firstActivityTimestamp: t.bigint(),
    lastActivityTimestamp: t.bigint(),
  }),
  (table) => ({
    makerIdx: index().on(table.maker),
    chainIdx: index().on(table.chainId),
    vtvlIdx: index().on(table.currentVtvl),
  }),
);

/**
 * Strategy cumulative statistics
 * PRD 8.2: Volume-to-TVL ratio per strategy
 */
export const strategyStats = onchainTable(
  "strategy_stats",
  (t) => ({
    id: t.text().primaryKey(), // "strategyHash-chainId"

    strategyHash: t.hex().notNull(),
    app: t.hex().notNull(),
    chainId: t.integer().notNull(),

    totalSwaps: t.integer().notNull().default(0),
    totalVolumeIn: t.bigint().notNull().default(0n),
    totalVolumeOut: t.bigint().notNull().default(0n),
    totalFees: t.bigint().notNull().default(0n),

    activeMakers: t.integer().notNull().default(0),
    totalVirtualBalance: t.bigint().notNull().default(0n),

    lastSwapTimestamp: t.bigint(),
  }),
  (table) => ({
    strategyIdx: index().on(table.strategyHash),
    appIdx: index().on(table.app),
    chainIdx: index().on(table.chainId),
  }),
);
