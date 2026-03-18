// ============================================
// StargateAdapter Event Handlers
// Tracks tokens bridged via Aqua0's StargateAdapter
// ============================================

import { ponder } from "ponder:registry";
import { tokensBridgedEvent, rebalanceOperation } from "ponder:schema";
import { getEventId } from "./utils/metrics";

// ============================================
// TOKENS BRIDGED
// Event: TokensBridged(uint32 indexed dstEid, address indexed recipient, uint256 amountIn, uint256 amountOut, bytes32 guid)
// ============================================

ponder.on("StargateAdapter:TokensBridged", async ({ event, context }) => {
  const { dstEid, recipient, amountIn, amountOut, guid } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  // Record the bridge event
  await context.db.insert(tokensBridgedEvent).values({
    id: eventId,
    dstEid: Number(dstEid),
    recipient,
    amountIn,
    amountOut,
    guid,
    chainId: context.network.chainId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });

  // Correlate with rebalance operation via guid
  await context.db
    .update(rebalanceOperation, { id: guid })
    .set({
      status: "bridging",
      stargateSentId: eventId,
    });
});
