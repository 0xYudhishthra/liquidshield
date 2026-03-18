// ============================================
// Metrics Utilities
// ============================================

/**
 * Generate a unique ID for daily metrics
 */
export function getDailyMetricsId(chainId: number, timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000).toISOString().split("T")[0];
  return `${chainId}-${date}`;
}

/**
 * Get date string from timestamp
 */
export function getDateFromTimestamp(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toISOString().split("T")[0];
}

/**
 * Generate maker stats ID
 */
export function getMakerStatsId(maker: string, chainId: number): string {
  return `${maker.toLowerCase()}-${chainId}`;
}

/**
 * Generate strategy stats ID
 */
export function getStrategyStatsId(
  strategyHash: string,
  chainId: number,
): string {
  return `${strategyHash.toLowerCase()}-${chainId}`;
}

/**
 * Calculate effective price from swap amounts
 */
export function calculateEffectivePrice(
  amountIn: bigint,
  amountOut: bigint,
): string {
  if (amountIn === 0n) return "0";
  return (Number(amountOut) / Number(amountIn)).toString();
}

/**
 * Generate unique event ID
 */
export function getEventId(
  txHash: string,
  logIndex: number,
  chainId: number,
): string {
  return `${txHash}-${logIndex}-${chainId}`;
}
