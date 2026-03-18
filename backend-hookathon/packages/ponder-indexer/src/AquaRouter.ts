// ============================================
// AquaRouter Event Handlers
// PRD 7.3.1: Core Aqua Protocol Events
// ============================================

import { ponder } from "ponder:registry";
import {
  strategy,
  strategyShippedEvent,
  strategyDockedEvent,
  swapEvent,
  tokenPulledEvent,
  tokenPushedEvent,
  virtualBalance,
  delegateUpdatedEvent,
  dailyChainMetrics,
  makerStats,
  strategyStats,
} from "ponder:schema";
import {
  getEventId,
  getDailyMetricsId,
  getDateFromTimestamp,
  getMakerStatsId,
  getStrategyStatsId,
  calculateEffectivePrice,
} from "./utils/metrics";

// ============================================
// STRATEGY REGISTRATION
// ============================================

ponder.on("AquaRouter:StrategyRegistered", async ({ event, context }) => {
  const {
    strategyHash,
    app,
    tokenIn,
    tokenOut,
    bytecode,
    feeRecipient,
    feeBps,
  } = event.args;

  await context.db.insert(strategy).values({
    strategyHash,
    app,
    tokenIn,
    tokenOut,
    chainId: context.network.chainId,
    bytecode: bytecode ?? null,
    feeRecipient: feeRecipient ?? null,
    feeBps: feeBps ? Number(feeBps) : null,
    isActive: true,
    registeredAtBlock: event.block.number,
    registeredAtTimestamp: event.block.timestamp,
    registrationTxHash: event.transaction.hash,
  });

  // Initialize strategy stats
  const statsId = getStrategyStatsId(strategyHash, context.network.chainId);
  await context.db
    .insert(strategyStats)
    .values({
      id: statsId,
      strategyHash,
      app,
      chainId: context.network.chainId,
      totalSwaps: 0,
      totalVolumeIn: 0n,
      totalVolumeOut: 0n,
      totalFees: 0n,
      activeMakers: 0,
      totalVirtualBalance: 0n,
      lastSwapTimestamp: null,
    })
    .onConflictDoNothing();
});

// ============================================
// STRATEGY SHIPPED (LP activates strategy)
// ============================================

ponder.on("AquaRouter:StrategyShipped", async ({ event, context }) => {
  const { maker, app, strategyHash, tokens, amounts } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  // Record the shipped event
  await context.db.insert(strategyShippedEvent).values({
    id: eventId,
    maker,
    app,
    strategyHash,
    chainId: context.network.chainId,
    tokens: JSON.stringify(tokens),
    amounts: JSON.stringify(amounts.map((a) => a.toString())),
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });

  // Update virtual balances for each token
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const amount = amounts[i];

    await context.db
      .insert(virtualBalance)
      .values({
        maker,
        app,
        strategyHash,
        token,
        chainId: context.network.chainId,
        balance: amount,
        lastUpdatedBlock: event.block.number,
        lastUpdatedTimestamp: event.block.timestamp,
      })
      .onConflictDoUpdate((row) => ({
        balance: row.balance + amount,
        lastUpdatedBlock: event.block.number,
        lastUpdatedTimestamp: event.block.timestamp,
      }));
  }

  // Update maker stats
  const makerStatsId = getMakerStatsId(maker, context.network.chainId);
  await context.db
    .insert(makerStats)
    .values({
      id: makerStatsId,
      maker,
      chainId: context.network.chainId,
      totalSwaps: 0,
      totalVolumeIn: 0n,
      totalVolumeOut: 0n,
      totalFeesEarned: 0n,
      currentVtvl: 0n,
      activeStrategies: 1,
      firstActivityTimestamp: event.block.timestamp,
      lastActivityTimestamp: event.block.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      activeStrategies: row.activeStrategies + 1,
      lastActivityTimestamp: event.block.timestamp,
    }));

  // Update strategy stats
  const statsId = getStrategyStatsId(strategyHash, context.network.chainId);
  await context.db
    .insert(strategyStats)
    .values({
      id: statsId,
      strategyHash,
      app,
      chainId: context.network.chainId,
      totalSwaps: 0,
      totalVolumeIn: 0n,
      totalVolumeOut: 0n,
      totalFees: 0n,
      activeMakers: 1,
      totalVirtualBalance: amounts.reduce((sum, a) => sum + a, 0n),
      lastSwapTimestamp: null,
    })
    .onConflictDoUpdate((row) => ({
      activeMakers: row.activeMakers + 1,
      totalVirtualBalance:
        row.totalVirtualBalance + amounts.reduce((sum, a) => sum + a, 0n),
    }));
});

// ============================================
// STRATEGY DOCKED (LP deactivates strategy)
// ============================================

ponder.on("AquaRouter:StrategyDocked", async ({ event, context }) => {
  const { maker, app, strategyHash, tokens, amounts } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  // Record the docked event
  await context.db.insert(strategyDockedEvent).values({
    id: eventId,
    maker,
    app,
    strategyHash,
    chainId: context.network.chainId,
    tokens: tokens ? JSON.stringify(tokens) : null,
    amounts: amounts ? JSON.stringify(amounts.map((a) => a.toString())) : null,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });

  // Update maker stats
  const makerStatsId = getMakerStatsId(maker, context.network.chainId);
  await context.db.update(makerStats, { id: makerStatsId }).set((row) => ({
    activeStrategies: Math.max(0, row.activeStrategies - 1),
    lastActivityTimestamp: event.block.timestamp,
  }));

  // Update strategy stats
  const statsId = getStrategyStatsId(strategyHash, context.network.chainId);
  await context.db.update(strategyStats, { id: statsId }).set((row) => ({
    activeMakers: Math.max(0, row.activeMakers - 1),
  }));
});

