#!/usr/bin/env bash
# ============================================================
# demo-simulate-health-drop.sh — Borrow more USDC on Aave to drop health factor
# This simulates a market condition that would trigger LiquidShield defense
# ============================================================
set -euo pipefail

RPC="${BASE_SEPOLIA_RPC_URL:-https://base-sepolia-rpc.publicnode.com}"
PK="${PRIVATE_KEY:?Set PRIVATE_KEY}"
ADDR=$(cast wallet address $PK)

AAVE_POOL="0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27"
USDC="0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"

echo "=== Simulate Health Factor Drop ==="
echo "Borrowing more USDC on Aave V3 (Base Sepolia) to lower health factor"
echo "Wallet: $ADDR"
echo ""

# Check current health
echo "--- Current Position ---"
DATA=$(cast call $AAVE_POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $ADDR --rpc-url $RPC)
HF=$(echo "$DATA" | tail -1)
echo "Health Factor: $HF"
echo ""

# Borrow 5 USDC at a time
for i in 1 2 3 4 5; do
  echo -n "Borrowing 5 USDC (attempt $i)... "
  RESULT=$(cast send $AAVE_POOL "borrow(address,uint256,uint256,uint16,address)" \
    $USDC 5000000 2 0 $ADDR \
    --private-key $PK --rpc-url $RPC 2>&1)
  if echo "$RESULT" | grep -q "status.*1"; then
    echo "success"
  else
    echo "failed (may have hit borrow limit)"
    break
  fi
done

echo ""
echo "--- After Borrowing ---"
DATA=$(cast call $AAVE_POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $ADDR --rpc-url $RPC)
HF=$(echo "$DATA" | tail -1)
echo "Health Factor: $HF"
echo ""
echo "If HF < 1.5e18, the Reactive Network RSC will detect this and trigger defense."
echo "Monitor the hook status with: ./script/demo-watch-defense.sh"
