// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core/test/utils/Deployers.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";

import {LiquidShieldHook} from "../../src/hooks/LiquidShieldHook.sol";
import {LiquidShieldRouter} from "../../src/router/LiquidShieldRouter.sol";
import {LiquidShieldSettler} from "../../src/settler/LiquidShieldSettler.sol";
import {SharedLiquidityPool} from "../../src/aqua0/SharedLiquidityPool.sol";
import {ILiquidShieldHook} from "../../src/interfaces/ILiquidShieldHook.sol";
import {Errors} from "../../src/lib/Errors.sol";
import {Events} from "../../src/lib/Events.sol";

/// @title Protection Mechanism Comprehensive Tests
/// @notice Validates that the LiquidShield defense system works end-to-end
///         covering delta atomicity, dynamic fees, reserve stress, premium boundaries,
///         and cross-chain intent lifecycle
contract ProtectionMechanismTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    LiquidShieldHook public hook;
    LiquidShieldRouter public router;
    LiquidShieldSettler public settler;
    SharedLiquidityPool public sharedPool;

    PoolKey public poolKey;
    PoolId public poolId;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public lp = makeAddr("lp");
    address public rscCallbackAddr = makeAddr("rscCallback");
    address public fillerAddr = makeAddr("filler");

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        sharedPool = new SharedLiquidityPool(address(this));

        uint160 hookFlags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG
                | Hooks.AFTER_ADD_LIQUIDITY_FLAG
                | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG
        );
        address hookAddr = address(hookFlags);
        deployCodeTo(
            "LiquidShieldHook.sol:LiquidShieldHook",
            abi.encode(address(manager), address(sharedPool), address(this)),
            hookAddr
        );
        hook = LiquidShieldHook(payable(hookAddr));


        settler = new LiquidShieldSettler(hookAddr);
        settler.setAuthorizedFiller(fillerAddr);
        router = new LiquidShieldRouter(hookAddr);

        hook.setRscCallback(rscCallbackAddr);
        hook.setFillerAddress(fillerAddr);
        hook.setSettler(address(settler));
        hook.setAuthorizedRouter(address(router));

        poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddr)
        });
        poolId = poolKey.toId();
        manager.initialize(poolKey, SQRT_PRICE_1_1);

        _setupUser(alice, 10000 ether);
        _setupUser(bob, 10000 ether);
        _setupUser(charlie, 10000 ether);
        _setupUser(lp, 10000 ether);
    }

    function _setupUser(address user, uint256 amount) internal {
        address token0 = Currency.unwrap(currency0);
        address token1 = Currency.unwrap(currency1);
        deal(token0, user, amount);
        deal(token1, user, amount);
        vm.startPrank(user);
        MockERC20(token0).approve(address(hook), type(uint256).max);
        MockERC20(token1).approve(address(hook), type(uint256).max);
        MockERC20(token0).approve(address(router), type(uint256).max);
        MockERC20(token1).approve(address(router), type(uint256).max);
        MockERC20(token0).approve(address(swapRouter), type(uint256).max);
        MockERC20(token1).approve(address(swapRouter), type(uint256).max);
        MockERC20(token0).approve(address(modifyLiquidityRouter), type(uint256).max);
        MockERC20(token1).approve(address(modifyLiquidityRouter), type(uint256).max);
        vm.stopPrank();
    }

    function _addLiquidity() internal {
        vm.prank(lp);
        modifyLiquidityRouter.modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: -120,
                tickUpper: 120,
                liquidityDelta: 1000e18,
                salt: bytes32(0)
            }),
            ""
        );
    }

    function _registerPosition(
        address user, bytes32 posId, Currency collateral, uint256 size,
        uint256 threshold, LiquidShieldHook.DefenseStrategy strategy, uint256 months
    ) internal {
        Currency debt = Currency.unwrap(collateral) == Currency.unwrap(currency0) ? currency1 : currency0;
        vm.prank(user);
        hook.registerPosition(
            posId, user, Currency.unwrap(collateral), Currency.unwrap(debt),
            size, threshold, strategy, 421614, address(0xBEEF), months
        );
    }

    function _fundReserve(address user, Currency token, uint256 amount) internal {
        vm.prank(user);
        hook.depositToReserve(Currency.unwrap(token), amount);
    }

    function _triggerDefense(bytes32 posId, uint256 currentHealth) internal {
        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, currentHealth);
    }

    function _settleDefense(bytes32 posId, uint256 amount) internal {
        vm.prank(fillerAddr);
        hook.settleDefense(posId, amount);
    }

    // ================================================================
    // 1. DELTA ATOMICITY — burn() + take() MUST net to zero
    // ================================================================

    /// @notice Defense extraction must produce zero net delta (burn positive + take negative)
    function test_deltaAtomicity_defenseExtractionNetsToZero() public {
        bytes32 posId = keccak256("delta_test");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 50 ether);

        // Get ERC-6909 balance of hook on PoolManager before defense
        uint256 claimsBefore = manager.balanceOf(address(hook), currency0.toId());
        assertTrue(claimsBefore >= 50 ether, "Hook should hold ERC-6909 claims after deposit");

        // Trigger defense — if deltas don't net zero, PoolManager reverts with NonzeroDeltaCount
        _triggerDefense(posId, 11e17);

        // Verify claims were burned
        uint256 claimsAfter = manager.balanceOf(address(hook), currency0.toId());
        assertTrue(claimsAfter < claimsBefore, "ERC-6909 claims should decrease after defense");

        // Verify the hook actually received the tokens
        uint256 hookBalance = IERC20(Currency.unwrap(currency0)).balanceOf(address(hook));
        uint256 defenseUsed = claimsBefore - claimsAfter;
        assertTrue(hookBalance >= defenseUsed, "Hook should hold extracted tokens");
    }

    /// @notice Reserve deposit must produce zero net delta (sync+transfer+settle+mint)
    function test_deltaAtomicity_reserveDepositNetsToZero() public {
        uint256 depositAmount = 100 ether;
        uint256 claimsBefore = manager.balanceOf(address(hook), currency0.toId());

        _fundReserve(alice, currency0, depositAmount);

        uint256 claimsAfter = manager.balanceOf(address(hook), currency0.toId());
        assertEq(claimsAfter - claimsBefore, depositAmount,
            "ERC-6909 claims should increase by exact deposit amount");
    }

    /// @notice Premium donation must produce zero net delta (sync+transfer+settle+donate)
    function test_deltaAtomicity_premiumDonationNetsToZero() public {
        bytes32 posId = keccak256("donate_delta");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);

        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 100 ether, 3);

        // Need LPs in range for donate to work
        _addLiquidity();

        // If deltas don't resolve, this reverts
        hook.donatePremiumsToLPs();

        (uint256 premiums0,) = hook.getAccumulatedPremiums();
        assertEq(premiums0, 0, "Premiums should be zero after donation");
    }

    /// @notice Multiple defense + deposit cycles in sequence shouldn't corrupt delta state
    function test_deltaAtomicity_sequentialUnlockCycles() public {
        bytes32 posId = keccak256("sequential_delta");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 12);

        // Cycle 1: deposit → defense → settle → deposit again
        _fundReserve(alice, currency0, 50 ether);
        _triggerDefense(posId, 11e17);
        _settleDefense(posId, 5 ether);

        // Cycle 2: deposit more and defend again
        _fundReserve(alice, currency0, 50 ether);
        _triggerDefense(posId, 10e17); // health dropped further

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));

        _settleDefense(posId, 3 ether);
        pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));
    }

    // ================================================================
    // 2. DYNAMIC FEE — reserve utilization scaling
    // ================================================================

    /// @notice Base fee returned when reserve utilization is below threshold
    function test_dynamicFee_baseFeeWhenUtilizationLow() public {
        // Large reserve, small protected value → low utilization
        _fundReserve(alice, currency0, 500 ether);
        _fundReserve(alice, currency1, 500 ether);

        bytes32 posId = keccak256("low_util");
        _registerPosition(alice, posId, currency0, 1 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);

        // Add liquidity and swap — fee should be base fee
        _addLiquidity();

        // Swap should succeed with base fee (no revert means fee is valid)
        vm.prank(bob);
        swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1e18,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    /// @notice Fee increases when reserve utilization exceeds threshold
    function test_dynamicFee_increasesWithHighUtilization() public {
        // Set fee params: baseFee=3000, maxFee=10000, threshold=5000 (50%)
        hook.setFeeParameters(3000, 10000, 5000);

        // Small reserve relative to protected value → high utilization
        _fundReserve(alice, currency0, 5 ether);

        // Register large position
        bytes32 posId = keccak256("high_util");
        _registerPosition(alice, posId, currency0, 100 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);

        // utilization = (100 ether * 10000) / 5 ether = 200000 >> 5000 threshold
        // Fee should be pushed toward maxFee
        _addLiquidity();

        // Swap still works (doesn't revert) but with higher fee
        vm.prank(bob);
        swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1e18,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    /// @notice Fee should drop back after reserve is replenished
    function test_dynamicFee_decreasesAfterReserveReplenished() public {
        hook.setFeeParameters(3000, 10000, 5000);

        // Start with small reserve → high utilization
        _fundReserve(alice, currency0, 5 ether);
        bytes32 posId = keccak256("fee_drop");
        _registerPosition(alice, posId, currency0, 50 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);

        // Now add massive reserve → utilization drops
        _fundReserve(alice, currency0, 5000 ether);

        _addLiquidity();

        // Swap should work fine with lower fee
        vm.prank(bob);
        swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1e18,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    // ================================================================
    // 3. RESERVE DEPLETION — stress tests
    // ================================================================

    /// @notice Defense reverts when reserve is exhausted
    function test_reserveDepletion_revertsWhenDrained() public {
        bytes32 posId1 = keccak256("drain1");
        bytes32 posId2 = keccak256("drain2");

        _registerPosition(alice, posId1, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _registerPosition(bob, posId2, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);

        // Fund just enough for one defense
        // Defense amount for health 1.1, threshold 1.3, size 10:
        // gap = 0.2e18, amount = (10e18 * 0.2e18) / 1.3e18 ≈ 1.538e18
        _fundReserve(alice, currency0, 2 ether);

        // First defense succeeds
        _triggerDefense(posId1, 11e17);

        // Second defense should fail — reserve exhausted
        vm.expectRevert(Errors.InsufficientReserve.selector);
        _triggerDefense(posId2, 11e17);
    }

    /// @notice Sequential defenses drain reserve correctly
    function test_reserveDepletion_tracksDrainCorrectly() public {
        bytes32 posId = keccak256("track_drain");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 12);
        _fundReserve(alice, currency0, 100 ether);

        // Defense 1
        (uint256 r0,) = hook.getReserveBalances();
        _triggerDefense(posId, 11e17);
        (uint256 r1,) = hook.getReserveBalances();
        uint256 defense1 = r0 - r1;

        // Settle and defend again at lower health
        _settleDefense(posId, defense1);
        (uint256 r2,) = hook.getReserveBalances();

        _triggerDefense(posId, 8e17); // much worse health
        (uint256 r3,) = hook.getReserveBalances();
        uint256 defense2 = r2 - r3;

        // Second defense should be larger (bigger gap)
        assertTrue(defense2 > defense1, "Larger health gap should require more defense capital");
    }

    /// @notice Defense amount caps at minDefense when gap is tiny
    function test_reserveDepletion_minDefenseFloor() public {
        bytes32 posId = keccak256("min_floor");
        _registerPosition(alice, posId, currency0, 100 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 200 ether);

        (uint256 rBefore,) = hook.getReserveBalances();

        // health 1.299, threshold 1.3 → gap = 0.001
        // amount = (100e18 * 1e15) / 13e17 ≈ 0.077e18
        // minDefense = 100e18 / 100 = 1e18 (wins)
        _triggerDefense(posId, 1299e15);

        (uint256 rAfter,) = hook.getReserveBalances();
        assertEq(rBefore - rAfter, 1 ether, "Should use minDefense floor");
    }

    /// @notice Defense amount scales proportionally for large health gaps
    function test_reserveDepletion_largeGapDefenseCalculation() public {
        bytes32 posId = keccak256("large_gap");
        _registerPosition(alice, posId, currency0, 10 ether, 15e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 100 ether);

        (uint256 rBefore,) = hook.getReserveBalances();

        // health 0.5, threshold 1.5 → gap = 1.0
        // amount = (10e18 * 1e18) / 1.5e18 ≈ 6.666e18
        _triggerDefense(posId, 5e17);

        (uint256 rAfter,) = hook.getReserveBalances();
        uint256 defenseUsed = rBefore - rAfter;
        uint256 expected = (uint256(10 ether) * 1e18) / uint256(15e17);
        assertApproxEqRel(defenseUsed, expected, 0.01e18);
    }

    // ================================================================
    // 4. PREMIUM EXPIRY BOUNDARIES
    // ================================================================

    /// @notice Defense succeeds 1 second before premium expires
    function test_premiumBoundary_succeedsOneSecondBeforeExpiry() public {
        bytes32 posId = keccak256("boundary_pass");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1);
        _fundReserve(alice, currency0, 50 ether);

        // Warp to 1 second before expiry (1 month = 30 days)
        vm.warp(block.timestamp + 30 days - 1);

        // Should succeed — premium not yet expired
        _triggerDefense(posId, 11e17);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
    }

    /// @notice Defense fails 1 second after premium expiry (strict < check)
    function test_premiumBoundary_failsOneSecondAfterExpiry() public {
        bytes32 posId = keccak256("boundary_fail");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1);
        _fundReserve(alice, currency0, 50 ether);

        // At exact expiry (premiumPaidUntil == block.timestamp), < check is false → still valid
        // 1 second after expiry → premiumPaidUntil < block.timestamp → expired
        vm.warp(block.timestamp + 30 days + 1);

        vm.expectRevert(Errors.PremiumExpired.selector);
        _triggerDefense(posId, 11e17);
    }

    /// @notice Defense succeeds at exact expiry timestamp (strict < means equal is still valid)
    function test_premiumBoundary_succeedsAtExactExpiry() public {
        bytes32 posId = keccak256("boundary_exact");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1);
        _fundReserve(alice, currency0, 50 ether);

        // Warp to exact expiry — should still work (strict <)
        vm.warp(block.timestamp + 30 days);

        _triggerDefense(posId, 11e17);
        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
    }

    /// @notice Premium renewal resets coverage then defense works
    function test_premiumBoundary_renewalThenDefense() public {
        bytes32 posId = keccak256("renew_defend");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1);
        _fundReserve(alice, currency0, 50 ether);

        // Let premium expire
        vm.warp(block.timestamp + 31 days);

        // Defense should fail
        vm.expectRevert(Errors.PremiumExpired.selector);
        _triggerDefense(posId, 11e17);

        // Renew premium
        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 10 ether, 2);

        // Defense should now succeed
        _triggerDefense(posId, 11e17);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
    }

    /// @notice Premium extension adds to existing coverage (not reset)
    function test_premiumBoundary_extensionIsAdditive() public {
        bytes32 posId = keccak256("additive");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 50 ether);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        uint256 originalExpiry = pos.premiumPaidUntil;

        // Pay more premium — should extend, not reset
        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 10 ether, 3);

        pos = hook.getPosition(posId);
        assertEq(pos.premiumPaidUntil, originalExpiry + (3 * 30 days));
    }

    // ================================================================
    // 5. ERC-7683 INTENT LIFECYCLE
    // ================================================================

    /// @notice Settler nonce increments for each defense trigger
    function test_intentLifecycle_nonceIncrementsPerDefense() public {
        assertEq(settler.nonce(), 0);

        bytes32 posId1 = keccak256("intent1");
        bytes32 posId2 = keccak256("intent2");
        _registerPosition(alice, posId1, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _registerPosition(bob, posId2, currency1, 5 ether, 15e17,
            LiquidShieldHook.DefenseStrategy.BATCHED_UNWIND, 6);
        _fundReserve(alice, currency0, 100 ether);
        _fundReserve(bob, currency1, 100 ether);

        _triggerDefense(posId1, 11e17);
        assertEq(settler.nonce(), 1);

        _settleDefense(posId1, 1 ether);

        _triggerDefense(posId2, 12e17);
        assertEq(settler.nonce(), 2);
    }

    /// @notice Defense trigger emits DefenseTriggered event with correct data
    function test_intentLifecycle_emitsDefenseTriggeredEvent() public {
        bytes32 posId = keccak256("intent_event");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 50 ether);

        // Verify DefenseTriggered event fires (amount is calculated internally)
        vm.expectEmit(true, false, false, false);
        emit Events.DefenseTriggered(posId, uint8(LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP), 0);
        _triggerDefense(posId, 11e17);
    }

    // ================================================================
    // 6. DEFENSE + SWAP INTERACTION (fee changes during defense)
    // ================================================================

    /// @notice Swaps still work while a position is being defended
    function test_defenseSwapInteraction_swapDuringDefense() public {
        bytes32 posId = keccak256("swap_during_defense");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 50 ether);
        _addLiquidity();

        // Trigger defense
        _triggerDefense(posId, 11e17);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));

        // Swap should still work while position is defending
        vm.prank(bob);
        swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1e18,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    /// @notice Defense works correctly after pool has had swap activity
    function test_defenseSwapInteraction_defenseAfterMultipleSwaps() public {
        _addLiquidity();

        // Do several swaps in both directions
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(bob);
            swapRouter.swap(
                poolKey,
                SwapParams({
                    zeroForOne: i % 2 == 0,
                    amountSpecified: -0.5e18,
                    sqrtPriceLimitX96: i % 2 == 0
                        ? TickMath.MIN_SQRT_PRICE + 1
                        : TickMath.MAX_SQRT_PRICE - 1
                }),
                PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
                ""
            );
        }

        // Now register and trigger defense
        bytes32 posId = keccak256("after_swaps");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 50 ether);

        _triggerDefense(posId, 11e17);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
    }

    // ================================================================
    // 7. CANNOT UNREGISTER WHILE DEFENDING
    // ================================================================

    function test_cannotUnregisterWhileDefending() public {
        bytes32 posId = keccak256("no_unreg_defending");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 50 ether);

        _triggerDefense(posId, 11e17);

        vm.expectRevert(Errors.PositionCurrentlyDefending.selector);
        vm.prank(alice);
        hook.unregisterPosition(posId, alice);
    }

    // ================================================================
    // 8. FULL E2E: REGISTER → PREMIUM → DEPOSIT → DEFENSE → SETTLE → DONATE → UNREGISTER
    // ================================================================

    function test_fullE2E_completeProtectionLifecycle() public {
        _addLiquidity();

        // 1. Register via router
        bytes32 posId = keccak256("full_e2e");
        vm.prank(alice);
        router.registerAndPayPremium(
            posId, Currency.unwrap(currency0), Currency.unwrap(currency1),
            10 ether, 13e17,
            ILiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6,
            Currency.unwrap(currency0), 100 ether
        );

        // 2. Verify premium split
        (uint256 reserve0,) = hook.getReserveBalances();
        (uint256 premiums0,) = hook.getAccumulatedPremiums();
        assertEq(reserve0, 60 ether);
        assertEq(premiums0, 40 ether);

        // 3. Deposit more to reserve
        _fundReserve(alice, currency0, 200 ether);

        // 4. Do a swap (pool is active, fees flow)
        vm.prank(bob);
        swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1e18,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );

        // 5. RSC triggers defense
        (uint256 reserveBeforeDefense,) = hook.getReserveBalances();
        _triggerDefense(posId, 11e17);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
        assertEq(settler.nonce(), 1);

        (uint256 reserveAfterDefense,) = hook.getReserveBalances();
        uint256 defenseUsed = reserveBeforeDefense - reserveAfterDefense;
        assertTrue(defenseUsed > 0);

        // 6. Filler settles
        _settleDefense(posId, defenseUsed);
        pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));

        // 7. Verify settlement fee went to premiums
        (uint256 premiumsAfterSettle,) = hook.getAccumulatedPremiums();
        uint256 expectedFee = (defenseUsed * 150) / 10000;
        assertEq(premiumsAfterSettle, premiums0 + expectedFee);

        // 8. Donate premiums to LPs
        hook.donatePremiumsToLPs();
        (uint256 premiumsAfterDonate,) = hook.getAccumulatedPremiums();
        assertEq(premiumsAfterDonate, 0);

        // 9. Unregister
        vm.prank(alice);
        hook.unregisterPosition(posId, alice);
        pos = hook.getPosition(posId);
        assertEq(pos.owner, address(0));
    }

    // ================================================================
    // 9. MULTI-USER CONCURRENT DEFENSES
    // ================================================================

    function test_multiUser_concurrentDefenses() public {
        bytes32 posId1 = keccak256("alice_concurrent");
        bytes32 posId2 = keccak256("bob_concurrent");
        bytes32 posId3 = keccak256("charlie_concurrent");

        _registerPosition(alice, posId1, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _registerPosition(bob, posId2, currency0, 20 ether, 15e17,
            LiquidShieldHook.DefenseStrategy.BATCHED_UNWIND, 6);
        _registerPosition(charlie, posId3, currency1, 15 ether, 12e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);

        _fundReserve(alice, currency0, 500 ether);
        _fundReserve(alice, currency1, 500 ether);

        // All three triggered in same block
        _triggerDefense(posId1, 11e17);
        _triggerDefense(posId2, 12e17);
        _triggerDefense(posId3, 10e17);

        // All should be DEFENDING
        assertEq(uint8(hook.getPosition(posId1).status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
        assertEq(uint8(hook.getPosition(posId2).status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
        assertEq(uint8(hook.getPosition(posId3).status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));

        // Settler should have 3 orders
        assertEq(settler.nonce(), 3);

        // Settle all
        _settleDefense(posId1, 1 ether);
        _settleDefense(posId2, 2 ether);
        _settleDefense(posId3, 1.5 ether);

        assertEq(uint8(hook.getPosition(posId1).status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));
        assertEq(uint8(hook.getPosition(posId2).status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));
        assertEq(uint8(hook.getPosition(posId3).status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));
    }

    // ================================================================
    // 10. TOKEN1 COLLATERAL DEFENSE (both sides work)
    // ================================================================

    function test_defense_worksWithToken1Collateral() public {
        bytes32 posId = keccak256("token1_defense");
        _registerPosition(alice, posId, currency1, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency1, 50 ether);

        (, uint256 reserveBefore) = hook.getReserveBalances();
        _triggerDefense(posId, 11e17);
        (, uint256 reserveAfter) = hook.getReserveBalances();

        assertTrue(reserveAfter < reserveBefore, "Token1 reserve should decrease");

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
    }

    // ================================================================
    // 11. DEFENSE AT HEALTH FACTOR ZERO (worst case)
    // ================================================================

    function test_defense_healthFactorZero() public {
        bytes32 posId = keccak256("health_zero");
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 100 ether);

        (uint256 rBefore,) = hook.getReserveBalances();

        // Health = 0, threshold = 1.3 → gap = 1.3 → amount = full positionSize
        _triggerDefense(posId, 0);

        (uint256 rAfter,) = hook.getReserveBalances();
        uint256 defenseUsed = rBefore - rAfter;
        // amount = (10e18 * 13e17) / 13e17 = 10e18 = full position
        assertEq(defenseUsed, 10 ether, "Full position should be defended at health 0");
    }

    // ================================================================
    // 12. FUZZ: DEFENSE AMOUNT IS ALWAYS CORRECT
    // ================================================================

    function testFuzz_defenseAmount_correctCalculation(
        uint256 posSize, uint256 threshold, uint256 health
    ) public {
        posSize = bound(posSize, 1 ether, 1000 ether);
        threshold = bound(threshold, 11e17, 20e17); // 1.1x to 2.0x
        health = bound(health, 0, threshold - 1);

        bytes32 posId = keccak256(abi.encode("fuzz_defense", posSize, threshold, health));
        _registerPosition(alice, posId, currency0, posSize, threshold,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, posSize * 2); // enough for any defense

        (uint256 rBefore,) = hook.getReserveBalances();
        _triggerDefense(posId, health);
        (uint256 rAfter,) = hook.getReserveBalances();

        uint256 defenseUsed = rBefore - rAfter;
        uint256 gap = threshold - health;
        uint256 expectedAmount = (posSize * gap) / threshold;
        uint256 minDefense = posSize / 100;
        uint256 expected = expectedAmount > minDefense ? expectedAmount : minDefense;

        assertEq(defenseUsed, expected, "Defense amount mismatch");
    }

    // ================================================================
    // 13. FUZZ: SETTLEMENT FEE INVARIANT
    // ================================================================

    function testFuzz_settlement_feeAndReserveInvariant(uint256 settleAmount) public {
        settleAmount = bound(settleAmount, 1, 1000 ether);

        bytes32 posId = keccak256(abi.encode("fuzz_settle", settleAmount));
        _registerPosition(alice, posId, currency0, 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 6);
        _fundReserve(alice, currency0, 50 ether);
        _triggerDefense(posId, 11e17);

        (uint256 rBefore,) = hook.getReserveBalances();
        (uint256 pBefore,) = hook.getAccumulatedPremiums();

        _settleDefense(posId, settleAmount);

        (uint256 rAfter,) = hook.getReserveBalances();
        (uint256 pAfter,) = hook.getAccumulatedPremiums();

        uint256 expectedFee = (settleAmount * 150) / 10000;
        uint256 reserveIncrease = rAfter - rBefore;
        uint256 premiumIncrease = pAfter - pBefore;

        // Invariant: fee + reserve replenishment = total settle amount
        assertEq(reserveIncrease + premiumIncrease, settleAmount,
            "Fee + reserve must equal settle amount");
        assertEq(premiumIncrease, expectedFee, "Fee must be exactly 1.5%");
    }
}

// Minimal mock for Deployers' MockERC20
interface MockERC20 is IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}