// ============================================
// SWAP EXECUTED
// ============================================

ponder.on("AquaRouter:SwapExecuted", async ({ event, context }) => {
  const {
    taker,
    maker,
    strategyHash,
    app,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    protocolFee,
    lpFee,
  } = event.args;

  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  // Insert swap event
  await context.db.insert(swapEvent).values({
    id: eventId,
    chainId: context.network.chainId,
    taker,
    maker: maker ?? null,
    strategyHash,
    app: app ?? null,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    protocolFee: protocolFee ?? 0n,
    lpFee: lpFee ?? 0n,
    effectivePrice: calculateEffectivePrice(amountIn, amountOut),
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
    logIndex: event.log.logIndex,
  });

  // Update daily chain metrics
  const metricsId = getDailyMetricsId(
    context.network.chainId,
    event.block.timestamp,
  );
  const date = getDateFromTimestamp(event.block.timestamp);

  await context.db
    .insert(dailyChainMetrics)
    .values({
      id: metricsId,
      chainId: context.network.chainId,
      date,
      swapCount: 1,
      totalVolumeIn: amountIn,
      totalVolumeOut: amountOut,
      totalProtocolFees: protocolFee ?? 0n,
      totalLpFees: lpFee ?? 0n,
      uniqueTakers: 1,
      uniqueMakers: maker ? 1 : 0,
      vtvlSnapshot: null,
      activeStrategies: 1,
    })
    .onConflictDoUpdate((row) => ({
      swapCount: row.swapCount + 1,
      totalVolumeIn: row.totalVolumeIn + amountIn,
      totalVolumeOut: row.totalVolumeOut + amountOut,
      totalProtocolFees: row.totalProtocolFees + (protocolFee ?? 0n),
      totalLpFees: row.totalLpFees + (lpFee ?? 0n),
    }));

  // Update maker stats if maker exists
  if (maker) {
    const makerStatsId = getMakerStatsId(maker, context.network.chainId);
    await context.db
      .insert(makerStats)
      .values({
        id: makerStatsId,
        maker,
        chainId: context.network.chainId,
        totalSwaps: 1,
        totalVolumeIn: amountIn,
        totalVolumeOut: amountOut,
        totalFeesEarned: lpFee ?? 0n,
        currentVtvl: 0n,
        activeStrategies: 0,
        firstActivityTimestamp: event.block.timestamp,
        lastActivityTimestamp: event.block.timestamp,
      })
      .onConflictDoUpdate((row) => ({
        totalSwaps: row.totalSwaps + 1,
        totalVolumeIn: row.totalVolumeIn + amountIn,
        totalVolumeOut: row.totalVolumeOut + amountOut,
        totalFeesEarned: row.totalFeesEarned + (lpFee ?? 0n),
        lastActivityTimestamp: event.block.timestamp,
      }));
  }

  // Update strategy stats
  const statsId = getStrategyStatsId(strategyHash, context.network.chainId);
  await context.db
    .insert(strategyStats)
    .values({
      id: statsId,
      strategyHash,
      app: app ?? "0x0000000000000000000000000000000000000000",
      chainId: context.network.chainId,
      totalSwaps: 1,
      totalVolumeIn: amountIn,
      totalVolumeOut: amountOut,
      totalFees: (protocolFee ?? 0n) + (lpFee ?? 0n),
      activeMakers: 0,
      totalVirtualBalance: 0n,
      lastSwapTimestamp: event.block.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      totalSwaps: row.totalSwaps + 1,
      totalVolumeIn: row.totalVolumeIn + amountIn,
      totalVolumeOut: row.totalVolumeOut + amountOut,
      totalFees: row.totalFees + (protocolFee ?? 0n) + (lpFee ?? 0n),
      lastSwapTimestamp: event.block.timestamp,
    }));
});

// ============================================
// TOKEN PULLED (Settlement: Maker -> Taker)
// ============================================

ponder.on("AquaRouter:TokenPulled", async ({ event, context }) => {
  const { maker, app, token, amount } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  await context.db.insert(tokenPulledEvent).values({
    id: eventId,
    maker,
    app,
    token,
    amount,
    chainId: context.network.chainId,
    swapEventId: null, // Will be correlated later if needed
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });
});

// ============================================
// TOKEN PUSHED (Settlement: Taker -> Maker)
// ============================================

ponder.on("AquaRouter:TokenPushed", async ({ event, context }) => {
  const { maker, app, token, amount } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  await context.db.insert(tokenPushedEvent).values({
    id: eventId,
    maker,
    app,
    token,
    amount,
    chainId: context.network.chainId,
    swapEventId: null,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });
});

// ============================================
// BALANCE UPDATED
// ============================================

ponder.on("AquaRouter:BalanceUpdated", async ({ event, context }) => {
  const { maker, app, strategyHash, token, newBalance } = event.args;

  await context.db
    .insert(virtualBalance)
    .values({
      maker,
      app,
      strategyHash,
      token,
      chainId: context.network.chainId,
      balance: newBalance,
      lastUpdatedBlock: event.block.number,
      lastUpdatedTimestamp: event.block.timestamp,
    })
    .onConflictDoUpdate(() => ({
      balance: newBalance,
      lastUpdatedBlock: event.block.number,
      lastUpdatedTimestamp: event.block.timestamp,
    }));
});

// ============================================
// DELEGATE UPDATED
// ============================================

ponder.on("AquaRouter:DelegateUpdated", async ({ event, context }) => {
  const { maker, delegate, authorized } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  await context.db.insert(delegateUpdatedEvent).values({
    id: eventId,
    maker,
    delegate,
    authorized,
    chainId: context.network.chainId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });
});
