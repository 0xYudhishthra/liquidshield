# CLAUDE.md — Aqua0 Backend

This file provides context for AI assistants (Claude, Cursor, Copilot, etc.) working on the Aqua0 backend.

## Project Overview

The Aqua0 backend provides API services for the cross-chain shared liquidity protocol. Built with **Hono** (TypeScript) for performance and type safety.

For **v1**, swaps are **single-chain only**: traders execute swaps on a specific chain
against available virtual liquidity on that chain. LayerZero/Stargate are used **only**
to move LP capital between their smart accounts on different chains (via the
rebalancer), not for an intent-based cross-chain swap flow.

**Note**: The API package (`packages/api`) has working services and routes for LP operations, rebalancer operations, strategy building, swap quoting, and bridge fee estimation. The Ponder indexer and database layers (Supabase, Redis) are planned but not yet implemented. When PRD language mentions *intents* for swaps, treat that as **future-phase** and follow the v1 behavior described above.

### Monorepo Structure

**Package Manager**: pnpm (workspace)
**Runtime**: Bun

```
backend/
├── pnpm-workspace.yaml
├── package.json              # Root package.json
├── openapi.yaml              # OpenAPI 3.0 spec
├── packages/
│   ├── api/                  # Main backend API (Hono)
│   │   ├── src/
│   │   │   ├── contracts/    # ABIs, calldata builders, viem client
│   │   │   ├── routes/       # API route handlers (lp, rebalancer, strategies, swaps)
│   │   │   ├── services/     # Business logic (lp, rebalancer, bridge, strategy-builder)
│   │   │   ├── types/        # Zod schemas
│   │   │   ├── tests/
│   │   │   │   ├── unit/           # Unit tests (calldata, strategy-builder)
│   │   │   │   ├── integration/    # Integration tests (lp-service, rebalancer-service, flows)
│   │   │   │   └── scripts/        # Test helper scripts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── ponder-indexer/       # Blockchain event indexer (Ponder.sh) [planned]
│       ├── ponder.config.ts
│       ├── ponder.schema.ts
│       ├── src/
│       │   └── handlers/     # Event handlers
│       └── package.json
│
├── supabase_schema.sql       # Supabase database schema [planned]
├── supabase_erd.mermaid      # Supabase ERD diagram
├── ponder_schema.ts          # Ponder schema reference
├── ponder_erd.mermaid        # Ponder ERD diagram
└── ponder_events.md          # Ponder events documentation
```

#### Two Packages

| Package                   | Purpose                   | Database                                  |
| ------------------------- | ------------------------- | ----------------------------------------- |
| `packages/api`            | REST API for web app      | Supabase (PostgreSQL) + reads from Ponder |
| `packages/ponder-indexer` | Blockchain event indexing | Ponder's internal PostgreSQL              |

## Quick Reference

### Commands (pnpm Workspace)

```bash
# Install dependencies (from backend root)
pnpm install

# Development - run both packages
pnpm dev                      # Runs all packages in parallel
pnpm --filter api dev         # Run only API server
pnpm --filter ponder-indexer dev  # Run only Ponder indexer

# Building
pnpm build                    # Build all packages
pnpm --filter api build       # Build only API

# Testing
pnpm test                     # Run all tests
pnpm --filter api test        # Test only API
pnpm --filter api test:e2e    # E2E tests

# Database
pnpm --filter api db:migrate  # Run Supabase migrations
pnpm --filter api db:seed     # Seed database

# Linting
pnpm lint                     # ESLint check
pnpm lint:fix                 # Auto-fix issues
pnpm format                   # Prettier formatting

# Add dependencies to specific package
pnpm --filter api add <package>
pnpm --filter ponder-indexer add <package>
```

### Key Directories

```
backend/
├── src/
│   ├── strategies/      # Strategy management
│   ├── positions/       # LP position tracking
│   ├── swap/            # Swap quoting & routing
│   ├── analytics/       # Protocol metrics
│   ├── rebalancer/      # Cross-chain rebalancing
│   ├── auth/            # Authentication
│   ├── websocket/       # Real-time updates
│   ├── rpc/             # Blockchain clients
│   ├── external/        # LayerZero, Stargate, Ponder
│   └── common/          # Shared utilities
├── test/                # Test files
└── prisma/              # Database schema
```

## Architecture

### Technology Stack

