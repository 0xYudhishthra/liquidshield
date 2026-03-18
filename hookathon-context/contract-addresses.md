# Aqua0 Contract Addresses — Unichain Sepolia

> **Chain:** Unichain Sepolia · **Chain ID:** `1301`  
> **RPC:** `https://unichain-sepolia-rpc.publicnode.com`  
> **Explorer:** https://unichain-sepolia.blockscout.com/

---

## Core Aqua0 Contracts

| Contract | Address | Notes |
|---|---|---|
| `SharedLiquidityPool` | `0xAaa6937e7297FC243e18bD726e71E38f511D4830` | Holds all user liquidity |
| `Aqua0Hook` | `0x78609BB14f0AeF92B8F22559D18BAC65De5740c0` | Reference hook implementation |
| `Aqua0QuoteHelper` | `0xE98EAe62107603CcB9da8a5e69e8C2bA0D5f437c` | Off-chain quote simulation |
| `PoolSwapTest` (testnet router) | `0x75fb5Aa45A57123A4a83E4aE3196629eCa0D14e6` | Used for UI swaps only |

## Uniswap V4 Core (Unichain Sepolia)

| Contract | Address |
|---|---|
| `PoolManager` | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` |

## Mock Tokens (testnet only)

> All tokens have **18 decimals**. Use `./mint-tokens.sh <your-address>` to get test funds.

| Token | Symbol | Address |
|---|---|---|
| Mock USDC | `mUSDC` | `0x73c56ddD816e356387Caf740c804bb9D379BE47E` |
| Mock DAI | `mDAI` | `0x0e6f9cD4C00b05E3857cEeA36ec7bEA68fa7e7eD` |
| Mock Wrapped BTC | `mWBTC` | `0x8508A009DA4BD177D1aEeeC00CBa64f4316BbD2B` |
| Mock Wrapped ETH | `mWETH` | `0x7fF28651365c735c22960E27C2aFA97AbE4Cf2Ad` |

## Seeded Pools (on Aqua0Hook)

| Pool | fee | tickSpacing | Token0 | Token1 |
|---|---|---|---|---|
| mUSDC / mWBTC | 0.3% | 60 | `0x73c5...47E` | `0x8508...D2B` |
| mDAI / mWBTC | 0.3% | 60 | `0x0e6f...7eD` | `0x8508...D2B` |
| mDAI / mUSDC | 0.05% | 10 | `0x0e6f...7eD` | `0x73c5...47E` |
| mUSDC / mWETH | 0.3% | 60 | `0x73c5...47E` | `0x7fF2...2Ad` |

---

## Integrating Your Own Hook (Teammates)

Your hook inherits from `Aqua0BaseHook` to get free JIT shared liquidity:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Aqua0BaseHook} from "path/to/Aqua0BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/types/PoolOperation.sol";
import {SharedLiquidityPool} from "path/to/SharedLiquidityPool.sol";

contract MyCustomHook is Aqua0BaseHook {
    constructor(IPoolManager _poolManager, SharedLiquidityPool _sharedPool)
        Aqua0BaseHook(_poolManager, _sharedPool) {}

    // Required: tell Uniswap which hooks you implement
    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeSwap: true,
            afterSwap: true,
            // ... set others to false
        });
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        external override onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24)
    {
        _addVirtualLiquidity(key);           // ← Aqua0 JIT injection
        // Your custom beforeSwap logic here...
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        external override onlyPoolManager returns (bytes4, int128)
    {
        (bool hasJIT, ) = _removeVirtualLiquidity(key);   // ← Aqua0 JIT removal + PnL
        if (hasJIT) _settleVirtualLiquidityDeltas(key);   // ← settle net token flow
        // Your custom afterSwap logic here...
        return (this.afterSwap.selector, 0);
    }
}
```

### Steps to register your hook

1. **Deploy** your hook using CREATE2 + `HookMiner.sol` so the address has the correct permission bits set (see `script/DeployV4Hookathon.s.sol` for reference).
2. **Register** your hook with the SharedLiquidityPool: `sharedPool.setHook(address(yourHook))`.
   - ⚠️ Currently only one hook can be registered at a time. Talk to the Aqua0 team if you need multi-hook support.
3. **Initialize** a V4 pool with your hook address in the `PoolKey.hooks` field.
4. The **Aqua0 frontend auto-indexes** any pool with an `aqua0Hook` address — your pool will appear in the UI once you share your hook address with us and we update `v4-hookathon-unichain-sepolia.json`.

### Required hook address bits

Your hook contract address must have `0xC0` in the lowest byte:
```
BEFORE_SWAP_FLAG = 0x80
AFTER_SWAP_FLAG  = 0x40
Required bits    = 0xC0
```
Use `contracts-hookathon/script/DeployV4Hookathon.s.sol` as a template — it includes `HookMiner.find()` to salt-mine the correct address.

---

## Testnet Faucets & Setup

```bash
# Mint test tokens to your address
cd hookathon-context
./mint-tokens.sh 0xYOUR_WALLET_ADDRESS

# Unichain Sepolia ETH faucet:
# https://faucet.quicknode.com/unichain/sepolia
```
