# Aqua0 Hookathon — Debugging Issues Log

> **Purpose:** Every bug encountered during development is recorded here.  
> Agents: update this file as you debug. After each fix, mark the issue RESOLVED.  
> Format: one section per issue, status badge at top.

---

## Issue Tracker

| # | Title | Status | File(s) |
|---|---|---|---|
| 1 | `amountSpecified` positive → exact-output swap | ✅ RESOLVED | `use-execute-swap.ts` |
| 2 | Hardcoded `SWAP_VM_ROUTER` sent ETH to EOA | ✅ RESOLVED | `contracts.ts`, `InitializePools.s.sol` |
| 3 | `SafeERC20FailedOperation` on native ETH settlement | ✅ RESOLVED | `SharedLiquidityPool.sol` |
| 4 | `currencyDelta` called on wrong object → OutOfFunds | ✅ RESOLVED | `Aqua0Hook.sol` |
| 5 | `afterSwap` settles non-zero when no JIT positions | ✅ RESOLVED | `Aqua0Hook.sol` |
| 6 | No Visibility Into Swap Flow | ✅ RESOLVED | `Aqua0Hook.sol`, `SharedLiquidityPool.sol` |
| 7 | Refactoring Aqua0Hook into an Extensible Base Hook | ✅ RESOLVED | `Aqua0BaseHook.sol` |
| 8 | True Liquidity Amplification (No Socialization) | ✅ RESOLVED | `SharedLiquidityPool.sol`, `Aqua0BaseHook.sol` |
| 9 | `ERC20InsufficientBalance` in Devnet `InitializePools.s.sol` | ✅ RESOLVED | `InitializePools.s.sol` |
| 10 | Real Liquidity Manager deposit/withdraw modals show no content | ✅ RESOLVED | `real-liquidity-manager.tsx` |
| 11 | `balanceOf` error on native ETH when clicking "Approve JIT Liquidity" | ✅ RESOLVED | `provide-liquidity-modal.tsx`, `v4-lp.service.ts` |
| 12 | Unrounded `tickLower`/`tickUpper` passed to backend for JIT liquidity | ✅ RESOLVED | `provide-liquidity-modal.tsx` |
| 13 | Hook `afterSwap` reverts with `SafeCastOverflow()` during `modifyLiquidity` | ✅ RESOLVED | `Aqua0BaseHook.sol` |
| 14 | React frontend silent swap failure via `SWAP_VM_ROUTER` EOA swallows 0.1 ETH | ✅ RESOLVED | `use-execute-swap.ts` |
| 15 | Local devnet `multicall` fails causing empty virtual positions | ✅ RESOLVED | `v4-client.ts` |
| 16 | Removing Position double-counts IL / FreeBalance Deduction | ✅ RESOLVED | `SharedLiquidityPool.sol` |
| 17 | `earnedFees` showed entire swap volume instead of just the 0.3% fee | ✅ RESOLVED | `SharedLiquidityPool.sol` |
| 18 | Unichain/Base testnet fallback to local devnet `696969` | ✅ RESOLVED | `contracts.ts` |
| 19 | Mock tokens not appearing — `V4_DEPLOYMENT_PATHS` wrong depth | ✅ RESOLVED | `v4-client.ts` |
| 20 | Mock contracts had no on-chain code — forge broadcast was interrupted | ✅ RESOLVED | `InitializePools.s.sol` deployment |

---

## Issue #1 — `amountSpecified` positive → exact-output swap

**Status:** ✅ RESOLVED  
**Date:** 2026-03-07  
**Symptom:** Sending 1 ETH for a swap returned near-zero mUSDC.  
**Root Cause:** Uniswap V4's `amountSpecified` convention uses **negative = exact input**, positive = exact output. Frontend was passing `+amountInRaw`, triggering an exact-output swap that consumed almost no input and produced dust output.  
**Fix:** `use-execute-swap.ts` — negated the value: `amountSpecified: -amountInRaw`  
**Files Changed:** `app-hookathon/hooks/use-execute-swap.ts`

---

## Issue #2 — Hardcoded `SWAP_VM_ROUTER` sent ETH to EOA

