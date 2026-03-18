# Aqua0 Backend

The API server and backend services for the Aqua0 cross-chain shared liquidity protocol. Built with **NestJS/Hono** (TypeScript) for high performance and type safety.

## Overview

The backend provides:

1. **REST API** — Endpoints for strategies, positions, swaps, and analytics
2. **WebSocket Server** — Real-time updates for swap status and position changes
3. **Rebalancing Service** — Monitors liquidity utilization and triggers cross-chain rebalancing
4. **Indexer Integration** — Syncs on-chain events via Ponder.sh

## Technology Stack

| Layer       | Technology            | Purpose                             |
| ----------- | --------------------- | ----------------------------------- |
| Framework   | NestJS or Hono        | API server, dependency injection    |
| Runtime     | Bun                   | JavaScript runtime, package manager |
| Language    | TypeScript 5          | Type safety                         |
| Database    | PostgreSQL (Supabase) | Primary data store                  |
| Cache       | Redis                 | Session & query caching             |
| Indexer     | Ponder.sh             | Blockchain event indexing           |
| RPC         | viem / ethers.js      | Blockchain interaction              |
| Cross-Chain | LayerZero SDK         | Message coordination                |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (package manager and runtime)
- PostgreSQL (via Supabase)
- Redis

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env

# Run database migrations
bun run db:migrate

# Start development server
bun run dev

# Start production server
bun run start:prod

