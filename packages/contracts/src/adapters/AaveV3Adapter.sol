// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILendingAdapter} from "../interfaces/ILendingAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal interface for Aave V3 Pool
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256);
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function getUserAccountData(address user) external view returns (
        uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase,
        uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor
    );
}

/// @title AaveV3Adapter
/// @author LiquidShield Team
/// @notice Lending adapter for Aave V3 protocol interactions
/// @dev Implements ILendingAdapter to provide unified interface for health checks,
///      collateral deposits, debt repayment, and withdrawals on Aave V3.
contract AaveV3Adapter is ILendingAdapter {

    // ============ STATE VARIABLES ============

    /// @notice Aave V3 Pool contract
    IAavePool public immutable aavePool;

    // ============ CONSTRUCTOR ============

    /// @notice Deploys the Aave V3 adapter
    /// @param _aavePool Address of the Aave V3 Pool contract
    constructor(address _aavePool) {
        aavePool = IAavePool(_aavePool);
    }

    // ============ EXTERNAL FUNCTIONS (VIEW/PURE) ============

    /// @notice Returns the health factor for a user on Aave V3
    /// @param user Address of the user to check
    /// @return Health factor in 18-decimal fixed point
    function getHealthFactor(address user) external view override returns (uint256) {
        (,,,,, uint256 hf) = aavePool.getUserAccountData(user);
        return hf;
    }

    /// @notice Returns position data for a user on Aave V3
    /// @param user Address of the user to query
    /// @return collateralAssets Empty array (Aave returns aggregate data)
    /// @return collateralAmounts Empty array
    /// @return debtAssets Empty array
    /// @return debtAmounts Empty array
    /// @return healthFactor Health factor in 18-decimal fixed point
    function getPositionData(address user) external view override returns (
        address[] memory collateralAssets, uint256[] memory collateralAmounts,
        address[] memory debtAssets, uint256[] memory debtAmounts, uint256 healthFactor
    ) {
        (,,,,, healthFactor) = aavePool.getUserAccountData(user);
        collateralAssets = new address[](0);
        collateralAmounts = new uint256[](0);
        debtAssets = new address[](0);
        debtAmounts = new uint256[](0);
    }

    // ============ EXTERNAL FUNCTIONS (STATE-CHANGING) ============

    /// @notice Deposits collateral into Aave V3 on behalf of a user
    /// @param user Address of the user to deposit for
    /// @param asset Address of the collateral token
    /// @param amount Amount of collateral to deposit
    function depositCollateral(address user, address asset, uint256 amount) external override {
        IERC20(asset).approve(address(aavePool), amount);
        aavePool.supply(asset, amount, user, 0);
    }

    /// @notice Repays debt on Aave V3 on behalf of a user
    /// @param user Address of the user to repay for
    /// @param asset Address of the debt token
    /// @param amount Amount of debt to repay
    function repayDebt(address user, address asset, uint256 amount) external override {
        IERC20(asset).approve(address(aavePool), amount);
        aavePool.repay(asset, amount, 2, user);
    }

    /// @notice Withdraws collateral from Aave V3
    /// @param asset Address of the collateral token
    /// @param amount Amount of collateral to withdraw
    function withdrawCollateral(address, address asset, uint256 amount) external override {
        aavePool.withdraw(asset, amount, msg.sender);
    }
}