**Status:** ✅ RESOLVED  
**Date:** 2026-03-07  
**Symptom:** Swap transaction debited 1 ETH but no mUSDC was received. Block explorer showed transfer to `0xB981...28fC` which was an EOA before deployment.  
**Root Cause:** `lib/contracts.ts` hardcoded `SWAP_VM_ROUTER` to an address that didn't exist on the local Anvil fork. ETH was sent to an EOA that silently accepted it.  
**Fix:**  
1. Modified `InitializePools.s.sol` to deploy `PoolSwapTest` and write its address to the deployment JSON.  
2. Updated `v4-client.ts` to parse `poolSwapTest` from JSON.  
3. Created `use-swap-router.ts` hook to dynamically fetch the router address from `/v4/pools` API.  
4. Updated `use-execute-swap.ts` to use `useSwapRouter` + `useAccount`.  
5. Updated `v4-pools.ts` to return `poolSwapTest` field in the response.  
**Files Changed:**  
- `contracts-hookathon/script/InitializePools.s.sol`  
- `backend-hookathon/packages/api/src/contracts/v4-client.ts`  
- `backend-hookathon/packages/api/src/routes/v4-pools.ts`  
- `app-hookathon/lib/v4-api.ts`  
- `app-hookathon/hooks/use-swap-router.ts` (NEW)  
- `app-hookathon/hooks/use-execute-swap.ts`

---

## Issue #3 — `SafeERC20FailedOperation` on native ETH settlement

**Status:** ✅ RESOLVED  
**Date:** 2026-03-07  
**Symptom:** `cast run` trace showed revert with `SafeERC20FailedOperation` inside `settleSwapDelta`. Custom error `0x5274afe7`.  
**Root Cause:** `SharedLiquidityPool.settleSwapDelta` called `IERC20(token).safeTransfer(hook, owed)` where `token = address(0)` (native ETH). ERC20 `safeTransfer` on `address(0)` fails because `address(0)` has no code.  
**Fix:**  
- Added `receive() external payable {}` to both `SharedLiquidityPool` and `Aqua0Hook`.  
- In `settleSwapDelta`: when `token == address(0)` and `delta < 0`, use `.call{value: owed}("")` instead of ERC20 transfer.  
- Made `settleSwapDelta` `payable` to accept ETH when `delta > 0`.  
- In `Aqua0Hook._settle`: when `currency.isAddressZero()` and hook owes PM, use `poolManager.settle{value: owed}()` instead of `sync + safeTransfer + settle`.  
**Files Changed:**  
- `contracts-hookathon/src/v4/SharedLiquidityPool.sol`  
- `contracts-hookathon/src/v4/Aqua0Hook.sol`

---

## Issue #4 — `currencyDelta` called on wrong object → OutOfFunds

**Status:** ✅ RESOLVED  
**Date:** 2026-03-07  
**Symptom:** After fix #3, swap trace showed `OutOfFunds` inside `settleSwapDelta`, with SharedLiquidityPool trying to send 1 ETH to the hook via `.call{value: 1e18}`.  
**Root Cause:** In `Aqua0Hook.afterSwap`, we called `poolManager.currencyDelta(address(this), currency)`. BUT `currencyDelta` is NOT a method on `IPoolManager` — it was added in `TransientStateLibrary` as a **library function** that calls `manager.exttload(...)`. Calling `poolManager.currencyDelta(...)` as an external method invoked a **non-existent function selector** on PoolManager, which returned garbage data (interpreted as -1e18) instead of the hook's actual zero delta.  
**Fix:** Changed to use the library correctly: `TransientStateLibrary.currencyDelta(poolManager, address(this), key.currency0)` (via the `using TransientStateLibrary for IPoolManager` directive).  
**Files Changed:**  
- `contracts-hookathon/src/v4/Aqua0Hook.sol`

---

## Issue #5 — `afterSwap` settles non-zero when no JIT positions

