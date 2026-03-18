// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

/// @title IDefenseExecutor
/// @notice Interface for the source-chain defense executor
/// @dev Implemented by DefenseExecutor, called by the filler to execute
///      defense actions (collateral top-up or batched unwind) on source chains.
interface IDefenseExecutor {
    /// @notice Executes a defense action on the source chain
    /// @param positionId Unique identifier of the position being defended
    /// @param lendingAdapter Address of the lending protocol adapter
    /// @param user Address of the position owner on the lending protocol
    /// @param collateralAsset Address of the collateral token
    /// @param collateralAmount Amount of collateral to deposit or withdraw
    /// @param strategy Defense strategy (0 = COLLATERAL_TOPUP, 1 = BATCHED_UNWIND)
    function executeDefense(
        bytes32 positionId,
        address lendingAdapter,
        address user,
        address collateralAsset,
        uint256 collateralAmount,
        uint8 strategy
    ) external;
}