| Component  | Technology            | Purpose                   |
| ---------- | --------------------- | ------------------------- |
| Framework  | Hono                  | API server                |
| Runtime/PM | Bun                   | Runtime & package manager |
| Language   | TypeScript 5          | Type safety               |
| Database   | PostgreSQL (Supabase) | Primary store             |
| Cache      | Redis                 | Caching, pub/sub          |
| Indexer    | Ponder.sh             | On-chain events           |
| RPC        | viem                  | Blockchain calls          |

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           WEB APP (Next.js)                         │
│                    Does NOT access Supabase directly                │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTP/REST
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND API (Hono)                          │
│                        packages/api                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Routes     │  │   Services   │  │   Database Clients       │  │
│  │  /users      │  │  UserService │  │  - SupabaseClient        │  │
│  │  /strategies │  │  SwapService │  │  - PonderClient (read)   │  │
│  │  /positions  │  │  LPService   │  │  - RedisClient (cache)   │  │
│  │  /swaps      │  │  MetricsServ │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└───────────────────────────┬─────────────────────┬───────────────────┘
                            │                     │
            ┌───────────────┘                     └───────────────┐
            ▼                                                     ▼
┌───────────────────────────┐               ┌─────────────────────────┐
│   SUPABASE (PostgreSQL)   │               │   PONDER INDEXER DB     │
│   packages/api            │               │   packages/ponder-indexer│
│                           │               │                         │
│   Off-chain data:         │               │   On-chain data:        │
│   - users                 │  ◄── sync ──► │   - lp_account          │
│   - user_preferences      │               │   - strategy            │
│   - strategy_metadata     │               │   - virtual_balance     │
│   - positions (enriched)  │               │   - swap_event          │
│   - rebalancer_configs    │               │   - strategy_shipped    │
│   - protocol_metrics_daily│               │   - lz_packet_sent      │
│   - tokens                │               │   - stargate_oft_sent   │
│   - token_price_history   │               │   - daily_chain_metrics │
└───────────────────────────┘               └─────────────────────────┘
                                                         ▲
                                                         │ indexes
                                                         │
                                            ┌────────────┴────────────┐
                                            │    BLOCKCHAIN EVENTS    │
                                            │  (Base, Arbitrum, etc.) │
                                            │   AquaRouter contracts  │
                                            │   LayerZero V2          │
                                            │   Stargate              │
                                            └─────────────────────────┘
```

#### Key Architectural Decisions

1. **Web app never accesses Supabase directly** — all DB operations go through the API
2. **Ponder indexes on-chain events** — provides real-time blockchain state
3. **Supabase stores enriched off-chain data** — user preferences, curated strategy metadata, computed metrics
4. **API syncs between both databases** — e.g., enriches Ponder positions with Supabase metadata

## Key Services (Implemented)

Services are functional modules in `packages/api/src/services/`. They use viem to read on-chain state and build calldata for transactions.

### lp.service.ts

LP account operations — creates accounts, prepares calldata, reads on-chain state:

```typescript
// Key functions
prepareCreateAccount(signature): { calldata }                    // Signature-verified account creation
prepareApproveAqua(account, token, amount): { calldata }         // Approve Aqua for token pulls
prepareShip(account, strategyBytes, tokens, amounts): { calldata }
prepareDock(account, strategyHash): { calldata }
prepareWithdraw(account, token, amount): { calldata }
prepareWithdrawETH(account, amount): { calldata }
prepareAuthorizeRebalancer(account, rebalancer): { calldata }
prepareRevokeRebalancer(account): { calldata }
prepareSetStargateAdapter(account, adapter): { calldata }
prepareSetComposer(account, composer): { calldata }
getAccountInfo(account): { owner, aqua, swapVMRouter, ... }     // On-chain reads
isAccount(address): boolean
getRawBalance(account, strategyHash, token): { balance, tokensCount }
getStrategyTokens(account, strategyHash): address[]
getTokenBalance(account, token): bigint
computeStrategyHash(strategyBytes): bytes32
```

### rebalancer.service.ts

Rebalancer operations — builds calldata for the Rebalancer contract state machine:

```typescript
// Key functions
prepareTriggerRebalance(account, srcChainId, dstChainId, token, amount): { calldata }
prepareExecuteDock(operationId, strategyHash): { calldata }
prepareRecordBridging(operationId, guid): { calldata }
prepareConfirmRebalance(operationId): { calldata }
prepareFailRebalance(operationId, reason): { calldata }
prepareExecuteBridge(operationId, dstEid, amount, minAmount, ...): { calldata }
operationExists(operationId): boolean
getOperation(operationId): RebalanceOperation
```

### bridge.service.ts

Bridge fee estimation — quotes fees from StargateAdapter:

```typescript
// Key functions
quoteBridgeFee(dstEid, recipient, amount, minAmount): bigint
quoteBridgeWithComposeFee(dstEid, composer, composeMsg, amount, minAmount, ...): bigint
```

### strategy-builder.service.ts

Builds SwapVM strategy bytecode (Constant Product, StableSwap templates):

```typescript
// Key functions
buildConstantProductStrategy(token0, token1, balance0, balance1, feeBps, maker)
buildStableSwapStrategy(token0, token1, balance0, balance1, linearWidth, rate0, rate1, feeBps, maker)
buildAquaTakerData(): Hex
computeStrategyHash(strategyBytes): Hex
```

### Planned Services (Not Yet Implemented)

- **PositionService** — LP position tracking via Ponder indexer
- **MetricsService** — Protocol metrics aggregation
- **UserService** — User preferences via Supabase

## API Endpoints

### Implemented Endpoints

```text
# Basic
GET  /health                                              # Liveness check
GET  /api/v1/chains                                       # Supported chains