**Status:** ✅ RESOLVED  
**Date:** 2026-03-07  
**Symptom:** Even with Issue #4 fixed, when no user has deposited liquidity into SharedLiquidityPool, `afterSwap` still attempts settlement and fails.  
**Root Cause:** When `getAggregatedPositions` returns 0 ranges, `afterSwap` loops 0 times (no modifyLiquidity calls). The hook's transient delta is genuinely 0. But `_settle` was still called, and `settleSwapDelta` tried to send `0` ETH via `.call{value: 0}` — surprisingly this doesn't always fail gracefully. More importantly, with positions the hook's transient delta is non-zero but SharedLiquidityPool has no backing ETH to send.  
**Fix:** Added explicit early-return when `ranges.length == 0` in `afterSwap`. The hook now does nothing (correct behavior) when there's no JIT liquidity — swaps route through the pool normally with just the PoolManager's existing liquidity.  
**Files Changed:**  
- `contracts-hookathon/src/v4/Aqua0Hook.sol`

---

## Issue #6 - No Visibility Into Swap Flow

**Status:** resolved  
**Date:** 2026-03-07 (session 3)  
**Symptom:** Swaps were passing or failing silently with no way to trace what the hook was doing with liquidity or tokens.  
**Fix:**
1. Added `import {console} from "forge-std/console.sol";` to both `Aqua0Hook.sol` and `SharedLiquidityPool.sol`.
2. Added logs in `Aqua0Hook.beforeSwap`: ranges found, each JIT add (tickLower, tickUpper, liquidity).
3. Added logs in `Aqua0Hook.afterSwap`: removes, net deltas, settlement direction.
4. Added logs in `Aqua0Hook._settle`: which direction, how much, ETH vs ERC20.
5. Added logs in `SharedLiquidityPool.settleSwapDelta`: token, delta direction/amount, pool ETH balance, transfer path.
6. Changed Anvil launch in `start-local.sh` from `--silent` to `--tracing` so logs are visible in the terminal.
7. Changed `InitializePools.s.sol` forge script from `-v` to `-vvvv` so pool init details print (sqrtPriceX96, amounts, ticks).

**Notes on console.log in Solidity:**
- `console.log` in Solidity (from `forge-std`) has limited overloads. Valid: `(string)`, `(string, uint)`, `(string, address)`, `(string, int)`, `(string, bool)`, `(string, uint, string)` - NOT 4+ args with mixed types.
- Logs appear only when Anvil runs with `--tracing`. They are NOT visible on mainnet/testnets.
- `console.log("text:", someInt24)` requires `int24` - Solidity will auto-match if the type fits a `(string, int)` overload.

**Files Changed:**
- `contracts-hookathon/src/v4/Aqua0Hook.sol`
- `contracts-hookathon/src/v4/SharedLiquidityPool.sol`
- `contracts-hookathon/script/InitializePools.s.sol`
- `backend-hookathon/scripts/start-local.sh`

---

## Issue #7 - Refactoring Aqua0Hook into an Extensible Base Hook

**Status:** resolved  
**Date:** 2026-03-11 (session 4)  
**Symptom:** Developers wanted to build custom Uniswap V4 hooks but still leverage Aqua0's JIT shared liquidity mechanism without copy-pasting code or messing with the complex poolManager modifications/deltas.  
**Fix:**
1. Created `Aqua0BaseHook` as an abstract contract holding all the complex JIT shared liquidity logic.
2. Exposed `_addVirtualLiquidity(key)`, `_removeVirtualLiquidity(key)`, and `_settleVirtualLiquidityDeltas(key)` as simple `internal` functions for child hooks to call.
3. Completely refactored `Aqua0Hook` to inherit from `Aqua0BaseHook`. `Aqua0Hook` now serves as the default minimal implementation that demonstrates how third-parties can integrate Aqua0 simply by calling the above 3 methods inside their own `beforeSwap` and `afterSwap`.

**Files Changed:**
- `contracts-hookathon/src/v4/Aqua0BaseHook.sol` (NEW)
- `contracts-hookathon/src/v4/Aqua0Hook.sol` (Refactored to inherit `Aqua0BaseHook`)

---

## Issue #8 - True Liquidity Amplification (No Socialization)