# Run tests
bun test
```

## Project Structure

```
backend/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   │
│   ├── strategies/             # Strategy management
│   │   ├── strategies.controller.ts
│   │   ├── strategies.service.ts
│   │   ├── strategies.repository.ts
│   │   └── dto/
│   │
│   ├── positions/              # LP position management
│   │   ├── positions.controller.ts
│   │   ├── positions.service.ts
│   │   └── positions.repository.ts
│   │
│   ├── swap/                   # Swap routing and execution
│   │   ├── swap.controller.ts
│   │   ├── swap.service.ts
│   │   ├── quote.service.ts
│   │   └── route.service.ts
│   │
│   ├── analytics/              # Protocol metrics
│   │   ├── analytics.controller.ts
│   │   └── analytics.service.ts
│   │
│   ├── rebalancer/             # Cross-chain rebalancing
│   │   ├── rebalancer.service.ts
│   │   ├── monitor.service.ts
│   │   └── bundler.service.ts
│   │
│   ├── auth/                   # Authentication
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── guards/
│   │
│   ├── websocket/              # Real-time updates
│   │   ├── websocket.gateway.ts
│   │   └── events/
│   │
│   ├── rpc/                    # Blockchain RPC clients
│   │   ├── rpc.service.ts
│   │   └── chains/
│   │
│   ├── external/               # External integrations
│   │   ├── layerzero.client.ts
│   │   ├── stargate.client.ts
│   │   └── ponder.client.ts
│   │
│   ├── database/               # Database configuration
│   │   ├── database.module.ts
│   │   └── migrations/
│   │
│   └── common/                 # Shared utilities
│       ├── dto/
│       ├── filters/
│       ├── guards/
│       ├── interceptors/
│       └── utils/
│
├── test/                       # Test files
├── prisma/                     # Prisma schema (if using)
│   └── schema.prisma
├── .env.example                # Environment template
├── package.json
└── tsconfig.json
```

## API Endpoints (v1)

### Health & Status

| Endpoint         | Method | Description                    | Auth |
| ---------------- | ------ | ------------------------------ | ---- |
| `/health`        | GET    | Liveness check                 | No   |
| `/ready`         | GET    | Readiness check (DB + indexer) | No   |
| `/api/v1/chains` | GET    | Supported chains list          | No   |

### Strategies

In v1, strategies and their metadata are read-only from the API (no on-chain strategy
build/simulate flows are exposed here yet).

| Endpoint                         | Method | Description              | Auth |
| -------------------------------- | ------ | ------------------------ | ---- |
| `/api/v1/strategies`            | GET    | List all strategies      | No   |
| `/api/v1/strategies/featured`   | GET    | List featured strategies | No   |
| `/api/v1/strategies/:hash`      | GET    | Get strategy details     | No   |
| `/api/v1/strategies/:hash/stats`| GET    | Get strategy statistics  | No   |

### Positions (LP side)

Positions are always derived from LP smart accounts on a **single chain**; cross-chain
movement of LP capital is handled by the rebalancer/LayerZero, not by trader intents.

| Endpoint                             | Method | Description                        | Auth |
| ------------------------------------ | ------ | ---------------------------------- | ---- |
| `/api/v1/positions/:wallet`         | GET    | LP positions for wallet            | No   |
| `/api/v1/positions/:wallet/summary` | GET    | Aggregated LP stats for wallet     | No   |
| `/api/v1/positions/:wallet/history` | GET    | Historical LP events (swaps, etc.) | No   |

### Swaps (trader side)

For v1, **swaps are executed on a specific chain only**. There is **no intent-based,
cross-chain swap flow** yet. LayerZero is only used to move LP liquidity between
their smart accounts on different chains; trader swaps are standard single-chain
router calls against available virtual liquidity on that chain.

| Endpoint                           | Method | Description                         | Auth |
| ---------------------------------- | ------ | ----------------------------------- | ---- |
| `/api/v1/swaps/quote`             | POST   | Get a (currently mocked) swap quote | No   |
| `/api/v1/swaps/history/:wallet`   | GET    | User's swap history (by taker)      | No   |
| `/api/v1/swaps/recent`            | GET    | Recent swaps across the protocol    | No   |
| `/api/v1/swaps/:id`               | GET    | Swap details by ID                  | No   |
| `/api/v1/swaps/by-strategy/:hash` | GET    | Swaps for a given strategy          | No   |

### Analytics / Metrics

| Endpoint                  | Method | Description                          | Auth |
| ------------------------- | ------ | ------------------------------------ | ---- |
| `/api/v1/metrics`        | GET    | High-level protocol metrics          | No   |
| `/api/v1/metrics/tvl`    | GET    | TVL metrics and top strategies       | No   |
| `/api/v1/metrics/volume` | GET    | Volume metrics and history           | No   |
| `/api/v1/metrics/fees`   | GET    | Protocol and LP fee metrics          | No   |

### Tokens

| Endpoint                      | Method | Description                 | Auth |
| ----------------------------- | ------ | --------------------------- | ---- |
| `/api/v1/tokens`             | GET    | List supported tokens       | No   |
| `/api/v1/tokens/:address`    | GET    | Get token by address/chain  | No   |
| `/api/v1/tokens/stablecoins` | GET    | List stablecoins by chain   | No   |

### Rebalancer (LP capital movement)

The rebalancer is responsible for moving **LP capital** between chains via LayerZero/
Stargate. It does **not** execute user swaps or intents; it only funds LP smart accounts
on other chains so that local, single-chain swaps can be served there.

| Endpoint                                    | Method | Description                           | Auth |
| ------------------------------------------- | ------ | ------------------------------------- | ---- |
| `/api/v1/rebalancer/:wallet`               | GET    | Rebalancer config for a wallet's LPs  | No   |
| `/api/v1/rebalancer/:lpAccount`            | PUT    | Update config for an LP smart account | Yes  |
| `/api/v1/rebalancer/:lpAccount/operations` | GET    | Rebalance history for LP account      | No   |
| `/api/v1/rebalancer/:lpAccount/pending`    | GET    | Pending rebalances for LP account     | No   |

## Configuration

### Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development

# Database (Supabase)
DATABASE_URL=postgresql://user:pass@host:5432/aqua0
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Redis
REDIS_URL=redis://localhost:6379

# Blockchain RPC
BASE_RPC_URL=https://mainnet.base.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
ETHEREUM_RPC_URL=https://eth.llamarpc.com

# Indexer (Ponder)
PONDER_API_URL=http://localhost:42069

# Cross-Chain
LAYERZERO_ENDPOINT=0x...
STARGATE_ROUTER=0x...

# Auth
JWT_SECRET=your-jwt-secret
WORLDID_APP_ID=your-worldid-app-id

# Rebalancer
REBALANCER_PRIVATE_KEY=0x... # For signing UserOps
BUNDLER_URL=https://bundler.example.com
PAYMASTER_URL=https://paymaster.example.com
```