# LP Account Operations
POST /api/v1/lp/accounts/prepare-create                   # Prepare account creation calldata
GET  /api/v1/lp/accounts/:address                         # Get account info (on-chain read)
GET  /api/v1/lp/accounts/:address/is-account              # Check if address is an account
POST /api/v1/lp/accounts/:address/prepare-approve          # Prepare Aqua approval calldata
POST /api/v1/lp/accounts/:address/prepare-ship            # Prepare ship calldata
POST /api/v1/lp/accounts/:address/prepare-dock            # Prepare dock calldata
POST /api/v1/lp/accounts/:address/prepare-withdraw        # Prepare withdraw calldata
POST /api/v1/lp/accounts/:address/prepare-withdraw-eth    # Prepare withdrawETH calldata
POST /api/v1/lp/accounts/:address/prepare-authorize       # Prepare authorize rebalancer
POST /api/v1/lp/accounts/:address/prepare-revoke          # Prepare revoke rebalancer
POST /api/v1/lp/accounts/:address/prepare-set-adapter     # Prepare setStargateAdapter
POST /api/v1/lp/accounts/:address/prepare-set-composer    # Prepare setComposer
GET  /api/v1/lp/accounts/:address/balance/:token          # Get token balance
GET  /api/v1/lp/accounts/:address/strategies/:hash        # Get strategy tokens
GET  /api/v1/lp/accounts/:address/raw-balance             # Get Aqua raw balance

# Rebalancer Operations
POST /api/v1/rebalancer/prepare-trigger                   # Prepare triggerRebalance
POST /api/v1/rebalancer/prepare-execute-dock              # Prepare executeDock
POST /api/v1/rebalancer/prepare-record-bridging           # Prepare recordBridging
POST /api/v1/rebalancer/prepare-confirm                   # Prepare confirmRebalance
POST /api/v1/rebalancer/prepare-fail                      # Prepare failRebalance
POST /api/v1/rebalancer/prepare-execute-bridge            # Prepare executeBridge
GET  /api/v1/rebalancer/operations/:id                    # Get operation details
GET  /api/v1/rebalancer/bridge-fee                        # Quote bridge fee
GET  /api/v1/rebalancer/bridge-compose-fee                # Quote bridge+compose fee

# Strategy Building
POST /api/v1/strategies/build/constant-product            # Build CP strategy bytecode
POST /api/v1/strategies/build/stable-swap                 # Build SS strategy bytecode
POST /api/v1/strategies/build/taker-data                  # Build taker data for swaps
POST /api/v1/strategies/hash                              # Compute strategy hash