**Status:** resolved  
**Date:** 2026-03-11 (session 4)  
**Symptom:** The shared liquidity pool lacked true capital efficiency. A user with 1 ETH could only provide 1 ETH of virtual liquidity across all ranges. Furthermore, there was no safe way to do this without socializing impermanent loss and swap fees across everyone in the pool. User requested true amplification without any socialization of losses.  
**Fix:**
1. Rearchitected `SharedLiquidityPool` so `addPosition` logs intent but does NOT lock `freeBalance`.
2. Created `preSwap` engine that calculates an individualized `scale` limit for each active user based on their real-time `freeBalance`.
3. Modified `Aqua0BaseHook` to pipe the exact Uniswap V4 `BalanceDelta` values generated during exact active ranges via Solidity 0.8.24 transient storage (`tstore` / `tload`).
4. Created `postSwap` engine that takes the exact `netPnL` of the range and distributes it down to the wei proportionally among overlapping users based on their localized scale, hitting their `freeBalance` independently.
5. In the frontend (`provide-liquidity-modal.tsx`), conditionally prompt `deposit` transaction limits based on actual Shared Liquidity Pool balances, allowing massive backend amplification of funds.

**Files Changed:**
- `contracts-hookathon/src/v4/SharedLiquidityPool.sol`
- `contracts-hookathon/src/v4/Aqua0BaseHook.sol`
- `app-hookathon/components/pools/provide-liquidity-modal.tsx`

---

## Issue #9 - `ERC20InsufficientBalance` in Devnet `InitializePools.s.sol`

**Status:** resolved  
**Date:** 2026-03-11 (session 4)  
**Symptom:** During devnet restart, `start-local.sh` crashed with `ERC20InsufficientBalance` stemming from the `InitializePools.s.sol` execution when seeding Pool 2 (`mUSDC` / `mWBTC`).  
**Root Cause:** Uniswap V4 creates pool pairs strictly sorted by token address (`t0 < t1`). In previous runs, `mUSDC`'s randomly generated address was naturally smaller than `mWBTC`, so `t0 = mUSDC`. However, in this devnet run, `mWBTC` was smaller. The initialization script had `SQRT_PRICE_2` hardcoded for the `P = mWBTC / mUSDC = 1/67848` ratio. When the tokens flipped, the script accidentally initialized the pool at `1 WBTC = 0.00001 USDC`. Consequentially, because `L` is fixed, achieving this extreme price required >1999 `mWBTC` to be pulled from the deployer, who only possessed a starting supply of 1000.  
**Fix:** Modified `InitializePools.s.sol` to conditionally check `address(mockUSDC) < address(mockWBTC)` and dynamically select either `SQRT_PRICE_2_USDC_0` or `SQRT_PRICE_2_WBTC_0`.

**Files Changed:**
- `contracts-hookathon/script/InitializePools.s.sol`

---

## Issue #10 — Real Liquidity Manager deposit/withdraw modals show no content

**Status:** ✅ RESOLVED  
**Date:** 2026-03-11 (session 5)  
**Symptom:** Clicking "Deposit" or "Withdraw" on the Real Liquidity Manager card on `/dashboard` shows a modal with only the title ("Deposit ETH" / "Withdraw ETH") and an `×` close icon — no amount input, no confirm button, nothing else.  
**Root Cause:** The `activeBalance` variable in `real-liquidity-manager.tsx` was `undefined` because native ETH `0x000...` caused the backend `balanceOf` call to fail, returning `undefined` for native ETH. The conditional `{activeToken && activeBalance && (...)}` block therefore rendered nothing.  
**Fix:** Removed the hard `activeBalance` requirement from the React guard (`{activeToken && (...)}`) and safely allowed `activeBalance.walletBalance` and `freeBalance` to fall back to `"0"`. Modals now render gracefully even while balances load or if they fail.

---

## Issue #11 — `balanceOf` reverts when approving JIT Liquidity with ETH

