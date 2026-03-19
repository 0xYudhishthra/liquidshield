#!/usr/bin/env bash
# ============================================================
# demo-swap-jit.sh — Swap mWETH→mUSDC through the LiquidShield hook
# Demonstrates JIT liquidity from Aqua0's SharedLiquidityPool
# ============================================================
set -euo pipefail

RPC="${UNICHAIN_SEPOLIA_RPC_URL:-https://sepolia.unichain.org}"
PK="${PRIVATE_KEY:?Set PRIVATE_KEY}"
ADDR=$(cast wallet address $PK)

HOOK="0x0AA6345204931FE6E5748BdB0A17C8DfeD25d5c0"
MWETH="0xD9cA9700DecEB91b61dAF48C8De7879C9Bfe9fe9"
MUSDC="0xFBC4BAD95C0E44F70631E6Df2ae6eDC97e7950C4"
SWAP_ROUTER="0x31E05bd36D327EEb104328ae6730EFBB0088A6dA"
SLP="0x199D3cae8267eb67547828BDa25592F70B1575c3"

echo "=== LiquidShield JIT Swap Demo ==="
echo "Swapping 0.01 mWETH → mUSDC through the hook"
echo "Hook: $HOOK"
echo "Wallet: $ADDR"
echo ""

# Check balances before
echo "--- Before Swap ---"
echo -n "mWETH: " && cast call $MWETH "balanceOf(address)(uint256)" $ADDR --rpc-url $RPC
echo -n "mUSDC: " && cast call $MUSDC "balanceOf(address)(uint256)" $ADDR --rpc-url $RPC

# Approve swap router
cast send $MWETH "approve(address,uint256)" $SWAP_ROUTER $(cast max-uint) --private-key $PK --rpc-url $RPC > /dev/null 2>&1
cast send $MUSDC "approve(address,uint256)" $SWAP_ROUTER $(cast max-uint) --private-key $PK --rpc-url $RPC > /dev/null 2>&1

# Execute swap: 0.01 mWETH → mUSDC (zeroForOne=true, mWETH is token0)
# PoolKey: (mWETH, mUSDC, 0x800000, 60, hook)
# MIN_SQRT_PRICE + 1 = 4295128740
echo ""
echo "Executing swap..."
TX=$(cast send $SWAP_ROUTER \
  "swap((address,address,uint24,int24,address),(bool,int256,uint160),(bool,bool),bytes)" \
  "($MWETH,$MUSDC,8388608,60,$HOOK)" \
  "(true,-10000000000000000,4295128740)" \
  "(false,false)" \
  "0x" \
  --private-key $PK --rpc-url $RPC --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['transactionHash'])")

echo "Tx: $TX"
echo ""

# Check balances after
echo "--- After Swap ---"
echo -n "mWETH: " && cast call $MWETH "balanceOf(address)(uint256)" $ADDR --rpc-url $RPC
echo -n "mUSDC: " && cast call $MUSDC "balanceOf(address)(uint256)" $ADDR --rpc-url $RPC

echo ""
echo "Check JIT liquidity activity on SharedLiquidityPool:"
echo -n "  User freeBalance mWETH: " && cast call $SLP "freeBalance(address,address)(uint256)" $ADDR $MWETH --rpc-url $RPC
echo -n "  User freeBalance mUSDC: " && cast call $SLP "freeBalance(address,address)(uint256)" $ADDR $MUSDC --rpc-url $RPC
echo ""
echo "Done! The swap executed through the LiquidShield hook with Aqua0 JIT liquidity."
