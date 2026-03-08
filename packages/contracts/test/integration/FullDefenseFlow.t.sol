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
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";

import {LiquidShieldHook} from "../../src/hooks/LiquidShieldHook.sol";
import {LiquidShieldRouter} from "../../src/router/LiquidShieldRouter.sol";
import {LiquidShieldSettler} from "../../src/settler/LiquidShieldSettler.sol";
import {ILiquidShieldHook} from "../../src/interfaces/ILiquidShieldHook.sol";
import {Errors} from "../../src/lib/Errors.sol";

/// @title Full Defense Flow Integration Test
/// @notice Tests the complete lifecycle: register → fund → trigger defense → settle
contract FullDefenseFlowTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    LiquidShieldHook public hook;
    LiquidShieldRouter public router;
    LiquidShieldSettler public settler;

    PoolKey public poolKey;
    PoolId public poolId;

    address public alice = makeAddr("alice");
    address public lp = makeAddr("lp");
    address public rscCallbackAddr = makeAddr("rscCallback");
    address public fillerAddr = makeAddr("filler");

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        uint160 hookFlags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG
                | Hooks.AFTER_ADD_LIQUIDITY_FLAG
                | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG
        );
        address hookAddr = address(hookFlags);
        deployCodeTo(
            "LiquidShieldHook.sol:LiquidShieldHook",
            abi.encode(address(manager)),
            hookAddr
        );
        hook = LiquidShieldHook(hookAddr);

        // Deploy settler and router
        settler = new LiquidShieldSettler(hookAddr);
        settler.setAuthorizedFiller(fillerAddr);
        router = new LiquidShieldRouter(hookAddr);

        // Configure hook
        hook.setRscCallback(rscCallbackAddr);
        hook.setFillerAddress(fillerAddr);
        hook.setSettler(address(settler));
        hook.setAuthorizedRouter(address(router));

        // Initialize pool
        poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddr)
        });
        poolId = poolKey.toId();
        manager.initialize(poolKey, SQRT_PRICE_1_1);

        // Fund users
        _setupUser(alice, 1000 ether);
        _setupUser(lp, 1000 ether);
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

    // ================================================================
    // FULL DEFENSE FLOW: COLLATERAL TOP-UP
    // ================================================================

    function test_fullDefenseFlow_collateralTopUp() public {
        // Step 1: Alice registers a position via the router
        bytes32 posId = keccak256("alice_aave_pos");

        vm.prank(alice);
        router.registerAndPayPremium(
            posId, Currency.unwrap(currency0), Currency.unwrap(currency1),
            10 ether, 13e17, // 1.3x health threshold
            ILiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6, // Arbitrum Sepolia, adapter, 6 months
            Currency.unwrap(currency0), 100 ether // Premium payment
        );

        // Verify position registered correctly
        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.owner, alice);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));

        // Step 2: Verify premium was split correctly
        (uint256 reserve0,) = hook.getReserveBalances();
        (uint256 premiums0,) = hook.getAccumulatedPremiums();
        assertEq(reserve0, 60 ether, "60% to reserve");
        assertEq(premiums0, 40 ether, "40% accumulated");

        // Step 3: Alice deposits more to reserve for defense capital
        vm.prank(alice);
        hook.depositToReserve(Currency.unwrap(currency0), 200 ether);

        (reserve0,) = hook.getReserveBalances();
        assertEq(reserve0, 260 ether, "Reserve should include premium + direct deposit");

        // Step 4: RSC detects health drop and triggers defense
        uint256 currentHealth = 11e17; // 1.1x (below 1.3x threshold)
        (uint256 reserveBeforeDefense,) = hook.getReserveBalances();

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, currentHealth);

        // Verify position is now DEFENDING
        pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));

        // Verify reserve decreased
        (uint256 reserveAfterDefense,) = hook.getReserveBalances();
        uint256 defenseUsed = reserveBeforeDefense - reserveAfterDefense;
        assertTrue(defenseUsed > 0, "Some reserve should have been used");

        // Verify settler received the order
        // (The settler.open() was called by the hook during triggerDefense)
        assertEq(settler.nonce(), 1, "Settler should have 1 open order");

        // Step 5: Filler settles the defense (returns capital after executing on source chain)
        (uint256 reserveBeforeSettle,) = hook.getReserveBalances();
        (uint256 premiumsBeforeSettle,) = hook.getAccumulatedPremiums();

        vm.prank(fillerAddr);
        hook.settleDefense(posId, defenseUsed);

        // Verify position back to ACTIVE
        pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));

        // Verify 1.5% fee was charged
        uint256 expectedFee = (defenseUsed * 150) / 10000;
        (uint256 reserveAfterSettle,) = hook.getReserveBalances();
        (uint256 premiumsAfterSettle,) = hook.getAccumulatedPremiums();

        assertEq(reserveAfterSettle, reserveBeforeSettle + defenseUsed - expectedFee, "Reserve replenished minus fee");
        assertEq(premiumsAfterSettle, premiumsBeforeSettle + expectedFee, "Fee added to premiums");
    }

    // ================================================================
    // FULL LIFECYCLE: REGISTER → DEFEND → SETTLE → UNREGISTER
    // ================================================================

    function test_fullLifecycle_registerDefendSettleUnregister() public {
        bytes32 posId = keccak256("lifecycle_pos");

        // Register
        vm.prank(alice);
        hook.registerPosition(
            posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1),
            5 ether, 15e17,
            LiquidShieldHook.DefenseStrategy.BATCHED_UNWIND,
            11155111, // Ethereum Sepolia
            address(0xCAFE), 3
        );

        assertEq(hook.totalProtectedValue(), 5 ether);

        // Fund reserve
        vm.prank(alice);
        hook.depositToReserve(Currency.unwrap(currency0), 100 ether);

        // Trigger defense
        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 12e17); // 1.2 < 1.5 threshold

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));

        // Settle
        vm.prank(fillerAddr);
        hook.settleDefense(posId, 1 ether);

        pos = hook.getPosition(posId);
        assertEq(uint8(pos.status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));

        // Unregister
        vm.prank(alice);
        hook.unregisterPosition(posId, alice);

        pos = hook.getPosition(posId);
        assertEq(pos.owner, address(0));
        assertEq(hook.totalProtectedValue(), 0);
    }

    // ================================================================
    // PREMIUM DONATION TO LPs FLOW
    // ================================================================

    function test_premiumDonation_fullFlow() public {
        bytes32 posId = keccak256("donate_pos");

        // Register and pay premium
        vm.prank(alice);
        hook.registerPosition(
            posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1),
            10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            1, address(0xBEEF), 6
        );

        vm.prank(alice);
        hook.payPremium(posId, Currency.unwrap(currency0), 100 ether, 6);

        // Verify premiums accumulated
        (uint256 premiums0,) = hook.getAccumulatedPremiums();
        assertEq(premiums0, 40 ether);

        // LP adds liquidity to the pool (needed for donate to work)
        vm.prank(lp);
        modifyLiquidityRouter.modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: -60,
                tickUpper: 60,
                liquidityDelta: 100e18,
                salt: bytes32(0)
            }),
            ""
        );

        // Donate premiums to LPs
        hook.donatePremiumsToLPs();

        // Verify premiums cleared
        (premiums0,) = hook.getAccumulatedPremiums();
        assertEq(premiums0, 0, "Premiums should be cleared after donation");
    }

    // ================================================================
    // DEFENSE WITH EXPIRED PREMIUM (should fail)
    // ================================================================

    function test_defenseFailsAfterPremiumExpiry() public {
        bytes32 posId = keccak256("expired_pos");

        vm.prank(alice);
        hook.registerPosition(
            posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1),
            10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            1, address(0xBEEF), 1 // Only 1 month
        );

        vm.prank(alice);
        hook.depositToReserve(Currency.unwrap(currency0), 50 ether);

        // Fast forward past premium expiry (1 month + 1 second)
        vm.warp(block.timestamp + 31 days);

        // Defense should fail with PremiumExpired
        vm.expectRevert(Errors.PremiumExpired.selector);
        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);
    }

    // ================================================================
    // MULTIPLE POSITIONS, MULTIPLE DEFENSES
    // ================================================================

    function test_multiplePositions_independentDefenses() public {
        bytes32 posId1 = keccak256("pos1");
        bytes32 posId2 = keccak256("pos2");

        // Alice registers position 1
        vm.prank(alice);
        hook.registerPosition(
            posId1, alice, Currency.unwrap(currency0), Currency.unwrap(currency1),
            10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6
        );

        // Alice registers position 2 with different collateral
        vm.prank(alice);
        hook.registerPosition(
            posId2, alice, Currency.unwrap(currency1), Currency.unwrap(currency0),
            5 ether, 15e17,
            LiquidShieldHook.DefenseStrategy.BATCHED_UNWIND,
            11155111, address(0xCAFE), 6
        );

        assertEq(hook.totalProtectedValue(), 15 ether);

        // Fund both reserves
        vm.startPrank(alice);
        hook.depositToReserve(Currency.unwrap(currency0), 100 ether);
        hook.depositToReserve(Currency.unwrap(currency1), 100 ether);
        vm.stopPrank();

        // Trigger defense on position 1
        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId1, 11e17);

        LiquidShieldHook.ProtectedPosition memory pos1 = hook.getPosition(posId1);
        LiquidShieldHook.ProtectedPosition memory pos2 = hook.getPosition(posId2);
        assertEq(uint8(pos1.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
        assertEq(uint8(pos2.status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));

        // Settle position 1
        vm.prank(fillerAddr);
        hook.settleDefense(posId1, 1 ether);

        // Trigger defense on position 2
        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId2, 12e17);

        pos1 = hook.getPosition(posId1);
        pos2 = hook.getPosition(posId2);
        assertEq(uint8(pos1.status), uint8(LiquidShieldHook.PositionStatus.ACTIVE));
        assertEq(uint8(pos2.status), uint8(LiquidShieldHook.PositionStatus.DEFENDING));
    }

    // ================================================================
    // ROUTER INTEGRATION — REGISTER + UNREGISTER
    // ================================================================

    function test_routerIntegration_registerAndUnregister() public {
        bytes32 posId = keccak256("router_lifecycle");

        // Register via router
        vm.prank(alice);
        router.registerAndPayPremium(
            posId, Currency.unwrap(currency0), Currency.unwrap(currency1),
            10 ether, 13e17,
            ILiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6,
            Currency.unwrap(currency0), 50 ether
        );

        // Verify owner is alice (not router)
        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.owner, alice);

        // Unregister via router
        vm.prank(alice);
        router.unregister(posId);

        pos = hook.getPosition(posId);
        assertEq(pos.owner, address(0));
    }

    // ================================================================
    // SETTLER INTEGRATION
    // ================================================================

    function test_settlerIntegration_orderCreatedOnDefense() public {
        bytes32 posId = keccak256("settler_test");

        vm.prank(alice);
        hook.registerPosition(
            posId, alice, Currency.unwrap(currency0), Currency.unwrap(currency1),
            10 ether, 13e17,
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6
        );

        vm.prank(alice);
        hook.depositToReserve(Currency.unwrap(currency0), 50 ether);

        assertEq(settler.nonce(), 0, "No orders yet");

        vm.prank(rscCallbackAddr);
        hook.triggerDefense(posId, 11e17);

        assertEq(settler.nonce(), 1, "One order should be created");
    }
}

// Minimal mock for Deployers' MockERC20
interface MockERC20 is IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}