**Status:** ✅ RESOLVED  
**Date:** 2026-03-11 (session 5)  
**Symptom:** Clicking "Approve JIT Liquidity" in the ETH/mUSDC pool's `ProvideLiquidityModal` immediately shows an error: `The contract function "balanceOf" returned no data ("0x")`.  
**Root Cause:** The `freeBalance` fetch in `provide-liquidity-modal.tsx` calls `GET /v4/lp/balances/:user?tokens=0x000...000`. The `getUserWalletBalance` backend service directly routed this token to viem's `readContract(balanceOf)`, which reverts on the zero address.  
**Fix:** Updated `getUserWalletBalance` in `v4-lp.service.ts` to detect `0x00...0` and specifically use `publicClient.getBalance({ address })` instead. This stops the server error from crashing the modal submission flow.

---

## Issue #12 — Unrounded `tickLower`/`tickUpper` passed to backend for JIT liquidity

**Status:** ✅ RESOLVED  
**Date:** 2026-03-11 (session 5)  
**Symptom:** While investigating V4 LP revert failures, noted that floating/unrounded ticks were sent via the API.  
**Root Cause:** In `provide-liquidity-modal.tsx`, user-selected `priceLower` and `priceUpper` bounds were converted to `tickLower` and `tickUpper` but passed to `api.post('prepare-add-position')` without rounding to the nearest `tickSpacing` multiple. Submitting unaligned ticks causes issues for Uniswap V4 PoolManager during `modifyLiquidity`.  
**Fix:** Replaced `tickLower` and `tickUpper` with the pre-calculated `tickLowerInt` and `tickUpperInt` parameters in the API payload array to ensure alignment with standard V4 TickSpacing intervals.

---

## Issue #13 — Hook `afterSwap` reverts with `SafeCastOverflow()` during `modifyLiquidity`

**Status:** ✅ RESOLVED  
**Date:** 2026-03-XX  
**Symptom:** Swap transaction failed with custom error `0x90bfb865` -> `WrappedError` containing `0x93dafdf1` (`SafeCastOverflow()`) from `Aqua0BaseHook.afterSwap`.  
**Root Cause:** In `Aqua0BaseHook._addVirtualLiquidity`, transient ticks `tickLowerInt` and `tickUpperInt` (which are `int24` cast to `int256`) were stored correctly. However, `_removeVirtualLiquidity` did `int24(int16(tickLowerInt))` instead of `int24(tickLowerInt)`. Casting to `int16` incorrectly truncated values > 32767 (e.g. `75720` became `10184`). The hook tried to `modifyLiquidity` removal on these corrupted ticks where it had 0 liquidity, which causes V4 to overflow negative gross liquidity resulting in `SafeCastOverflow`.  
**Fix:** Removed the `int16()` intermediate cast in `_removeVirtualLiquidity`.  
**Files Changed:**  
- `contracts-hookathon/src/v4/Aqua0BaseHook.sol`

---

## Issue #14 — React frontend silent swap failure via `SWAP_VM_ROUTER` EOA swallows 0.1 ETH

**Status:** ✅ RESOLVED  
**Date:** 2026-03-XX  
**Symptom:** `0.1 ETH` -> `mUSDC` swap transacted successfully on frontend but no USDC was returned. Gas used was `27400` (which is 21000 base + 6400 calldata). Tracing showed the destination contract had `0x` code and just absorbed the ETH without reverting.  
**Root Cause:** The `useExecuteSwap.ts` hook's `execute` `useCallback` function had a missing dependency for `routerTarget`. Because it wasn't specified, the callback captured the default `SWAP_VM_ROUTER` (an EOA that is no longer a contract) before `useSwapRouter` successfully brought back the latest `poolSwapTest` address from the `v4/pools` API.  
**Fix:** Added `routerTarget` to the dependency array in `useCallback` found in `use-execute-swap.ts`.  
**Files Changed:**  
- `app-hookathon/hooks/use-execute-swap.ts`


## Issue #15 — Local devnet `multicall` fails causing empty virtual positions

**Status:** ✅ RESOLVED  
**Date:** 2026-03-11  
**Symptom:** The `VisualLiquidityChart` showed "No liquidity in this pool yet" despite having active positions. The `/v4/pools` endpoint returned empty `aggregatedRanges`.  
**Root Cause:** The `v4-client.ts` backend used `client.multicall` to fetch all ranges. However, the local Anvil devnet does not have the `multicall3` contract deployed by default. `viem` threw a silent error `Chain "Aqua0 Local Devnet" does not support contract "multicall3"`.  
**Fix:** Refactored `readAggregatedPositions` to use `Promise.allSettled` over multiple `client.readContract` calls instead of `multicall`.  
**Files Changed:**  
- `backend-hookathon/packages/api/src/contracts/v4-client.ts`

