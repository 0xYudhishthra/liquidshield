// ============================================
// CCTPAdapter Event Handlers
// Tracks USDC bridged via Aqua0's CCTPAdapter (CCTP v2)
// ============================================

import { ponder } from "ponder:registry";
import { cctpBridgedEvent } from "ponder:schema";
import { getEventId } from "./utils/metrics";

// ============================================
// CCTP BRIDGED
// Event: CCTPBridged(uint32 indexed dstDomain, address indexed mintRecipient, address token, uint256 amount, uint64 nonce)
// ============================================

ponder.on("CCTPAdapter:CCTPBridged", async ({ event, context }) => {
  const { dstDomain, mintRecipient, token, amount, nonce } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  await context.db.insert(cctpBridgedEvent).values({
    id: eventId,
    dstDomain: Number(dstDomain),
    mintRecipient,
    token,
    amount,
    nonce: BigInt(nonce),
    chainId: context.network.chainId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });
});
