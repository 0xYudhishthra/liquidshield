import { gql } from "graphql-request";
export const MORPHO_USER_POSITIONS = gql`
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