---

## Issue #16 — Removing Position double-counts IL / FreeBalance Deduction

**Status:** ✅ RESOLVED  
**Date:** 2026-03-16
**Symptom:** Removing an active position was resulting in a massive deduction of `freeBalance` equivalent to approximately 1 tick's worth of value, or worse.
**Root Cause:** The `True Liquidity Amplification` feature introduced in Issue #8 dynamically calculated and distributed Impermanent Loss directly against user `freeBalance` independently during the `postSwap` hook function execution. However, the `removePosition` logic still relied on an older version of the codebase, evaluating the user's explicitly passed returning token counts against their initially backed amounts and subtracting the difference against their balance. Because the user's `freeBalance` had already been naturally affected during swap activity, this resulted in an arbitrary double-charge applied to `freeBalance` upon closure based on imprecise frontend calculations. 
**Fix:** Removed the obsolete PnL and `earnedFees`/`freeBalance` modifications inside `SharedLiquidityPool.removePosition`. Consequently removed the `token0Return` and `token1Return` parameters from `SharedLiquidityPool.sol`, back-end routes, client API schema, and React front-end logic, guaranteeing an absence of user-submitted numbers governing IL logic.
**Files Changed:**  
- `contracts-hookathon/src/v4/SharedLiquidityPool.sol`
- `backend-hookathon/packages/api/src/contracts/v4-abis.ts`
- `backend-hookathon/packages/api/src/contracts/v4-client.ts`
- `backend-hookathon/packages/api/src/services/v4-lp.service.ts`
- `backend-hookathon/packages/api/src/routes/v4-lp.ts`
- `app-hookathon/components/pools/provide-liquidity-modal.tsx`

---

## Issue #17 — `earnedFees` showed entire swap volume instead of just the 0.3% fee

**Status:** ✅ RESOLVED  
**Date:** 2026-03-16  
**Symptom:** After swapping 0.1 ETH → ~196 USDC, the dashboard showed ~0.1 ETH as claimable fees AND ~196 USDC deducted from `Shared: USDC`. Net position looked like the pool ate the principal.  
**Root Cause:** `_applyNetPnL` was incorrectly treating ALL positive `netPnL` (input token inflow) as claimable fees, and ALL negative `netPnL` (output token outflow) as IL deducted from `freeBalance`. In reality:
- Positive `netPnL` = **Fee portion** (e.g. 0.3% of amountIn) + **Inventory shift** (principal rebalancing — the rest).
- Negative `netPnL` = purely **Inventory shift** of the output token (not IL).

Uniswap V4 takes fees **only from the input token** per `SwapMath.computeSwapStep`.  
**Fix:** Updated `_applyNetPnL(user, token, pnl, lpFee)` to split positive PnL:
- `feePortion = pnl * lpFee / 1_000_000` → `earnedFees` (claimable)
- `inventoryShift = pnl - feePortion` → `freeBalance` (principal rebalancing)

`Aqua0BaseHook._removeVirtualLiquidity` now reads `lpFee` via `StateLibrary.getSlot0(poolManager, poolId)` and passes it to `postSwap`. Also refactored `preSwap` to extract the per-user scale computation into a private `_computeRangeScaledLiquidity` helper to fix a stack-too-deep compile error introduced by adding `StateLibrary` imports.  
**Files Changed:**  
- `contracts-hookathon/src/v4/SharedLiquidityPool.sol`
- `contracts-hookathon/src/v4/Aqua0BaseHook.sol`
- `contracts-hookathon/src/v4/Aqua0Hook.sol`

---

## Issue #18 — Unichain/Base testnet fallback to local devnet `696969` due to string mapping