# Swap Operations
POST /api/v1/swaps/quote                                  # Quote swap via SwapVM Router
POST /api/v1/swaps/prepare                                # Prepare swap calldata
```

### Planned Endpoints (Not Yet Implemented)

```text
# Positions, Metrics, Tokens, Users — require Ponder indexer + Supabase
GET  /api/v1/positions/:wallet
GET  /api/v1/metrics
GET  /api/v1/tokens
PUT  /api/v1/users/:wallet/preferences
```

## Database Schema Reference

**IMPORTANT**: Before implementing any database-related features, review these schema files:

| File                   | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `supabase_schema.sql`  | Complete Supabase schema with tables, RLS policies, triggers |
| `supabase_erd.mermaid` | Entity-relationship diagram for Supabase                     |
| `ponder_schema.ts`     | Ponder schema (on-chain indexed data)                        |
| `ponder_erd.mermaid`   | Entity-relationship diagram for Ponder                       |
| `ponder_events.md`     | Documented events that Ponder indexes                        |

### Supabase Tables (Off-chain)

- `users` — Wallet-based authentication
- `user_preferences` — Slippage, theme, notifications
- `tokens` — Token metadata with prices
- `strategy_metadata` — Curated strategy info (APY, risk level, description)
- `positions` — Enriched position data with PnL
- `rebalancer_configs` — LP rebalancer settings
- `protocol_metrics_daily` — Historical protocol metrics
- `token_price_history` — Price history for charts

### Ponder Tables (On-chain)

- `lp_account` — LP smart accounts (ERC-4337)
- `strategy` — Registered SwapVM bytecode strategies
- `virtual_balance` — Core Aqua state: `balances[maker][app][strategyHash][token]`
- `swap_event` — Executed swaps
- `strategy_shipped_event` / `strategy_docked_event` — Strategy lifecycle
- `lz_packet_sent` / `lz_packet_received` — LayerZero cross-chain messages
- `stargate_oft_sent` / `stargate_oft_received` — Stargate token bridges
- `rebalance_operation` — Cross-chain rebalance tracking
- `daily_chain_metrics` / `maker_stats` / `strategy_stats` — Aggregated metrics

## Code Style Guidelines

### Route Pattern (Hono)

```typescript
// routes/strategies.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { strategyService } from "../services/strategy.service";
import { authMiddleware } from "../middleware/auth";

const strategies = new Hono();

// GET /api/v1/strategies
strategies.get("/", async (c) => {
  const { chain, type, featured } = c.req.query();

  const result = await strategyService.findAll({
    chain: chain as string | undefined,
    type: type as string | undefined,
    featured: featured === "true",
  });

  return c.json(result);
});

// GET /api/v1/strategies/:hash
strategies.get("/:hash", async (c) => {
  const hash = c.req.param("hash");

  const strategy = await strategyService.findByHash(hash);
  if (!strategy) {
    return c.json({ error: "Strategy not found" }, 404);
  }

  return c.json(strategy);
});

// Protected route example
strategies.post(
  "/",
  authMiddleware,
  zValidator("json", createStrategySchema),
  async (c) => {
    const data = c.req.valid("json");
    const result = await strategyService.create(data);
    return c.json(result, 201);
  },
);

export { strategies };
```

### Service Pattern

```typescript
// services/strategy.service.ts
import { supabase } from "../db/supabase";
import { ponderClient } from "../db/ponder";
import { redis } from "../db/redis";
import type { Strategy, StrategyFilters } from "../types/db";

