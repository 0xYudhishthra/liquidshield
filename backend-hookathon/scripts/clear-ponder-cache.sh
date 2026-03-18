#!/usr/bin/env bash
# ============================================
# Clear Ponder Indexer Schema Cache
# ============================================
# Removes the .ponder/ directory which contains the locked schema cache.
# This prevents stale schema state from causing conflicts when the
# ponder-indexer schema or handlers are modified.
#
# Run automatically via the "preinstall" hook in ponder-indexer/package.json,
# or manually:  pnpm --filter ponder-indexer clean:cache

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PONDER_DIR="$SCRIPT_DIR/../packages/ponder-indexer"

CACHE_DIR="$PONDER_DIR/.ponder"
GENERATED_DIR="$PONDER_DIR/generated"

removed=0

if [ -d "$CACHE_DIR" ]; then
  rm -rf "$CACHE_DIR"
  echo "Cleared Ponder schema cache: .ponder/"
  removed=1
fi

if [ -d "$GENERATED_DIR" ]; then
  rm -rf "$GENERATED_DIR"
  echo "Cleared Ponder generated types: generated/"
  removed=1
fi

if [ "$removed" -eq 0 ]; then
  echo "Ponder cache already clean — nothing to remove."
fi
