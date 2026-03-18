// ============================================
// Ponder Indexer Entry Point
// ============================================
//
// Event handlers organized by contract:
// - AquaRouter.ts: Core 1inch Aqua protocol events (external, filtered by address)
// - LPAccountFactory.ts: Account creation + implementation upgrades (Aqua0)
// - Account.ts: LP Account events — rebalancer auth, withdraw, config (Aqua0)
// - Rebalancer.ts: Cross-chain rebalancing events (Aqua0)
// - StargateAdapterHandler.ts: Token bridging events (Aqua0)
// - ComposerHandler.ts: Compose message events (Aqua0)
//
// NOTE: LayerZero Endpoint and Stargate Pool are shared infrastructure
// contracts that emit events for ALL protocols. They are NOT indexed.
// Rebalance lifecycle is fully tracked via our own contracts:
//   Rebalancer → StargateAdapter → Composer
// ============================================

// Import all handlers to register them
import "./AquaRouter";
import "./LPAccountFactory";
import "./Account";
import "./Rebalancer";
import "./StargateAdapterHandler";
import "./ComposerHandler";

export {};
