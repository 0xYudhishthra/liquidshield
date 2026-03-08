// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILiquidShieldHook} from "../interfaces/ILiquidShieldHook.sol";
import {Errors} from "../lib/Errors.sol";

/// @title LiquidShieldRouter
/// @author LiquidShield Team
/// @notice User-facing router for position registration, premium payments, and management
/// @dev Routes calls to the LiquidShield hook, passing msg.sender as onBehalfOf
///      so the hook stores the actual user (not the router) as position owner.
contract LiquidShieldRouter {
    using SafeERC20 for IERC20;

    // ============ STATE VARIABLES ============

    /// @notice Address of the LiquidShield hook contract
    ILiquidShieldHook public immutable hook;

    // ============ CONSTRUCTOR ============

    /// @notice Deploys the router contract
    /// @param _hook Address of the LiquidShield hook contract
    constructor(address _hook) {
        if (_hook == address(0)) revert Errors.ZeroAddress();
        hook = ILiquidShieldHook(_hook);
    }

    // ============ EXTERNAL FUNCTIONS (STATE-CHANGING) ============

    /// @notice Registers a position and pays premium in a single transaction
    /// @param positionId Unique identifier for the position
    /// @param collateralAsset Address of the collateral token on the source chain
    /// @param debtAsset Address of the debt token on the source chain
    /// @param positionSize Size of the position in collateral terms
    /// @param healthThreshold Health factor threshold for defense trigger
    /// @param strategy Defense strategy (COLLATERAL_TOPUP or BATCHED_UNWIND)
    /// @param sourceChainId Chain ID where the lending position resides
    /// @param lendingAdapter Address of the lending adapter on the source chain
    /// @param premiumMonths Number of months of premium coverage
    /// @param premiumToken Token used for premium payment
    /// @param premiumAmount Amount of premium to pay
    function registerAndPayPremium(
        bytes32 positionId, address collateralAsset, address debtAsset, uint256 positionSize,
        uint256 healthThreshold, ILiquidShieldHook.DefenseStrategy strategy,
        uint256 sourceChainId, address lendingAdapter, uint256 premiumMonths,
        address premiumToken, uint256 premiumAmount
    ) external {
        // Pass msg.sender as onBehalfOf so the hook stores the actual user as owner
        hook.registerPosition(
            positionId, msg.sender, collateralAsset, debtAsset, positionSize,
            healthThreshold, strategy, sourceChainId, lendingAdapter, premiumMonths
        );

        if (premiumAmount > 0) {
            IERC20(premiumToken).safeTransferFrom(msg.sender, address(this), premiumAmount);
            IERC20(premiumToken).forceApprove(address(hook), premiumAmount);
            hook.payPremium(positionId, premiumToken, premiumAmount, premiumMonths);
        }
    }

    /// @notice Unregisters a protected position on behalf of the caller
    /// @param positionId Unique identifier of the position to unregister
    function unregister(bytes32 positionId) external {
        hook.unregisterPosition(positionId, msg.sender);
    }

    /// @notice Tops up premium for an existing position
    /// @param positionId Unique identifier of the position
    /// @param token Token used for premium payment
    /// @param amount Amount of premium to pay
    /// @param months Number of additional months of coverage
    function topUpPremium(bytes32 positionId, address token, uint256 amount, uint256 months) external {
        if (amount == 0) revert Errors.InvalidAmount();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(address(hook), amount);
        hook.payPremium(positionId, token, amount, months);
    }
}
