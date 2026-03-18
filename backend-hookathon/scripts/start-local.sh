#!/usr/bin/env bash
# ============================================
# Aqua0 V4 Hookathon — Local Dev Stack
#
# What this does:
#   1. Starts Anvil forking Base Sepolia (so V4 PoolManager exists)
#   2. Deploys SharedLiquidityPool + Aqua0Hook via CREATE2 salt mining
#   3. Funds target wallet(s) with ETH
#   4. Starts Otterscan block explorer (Docker) on http://localhost:5100
#   5. Starts the backend API on http://localhost:3001
#
# Prerequisites:
#   - anvil, forge, cast  (foundry)
#   - bun                 (runtime)
#   - docker              (for otterscan)
#   - jq                  (json parsing)
#
# Usage:
#   cd backend-hookathon
#   ./scripts/start-local.sh
#
# Optional env vars:
#   BASE_SEPOLIA_RPC   Override fork RPC (default: https://sepolia.base.org)
#   ANVIL_PORT         Anvil port (default: 8545)
#   SKIP_OTTERSCAN     Set to 1 to skip Otterscan docker container
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$BACKEND_DIR")"
CONTRACTS_DIR="$ROOT_DIR/contracts-hookathon"
DEPLOYMENT_JSON="$CONTRACTS_DIR/deployments/v4-hookathon-local.json"

ANVIL_PORT="${ANVIL_PORT:-8545}"
RPC_URL="http://127.0.0.1:$ANVIL_PORT"
FORK_RPC="${BASE_SEPOLIA_RPC:-https://sepolia.base.org}"
SKIP_OTTERSCAN="${SKIP_OTTERSCAN:-0}"

# Anvil default account 0 private key — has 10000 ETH on every Anvil node
ANVIL_DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Wallet to fund with ETH
FUND_TARGET="0xc929959b439b6FC2Eb53e7CeB602297fF3147146"
FUND_AMOUNT="100ether"

ANVIL_PID=""
API_PID=""

# ── Cleanup ──────────────────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "${ANVIL_PID:-}" ] && kill "$ANVIL_PID" 2>/dev/null || true
  [ -n "${API_PID:-}" ]   && kill "$API_PID"   2>/dev/null || true
  if [ "$SKIP_OTTERSCAN" != "1" ]; then
    cd "$BACKEND_DIR" && docker compose stop otterscan 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Aqua0 V4 Hookathon — Local Dev Stack       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: Start Anvil forking Base Sepolia ──────────────────────────────────

echo "[1/5] Starting Anvil — forking Base Sepolia..."
echo "      Fork: $FORK_RPC"
echo "      Chain ID: 696969  Port: $ANVIL_PORT"
echo ""

# NOTE: --no-mining is NOT set — auto-mining is on.
# console.log() from Solidity contracts prints to THIS terminal via the tracing output.
anvil \
  --fork-url "$FORK_RPC" \
  --port "$ANVIL_PORT" \
  --chain-id 696969 \
  --tracing &
ANVIL_PID=$!

echo "      Waiting for Anvil to be ready..."
until cast block-number --rpc-url "$RPC_URL" &>/dev/null; do sleep 1; done
echo "      ✓ Anvil ready (block $(cast block-number --rpc-url "$RPC_URL"))"
echo ""

# ── Step 2: Deploy V4 hookathon contracts ────────────────────────────────────

echo "[2/5] Deploying SharedLiquidityPool + Aqua0Hook (salt mining ~5-15s)..."

cd "$CONTRACTS_DIR"
mkdir -p deployments

DEPLOYER_PRIVATE_KEY="$ANVIL_DEPLOYER_KEY" \
  forge script script/DeployV4Hookathon.s.sol:DeployV4Hookathon \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -v 2>&1 | grep -E "(SharedLiquidityPool|Aqua0Hook|Mined|saved|ERROR|Error)" || true

if [ ! -f "$DEPLOYMENT_JSON" ]; then
  echo "      ERROR: Deployment failed — $DEPLOYMENT_JSON not found"
  exit 1
fi

SHARED_POOL=$(jq -r .sharedLiquidityPool "$DEPLOYMENT_JSON")
HOOK_ADDR=$(jq -r .aqua0Hook "$DEPLOYMENT_JSON")
POOL_MANAGER=$(jq -r .poolManager "$DEPLOYMENT_JSON")