## Core Services

### Strategy Service

Manages strategy configurations and SwapVM bytecode generation:

```typescript
interface StrategyService {
  findAll(filters?: StrategyFilters): Promise<Strategy[]>;
  findById(id: string): Promise<Strategy>;
  buildProgram(params: BuildParams): Promise<SwapVMProgram>;
  simulate(id: string, params: SimulateParams): Promise<SimulationResult>;
}
```

### Position Service

Tracks LP positions and earnings:

```typescript
interface PositionService {
  findByOwner(address: string): Promise<Position[]>;
  create(data: CreatePositionDto): Promise<Position>;
  syncFromChain(lpAccount: string): Promise<void>;
  calculateEarnings(positionId: string): Promise<Earnings>;
}
```

### Swap Service

Handles swap quoting and routing:

```typescript
interface SwapService {
  getQuote(params: QuoteParams): Promise<SwapQuote>;
  getOptimalRoute(params: RouteParams): Promise<SwapRoute>;
  trackStatus(swapId: string): Promise<SwapStatus>;
}
```

### Rebalancer Service

Monitors and executes cross-chain rebalancing:

```typescript
interface RebalancerService {
  monitorUtilization(): Promise<void>;
  triggerRebalance(params: RebalanceParams): Promise<RebalanceOperation>;
  buildUserOp(operation: RebalanceOperation): Promise<UserOperation>;
  submitBundle(userOps: UserOperation[]): Promise<string>;
}
```

## Database Schema

See `../uploads/supabase_erd.mermaid` for the complete schema. Key tables:

- `users` — User accounts with wallet addresses
- `user_preferences` — User settings
- `strategy_metadata` — Strategy display info and computed metrics
- `positions` — LP positions with P&L tracking
- `rebalancer_configs` — Per-LP rebalancing settings
- `protocol_metrics_daily` — Aggregated protocol stats
- `tokens` — Token metadata with prices

## Indexer Integration

The backend syncs with Ponder.sh indexer for on-chain data:

```typescript
// Indexed tables (from Ponder)
-lp_account -
  strategy -
  virtual_balance -
  swap_event -
  strategy_shipped_event -
  strategy_docked_event -
  rebalance_operation -
  daily_chain_metrics;
```

See `../uploads/ponder_erd.mermaid` for the complete indexer schema.

## Authentication

Two authentication modes:

1. **WorldID (Mini App)** — Sybil-resistant verification
2. **Wallet Signature (Web App)** — Standard wallet connection

```typescript
// JWT payload
interface JwtPayload {
  sub: string; // User ID
  walletAddress: string;
  worldIdVerified: boolean;
  iat: number;
  exp: number;
}
```

## WebSocket Events

Real-time updates via WebSocket:

```typescript
// Client → Server
'subscribe:position' { positionId: string }
'subscribe:swap' { swapId: string }

// Server → Client
'position:updated' { position: Position }
'swap:status' { swapId: string, status: SwapStatus }
'rebalance:started' { operationId: string }
'rebalance:completed' { operationId: string }
```

## Testing

```bash
# Unit tests
bun test

# E2E tests
bun test:e2e

# Test coverage
bun test --coverage

# Test with watch
bun test --watch
```

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

### Environment Checklist

- [ ] Database migrations applied
- [ ] Redis connection verified
- [ ] RPC endpoints healthy
- [ ] Ponder indexer synced
- [ ] Bundler/Paymaster configured
- [ ] Secrets properly set

## Related Documentation

- `CLAUDE.md` — AI assistant context
- `AGENTS.md` — AI workflow guidelines
- `../contracts/README.md` — Smart contract documentation
- `../web-app/README.md` — Frontend documentation
