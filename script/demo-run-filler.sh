#!/usr/bin/env bash
# ============================================================
# demo-run-filler.sh — Run the filler service to execute defense
# Watches for ERC-7683 intents on Unichain, executes on Base Sepolia
# ============================================================
set -euo pipefail

export PRIVATE_KEY="${PRIVATE_KEY:?Set PRIVATE_KEY}"
export FILLER_PRIVATE_KEY="${FILLER_PRIVATE_KEY:-$PRIVATE_KEY}"
export UNICHAIN_SEPOLIA_RPC_URL="${UNICHAIN_SEPOLIA_RPC_URL:-https://sepolia.unichain.org}"
export BASE_SEPOLIA_RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://base-sepolia-rpc.publicnode.com}"
export LIQUIDSHIELD_SETTLER_ADDRESS="0xdC2E7C04c7E742d3e116aC2ce787B59C75a1523e"
export LIQUIDSHIELD_HOOK_ADDRESS="0x0AA6345204931FE6E5748BdB0A17C8DfeD25d5c0"
export FILLER_LOOKBACK_BLOCKS="${FILLER_LOOKBACK_BLOCKS:-200}"

echo "=== LiquidShield Filler Service ==="
echo "Watching for ERC-7683 defense intents on Unichain Sepolia"
echo "Will execute defense on Base Sepolia via DefenseExecutor + AaveV3Adapter"
echo "Lookback: $FILLER_LOOKBACK_BLOCKS blocks"
echo ""

cd "$(dirname "$0")/../packages/filler"
exec npx tsx src/index.ts