echo "      ✓ SharedLiquidityPool: $SHARED_POOL"
echo "      ✓ Aqua0Hook:           $HOOK_ADDR"
echo "      ✓ PoolManager (fork):  $POOL_MANAGER"
echo ""

# ── Step 2.5: Initialize V4 pools ────────────────────────────────────────────

echo "[2.5/5] Initializing V4 pools (ETH/mUSDC + mUSDC/mWBTC)..."

cd "$CONTRACTS_DIR"
AQUA0_HOOK_ADDR="$HOOK_ADDR" \
POOL_MANAGER_ADDR="$POOL_MANAGER" \
DEPLOYER_PRIVATE_KEY="$ANVIL_DEPLOYER_KEY" \
FUND_TARGET="$FUND_TARGET" \
  forge script script/InitializePools.s.sol:InitializePools \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvvv 

TOKENS_JSON="$CONTRACTS_DIR/deployments/v4-hookathon-local-tokens.json"
if [ -f "$TOKENS_JSON" ]; then
  # Merge token/pool info into the main deployment JSON
  jq -s '.[0] * .[1]' "$DEPLOYMENT_JSON" "$TOKENS_JSON" > /tmp/aqua0_merged.json
  mv /tmp/aqua0_merged.json "$DEPLOYMENT_JSON"
  MOCK_USDC=$(jq -r .mockUsdc "$DEPLOYMENT_JSON")
  MOCK_WBTC=$(jq -r .mockWbtc "$DEPLOYMENT_JSON")
  echo "      ✓ MockUSDC: $MOCK_USDC"
  echo "      ✓ MockWBTC: $MOCK_WBTC"
  echo "      ✓ Pool 1: ETH(native) / mUSDC"
  echo "      ✓ Pool 2: mUSDC / mWBTC"
else
  echo "      WARNING: token JSON not found — pools may not have initialized correctly"
  MOCK_USDC="(not deployed)"
  MOCK_WBTC="(not deployed)"
fi
echo ""

# ── Step 3: Fund wallets ──────────────────────────────────────────────────────

echo "[3/5] Funding $FUND_TARGET..."

cast send \
  --rpc-url "$RPC_URL" \
  --private-key "$ANVIL_DEPLOYER_KEY" \
  --value "$FUND_AMOUNT" \
  "$FUND_TARGET" \
  > /dev/null 2>&1

BALANCE=$(cast balance "$FUND_TARGET" --rpc-url "$RPC_URL" --ether)
echo "      ✓ Balance: $BALANCE ETH"
echo ""

# ── Step 4: Otterscan ────────────────────────────────────────────────────────

if [ "$SKIP_OTTERSCAN" != "1" ]; then
  echo "[4/5] Starting Otterscan..."
  cd "$BACKEND_DIR"
  docker compose up -d otterscan 2>&1 | grep -v "^#" | tail -5
  echo "      ✓ Otterscan: http://localhost:5100"
else
  echo "[4/5] Otterscan skipped."
fi
echo ""

# ── Step 5: Start API ─────────────────────────────────────────────────────────

echo "[5/5] Starting backend API on :3001..."
cd "$BACKEND_DIR/packages/api"

V4_DEPLOYMENT_JSON_PATH="$DEPLOYMENT_JSON" \
RPC_URL_ANVIL="$RPC_URL" \
  bun run dev &
API_PID=$!

sleep 2
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Local Stack Running!                        ║"
echo "║                                                          ║"
echo "║  API:        http://localhost:3001                       ║"
echo "║  Anvil RPC:  http://localhost:$ANVIL_PORT                       ║"
echo "║  Otterscan:  http://localhost:5100                       ║"
echo "║                                                          ║"
printf "║  SharedPool: %-44s║\n" "$SHARED_POOL"
printf "║  Hook:       %-44s║\n" "$HOOK_ADDR"
echo "║                                                          ║"
printf "║  MockUSDC:   %-44s║\n" "$MOCK_USDC"
printf "║  MockWBTC:   %-44s║\n" "$MOCK_WBTC"
echo "║  Pools:      ETH/mUSDC  •  mUSDC/mWBTC                  ║"
echo "║                                                          ║"
printf "║  Funded:     %-44s║\n" "$FUND_TARGET"
echo "║                                                          ║"
echo "║  Press Ctrl+C to stop all services                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

wait $API_PID
