// ============================================
// Composer Event Handlers
// Tracks compose messages received on destination chain
// ============================================

import { ponder } from "ponder:registry";
import { composeReceivedEvent, rebalanceOperation } from "ponder:schema";
import { getEventId } from "./utils/metrics";

// ============================================
// COMPOSE RECEIVED
// Event: ComposeReceived(bytes32 indexed guid, address indexed from, uint256 amount, bytes32 strategyHash)
// ============================================

ponder.on("Composer:ComposeReceived", async ({ event, context }) => {
  const { guid, from, amount, strategyHash } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  // Record the compose received event
  await context.db.insert(composeReceivedEvent).values({
    id: eventId,
    guid,
    from,
    amount,
    strategyHash,
    chainId: context.network.chainId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });

  // Correlate with rebalance operation via guid — mark as completed
  await context.db
    .update(rebalanceOperation, { id: guid })
    .set({
      status: "completed",
      stargateReceivedId: eventId,
      completedAt: event.block.timestamp,
      dstTxHash: event.transaction.hash,
    });
});
