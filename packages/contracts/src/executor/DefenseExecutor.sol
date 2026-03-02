// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILendingAdapter} from "../interfaces/ILendingAdapter.sol";
import {IDefenseExecutor} from "../interfaces/IDefenseExecutor.sol";
import {Errors} from "../lib/Errors.sol";
import {Events} from "../lib/Events.sol";

/// @title DefenseExecutor
/// @author LiquidShield Team
/// @notice Executes defense actions on source chains via lending protocol adapters
/// @dev Deployed on each source chain (Arbitrum, Ethereum). Called by the authorized filler
///      to deposit collateral or withdraw (unwind) via the appropriate lending adapter.
///      Follows CEI pattern throughout.
contract DefenseExecutor is IDefenseExecutor {
    using SafeERC20 for IERC20;

    // ============ ENUMS ============

    enum DefenseStrategy { COLLATERAL_TOPUP, BATCHED_UNWIND }

    // ============ STATE VARIABLES ============

    /// @notice Contract owner for admin operations
    address public owner;

    /// @notice Authorized filler address for defense execution
    address public authorizedFiller;

    // ============ MODIFIERS ============

    modifier onlyFiller() {
        if (msg.sender != authorizedFiller) revert Errors.UnauthorizedCaller();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.UnauthorizedCaller();
        _;
    }

    // ============ CONSTRUCTOR ============

    /// @notice Deploys the defense executor
    /// @param _filler Address of the authorized filler
    constructor(address _filler) {
        if (_filler == address(0)) revert Errors.ZeroAddress();
        authorizedFiller = _filler;
        owner = msg.sender;
    }

    // ============ EXTERNAL FUNCTIONS (STATE-CHANGING) ============

    /// @notice Updates the authorized filler address
    /// @param _filler New filler address
    function setFiller(address _filler) external onlyOwner {
        authorizedFiller = _filler;
    }

    /// @notice Executes a defense action on the source chain
    /// @dev For COLLATERAL_TOPUP: transfers tokens from filler, approves adapter, deposits collateral.
    ///      For BATCHED_UNWIND: withdraws collateral via adapter.
    /// @param positionId Unique identifier of the position being defended
    /// @param lendingAdapter Address of the lending protocol adapter
    /// @param user Address of the position owner on the lending protocol
    /// @param collateralAsset Address of the collateral token
    /// @param collateralAmount Amount of collateral to deposit or withdraw
    /// @param strategy Defense strategy (0 = COLLATERAL_TOPUP, 1 = BATCHED_UNWIND)
    function executeDefense(
        bytes32 positionId, address lendingAdapter, address user,
        address collateralAsset, uint256 collateralAmount, uint8 strategy
    ) external onlyFiller {
        if (lendingAdapter == address(0)) revert Errors.InvalidAdapter();

        if (strategy == uint8(DefenseStrategy.COLLATERAL_TOPUP)) {
            IERC20(collateralAsset).safeTransferFrom(msg.sender, address(this), collateralAmount);
            IERC20(collateralAsset).forceApprove(lendingAdapter, collateralAmount);
            ILendingAdapter(lendingAdapter).depositCollateral(user, collateralAsset, collateralAmount);
        } else {
            ILendingAdapter(lendingAdapter).withdrawCollateral(user, collateralAsset, collateralAmount);
        }

        emit Events.DefenseExecuted(positionId, lendingAdapter, collateralAmount, strategy);
    }
}
