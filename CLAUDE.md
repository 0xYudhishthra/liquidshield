# LiquidShield — Development Guide

## Project Overview

LiquidShield is a **cross-chain liquidation defense hook** for Uniswap v4 on Unichain. It monitors DeFi lending positions across Arbitrum, Base, Optimism, and Ethereum via Reactive Network's RSCs, and executes preemptive defense strategies through a Uniswap v4 pool before liquidation occurs.

**One-liner:** "Never get liquidated again."

**Target:** UHI8 Hookathon — Uniswap Foundation ($20K) + Unichain ($10K) + Reactive Network ($5K)

## Architecture Decisions (Finalized)

| Decision | Choice | Rationale |
|---|---|---|
| Defense capital | ERC-6909 claims on hook | v4 flash accounting requires all deltas resolve to zero in single `unlock`. Hook accumulates claims via premiums, burns + takes atomically during defense. |
| LP premium distribution | `poolManager.donate()` | Native v4 mechanism, distributes to in-range LPs proportionally. No custom tracking needed. |
| Gradual unwind | Batched ERC-7683 intents | NOT TWAMM. Each unwind step is a discrete cross-chain intent cycle. Flashblock advantage is Unichain-side accounting speed. |
| RSC → Hook trigger | Native RSC callback | Reactive Network natively sends transactions to destination chains. RSC detects on source chain, triggers callback directly on Unichain. |
| User delegation | Approval-based (EIP-7702 fallback) | Users pre-approve DefenseExecutor to act on their behalf. EIP-7702 is the production target but approval-based works on all testnets today. |
| Cross-chain intents | Full ERC-7683 spec | Implement IOriginSettler with proper GaslessCrossChainOrder struct, open/fill/resolve flow. |
| Premium payments | Upfront lump sum | User pays X months of premium during registration. `premiumPaidUntil = block.timestamp + paidMonths`. |
| Contract separation | Router + Settler separate | LiquidShieldRouter handles user interactions. LiquidShieldSettler implements IOriginSettler. Hook is the core orchestrator. |
| Testnet tokens | Real testnet tokens | Use actual WETH/USDC from testnet faucets. |
| Dynamic fees | Defense-aware | `beforeSwap` increases fees when defense reserve utilization is high, decreases when reserves are healthy. Ties fee logic to hook's core purpose. |

## Monorepo Structure

```
liquidshield/
├── CLAUDE.md                       # This file — development guide
├── README.md                       # Submission README
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml
├── .gitignore
├── .env.example
│
├── packages/
│   ├── contracts/                  # Foundry project — ALL Solidity
│   │   ├── foundry.toml
│   │   ├── src/
│   │   │   ├── hooks/
│   │   │   │   └── LiquidShieldHook.sol       # Core v4 hook
│   │   │   ├── router/
│   │   │   │   └── LiquidShieldRouter.sol     # User-facing interactions
│   │   │   ├── settler/
│   │   │   │   └── LiquidShieldSettler.sol    # ERC-7683 IOriginSettler
│   │   │   ├── rsc/
│   │   │   │   └── PositionMonitor.sol        # Reactive Network RSC
│   │   │   ├── executor/
│   │   │   │   └── DefenseExecutor.sol        # Source-chain executor
│   │   │   ├── adapters/
│   │   │   │   ├── ILendingAdapter.sol
│   │   │   │   ├── AaveV3Adapter.sol
│   │   │   │   └── MorphoBlueAdapter.sol
│   │   │   └── interfaces/
│   │   │       ├── ILiquidShieldHook.sol
│   │   │       └── IDefenseExecutor.sol
│   │   ├── test/
│   │   │   ├── LiquidShieldHook.t.sol
│   │   │   ├── DefenseExecutor.t.sol
│   │   │   ├── adapters/
│   │   │   │   ├── AaveV3Adapter.t.sol
│   │   │   │   └── MorphoBlueAdapter.t.sol
│   │   │   └── integration/
│   │   │       ├── AaveDefenseFlow.t.sol
│   │   │       └── MorphoDefenseFlow.t.sol
│   │   └── script/
│   │       ├── DeployHook.s.sol
│   │       ├── DeployExecutor.s.sol
│   │       └── RegisterPosition.s.sol
│   │
│   ├── frontend/                   # Next.js 14 App Router
│   │   ├── package.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx               # Landing / Dashboard
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── landing/               # Hero, HowItWorks, StatsBanner, TechStrip
│   │   │   ├── dashboard/             # ProtectedPositions, DefenseHistory, LPSection, RegisterModal
│   │   │   └── shared/                # HealthFactorBadge, ChainBadge, ProtocolLogo
│   │   ├── hooks/                     # usePositions, useHealthFactor, useDefenseHistory
│   │   └── lib/                       # api.ts, contracts.ts, chains.ts
│   │
│   ├── backend/                    # Hono API server
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/                # positions, health, defenses, lp, webhooks
│   │   │   ├── services/              # aave.service, morpho.service, position-aggregator
│   │   │   └── graphql/               # aave-queries, morpho-queries
│   │   └── wrangler.toml
│   │
│   ├── filler/                     # Intent filler service
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── watcher.ts            # Watch ERC-7683 intents
│   │       ├── executor.ts           # Fill on source chain
│   │       ├── settlement.ts         # Settle back on Unichain
│   │       └── strategies/
│   │
│   └── shared/                     # Shared types, constants, ABIs
│       ├── package.json
│       └── src/
│           ├── types.ts
│           ├── constants.ts
│           └── abis/
```

