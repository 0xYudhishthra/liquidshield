// ============================================
// Rebalancer Event Handlers
// PRD: Cross-Chain Rebalancing Operations
// ============================================

import { ponder } from "ponder:registry";
import { rebalanceOperation, lpAccount } from "ponder:schema";

// ============================================
// REBALANCE TRIGGERED
// Event: RebalanceTriggered(bytes32 indexed operationId, address indexed lpAccount, uint32 srcChainId, uint32 dstChainId, address token, uint256 amount)
// ============================================

ponder.on("Rebalancer:RebalanceTriggered", async ({ event, context }) => {
  const {
    operationId,
    lpAccount: lpAccountAddress,
    srcChainId,
    dstChainId,
    token,
    amount,
  } = event.args;

  await context.db.insert(rebalanceOperation).values({
    id: operationId,
    maker: lpAccountAddress,
    srcChainId: Number(srcChainId),
    dstChainId: Number(dstChainId),
    token,
    amount,
    status: "pending",
    lzSentGuid: null,
    lzReceivedId: null,
    stargateSentId: null,
    stargateReceivedId: null,
    initiatedAt: event.block.timestamp,
    completedAt: null,
    srcTxHash: event.transaction.hash,
    dstTxHash: null,
  });
});

// ============================================
// REBALANCE COMPLETED
// Event: RebalanceCompleted(bytes32 indexed operationId, bytes32 indexed messageGuid)
// ============================================

ponder.on("Rebalancer:RebalanceCompleted", async ({ event, context }) => {
  const { operationId, messageGuid } = event.args;

  await context.db.update(rebalanceOperation, { id: operationId }).set({
    status: "completed",
    lzSentGuid: messageGuid,
    completedAt: event.block.timestamp,
  });
});

// ============================================
// REBALANCE FAILED
// Event: RebalanceFailed(bytes32 indexed operationId, string reason)
// ============================================

ponder.on("Rebalancer:RebalanceFailed", async ({ event, context }) => {
  const { operationId } = event.args;

  await context.db.update(rebalanceOperation, { id: operationId }).set({
    status: "failed",
    completedAt: event.block.timestamp,
  });
});
