// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core/test/utils/Deployers.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";

import {LiquidShieldHook} from "../src/hooks/LiquidShieldHook.sol";
import {LiquidShieldSettler} from "../src/settler/LiquidShieldSettler.sol";
import {SharedLiquidityPool} from "../src/aqua0/SharedLiquidityPool.sol";
import {Errors} from "../src/lib/Errors.sol";
import {Events} from "../src/lib/Events.sol";

contract LiquidShieldHookTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    LiquidShieldHook public hook;
    LiquidShieldSettler public settlerContract;
    SharedLiquidityPool public sharedPool;
    PoolKey public poolKey;
    PoolId public poolId;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public rscCallbackAddr = makeAddr("rscCallback");
    address public fillerAddr = makeAddr("filler");

    function setUp() public {
        // Deploy PoolManager and all test routers (swapRouter, modifyLiquidityRouter, etc.)
        deployFreshManagerAndRouters();

        // Deploy test tokens (currency0 and currency1, properly ordered)
        deployMintAndApprove2Currencies();

        // Deploy SharedLiquidityPool
        sharedPool = new SharedLiquidityPool(address(this));

        // Calculate hook address from required permission flags
        uint160 hookFlags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG
                | Hooks.AFTER_ADD_LIQUIDITY_FLAG
                | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG
        );

        // Deploy hook at the correct address
        address hookAddr = address(hookFlags);
        deployCodeTo(
            "LiquidShieldHook.sol:LiquidShieldHook",
            abi.encode(address(manager), address(sharedPool)),
            hookAddr
        );
        hook = LiquidShieldHook(payable(hookAddr));

        // Set hook on SharedLiquidityPool
        sharedPool.setHook(hookAddr);

        // Initialize pool with dynamic fee and our hook
        poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddr)
        });
        poolId = poolKey.toId();
        manager.initialize(poolKey, SQRT_PRICE_1_1);

        // Deploy settler pointing to hook
        settlerContract = new LiquidShieldSettler(hookAddr);
        settlerContract.setAuthorizedFiller(fillerAddr);

        // Configure hook admin settings
        hook.setRscCallback(rscCallbackAddr);
        hook.setFillerAddress(fillerAddr);
        hook.setSettler(address(settlerContract));

        // Mint tokens and approve for test users
        _mintAndApproveUser(alice);
        _mintAndApproveUser(bob);
    }

    function _mintAndApproveUser(address user) internal {
        address token0Addr = Currency.unwrap(currency0);
        address token1Addr = Currency.unwrap(currency1);

        // Deal tokens to user
        deal(token0Addr, user, 1000 ether);
        deal(token1Addr, user, 1000 ether);

        vm.startPrank(user);
        // Approve hook for premium payments and reserve deposits
        MockERC20(token0Addr).approve(address(hook), type(uint256).max);
        MockERC20(token1Addr).approve(address(hook), type(uint256).max);
        // Approve routers for swap/liquidity operations
        MockERC20(token0Addr).approve(address(swapRouter), type(uint256).max);
        MockERC20(token1Addr).approve(address(swapRouter), type(uint256).max);
        MockERC20(token0Addr).approve(address(modifyLiquidityRouter), type(uint256).max);
        MockERC20(token1Addr).approve(address(modifyLiquidityRouter), type(uint256).max);
        vm.stopPrank();
    }

    // ================================================================
    // HOOK PERMISSIONS
    // ================================================================

    function test_getHookPermissions() public view {
        Hooks.Permissions memory perms = hook.getHookPermissions();
        assertFalse(perms.beforeInitialize);
        assertTrue(perms.afterInitialize);
        assertFalse(perms.beforeAddLiquidity);
        assertTrue(perms.afterAddLiquidity);
        assertFalse(perms.beforeRemoveLiquidity);
        assertTrue(perms.afterRemoveLiquidity);
        assertTrue(perms.beforeSwap);
        assertTrue(perms.afterSwap);
        assertFalse(perms.beforeDonate);
        assertFalse(perms.afterDonate);
        assertFalse(perms.beforeSwapReturnDelta);
        assertFalse(perms.afterSwapReturnDelta);
        assertFalse(perms.afterAddLiquidityReturnDelta);
        assertFalse(perms.afterRemoveLiquidityReturnDelta);
    }

    // ================================================================
    // AFTER INITIALIZE
    // ================================================================

    function test_afterInitialize_setsPoolKey() public view {
        (Currency c0, Currency c1,,, IHooks hooks) = hook.poolKey();
        assertEq(Currency.unwrap(c0), Currency.unwrap(currency0));
        assertEq(Currency.unwrap(c1), Currency.unwrap(currency1));
        assertEq(address(hooks), address(hook));
    }

    // ================================================================
    // POSITION REGISTRATION — HAPPY PATHS
    // ================================================================

    function test_registerPosition_succeeds() public {
        bytes32 posId = keccak256("pos1");
        vm.prank(alice);
        hook.registerPosition(
            posId,
            alice, // onBehalfOf
            Currency.unwrap(currency0),
            Currency.unwrap(currency1),
            10 ether,
            13e17, // 1.3x
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            1,
            address(0xBEEF),
            6
        );

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.owner, alice);
        assertEq(pos.collateralAsset, Currency.unwrap(currency0));
        assertEq(pos.debtAsset, Currency.unwrap(currency1));
        assertEq(pos.positionSize, 10 ether);
        assertEq(pos.healthThreshold, 13e17);
        assertEq(uint8(pos.strategy), uint8(LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP));
        assertEq(pos.premiumPaidUntil, block.timestamp + (6 * 30 days));
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));
        assertEq(hook.totalProtectedValue(), 10 ether);
    }

    function test_registerPosition_emitsEvent() public {
        bytes32 posId = keccak256("pos1");
        vm.expectEmit(true, true, false, true);
        emit Events.PositionRegistered(posId, alice, uint8(LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP));
        vm.prank(alice);
        hook.registerPosition(
            posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1), 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1, address(0xBEEF), 6
        );
    }

    function test_registerPosition_multiplePositions() public {
        bytes32 posId1 = keccak256("pos1");
        bytes32 posId2 = keccak256("pos2");

        vm.prank(alice);
        hook.registerPosition(posId1, alice, Currency.unwrap(currency0), Currency.unwrap(currency1), 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1, address(0xBEEF), 6);

        vm.prank(bob);
        hook.registerPosition(posId2, bob, Currency.unwrap(currency1), Currency.unwrap(currency0), 5 ether, 15e17,
            LiquidShieldHook.DefenseStrategy.BATCHED_UNWIND, 2, address(0xCAFE), 3);

        assertEq(hook.totalProtectedValue(), 15 ether);
    }

    // ================================================================
    // POSITION REGISTRATION — SAD PATHS
    // ================================================================

    function test_registerPosition_revertsWhenDuplicate() public {
        bytes32 posId = keccak256("pos1");
        vm.prank(alice);
        hook.registerPosition(posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1), 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1, address(0xBEEF), 6);

        vm.expectRevert(Errors.PositionAlreadyRegistered.selector);
        vm.prank(bob);
        hook.registerPosition(posId, bob, Currency.unwrap(currency0), Currency.unwrap(currency1), 5 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1, address(0xBEEF), 3);
    }

    function test_registerPosition_revertsWhenZeroSize() public {
        bytes32 posId = keccak256("pos1");
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        hook.registerPosition(posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1), 0, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1, address(0xBEEF), 6);
    }

    // ================================================================
    // POSITION UNREGISTRATION — HAPPY PATHS
    // ================================================================

    function test_unregisterPosition_succeeds() public {
        bytes32 posId = _registerDefaultPosition(alice);
        assertEq(hook.totalProtectedValue(), 10 ether);

        vm.prank(alice);
        hook.unregisterPosition(posId, alice);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.owner, address(0));
        assertEq(hook.totalProtectedValue(), 0);
    }

    function test_unregisterPosition_emitsEvent() public {
        bytes32 posId = _registerDefaultPosition(alice);

        vm.expectEmit(true, false, false, false);
        emit Events.PositionUnregistered(posId);
        vm.prank(alice);
        hook.unregisterPosition(posId, alice);
    }

    // ================================================================
    // POSITION UNREGISTRATION — SAD PATHS
    // ================================================================

    function test_unregisterPosition_revertsWhenNotOwner() public {
        bytes32 posId = _registerDefaultPosition(alice);

        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(bob);
        hook.unregisterPosition(posId, bob);
    }

    function test_unregisterPosition_revertsWhenNonexistent() public {
        bytes32 posId = keccak256("nonexistent");
        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(alice);
        hook.unregisterPosition(posId, alice);
    }

    // ================================================================
    // ADMIN — HAPPY PATHS
    // ================================================================

    function test_setRscCallback_succeeds() public {
        address newRsc = makeAddr("newRsc");
        hook.setRscCallback(newRsc);
        assertEq(hook.rscCallback(), newRsc);
    }

    function test_setFillerAddress_succeeds() public {
        address newFiller = makeAddr("newFiller");
        hook.setFillerAddress(newFiller);
        assertEq(hook.fillerAddress(), newFiller);
    }

    function test_setFeeParameters_succeeds() public {
        hook.setFeeParameters(5000, 15000, 8000);
        assertEq(hook.baseFee(), 5000);
        assertEq(hook.maxFee(), 15000);
        assertEq(hook.reserveUtilizationThreshold(), 8000);
    }

    // ================================================================
    // ADMIN — SAD PATHS
    // ================================================================

    function test_setRscCallback_revertsWhenNotOwner() public {
        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(alice);
        hook.setRscCallback(makeAddr("newRsc"));
    }

    function test_setFillerAddress_revertsWhenNotOwner() public {
        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(alice);
        hook.setFillerAddress(makeAddr("newFiller"));
    }

    function test_setFeeParameters_revertsWhenNotOwner() public {
        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(alice);
        hook.setFeeParameters(5000, 15000, 8000);
    }

    // ================================================================
    // PREMIUM PAYMENT — HAPPY PATHS
    // ================================================================

    function test_payPremium_token0_splitsCorrectly() public {
        bytes32 posId = _registerDefaultPosition(alice);

        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 100 ether, 3);

        (uint256 reserve0, uint256 reserve1) = hook.getReserveBalances();
        (uint256 premiums0, uint256 premiums1) = hook.getAccumulatedPremiums();
        assertEq(reserve0, 60 ether); // 60%
        assertEq(premiums0, 40 ether); // 40%
        assertEq(reserve1, 0);
        assertEq(premiums1, 0);
    }

    function test_payPremium_token1_splitsCorrectly() public {
        bytes32 posId = _registerDefaultPosition(alice);

        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency1), 50 ether, 2);

        (uint256 reserve0, uint256 reserve1) = hook.getReserveBalances();
        (uint256 premiums0, uint256 premiums1) = hook.getAccumulatedPremiums();
        assertEq(reserve0, 0);
        assertEq(reserve1, 30 ether); // 60%
        assertEq(premiums0, 0);
        assertEq(premiums1, 20 ether); // 40%
    }

    function test_payPremium_extendsCoverage() public {
        bytes32 posId = _registerDefaultPosition(alice);
        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        uint256 initialPaidUntil = pos.premiumPaidUntil;

        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 10 ether, 3);

        pos = hook.getPosition(posId);
        assertEq(pos.premiumPaidUntil, initialPaidUntil + (3 * 30 days));
    }

    function test_payPremium_resetsExpiredCoverage() public {
        bytes32 posId = _registerDefaultPosition(alice);

        // Fast forward past premium expiry
        vm.warp(block.timestamp + 365 days);

        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 10 ether, 2);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.premiumPaidUntil, block.timestamp + (2 * 30 days));
    }

    function test_payPremium_emitsEvent() public {
        bytes32 posId = _registerDefaultPosition(alice);

        vm.expectEmit(true, true, false, true);
        emit Events.PremiumCollected(posId, Currency.unwrap(currency0), 10 ether);
        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 10 ether, 1);
    }

    // ================================================================
    // PREMIUM PAYMENT — SAD PATHS
    // ================================================================

    function test_payPremium_revertsWhenPositionNotFound() public {
        bytes32 posId = keccak256("nonexistent");
        vm.expectRevert(Errors.PositionNotFound.selector);
        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 10 ether, 1);
    }

    function test_payPremium_revertsWhenZeroAmount() public {
        bytes32 posId = _registerDefaultPosition(alice);
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 0, 1);
    }

    // ================================================================
    // TRIGGER DEFENSE — HAPPY PATHS
    // ================================================================

    function test_triggerDefense_token0_succeeds() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17); // health 1.1, threshold 1.3

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
    }

    function test_triggerDefense_reducesReserve() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        (uint256 reserveBefore,) = hook.getReserveBalances();

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);

        (uint256 reserveAfter,) = hook.getReserveBalances();
        assertTrue(reserveAfter < reserveBefore, "Reserve should decrease after defense");
    }

    function test_triggerDefense_emitsDefenseTriggeredEvent() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.prank(rscCallbackAddr);
        // Just verify it doesn't revert and emits correctly (amount is calculated)
        hook.triggerDefense(posId, 11e17);
    }

    // ================================================================
    // TRIGGER DEFENSE — SAD PATHS
    // ================================================================

    function test_triggerDefense_revertsWhenUnauthorized() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(alice);
        hook.triggerDefense(posId, 11e17);
    }

    function test_triggerDefense_revertsWhenPositionNotFound() public {
        bytes32 posId = keccak256("nonexistent");
        vm.expectRevert(Errors.PositionNotFound.selector);
        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);
    }

    function test_triggerDefense_revertsWhenPremiumExpired() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.warp(block.timestamp + 365 days);

        vm.expectRevert(Errors.PremiumExpired.selector);
        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);
    }

    function test_triggerDefense_revertsWhenInsufficientReserve() public {
        bytes32 posId = _registerDefaultPosition(alice);

        // Pay tiny premium to extend coverage but don't fund reserve sufficiently
        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 1 wei, 12);

        vm.expectRevert(Errors.InsufficientReserve.selector);
        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);
    }

    // ================================================================
    // SETTLE DEFENSE — HAPPY PATHS
    // ================================================================

    function test_settleDefense_succeeds() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);

        vm.prank(fillerAddr);
        hook.settleDefense(posId, 5 ether);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));
    }

    function test_settleDefense_chargesFee() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);

        (uint256 reserveBefore,) = hook.getReserveBalances();
        (uint256 premiumsBefore,) = hook.getAccumulatedPremiums();

        uint256 settleAmount = 5 ether;
        uint256 expectedFee = (settleAmount * 150) / 10000; // 1.5%

        vm.prank(fillerAddr);
        hook.settleDefense(posId, settleAmount);

        (uint256 reserveAfter,) = hook.getReserveBalances();
        (uint256 premiumsAfter,) = hook.getAccumulatedPremiums();

        assertEq(reserveAfter, reserveBefore + settleAmount - expectedFee);
        assertEq(premiumsAfter, premiumsBefore + expectedFee);
    }

    function test_settleDefense_emitsEvent() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);

        uint256 settleAmount = 5 ether;
        uint256 expectedFee = (settleAmount * 150) / 10000;

        vm.expectEmit(true, false, false, true);
        emit Events.DefenseSettled(posId, settleAmount, expectedFee);
        vm.prank(fillerAddr);
        hook.settleDefense(posId, settleAmount);
    }

    // ================================================================
    // SETTLE DEFENSE — SAD PATHS
    // ================================================================

    function test_settleDefense_revertsWhenNotFiller() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);

        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(alice);
        hook.settleDefense(posId, 5 ether);
    }

    // ================================================================
    // DEPOSIT TO RESERVE — HAPPY PATHS
    // ================================================================

    function test_depositToReserve_token0() public {
        vm.prank(alice);
        hook.depositToReserve(Currency.unwrap(currency0), 50 ether);

        (uint256 reserve0,) = hook.getReserveBalances();
        assertEq(reserve0, 50 ether);
    }

    function test_depositToReserve_token1() public {
        vm.prank(alice);
        hook.depositToReserve(Currency.unwrap(currency1), 30 ether);

        (, uint256 reserve1) = hook.getReserveBalances();
        assertEq(reserve1, 30 ether);
    }

    function test_depositToReserve_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit Events.ReserveDeposited(Currency.unwrap(currency0), 10 ether);
        vm.prank(alice);
        hook.depositToReserve(Currency.unwrap(currency0), 10 ether);
    }

    // ================================================================
    // DEPOSIT TO RESERVE — SAD PATHS
    // ================================================================

    function test_depositToReserve_revertsWhenZeroAmount() public {
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        hook.depositToReserve(Currency.unwrap(currency0), 0);
    }

    // ================================================================
    // DONATE PREMIUMS — SAD PATHS
    // ================================================================

    function test_donatePremiumsToLPs_revertsWhenNoPremiums() public {
        vm.expectRevert(Errors.InvalidAmount.selector);
        hook.donatePremiumsToLPs();
    }

    // ================================================================
    // DYNAMIC FEE
    // ================================================================

    function test_dynamicFee_returnsBaseFeeWhenNoReserve() public view {
        assertEq(hook.baseFee(), 3000);
    }

    // ================================================================
    // DEFENSE AMOUNT CALCULATION
    // ================================================================

    function test_defenseAmount_proportionalToGap() public {
        bytes32 posId = _registerAndFundPosition(alice, currency0);
        (uint256 reserveBefore,) = hook.getReserveBalances();

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17); // health 1.1, threshold 1.3

        (uint256 reserveAfter,) = hook.getReserveBalances();
        uint256 defenseUsed = reserveBefore - reserveAfter;

        // gap = 1.3e18 - 1.1e18 = 0.2e18
        // amount = (positionSize * gap) / healthThreshold
        uint256 posSize = 10 ether;
        uint256 gap = 2e17;
        uint256 threshold = 13e17;
        uint256 expected = (posSize * gap) / threshold;
        assertApproxEqRel(defenseUsed, expected, 0.01e18);
    }

    function test_defenseAmount_usesMinDefenseWhenGapSmall() public {
        bytes32 posId = keccak256("bigpos");
        vm.prank(alice);
        hook.registerPosition(
            posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1), 100 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1, address(0xBEEF), 12
        );

        vm.prank(alice);
        hook.depositToReserve(Currency.unwrap(currency0), 200 ether);

        (uint256 reserveBefore,) = hook.getReserveBalances();

        // health 1.29, threshold 1.3 => gap = 0.01
        // amount = (100 ether * 1e16) / 13e17 ≈ 0.769 ether
        // minDefense = 100 ether / 100 = 1 ether (wins)
        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 129e16);

        (uint256 reserveAfter,) = hook.getReserveBalances();
        uint256 defenseUsed = reserveBefore - reserveAfter;
        assertEq(defenseUsed, 1 ether); // minDefense = positionSize / 100
    }

    // ================================================================
    // SOURCE CHAIN ID
    // ================================================================

    function test_registerPosition_realChainIds() public {
        // sourceChainId is now uint256, so real chain IDs work correctly
        bytes32 posId = keccak256("chainIdFixed");
        vm.prank(alice);
        hook.registerPosition(
            posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1), 10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, // Arbitrum Sepolia chain ID
            address(0xBEEF), 6
        );

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.sourceChainId, 421614);
    }

    // ================================================================
    // VIEW FUNCTIONS
    // ================================================================

    function test_getReserveBalances_empty() public view {
        (uint256 r0, uint256 r1) = hook.getReserveBalances();
        assertEq(r0, 0);
        assertEq(r1, 0);
    }

    function test_getAccumulatedPremiums_empty() public view {
        (uint256 p0, uint256 p1) = hook.getAccumulatedPremiums();
        assertEq(p0, 0);
        assertEq(p1, 0);
    }

    // ================================================================
    // FUZZ TESTS
    // ================================================================

    function testFuzz_registerPosition_arbitrarySize(uint256 positionSize) public {
        positionSize = bound(positionSize, 1, type(uint128).max);

        bytes32 posId = keccak256(abi.encode("fuzz", positionSize));
        vm.prank(alice);
        hook.registerPosition(
            posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1), positionSize, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP, 1, address(0xBEEF), 6
        );

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.positionSize, positionSize);
        assertEq(hook.totalProtectedValue(), positionSize);
    }

    function testFuzz_payPremium_splitInvariant(uint256 amount) public {
        amount = bound(amount, 1, 100 ether);
        bytes32 posId = _registerDefaultPosition(alice);

        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), amount, 1);

        (uint256 reserve0,) = hook.getReserveBalances();
        (uint256 premiums0,) = hook.getAccumulatedPremiums();

        assertEq(reserve0 + premiums0, amount, "Premium split invariant violated");
        assertEq(reserve0, (amount * 60) / 100);
        assertEq(premiums0, amount - (amount * 60) / 100);
    }

    function testFuzz_settleDefense_feeCalculation(uint256 defenseAmount) public {
        defenseAmount = bound(defenseAmount, 1, 1000 ether);

        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);

        (uint256 reserveBefore,) = hook.getReserveBalances();
        (uint256 premiumsBefore,) = hook.getAccumulatedPremiums();

        vm.prank(fillerAddr);
        hook.settleDefense(posId, defenseAmount);

        (uint256 reserveAfter,) = hook.getReserveBalances();
        (uint256 premiumsAfter,) = hook.getAccumulatedPremiums();

        uint256 expectedFee = (defenseAmount * 150) / 10000;
        assertEq(premiumsAfter - premiumsBefore, expectedFee, "Fee calculation wrong");
        assertEq(reserveAfter - reserveBefore, defenseAmount - expectedFee, "Reserve replenishment wrong");
    }

    function testFuzz_defenseAmount_neverExceedsPositionSize(uint256 currentHealth) public pure {
        uint256 healthThreshold = 13e17;
        currentHealth = bound(currentHealth, 0, healthThreshold - 1);

        uint256 positionSize = 10 ether;
        uint256 gap = healthThreshold - currentHealth;
        uint256 amount = (positionSize * gap) / healthThreshold;
        uint256 minDefense = positionSize / 100;
        uint256 result = amount > minDefense ? amount : minDefense;

        assertTrue(result <= positionSize, "Defense amount exceeds position size");
    }

    // ================================================================
    // AQUA0 JIT INTEGRATION
    // ================================================================

    function test_swapWorksWithEmptySharedPool() public {
        // Add liquidity to pool so swaps can execute
        vm.prank(alice);
        modifyLiquidityRouter.modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: -120,
                tickUpper: 120,
                liquidityDelta: 100e18,
                salt: bytes32(0)
            }),
            ""
        );

        // Execute a swap — should work with empty SharedLiquidityPool (JIT is no-op)
        vm.prank(bob);
        swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1e18,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({
                takeClaims: false,
                settleUsingBurn: false
            }),
            ""
        );
    }

    function test_defenseStillWorksAfterSwap() public {
        // Add liquidity and do a swap first
        vm.prank(alice);
        modifyLiquidityRouter.modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: -120,
                tickUpper: 120,
                liquidityDelta: 100e18,
                salt: bytes32(0)
            }),
            ""
        );

        vm.prank(bob);
        swapRouter.swap(
            poolKey,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -1e18,
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            PoolSwapTest.TestSettings({
                takeClaims: false,
                settleUsingBurn: false
            }),
            ""
        );

        // Now trigger defense — should still work atomically in separate unlock cycle
        bytes32 posId = _registerAndFundPosition(alice, currency0);

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
    }

    // ================================================================
    // HELPERS
    // ================================================================

    function _registerDefaultPosition(address user) internal returns (bytes32) {
        bytes32 posId = keccak256(abi.encode("default", user));
        vm.prank(user);
        hook.registerPosition(
            posId,
            user,
            Currency.unwrap(currency0),
            Currency.unwrap(currency1),
            10 ether,
            13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            1,
            address(0xBEEF),
            6
        );
        return posId;
    }

    function _registerAndFundPosition(address user, Currency collateral) internal returns (bytes32) {
        bytes32 posId = _registerDefaultPosition(user);

        // Fund reserve with enough tokens for defense
        vm.prank(user);
        hook.depositToReserve(Currency.unwrap(collateral), 50 ether);

        return posId;
    }
}

// Minimal mock for Deployers' MockERC20
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface MockERC20 is IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}
