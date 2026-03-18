// ============================================
// CCTPComposer Event Handlers
// Tracks CCTP compose messages received on destination chain
// ============================================

import { ponder } from "ponder:registry";
import { cctpComposeReceivedEvent } from "ponder:schema";
import { getEventId } from "./utils/metrics";

// ============================================
// CCTP COMPOSE RECEIVED
// Event: CCTPComposeReceived(uint256 amount, bytes32 indexed strategyHash)
// ============================================

ponder.on("CCTPComposer:CCTPComposeReceived", async ({ event, context }) => {
  const { amount, strategyHash } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  await context.db.insert(cctpComposeReceivedEvent).values({
    id: eventId,
    amount,
    strategyHash,
    chainId: context.network.chainId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });
});
