# LiquidShield — Cross-Chain Liquidation Defense Hook

> **Never get liquidated again.**

LiquidShield is a cross-chain liquidation defense hook for Uniswap v4 deployed on Unichain. DeFi borrowers lose billions annually to liquidation penalties (5-15%) during market downturns. LiquidShield monitors lending positions across Arbitrum, Base, Optimism, and Ethereum via Reactive Network's RSCs, and executes preemptive defense strategies through a Uniswap v4 pool before liquidation occurs.

**Hackathon:** UHI8 Hookathon | February-March 2026

---

## The Problem

- Over $2B in DeFi positions were liquidated in 2024 alone
- Users lose 5-15% in penalties to liquidation bots and MEV searchers
- Current solutions are manual: watch your health factor, set price alerts, scramble to add collateral
- No automated, non-custodial defense layer exists that works across chains

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  1. User registers lending position (Aave/Morpho) with hook    │
│  2. Reactive Network RSC monitors health factor across chains  │
│  3. When health drops below threshold:                         │
│     → RSC triggers hook on Unichain                            │
│     → Hook burns ERC-6909 claims, extracts defense capital     │
│     → Hook emits ERC-7683 cross-chain intent                   │
│     → Filler delivers collateral to lending position           │
│     → Position health restored. User saved.                    │
│  4. LPs earn triple yield: swap fees + premiums + defense fees │
└─────────────────────────────────────────────────────────────────┘
```

### Defense Strategies

| Strategy | Use Case | Mechanic |
|---|---|---|
| **Collateral Top-Up** | Moderate health decline (1.5x → 1.25x) | Hook extracts WETH/USDC from reserve, sends to lending position via cross-chain intent |
| **Batched Gradual Unwind** | Severe health decline approaching 1.0x | Hook emits N sequential ERC-7683 intents, progressively unwinding the position with minimal price impact |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        UNICHAIN SEPOLIA                              │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │ LiquidShieldHook│──│LiquidShieldRouter│  │LiquidShieldSettler │  │
│  │ (Core v4 Hook)  │  │ (User Interface) │  │  (ERC-7683)        │  │
│  └────────┬────────┘  └──────────────────┘  └────────┬───────────┘  │
│           │                                           │              │
│  ┌────────┴────────┐                                  │              │
│  │  PoolManager    │     USDC/WETH Pool               │              │
│  │  (ERC-6909      │     + Defense Reserve             │              │
│  │   Claims)       │                                  │              │
│  └─────────────────┘                                  │              │
└───────────────────────────────────────────────────────┼──────────────┘
                                                        │
        ┌───────────────────────┐                       │
        │   REACTIVE NETWORK    │                       │
        │  PositionMonitor.sol  │──── native callback ──┘
        │  (RSC: monitors HFs)  │
        └───────────┬───────────┘
                    │ subscribes to events
        ┌───────────┴──────────────────────────────────────┐
        │                                                  │
┌───────┴──────────┐                          ┌────────────┴──────────┐
│ ARBITRUM SEPOLIA │                          │  ETHEREUM SEPOLIA     │
│                  │                          │                       │
│ DefenseExecutor  │                          │  DefenseExecutor      │
│ AaveV3Adapter    │                          │  MorphoBlueAdapter    │
│ Aave V3 Pool     │                          │  Morpho Blue          │
└──────────────────┘                          └───────────────────────┘
```

## Core Contracts

| Contract | Chain | Purpose |
|---|---|---|
| `LiquidShieldHook.sol` | Unichain Sepolia | Core v4 hook. ERC-6909 defense reserve, `triggerDefense()`, dynamic fees, premium collection |
| `LiquidShieldRouter.sol` | Unichain Sepolia | User-facing: registration, premium payments, position management |
| `LiquidShieldSettler.sol` | Unichain Sepolia | ERC-7683 `IOriginSettler` implementation for cross-chain intent emission |
| `PositionMonitor.sol` | Reactive Network (Kopli) | RSC: cross-chain health factor monitoring with native callbacks |
| `DefenseExecutor.sol` | Arbitrum + Ethereum Sepolia | Executes defense on source chains via lending adapter routing |
| `AaveV3Adapter.sol` | Arbitrum Sepolia | Aave V3 implementation of `ILendingAdapter` |
| `MorphoBlueAdapter.sol` | Ethereum Sepolia | Morpho Blue implementation of `ILendingAdapter` |

