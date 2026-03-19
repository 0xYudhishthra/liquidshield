#!/usr/bin/env bash
# ============================================================
# demo-watch-defense.sh — Monitor hook state for defense trigger
# Polls every 10 seconds until the position status changes to DEFENDING
# ============================================================
set -euo pipefail

UNICHAIN_RPC="${UNICHAIN_SEPOLIA_RPC_URL:-https://sepolia.unichain.org}"
BASE_RPC="${BASE_SEPOLIA_RPC_URL:-https://base-sepolia-rpc.publicnode.com}"

HOOK="0x0AA6345204931FE6E5748BdB0A17C8DfeD25d5c0"
SETTLER="0xdC2E7C04c7E742d3e116aC2ce787B59C75a1523e"
AAVE_POOL="0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27"
POSID="${1:?Usage: ./demo-watch-defense.sh <positionId>}"
ADDR="${2:-0x40BA13eAA42D52915E79dDb7A980707Fd70D945f}"

echo "=== Watching for Defense Trigger ==="
echo "Hook: $HOOK"
echo "Position: ${POSID:0:20}..."
echo "Polling every 10 seconds. Press Ctrl+C to stop."
echo ""

INITIAL_NONCE=$(cast call $SETTLER "nonce()(uint256)" --rpc-url $UNICHAIN_RPC 2>/dev/null)

while true; do
  # Get position status (last field: 0=ACTIVE, 1=DEFENDING)
  STATUS=$(cast call $HOOK "getPosition(bytes32)(address,address,address,address,uint256,uint256,uint256,uint256,uint8,uint8)" $POSID --rpc-url $UNICHAIN_RPC 2>/dev/null | tail -1)
  NONCE=$(cast call $SETTLER "nonce()(uint256)" --rpc-url $UNICHAIN_RPC 2>/dev/null)
  HF=$(cast call $AAVE_POOL "getUserAccountData(address)(uint256,uint256,uint256,uint256,uint256,uint256)" $ADDR --rpc-url $BASE_RPC 2>/dev/null | tail -1)
  RESERVE=$(cast call $HOOK "getReserveBalances()(uint256,uint256)" --rpc-url $UNICHAIN_RPC 2>/dev/null | head -1)

  TIMESTAMP=$(date +%H:%M:%S)

  if [ "$STATUS" = "1" ]; then
    echo "[$TIMESTAMP] STATUS=DEFENDING | HF=$HF | Nonce=$NONCE | Reserve=$RESERVE"
    echo ""
    echo ">>> DEFENSE TRIGGERED! <<<"
    echo "  Position is now DEFENDING"
    echo "  Settler nonce: $NONCE (was $INITIAL_NONCE)"
    echo "  ERC-7683 intent emitted — filler should pick it up"
    echo ""
    echo "Run the filler: cd packages/filler && FILLER_LOOKBACK_BLOCKS=100 npx tsx src/index.ts"
    break
  else
    echo "[$TIMESTAMP] STATUS=ACTIVE | HF=$HF | Nonce=$NONCE | Reserve=$RESERVE"
  fi

  sleep 10
done
