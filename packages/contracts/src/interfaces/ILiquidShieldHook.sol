// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILiquidShieldHook
/// @notice Interface for the core LiquidShield hook contract
/// @dev Used by the router and settler to interact with the hook.
interface ILiquidShieldHook {
    enum DefenseStrategy { COLLATERAL_TOPUP, BATCHED_UNWIND }
    enum PositionStatus { ACTIVE, DEFENDING, UNWINDING, CLOSED }

    struct ProtectedPosition {
        address owner;
        address collateralAsset;
        address debtAsset;
        address lendingAdapter;
        uint256 positionSize;
        uint256 healthThreshold;
        uint256 sourceChainId;
        uint256 premiumPaidUntil;
        DefenseStrategy strategy;
        PositionStatus status;
    }

    /// @notice Registers a lending position for liquidation protection
    function registerPosition(
        bytes32 positionId, address onBehalfOf, address collateralAsset, address debtAsset,
        uint256 positionSize, uint256 healthThreshold, DefenseStrategy strategy,
        uint256 sourceChainId, address lendingAdapter, uint256 premiumMonths
    ) external;

    /// @notice Unregisters a protected position
    function unregisterPosition(bytes32 positionId, address onBehalfOf) external;

    /// @notice Triggers a defense action for a position
    function triggerDefense(bytes32 positionId, uint256 currentHealth) external;

    /// @notice Settles a defense action after filler execution
    function settleDefense(bytes32 positionId, uint256 defenseAmount) external;

    /// @notice Deposits tokens into the defense reserve
    function depositToReserve(address token, uint256 amount) external;

    /// @notice Pays premium for a protected position
    function payPremium(bytes32 positionId, address token, uint256 amount, uint256 additionalMonths) external;

    /// @notice Donates accumulated premiums to LPs
    function donatePremiumsToLPs() external;

    /// @notice Returns position data for a given position ID
    function getPosition(bytes32 positionId) external view returns (ProtectedPosition memory);

    /// @notice Returns the current defense reserve balances
    function getReserveBalances() external view returns (uint256 reserve0, uint256 reserve1);

    /// @notice Returns the accumulated premium balances
    function getAccumulatedPremiums() external view returns (uint256 premiums0, uint256 premiums1);
}