**Status:** ✅ RESOLVED  
**Date:** 2026-03-17  
**Symptom:** When clicking "Claim Fees" or rendering the real liquidity manager on Unichain Sepolia (`1301`), the frontend silently routed API requests to the local devnet (`696969`).  
**Root Cause:** `BACKEND_CHAIN_IDS` in `lib/contracts.ts` mapped legacy strings (`"base"`, `"unichain"`) to backend chain IDs. Wagmi's numeric `chainId` (e.g., `1301`) was passed into `BACKEND_CHAIN_IDS[chainId!] ?? 696969`. Because `1301` was missing as a key, it always fell back to `696969` on testnets, fetching wrong data or calling the wrong network endpoints.  
**Fix:** Added numeric mappings (`1301: 1301`, `84532: 84532`, `696969: 696969`) to the `BACKEND_CHAIN_IDS` object so testnets cleanly resolve to themselves in the API requests.  
**Files Changed:**  
- `app-hookathon/lib/contracts.ts`

---

## Debugging Protocol

When investigating a new revert:
1. Isolate: identify the exact function failing
2. Read: check the error message carefully – the revert string is the first clue
3. Trace: find the root cause (wrong args, wrong type, wrong caller, wrong state)
4. Fix: apply minimal surgical change
5. Update: document the issue and fix in this file

---

## Notes for Future Agents

- **Always update this file** when you fix a bug. Put: what broke, why, and exactly what files changed.  
- **Always restart** `./scripts/start-local.sh` after any Solidity change — the local chain and hook address changes on every restart.  
- The **pool shows 1:1 ETH/mUSDC by default** on a fresh chain if no positions are seeded — ignore this during testing, use the price from the API (`currentPrice` field).  
- `poolSwapTest` address changes on every `start-local.sh` — do NOT hardcode it.  
- If the frontend shows wrong prices: restart the backend API (it re-reads the JSON on startup).

---

## Issue #19 — Mock Tokens Not Appearing (V4_DEPLOYMENT_PATHS wrong depth)

**Status:** ✅ RESOLVED

**Symptom:**  
Backend /v4/pools?chainId=1301 was returning the static hardcoded real WETH/USDC pool instead of the deployed mock tokens (mUSDC, mWETH, etc). The /v4/lp/balances endpoint was also 500-ing with "V4 deployment addresses not found for chainId 1301."

**Root Cause:**  
In `v4-client.ts`, `V4_DEPLOYMENT_PATHS` used `process.cwd()` + `../../contracts-hookathon/...`. When running via `bun run dev:api`, `process.cwd()` is `packages/api/`, so `../../` resolves to `backend-hookathon/`—not the `Aqua0/` root where the actual `contracts-hookathon/` folder lives. The JSON file was never found, the `catch {}` block swallowed the error, and the static fallback registry was used.

**Fix:**  
Changed to `import.meta.dir`-relative paths (Bun-native, CWD-independent). From `src/contracts/v4-client.ts`, 5 levels up (`../../../../../`) reaches the `Aqua0/` root correctly. Removed the `process.cwd()` dependency entirely.

**Files Changed:**  
- `backend-hookathon/packages/api/src/contracts/v4-client.ts`

---

## Issue #20 — Mock Contracts Had No On-Chain Code (Broadcast Interrupted)

**Status:** ✅ RESOLVED

**Symptom:**  
`cast call` showed "contract does not have any code" for `mUSDC` (0x73c5...) even though the deployment JSON was correctly populated with addresses.

**Root Cause:**  
The initial `forge script --broadcast` command was stuck waiting for a nonce confirmation prompt and was manually killed before any transactions were submitted. The simulation succeeded and wrote addresses to the JSON, but nothing was actually sent to the network.

**Fix:**  
Re-ran `forge script InitializePools.s.sol --tc InitializePools --broadcast --legacy --skip-simulation`. The `--skip-simulation` flag bypassed the hanging confirmation prompt and broadcast all transactions successfully. All 4 tokens (mUSDC, mDAI, mWBTC, mWETH) and 4 pools are now live on Unichain Sepolia.

**Files Changed:**  
- `contracts-hookathon/deployments/v4-hookathon-unichain-sepolia-tokens.json` (updated with final on-chain addresses)
