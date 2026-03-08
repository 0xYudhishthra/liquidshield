import { gql } from "graphql-request";
export const AAVE_USER_POSITIONS = gql`
  query GetUserPositions($userAddress: String!) {
    userReserves(where: { user: $userAddress }) {
      id currentATokenBalance currentVariableDebt currentStableDebt
      reserve { symbol decimals underlyingAsset liquidityRate variableBorrowRate baseLTVasCollateral reserveLiquidationThreshold price { priceInEth } }
      usageAsCollateralEnabledOnUser
    }
  }
`;