## Tech Stack

| Layer | Technology |
|---|---|
| Package Manager | pnpm with workspaces |
| Smart Contracts | Foundry (Solidity ^0.8.24) |
| Frontend | Next.js 14 (App Router), wagmi v2, viem, Tailwind CSS |
| Backend | Hono (TypeScript) |
| Filler | Node.js + viem |
| GraphQL | graphql-request |
| Wallet | wagmi v2 + RainbowKit |

## Core Contracts

### LiquidShieldHook.sol (Unichain)
- Core v4 hook attached to USDC/WETH pool
- Hook permissions: `afterAddLiquidity`, `afterRemoveLiquidity`, `beforeSwap`
- Manages defense reserve as ERC-6909 claims on PoolManager
- Defense trigger: `triggerDefense()` called by RSC → burns claims → takes tokens → emits intent
- Premium collection and LP donation via `donate()`
- Defense-aware dynamic fees in `beforeSwap`

### LiquidShieldRouter.sol (Unichain)
- User-facing contract for registration and premium payments
- `registerPosition()` — register a lending position for protection
- `payPremium()` — upfront lump sum premium payment
- Routes to hook for state updates

### LiquidShieldSettler.sol (Unichain)
- Implements `IOriginSettler` from ERC-7683
- Emits `GaslessCrossChainOrder` with defense parameters
- Settlement verification for filler returns

### PositionMonitor.sol (Reactive Network — Kopli Testnet)
- Reactive Smart Contract subscribing to lending protocol events
- Monitors Aave V3 (Arbitrum Sepolia) and Morpho Blue (Ethereum Sepolia)
- Native callback to LiquidShieldHook on Unichain when health < threshold

### DefenseExecutor.sol (Source Chains)
- Deployed on Arbitrum Sepolia + Ethereum Sepolia
- Called by filler via user's pre-approval
- Routes to correct ILendingAdapter based on position's protocol
- `executeDefense()` — deposit collateral or repay debt

### AaveV3Adapter.sol + MorphoBlueAdapter.sol (Source Chains)
- Protocol-specific implementations of `ILendingAdapter`
- Aave: direct `getUserAccountData()` for HF, `supply()` for collateral
- Morpho: computed HF from position data + oracle + LLTV, `supplyCollateral()` for defense

## Key V4 Constraints (MUST follow)

1. **All deltas MUST resolve to zero** within a single `unlock` callback. The PoolManager reverts with `NonzeroDeltaCount` otherwise.
2. **`take()` requires ERC20 balance on PoolManager.** Can't take more than what's deposited.
3. **ERC-6909 burn + take pattern:** burn claims (positive delta) + take tokens (negative delta) = zero. This is the only way to extract defense capital.
4. **`donate()` distributes to in-range LPs only.** Out-of-range LPs miss donations during that period.
5. **Hook address encodes permissions.** Must deploy to address where flag bits match `getHookPermissions()`. Use CREATE2 salt mining.
6. **Flash accounting is atomic.** No deferred settlement across transactions.

## Defense Flow (Critical Path)