class StrategyService {
  async findAll(filters: StrategyFilters): Promise<Strategy[]> {
    // Check cache first
    const cacheKey = `strategies:${JSON.stringify(filters)}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Get on-chain data from Ponder
    const onChainStrategies = await ponderClient.query(`
      SELECT * FROM strategy
      WHERE is_active = true
      ${filters.chain ? `AND chain_id = ${filters.chain}` : ""}
    `);

    // Enrich with off-chain metadata from Supabase
    const { data: metadata } = await supabase
      .from("strategy_metadata")
      .select("*")
      .in(
        "strategy_hash",
        onChainStrategies.map((s) => s.strategyHash),
      );

    const enriched = onChainStrategies.map((strategy) => ({
      ...strategy,
      metadata: metadata?.find(
        (m) => m.strategy_hash === strategy.strategyHash,
      ),
    }));

    await redis.set(cacheKey, JSON.stringify(enriched), "EX", 300);
    return enriched;
  }

  async findByHash(hash: string): Promise<Strategy | null> {
    // Get on-chain data
    const [onChain] = await ponderClient.query(
      `
      SELECT * FROM strategy WHERE strategy_hash = $1
    `,
      [hash],
    );

    if (!onChain) return null;

    // Get off-chain metadata
    const { data: metadata } = await supabase
      .from("strategy_metadata")
      .select("*")
      .eq("strategy_hash", hash)
      .single();

    return { ...onChain, metadata };
  }
}

export const strategyService = new StrategyService();
```

### Validation with Zod

```typescript
// types/schemas.ts
import { z } from "zod";

// Ethereum address validation
const ethereumAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

// Strategy hash validation (bytes32)
const strategyHash = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export const createUserSchema = z.object({
  walletAddress: ethereumAddress,
});

export const updatePreferencesSchema = z.object({
  defaultSlippageBps: z.number().min(1).max(5000).optional(),
  preferredChains: z.array(z.enum(["base", "arbitrum", "optimism"])).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  notificationsEnabled: z.boolean().optional(),
});

export const swapQuoteSchema = z.object({
  tokenIn: ethereumAddress,
  tokenOut: ethereumAddress,
  amountIn: z.string(), // BigInt as string
  chainId: z.number(),
  slippageBps: z.number().min(1).max(5000).optional(),
});
```

### Database Client Patterns

```typescript
// db/supabase.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

export const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

// Helper for authenticated queries (with RLS)
export const supabaseWithAuth = (walletAddress: string) => {
  const client = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );

  // Set the wallet address for RLS policies
  // This requires a custom RLS setup
  return client;
};
```

```typescript
// db/ponder.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const ponderConnection = postgres(process.env.PONDER_DATABASE_URL!);
export const ponderDb = drizzle(ponderConnection);

// Or use Ponder's GraphQL API
export const ponderClient = {
  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await ponderConnection.unsafe(sql, params);
    return result as T[];
  },
};
```

## Blockchain Integration

### RPC Client Pattern

```typescript
// rpc/chains/base.client.ts
import { Injectable } from "@nestjs/common";
import { createPublicClient, http, PublicClient } from "viem";
import { base } from "viem/chains";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class BaseRpcClient {
  private readonly client: PublicClient;

  constructor(config: ConfigService) {
    this.client = createPublicClient({
      chain: base,
      transport: http(config.get("BASE_RPC_URL")),
    });
  }

  async getBlockNumber(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  async readContract<T>(params: ReadContractParams): Promise<T> {
    return this.client.readContract(params) as T;
  }
}
```

### Cross-Chain Messaging

```typescript
// external/layerzero.client.ts
import { Injectable } from "@nestjs/common";

@Injectable()
export class LayerZeroClient {
  async sendMessage(params: {
    dstEid: number;
    message: string;
    options: MessageOptions;
  }): Promise<{ guid: string; txHash: string }> {
    // Implementation
  }

  async quoteFee(params: {
    dstEid: number;
    message: string;
    options: MessageOptions;
  }): Promise<bigint> {
    // Implementation
  }
}
```

## Ponder Indexer (packages/ponder-indexer)

The Ponder indexer tracks all on-chain events from Aqua contracts across multiple chains.

### Configuration

```typescript
// ponder.config.ts
import { createConfig, rateLimit } from "ponder";
import { http } from "viem";

export default createConfig({
  networks: {
    base: {
      chainId: 8453,
      transport: rateLimit(http(process.env.BASE_RPC_URL), {
        requestsPerSecond: 10,
      }),
    },
    arbitrum: {
      chainId: 42161,
      transport: rateLimit(http(process.env.ARBITRUM_RPC_URL), {
        requestsPerSecond: 10,
      }),
    },
  },
  contracts: {
    AquaRouter: {
      abi: AquaRouterAbi,
      network: {
        base: {
          address: "0x...",
          startBlock: 12345678,
        },
        arbitrum: {
          address: "0x...",
          startBlock: 12345678,
        },
      },
    },
    LayerZeroEndpoint: {
      abi: LayerZeroEndpointAbi,
      network: {
        base: { address: "0x..." },
        arbitrum: { address: "0x..." },
      },
    },
  },
});
```

### Event Handler Pattern

```typescript
// src/AquaRouter.ts
import { ponder } from "@/generated";

ponder.on("AquaRouter:SwapExecuted", async ({ event, context }) => {
  const { taker, maker, strategyHash, tokenIn, tokenOut, amountIn, amountOut } =
    event.args;

  // Insert swap event
  await context.db.swapEvent.create({
    data: {
      id: `${event.transaction.hash}-${event.log.logIndex}-${context.network.chainId}`,
      chainId: context.network.chainId,
      taker,
      maker,
      strategyHash,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      effectivePrice: (Number(amountOut) / Number(amountIn)).toString(),
      blockNumber: event.block.number,
      blockTimestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
      logIndex: event.log.logIndex,
    },
  });

  // Update daily metrics
  const date = new Date(Number(event.block.timestamp) * 1000)
    .toISOString()
    .split("T")[0];
  const metricsId = `${context.network.chainId}-${date}`;

  await context.db.dailyChainMetrics.upsert({
    id: metricsId,
    create: {
      chainId: context.network.chainId,
      date,
      swapCount: 1,
      totalVolumeIn: amountIn,
      totalVolumeOut: amountOut,
    },
    update: ({ current }) => ({
      swapCount: current.swapCount + 1,
      totalVolumeIn: current.totalVolumeIn + amountIn,
      totalVolumeOut: current.totalVolumeOut + amountOut,
    }),
  });
});

ponder.on("AquaRouter:StrategyShipped", async ({ event, context }) => {
  const { maker, app, strategyHash, tokens, amounts } = event.args;

  // Create or update virtual balances
  for (let i = 0; i < tokens.length; i++) {
    await context.db.virtualBalance.upsert({
      id: {
        maker,
        app,
        strategyHash,
        token: tokens[i],
        chainId: context.network.chainId,
      },
      create: {
        maker,
        app,
        strategyHash,
        token: tokens[i],
        chainId: context.network.chainId,
        balance: amounts[i],
        lastUpdatedBlock: event.block.number,
        lastUpdatedTimestamp: event.block.timestamp,
      },
      update: ({ current }) => ({
        balance: current.balance + amounts[i],
        lastUpdatedBlock: event.block.number,
        lastUpdatedTimestamp: event.block.timestamp,
      }),
    });
  }
});
```

### Cross-Chain Event Correlation

```typescript
// src/LayerZero.ts
ponder.on("LayerZeroEndpoint:PacketSent", async ({ event, context }) => {
  const { guid, dstEid, sender, nonce, payloadHash } = event.args;

  await context.db.lzPacketSent.create({
    data: {
      guid,
      srcChainId: context.network.chainId,
      dstEid: Number(dstEid),
      dstChainId: eidToChainId(Number(dstEid)),
      sender,
      nonce,
      payloadHash,
      blockNumber: event.block.number,
      blockTimestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
    },
  });

  // Create pending rebalance operation
  await context.db.rebalanceOperation.create({
    data: {
      id: guid,
      maker: sender,
      srcChainId: context.network.chainId,
      dstChainId: eidToChainId(Number(dstEid)),
      status: "pending",
      lzSentGuid: guid,
      initiatedAt: event.block.timestamp,
      srcTxHash: event.transaction.hash,
    },
  });
});

ponder.on("LayerZeroEndpoint:PacketReceived", async ({ event, context }) => {
  const { guid, srcEid, receiver } = event.args;

  // Update rebalance operation status
  await context.db.rebalanceOperation.update({
    id: guid,
    data: {
      status: "bridging",
      lzReceivedId: `${event.transaction.hash}-${event.log.logIndex}`,
    },
  });
});
```

## Rebalancer Service

### Utilization Monitoring

```typescript
// rebalancer/monitor.service.ts
@Injectable()
export class MonitorService {
  private readonly CHECK_INTERVAL = 30_000; // 30 seconds

  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkUtilization() {
    const accounts = await this.getLPAccountsWithAuthorization();

    for (const account of accounts) {
      const utilization = await this.calculateUtilization(account);

      if (this.needsRebalancing(utilization)) {
        await this.rebalancerService.triggerRebalance({
          lpAccount: account.address,
          sourceChain: utilization.highestChain,
          destChain: utilization.lowestChain,
          amount: this.calculateRebalanceAmount(utilization),
        });
      }
    }
  }
}
```

### ERC-4337 Bundling

```typescript
// rebalancer/bundler.service.ts
@Injectable()
export class BundlerService {
  async buildUserOp(operation: RebalanceOperation): Promise<UserOperation> {
    const callData = this.encodeRebalanceCall(operation);

    return {
      sender: operation.lpAccount,
      nonce: await this.getNonce(operation.lpAccount),
      initCode: "0x",
      callData,
      callGasLimit: 500_000n,
      verificationGasLimit: 100_000n,
      preVerificationGas: 50_000n,
      maxFeePerGas: await this.getMaxFeePerGas(),
      maxPriorityFeePerGas: await this.getMaxPriorityFeePerGas(),
      paymasterAndData: await this.getPaymasterData(operation),
      signature: "0x", // Will be filled by Bundler
    };
  }

  async submitBundle(userOps: UserOperation[]): Promise<string> {
    return this.bundlerClient.eth_sendUserOperation(userOps);
  }
}
```

## Error Handling

### Custom Exceptions

```typescript
// common/exceptions/blockchain.exception.ts
import { HttpException, HttpStatus } from "@nestjs/common";

export class InsufficientBalanceException extends HttpException {
  constructor(token: string, required: bigint, available: bigint) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: "InsufficientBalance",
        message: `Insufficient ${token} balance`,
        required: required.toString(),
        available: available.toString(),
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class ChainNotSupportedException extends HttpException {
  constructor(chainId: number) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: "ChainNotSupported",
        message: `Chain ${chainId} is not supported`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
```

### Global Exception Filter

```typescript
// common/filters/http-exception.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : "Internal server error";

    this.logger.error(exception);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      ...(typeof message === "object" ? message : { message }),
    });
  }
}
```

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
BASE_RPC_URL=https://...
JWT_SECRET=...

# Rebalancer
REBALANCER_PRIVATE_KEY=0x...
BUNDLER_URL=https://...
PAYMASTER_URL=https://...

# External
PONDER_API_URL=http://...
LAYERZERO_ENDPOINT=0x...
STARGATE_ROUTER=0x...
```

## Testing Best Practices (Required)

### Test-Driven Development (TDD)

**Default to writing tests first** for any meaningful feature or bug fix:

1. **Write the test** — Define expected behavior (inputs, outputs, failure modes)
2. **Watch it fail** — Confirm the test fails for the right reason
3. **Implement the code** — Write minimal code to make the test pass
4. **Refactor** — Clean up while keeping tests green

### When to Write Tests

| Change Type          | Required Tests                                  |
| -------------------- | ----------------------------------------------- |
| New endpoint         | Unit test for service + E2E test for controller |
| New service method   | Unit test with mocked dependencies              |
| Bug fix              | Regression test that reproduces the bug         |
| Business logic       | Unit tests covering happy path + edge cases     |
| External integration | Integration test with mocked external service   |

### TDD Workflow Example

```typescript
// 1. FIRST: Write the failing test
describe("SwapService", () => {
  describe("getQuote", () => {
    it("should return quote with calculated output amount", async () => {
      const quote = await service.getQuote({
        tokenIn: "0xUSDC",
        tokenOut: "0xETH",
        amountIn: "1000000000", // 1000 USDC
      });

      expect(quote.amountOut).toBeDefined();
      expect(quote.priceImpact).toBeLessThan(5);
    });

    it("should throw InsufficientLiquidityException when pool is empty", async () => {
      await expect(
        service.getQuote({
          tokenIn: "0xUSDC",
          tokenOut: "0xRARE",
          amountIn: "1000",
        }),
      ).rejects.toThrow(InsufficientLiquidityException);
    });
  });
});

// 2. THEN: Implement the service to make tests pass
// 3. FINALLY: Refactor while keeping tests green
```

### Coverage Requirements

- **Services**: Aim for >80% coverage on business logic
- **Controllers**: E2E tests for all public endpoints
- **Repositories**: Integration tests for complex queries
- **Critical paths** (auth, payments, rebalancing): 100% coverage

## Testing Patterns

### Unit Test (Bun)

```typescript
// services/strategy.service.test.ts
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { strategyService } from "./strategy.service";

// Mock the database clients
mock.module("../db/supabase", () => ({
  supabase: {
    from: mock(() => ({
      select: mock(() => ({
        eq: mock(() => ({
          single: mock(() => Promise.resolve({ data: mockMetadata })),
        })),
        in: mock(() => Promise.resolve({ data: [mockMetadata] })),
      })),
    })),
  },
}));

mock.module("../db/ponder", () => ({
  ponderClient: {
    query: mock(() => Promise.resolve([mockStrategy])),
  },
}));

const mockStrategy = {
  strategyHash: "0x1234...",
  app: "0xapp...",
  tokenIn: "0xUSDC...",
  tokenOut: "0xUSDT...",
  isActive: true,
};

const mockMetadata = {
  strategy_hash: "0x1234...",
  display_name: "USDC/USDT Stableswap",
  apy_24h: 5.5,
};

describe("StrategyService", () => {
  describe("findByHash", () => {
    it("should return strategy with metadata when found", async () => {
      const result = await strategyService.findByHash("0x1234...");

      expect(result).toBeDefined();
      expect(result?.strategyHash).toBe("0x1234...");
      expect(result?.metadata?.display_name).toBe("USDC/USDT Stableswap");
    });

    it("should return null when strategy not found", async () => {
      // Mock empty response
      mock.module("../db/ponder", () => ({
        ponderClient: {
          query: mock(() => Promise.resolve([])),
        },
      }));

      const result = await strategyService.findByHash("0xnonexistent");
      expect(result).toBeNull();
    });
  });
});
```

### E2E Test (Bun + Hono)

```typescript
// routes/strategies.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../index";

describe("Strategies API (e2e)", () => {
  describe("GET /api/v1/strategies", () => {
    it("should return list of strategies", async () => {
      const res = await app.request("/api/v1/strategies");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("should filter by chain", async () => {
      const res = await app.request("/api/v1/strategies?chain=base");

      expect(res.status).toBe(200);

      const body = await res.json();
      body.forEach((strategy: any) => {
        expect(strategy.chainId).toBe(8453); // Base chain ID
      });
    });
  });

  describe("GET /api/v1/strategies/:hash", () => {
    it("should return 404 for non-existent strategy", async () => {
      const res = await app.request("/api/v1/strategies/0xinvalid");
      expect(res.status).toBe(404);
    });
  });
});
```

### Ponder Indexer Tests

```typescript
// packages/ponder-indexer/src/AquaRouter.test.ts
import { describe, it, expect } from "bun:test";
import { ponder } from "@/generated";

describe("AquaRouter Event Handlers", () => {
  it("should correctly parse SwapExecuted event", async () => {
    const mockEvent = {
      args: {
        taker: "0xtaker...",
        maker: "0xmaker...",
        strategyHash: "0xstrategy...",
        tokenIn: "0xUSDC...",
        tokenOut: "0xUSDT...",
        amountIn: 1000000n,
        amountOut: 999500n,
      },
      block: { number: 12345n, timestamp: 1700000000n },
      transaction: { hash: "0xtx..." },
      log: { logIndex: 0 },
    };

    // Test the handler logic
    const effectivePrice = (
      Number(mockEvent.args.amountOut) / Number(mockEvent.args.amountIn)
    ).toString();

    expect(effectivePrice).toBe("0.9995");
  });
});
```

## Security Best Practices

### Input Validation

- Always use DTOs with class-validator decorators
- Validate blockchain addresses with custom decorators
- Sanitize user inputs before database queries

### Authentication

- JWT tokens with short expiration (15 min)
- Refresh tokens stored in httpOnly cookies
- Wallet signature verification for sensitive operations

### Rate Limiting

```typescript
// Apply to sensitive endpoints
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Post('swap/quote')
async getQuote(@Body() dto: QuoteDto) {
  // ...
}
```

### Secrets Management

- Never commit secrets to git
- Use environment variables
- Rotate keys regularly
- Use separate keys for dev/staging/prod

## Checklist Before PR

### General

- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] **Tests written first** (TDD) for new features/fixes
- [ ] New features have corresponding unit tests
- [ ] Bug fixes include regression tests

### API Package (packages/api)

- [ ] Routes have proper Zod validation schemas
- [ ] New endpoints return correct HTTP status codes
- [ ] Error cases are handled gracefully with consistent error format
- [ ] Sensitive operations have auth middleware
- [ ] Database queries are optimized
- [ ] Caching is implemented where appropriate (Redis)
- [ ] OpenAPI spec is updated for new endpoints

### Ponder Indexer (packages/ponder-indexer)

- [ ] Event handlers are idempotent (safe to replay)
- [ ] All relevant events are indexed
- [ ] Cross-chain event correlation is handled
- [ ] Aggregated metrics are updated correctly
- [ ] Schema changes are backwards compatible
- [ ] New events are documented in `ponder_events.md`

### Schema Changes

- [ ] Supabase migrations created for schema changes
- [ ] `supabase_schema.sql` updated
- [ ] `supabase_erd.mermaid` updated
- [ ] `ponder_schema.ts` updated (if on-chain schema changes)
- [ ] `ponder_erd.mermaid` updated
- [ ] RLS policies added for new tables

## Related Files

- `README.md` — Full documentation
- `../contracts/` — Smart contracts
- `../web-app/` — Frontend
