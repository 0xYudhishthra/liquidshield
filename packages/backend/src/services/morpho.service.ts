import { GraphQLClient, gql } from "graphql-request";

const MORPHO_API = "https://api.morpho.org/graphql";

const GET_MORPHO_POSITIONS = gql`
  query GetMorphoPositions($address: String!, $chainId: Int!) {
    userByAddress(address: $address, chainId: $chainId) {
      address
      marketPositions {
        market { uniqueKey lltv loanAsset { address symbol decimals } collateralAsset { address symbol decimals } state { borrowAssets supplyAssets } }
        state { supplyAssets supplyAssetsUsd borrowAssets borrowAssetsUsd collateral collateralUsd }
      }
    }
  }
`;

export interface MorphoPosition {
  protocol: "morpho"; chainId: number; marketKey: string; collateralAsset: string;
  collateralSymbol: string; collateralAmount: string; collateralUsd: number;
  debtAsset: string; debtSymbol: string; debtAmount: string; debtUsd: number;
  healthFactor: number; lltv: number;
}

export async function getMorphoPositions(address: string, chainId: number): Promise<MorphoPosition[]> {
  try {
    const client = new GraphQLClient(MORPHO_API);
    const data = await client.request<{ userByAddress: any }>(GET_MORPHO_POSITIONS, { address, chainId });
    const userData = data.userByAddress;
    if (!userData?.marketPositions?.length) return [];
    return userData.marketPositions.filter((p: any) => parseFloat(p.state.borrowAssets) > 0).map((p: any) => {
      const collateralUsd = parseFloat(p.state.collateralUsd || "0");
      const borrowUsd = parseFloat(p.state.borrowAssetsUsd || "0");
      const lltv = parseFloat(p.market.lltv || "0");
      return {
        protocol: "morpho" as const, chainId, marketKey: p.market.uniqueKey,
        collateralAsset: p.market.collateralAsset?.address || "", collateralSymbol: p.market.collateralAsset?.symbol || "???",
        collateralAmount: p.state.collateral || "0", collateralUsd,
        debtAsset: p.market.loanAsset?.address || "", debtSymbol: p.market.loanAsset?.symbol || "???",
        debtAmount: p.state.borrowAssets || "0", debtUsd: borrowUsd,
        healthFactor: borrowUsd > 0 ? (collateralUsd * lltv) / borrowUsd : Infinity, lltv,
      };
    });
  } catch (error) { console.error(`Morpho fetch error for chain ${chainId}:`, error); return []; }
}