```
1. RSC detects health factor drop on source chain (native Reactive callback)
2. RSC triggers triggerDefense(positionId, currentHealth) on hook (Unichain)
3. Hook validates: position exists, premium not expired, reserve sufficient
4. Hook calls poolManager.unlock(encoded data)
5. Inside _unlockCallback:
   a. poolManager.burn(hook, currency, amount)  → +delta
   b. poolManager.take(currency, hook, amount)  → -delta
   c. Deltas net to zero ✓
6. Hook calls Settler to emit ERC-7683 GaslessCrossChainOrder
7. Filler detects intent, fills on source chain via DefenseExecutor
8. DefenseExecutor calls ILendingAdapter.depositCollateral() (using user's approval)
9. Filler settles back on Unichain
10. Hook receives tokens, deducts 1.5% fee, donates fee to LPs, replenishes reserve
```

## Deployment Targets

| Contract | Chain | Network |
|---|---|---|
| LiquidShieldHook | Unichain | Sepolia (chain ID: 1301) |
| LiquidShieldRouter | Unichain | Sepolia |
| LiquidShieldSettler | Unichain | Sepolia |
| PositionMonitor (RSC) | Reactive Network | Kopli Testnet |
| DefenseExecutor | Arbitrum | Sepolia (chain ID: 421614) |
| AaveV3Adapter | Arbitrum | Sepolia |
| DefenseExecutor | Ethereum | Sepolia (chain ID: 11155111) |
| MorphoBlueAdapter | Ethereum | Sepolia |

## Uniswap v4 Deployed Addresses (Cross-chain consistent)

| Contract | Address |
|---|---|
| PoolManager | `0x000000000004444c5dc75cB358380D2e3dE08A90` |
| PositionManager | `0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e` |
| V4Quoter | `0xB3d50e12BdC25a1e71cFdC652509EC6bb730bc3f` |
| StateView | `0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227` |

## Development Commands

```bash
# Install dependencies
pnpm install

# Smart contracts
cd packages/contracts && forge build        # Compile
cd packages/contracts && forge test         # Run tests
cd packages/contracts && forge test -vvv    # Verbose tests
cd packages/contracts && forge coverage     # Coverage report

# Frontend
pnpm --filter frontend dev                 # Dev server

# Backend
pnpm --filter backend dev                  # Hono dev server

# Filler
pnpm --filter filler dev                   # Start filler service

# Deploy
cd packages/contracts && forge script script/DeployHook.s.sol --broadcast --rpc-url unichain-sepolia
cd packages/contracts && forge script script/DeployExecutor.s.sol --broadcast --rpc-url arbitrum-sepolia
```

## Testing Strategy

- **Unit tests**: Each contract in isolation with mocked dependencies
- **Integration tests**: Full defense flow (register → trigger → extract → intent → settle)
- **Fork tests**: Fork Aave V3 Sepolia / Morpho Blue Sepolia for realistic adapter testing
- **Fuzz tests**: Premium calculations, defense amount calculations, edge cases

## Demo Scenarios

### Scene A: Aave V3 (Collateral Top-Up)
- **Chain**: Arbitrum Sepolia
- **Collateral**: WETH
- **Reserve used**: Hook's ERC-6909 WETH claims
- **Strategy**: Collateral top-up — surgical fix, health 1.25x → 1.6x

### Scene B: Morpho Blue (Batched Gradual Unwind)
- **Chain**: Ethereum Sepolia
- **Collateral**: USDC
- **Reserve used**: Hook's ERC-6909 USDC claims
- **Strategy**: Batched unwind — N sequential intents, progressive position unwinding

## Style & Conventions

- Solidity: Follow Uniswap v4 conventions (underscore-prefixed internal functions, NatSpec comments)
- TypeScript: Strict mode, ESM imports, viem for all chain interactions
- Tests: Descriptive names (`test_triggerDefense_revertsWhenPremiumExpired`)
- Commits: Conventional commits (`feat:`, `fix:`, `test:`, `docs:`)
- Errors: Custom errors over require strings in Solidity

## Important Links

- [Uniswap v4 Docs](https://docs.uniswap.org/contracts/v4/overview)
- [Unichain Docs](https://docs.unichain.org/)
- [Reactive Network Docs](https://dev.reactive.network/)
- [ERC-7683 Spec](https://eips.ethereum.org/EIPS/eip-7683)
- [ERC-6909 Spec](https://eips.ethereum.org/EIPS/eip-6909)
- [Uniswap v4 Template](https://github.com/uniswapfoundation/v4-template)
- [v4-periphery](https://github.com/Uniswap/v4-periphery)
