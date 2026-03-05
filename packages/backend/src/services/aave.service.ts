import { GraphQLClient, gql } from "graphql-request";

const AAVE_SUBGRAPHS: Record<number, string> = {
  1: "https://api.thegraph.com/subgraphs/name/aave/protocol-v3",
  42161: "https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum",
  10: "https://api.thegraph.com/subgraphs/name/aave/protocol-v3-optimism",
  8453: "https://api.thegraph.com/subgraphs/name/aave/protocol-v3-base",
};

const GET_USER_POSITIONS = gql`
  query GetUserPositions($userAddress: String!) {
    userReserves(where: { user: $userAddress }) {
      id
      currentATokenBalance
      currentVariableDebt
      currentStableDebt
      reserve { symbol decimals underlyingAsset liquidityRate variableBorrowRate baseLTVasCollateral reserveLiquidationThreshold price { priceInEth } }
      usageAsCollateralEnabledOnUser
    }
  }
`;

export interface AavePosition {
  protocol: "aave"; chainId: number; collateralAsset: string; collateralSymbol: string;
  collateralAmount: string; debtAsset: string; debtSymbol: string; debtAmount: string;
  healthFactor: number; liquidationThreshold: number;
}

/**
 * Compute account-level health factor from all user reserves.
 *
 * HF = sum(collateralAmount * priceInEth * liquidationThreshold) / sum(debtAmount * priceInEth)
 *
 * The Aave subgraph stores:
 * - currentATokenBalance: raw token balance (in token decimals, as string)
 * - currentVariableDebt / currentStableDebt: debt amounts (same)
 * - reserve.price.priceInEth: price in ETH (as string, in wei = 1e18)
 * - reserve.reserveLiquidationThreshold: in basis points (e.g. 8250 = 82.50%)
 * - reserve.decimals: token decimals
 *
 * We normalize all values to a common unit for the ratio.
 */
function computeAccountHealthFactor(userReserves: any[]): number {
  let totalCollateralTimesLtEth = 0;
  let totalDebtEth = 0;

  for (const r of userReserves) {
    const decimals = parseInt(r.reserve.decimals || "18");
    const priceInEth = parseFloat(r.reserve.price?.priceInEth || "0");
    const liquidationThreshold = parseFloat(r.reserve.reserveLiquidationThreshold || "0");

    // Collateral contribution: only if enabled as collateral
    if (r.usageAsCollateralEnabledOnUser) {
      const aTokenBalance = parseFloat(r.currentATokenBalance || "0");
      // Normalize: balance is in token units (already decimal-adjusted from subgraph in many cases,
      // but the subgraph returns raw amounts, so we divide by 10^decimals)
      const normalizedCollateral = aTokenBalance / Math.pow(10, decimals);
      // priceInEth is in wei (1e18), normalize to ETH
      const normalizedPrice = priceInEth / 1e18;
      // liquidationThreshold is in basis points (10000 = 100%)
      const ltFraction = liquidationThreshold / 10000;

      totalCollateralTimesLtEth += normalizedCollateral * normalizedPrice * ltFraction;
    }

    // Debt contribution: variable + stable
    const variableDebt = parseFloat(r.currentVariableDebt || "0");
    const stableDebt = parseFloat(r.currentStableDebt || "0");
    const totalDebt = variableDebt + stableDebt;
    if (totalDebt > 0) {
      const normalizedDebt = totalDebt / Math.pow(10, decimals);
      const normalizedPrice = priceInEth / 1e18;
      totalDebtEth += normalizedDebt * normalizedPrice;
    }
  }

  if (totalDebtEth === 0) return Infinity;
  return totalCollateralTimesLtEth / totalDebtEth;
}

export async function getAavePositions(address: string, chainId: number): Promise<AavePosition[]> {
  const endpoint = AAVE_SUBGRAPHS[chainId];
  if (!endpoint) return [];
  try {
    const client = new GraphQLClient(endpoint);
    const data = await client.request<{ userReserves: any[] }>(GET_USER_POSITIONS, { userAddress: address.toLowerCase() });
    const userReserves = data.userReserves || [];
    if (userReserves.length === 0) return [];

    // Compute account-level health factor across all reserves
    const accountHealthFactor = computeAccountHealthFactor(userReserves);

    // Filter to reserves that have debt (these are the positions we report)
    return userReserves
      .filter((r: any) => parseFloat(r.currentVariableDebt) > 0 || parseFloat(r.currentStableDebt) > 0)
      .map((r: any) => ({
        protocol: "aave" as const,
        chainId,
        collateralAsset: r.reserve.underlyingAsset,
        collateralSymbol: r.reserve.symbol,
        collateralAmount: r.currentATokenBalance,
        debtAsset: r.reserve.underlyingAsset,
        debtSymbol: r.reserve.symbol,
        debtAmount: (parseFloat(r.currentVariableDebt || "0") + parseFloat(r.currentStableDebt || "0")).toString(),
        healthFactor: accountHealthFactor,
        liquidationThreshold: parseFloat(r.reserve.reserveLiquidationThreshold) / 10000,
      }));
  } catch (error) {
    console.error(`Aave fetch error for chain ${chainId}:`, error);
    return [];
  }
}
