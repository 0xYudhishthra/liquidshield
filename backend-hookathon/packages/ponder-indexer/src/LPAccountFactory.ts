// ============================================
// LP Account Factory Event Handlers
// PRD: ERC-4337 Smart Account Creation
// ============================================

import { ponder } from "ponder:registry";
import { lpAccount, makerStats, accountUpgradeEvent } from "ponder:schema";
import { getMakerStatsId, getEventId } from "./utils/metrics";

// ============================================
// ACCOUNT CREATED
// Event: AccountCreated(address indexed account, address indexed owner, bytes32 salt)
// ============================================

ponder.on("AccountFactory:AccountCreated", async ({ event, context }) => {
  const { account, owner, salt } = event.args;

  // Create LP account record
  await context.db.insert(lpAccount).values({
    address: account,
    chainId: context.network.chainId,
    owner,
    salt: BigInt(salt), // Convert bytes32 to bigint for storage
    rebalancerAuthorized: false,
    rebalancerAddress: null,
    createdAtBlock: event.block.number,
    createdAtTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
  });

  // Initialize maker stats for this account
  const makerStatsId = getMakerStatsId(account, context.network.chainId);
  await context.db
    .insert(makerStats)
    .values({
      id: makerStatsId,
      maker: account,
      chainId: context.network.chainId,
      totalSwaps: 0,
      totalVolumeIn: 0n,
      totalVolumeOut: 0n,
      totalFeesEarned: 0n,
      currentVtvl: 0n,
      activeStrategies: 0,
      firstActivityTimestamp: event.block.timestamp,
      lastActivityTimestamp: event.block.timestamp,
    })
    .onConflictDoNothing();
});

// ============================================
// ACCOUNT IMPLEMENTATION UPGRADED
// Event: AccountImplementationUpgraded(address indexed newImplementation)
// ============================================

ponder.on(
  "AccountFactory:AccountImplementationUpgraded",
  async ({ event, context }) => {
    const { newImplementation } = event.args;
    const eventId = getEventId(
      event.transaction.hash,
      event.log.logIndex,
      context.network.chainId,
    );

    await context.db.insert(accountUpgradeEvent).values({
      id: eventId,
      newImplementation,
      chainId: context.network.chainId,
      blockNumber: event.block.number,
      blockTimestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
    });
  },
);