## V4 Hook Innovation

The hook manages a **defense reserve via v4's ERC-6909 accounting system**, funded by user premiums. When defense triggers, the hook atomically burns ERC-6909 claims + extracts tokens within a single `unlock` callback (all deltas resolve to zero). LPs earn premium yield via `poolManager.donate()`.

**Hook permissions:**
- `afterAddLiquidity` — Track LPs for premium distribution
- `afterRemoveLiquidity` — Update LP tracking
- `beforeSwap` — Defense-aware dynamic fees (higher fees when reserve utilization is high)

**LP Triple Yield:**
1. Swap fees (standard AMM)
2. Premium donations (via `donate()` from user premiums)
3. Defense fee donations (via `donate()` after successful defense, 1.5% of defense amount)

## Partner Integrations

### Reactive Network
- **`packages/contracts/src/rsc/PositionMonitor.sol`** — Reactive Smart Contract for cross-chain health factor monitoring
- Subscribes to Aave V3 and Morpho Blue lending protocol events across Arbitrum and Ethereum
- Native callback mechanism triggers `triggerDefense()` on the hook when health drops below threshold

### Unichain (Flashblocks + TEE)
- **`packages/contracts/src/hooks/LiquidShieldHook.sol`** — Core hook leveraging Unichain's 200ms Flashblocks for sub-second defense response
- TEE-based block building prevents MEV front-running of defense transactions
- Detection-to-defense-confirmation: ~400ms (vs 12-24s on Ethereum L1)

### ERC-7683 (Cross-Chain Intents)
- **`packages/contracts/src/settler/LiquidShieldSettler.sol`** — Full `IOriginSettler` implementation
- **`packages/filler/src/`** — Intent watcher, source-chain executor, Unichain settlement

### Lending Protocol Adapters
- **`packages/contracts/src/adapters/ILendingAdapter.sol`** — Protocol-agnostic interface
- **`packages/contracts/src/adapters/AaveV3Adapter.sol`** — Aave V3 (collateral top-up defense)
- **`packages/contracts/src/adapters/MorphoBlueAdapter.sol`** — Morpho Blue (batched gradual unwind)

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (Solidity toolchain)
- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8

### Installation

```bash
git clone https://github.com/0xYudhishthra/liquidshield.git
cd liquidshield
pnpm install
```

### Build & Test

```bash
# Smart contracts
cd packages/contracts
forge build
forge test -vvv

# Frontend
pnpm --filter frontend dev

# Backend
pnpm --filter backend dev

# Filler service
pnpm --filter filler dev
```

### Deploy

```bash
# Deploy hook to Unichain Sepolia
cd packages/contracts
forge script script/DeployHook.s.sol --broadcast --rpc-url unichain-sepolia

# Deploy executor + adapters to source chains
forge script script/DeployExecutor.s.sol --broadcast --rpc-url arbitrum-sepolia
forge script script/DeployExecutor.s.sol --broadcast --rpc-url ethereum-sepolia
```

## Testing

```bash
cd packages/contracts

# Unit tests
forge test --match-path "test/*.t.sol" -vvv

# Integration tests (full defense flow)
forge test --match-path "test/integration/*.t.sol" -vvv

# Coverage
forge coverage
```

## Demo Video

[Link to demo video — under 5 minutes]

### Demo Flow
1. **Scene A (Aave V3):** WETH-collateralized position on Arbitrum Sepolia → health drops → collateral top-up defense → health restored
2. **Scene B (Morpho Blue):** USDC-collateralized position on Ethereum Sepolia → severe health drop → batched gradual unwind → position safely unwound

**One hook. One pool. Two protocols. Two strategies. Two chains. Every delta resolves to zero.**

## Why Unichain?

| Capability | LiquidShield Usage |
|---|---|
| **Flashblocks (200ms)** | Sub-second defense execution — difference between saving and losing a position |
| **TEE Block Building** | Prevents MEV bots from front-running defense to liquidate first |
| **ERC-7683 Intents** | Native cross-chain settlement — pool assets become source-chain collateral |
| **v4 Hooks** | Core defense logic — hook manages reserve via v4-native ERC-6909 accounting |

## Team

Built by Yudhishthra & Team for UHI8 Hookathon 2026.

## License

MIT
