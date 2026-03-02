// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILendingAdapter} from "../interfaces/ILendingAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Morpho Blue market parameters
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

/// @notice Minimal interface for Morpho Blue protocol
interface IMorpho {
    function supplyCollateral(MarketParams calldata marketParams, uint256 assets, address onBehalf, bytes calldata data) external;
    function withdrawCollateral(MarketParams calldata marketParams, uint256 assets, address onBehalf, address receiver) external;
    function repay(MarketParams calldata marketParams, uint256 assets, uint256 shares, address onBehalf, bytes calldata data) external returns (uint256, uint256);
    function position(bytes32 id, address user) external view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral);
    function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee);
}

/// @notice Minimal interface for Morpho oracle
interface IMorphoOracle {
    function price() external view returns (uint256);
}

/// @title MorphoBlueAdapter
/// @author LiquidShield Team
/// @notice Lending adapter for Morpho Blue protocol interactions
/// @dev Implements ILendingAdapter to provide unified interface for health checks,
///      collateral deposits, debt repayment, and withdrawals on Morpho Blue.
///      Health factor is computed from position data, oracle price, and LLTV.
contract MorphoBlueAdapter is ILendingAdapter {

    // ============ STATE VARIABLES ============

    /// @notice Morpho Blue protocol contract
    IMorpho public immutable morpho;

    /// @notice Market identifier for this adapter's market
    bytes32 public immutable marketId;

    /// @notice Market parameters for this adapter's market
    MarketParams public marketParams;

    // ============ CONSTRUCTOR ============

    /// @notice Deploys the Morpho Blue adapter for a specific market
    /// @param _morpho Address of the Morpho Blue protocol contract
    /// @param _marketParams Market parameters (loanToken, collateralToken, oracle, irm, lltv)
    /// @param _marketId Unique market identifier
    constructor(address _morpho, MarketParams memory _marketParams, bytes32 _marketId) {
        morpho = IMorpho(_morpho);
        marketParams = _marketParams;
        marketId = _marketId;
    }

    // ============ EXTERNAL FUNCTIONS (VIEW/PURE) ============

    /// @notice Returns the health factor for a user on Morpho Blue
    /// @dev Computes HF = (collateralValue * LLTV) / (debtValue * 1e18)
    /// @param user Address of the user to check
    /// @return Health factor in 36-decimal fixed point, or type(uint256).max if no borrow
    function getHealthFactor(address user) external view override returns (uint256) {
        (, uint128 borrowShares, uint128 collateral) = morpho.position(marketId, user);
        if (borrowShares == 0) return type(uint256).max;

        (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = morpho.market(marketId);
        uint256 collateralValue = uint256(collateral) * IMorphoOracle(marketParams.oracle).price();
        uint256 debtValue = _toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares);
        if (debtValue == 0) return type(uint256).max;

        return (collateralValue * marketParams.lltv) / (debtValue * 1e18);
    }

    /// @notice Returns detailed position data for a user on Morpho Blue
    /// @param user Address of the user to query
    /// @return collateralAssets Array containing the collateral token address
    /// @return collateralAmounts Array containing the collateral amount
    /// @return debtAssets Array containing the loan token address
    /// @return debtAmounts Array containing the debt amount (ceiling division)
    /// @return healthFactor Health factor in 36-decimal fixed point
    function getPositionData(address user) external view override returns (
        address[] memory collateralAssets, uint256[] memory collateralAmounts,
        address[] memory debtAssets, uint256[] memory debtAmounts, uint256 healthFactor
    ) {
        (, uint128 borrowShares, uint128 collateral) = morpho.position(marketId, user);

        collateralAssets = new address[](1);
        collateralAssets[0] = marketParams.collateralToken;
        collateralAmounts = new uint256[](1);
        collateralAmounts[0] = collateral;

        debtAssets = new address[](1);
        debtAssets[0] = marketParams.loanToken;
        debtAmounts = new uint256[](1);
        (,, uint128 totalBorrowAssets, uint128 totalBorrowShares,,) = morpho.market(marketId);
        debtAmounts[0] = _toAssetsUp(borrowShares, totalBorrowAssets, totalBorrowShares);

        healthFactor = this.getHealthFactor(user);
    }

    // ============ EXTERNAL FUNCTIONS (STATE-CHANGING) ============

    /// @notice Deposits collateral into Morpho Blue on behalf of a user
    /// @param user Address of the user to deposit for
    /// @param asset Address of the collateral token
    /// @param amount Amount of collateral to deposit
    function depositCollateral(address user, address asset, uint256 amount) external override {
        IERC20(asset).approve(address(morpho), amount);
        morpho.supplyCollateral(marketParams, amount, user, "");
    }

    /// @notice Repays debt on Morpho Blue on behalf of a user
    /// @param user Address of the user to repay for
    /// @param asset Address of the loan token
    /// @param amount Amount of debt to repay
    function repayDebt(address user, address asset, uint256 amount) external override {
        IERC20(asset).approve(address(morpho), amount);
        morpho.repay(marketParams, amount, 0, user, "");
    }

    /// @notice Withdraws collateral from Morpho Blue
    /// @param user Address of the user to withdraw for
    /// @param amount Amount of collateral to withdraw
    function withdrawCollateral(address user, address, uint256 amount) external override {
        morpho.withdrawCollateral(marketParams, amount, user, user);
    }

    // ============ INTERNAL FUNCTIONS (VIEW/PURE) ============

    /// @notice Converts shares to assets using ceiling division
    /// @param shares Number of shares to convert
    /// @param totalAssets Total assets in the market
    /// @param totalShares Total shares in the market
    /// @return The asset amount (rounded up)
    function _toAssetsUp(uint128 shares, uint128 totalAssets, uint128 totalShares) internal pure returns (uint256) {
        if (totalShares == 0) return 0;
        return (uint256(shares) * uint256(totalAssets) + uint256(totalShares) - 1) / uint256(totalShares);
    }
}
