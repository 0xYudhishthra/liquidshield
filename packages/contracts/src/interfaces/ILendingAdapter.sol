// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

/// @title ILendingAdapter
/// @notice Interface for lending protocol adapters used by LiquidShield
/// @dev Implemented by AaveV3Adapter and MorphoBlueAdapter to provide a unified
///      interface for health checks, collateral management, and debt operations.
interface ILendingAdapter {
    /// @notice Returns the health factor for a user on the lending protocol
    /// @param user Address of the user to check
    /// @return Health factor (protocol-specific scaling)
    function getHealthFactor(address user) external view returns (uint256);

    /// @notice Deposits collateral on behalf of a user
    /// @param user Address of the user to deposit for
    /// @param asset Address of the collateral token
    /// @param amount Amount of collateral to deposit
    function depositCollateral(address user, address asset, uint256 amount) external;

    /// @notice Repays debt on behalf of a user
    /// @param user Address of the user to repay for
    /// @param asset Address of the debt token
    /// @param amount Amount of debt to repay
    function repayDebt(address user, address asset, uint256 amount) external;

    /// @notice Withdraws collateral on behalf of a user
    /// @param user Address of the user to withdraw for
    /// @param asset Address of the collateral token
    /// @param amount Amount of collateral to withdraw
    function withdrawCollateral(address user, address asset, uint256 amount) external;

    /// @notice Returns detailed position data for a user
    /// @param user Address of the user to query
    /// @return collateralAssets Array of collateral token addresses
    /// @return collateralAmounts Array of collateral amounts
    /// @return debtAssets Array of debt token addresses
    /// @return debtAmounts Array of debt amounts
    /// @return healthFactor Current health factor
    function getPositionData(address user) external view returns (
        address[] memory collateralAssets,
        uint256[] memory collateralAmounts,
        address[] memory debtAssets,
        uint256[] memory debtAmounts,
        uint256 healthFactor
    );
}
