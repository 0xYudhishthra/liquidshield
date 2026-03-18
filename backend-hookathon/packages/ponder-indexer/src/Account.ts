// ============================================
// Account Event Handlers (factory-discovered)
// Events from LP Smart Accounts created by AccountFactory
// ============================================

import { ponder } from "ponder:registry";
import {
  lpAccount,
  withdrawalEvent,
  swapVMRouterSetEvent,
} from "ponder:schema";
import { getEventId } from "./utils/metrics";

// ============================================
// REBALANCER AUTHORIZED
// Event: RebalancerAuthorized(address indexed account, address indexed rebalancer)
// ============================================

ponder.on("Account:RebalancerAuthorized", async ({ event, context }) => {
  const { account, rebalancer } = event.args;

  await context.db
    .insert(lpAccount)
    .values({
      address: account,
      chainId: context.network.chainId,
      owner: event.transaction.from,
      rebalancerAuthorized: true,
      rebalancerAddress: rebalancer,
      createdAtBlock: event.block.number,
      createdAtTimestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoUpdate({
      rebalancerAuthorized: true,
      rebalancerAddress: rebalancer,
    });
});

// ============================================
// REBALANCER REVOKED
// Event: RebalancerRevoked(address indexed account)
// ============================================

ponder.on("Account:RebalancerRevoked", async ({ event, context }) => {
  const { account } = event.args;

  await context.db
    .insert(lpAccount)
    .values({
      address: account,
      chainId: context.network.chainId,
      owner: event.transaction.from,
      rebalancerAuthorized: false,
      rebalancerAddress: null,
      createdAtBlock: event.block.number,
      createdAtTimestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
    })
    .onConflictDoUpdate({
      rebalancerAuthorized: false,
      rebalancerAddress: null,
    });
});

// ============================================
// WITHDRAWN
// Event: Withdrawn(address indexed account, address indexed token, uint256 amount, address to)
// ============================================

ponder.on("Account:Withdrawn", async ({ event, context }) => {
  const { account, token, amount, to } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  await context.db.insert(withdrawalEvent).values({
    id: eventId,
    lpAccount: account,
    token,
    amount,
    to,
    chainId: context.network.chainId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });
});

// ============================================
// SWAP VM ROUTER SET
// Event: SwapVMRouterSet(address indexed oldRouter, address indexed newRouter)
// ============================================

ponder.on("Account:SwapVMRouterSet", async ({ event, context }) => {
  const { oldRouter, newRouter } = event.args;
  const eventId = getEventId(
    event.transaction.hash,
    event.log.logIndex,
    context.network.chainId,
  );

  await context.db.insert(swapVMRouterSetEvent).values({
    id: eventId,
    lpAccount: event.log.address,
    oldRouter,
    newRouter,
    chainId: context.network.chainId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });
});
