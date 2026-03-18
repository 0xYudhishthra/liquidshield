#!/usr/bin/env bash
# ============================================================
# mint-tokens.sh — Mint Aqua0 mock tokens on Unichain Sepolia
# Usage: ./mint-tokens.sh <recipient-address>
# ============================================================

set -euo pipefail

RECIPIENT="${1:-}"

if [[ -z "$RECIPIENT" ]]; then
  echo "Usage: ./mint-tokens.sh <recipient-address>"
  echo "Example: ./mint-tokens.sh 0xABCDEF..."
  exit 1
fi

# ── Config ───────────────────────────────────────────────────
RPC="https://unichain-sepolia-rpc.publicnode.com"
PRIVATE_KEY="0xdeb0521974dcac6fc988dbc49ff1883dbe9d5d4b46306a8377fabf737889a0a2"

# Token addresses (Unichain Sepolia)
MUSDC="0x73c56ddD816e356387Caf740c804bb9D379BE47E"
MDAI="0x0e6f9cD4C00b05E3857cEeA36ec7bEA68fa7e7eD"
MWBTC="0x8508A009DA4BD177D1aEeeC00CBa64f4316BbD2B"
MWETH="0x7fF28651365c735c22960E27C2aFA97AbE4Cf2Ad"

# Amounts to mint (in token-wei, all 18 decimals)
STABLE_AMOUNT="10000000000000000000000000"   # 10,000,000 tokens
WBTC_AMOUNT="1000000000000000000000"          # 1,000 tokens
WETH_AMOUNT="1000000000000000000000000"       # 1,000,000 tokens

echo "================================================"
echo "  Aqua0 Mock Token Minter — Unichain Sepolia"
echo "================================================"
echo "  Recipient: $RECIPIENT"
echo ""

# ── Mint function (MockERC20.mint) ───────────────────────────
mint() {
  local label="$1"
  local token="$2"
  local amount="$3"

  echo -n "  Minting $label... "
  cast send \
    --rpc-url "$RPC" \
    --private-key "$PRIVATE_KEY" \
    --legacy \
    "$token" \
    "mint(address,uint256)" \
    "$RECIPIENT" \
    "$amount" \
    --confirmations 1 \
    > /dev/null 2>&1
  echo "✅  done"
}

mint "10,000,000 mUSDC" "$MUSDC" "$STABLE_AMOUNT"
mint "10,000,000 mDAI"  "$MDAI"  "$STABLE_AMOUNT"
mint "1,000 mWBTC"      "$MWBTC" "$WBTC_AMOUNT"
mint "1,000,000 mWETH"  "$MWETH" "$WETH_AMOUNT"

echo ""
echo "================================================"
echo "  ✅ Done! Check your balances:"
echo ""
echo "  mUSDC: cast call $MUSDC 'balanceOf(address)(uint256)' $RECIPIENT --rpc-url $RPC"
echo "  mDAI:  cast call $MDAI  'balanceOf(address)(uint256)' $RECIPIENT --rpc-url $RPC"
echo "  mWBTC: cast call $MWBTC 'balanceOf(address)(uint256)' $RECIPIENT --rpc-url $RPC"
echo "  mWETH: cast call $MWETH 'balanceOf(address)(uint256)' $RECIPIENT --rpc-url $RPC"
echo "================================================"
