// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "v4-core/test/utils/Deployers.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LiquidShieldHook} from "../src/hooks/LiquidShieldHook.sol";
import {LiquidShieldRouter} from "../src/router/LiquidShieldRouter.sol";
import {LiquidShieldSettler} from "../src/settler/LiquidShieldSettler.sol";
import {SharedLiquidityPool} from "../src/aqua0/SharedLiquidityPool.sol";
import {ILiquidShieldHook} from "../src/interfaces/ILiquidShieldHook.sol";
import {Errors} from "../src/lib/Errors.sol";

contract LiquidShieldRouterTest is Test, Deployers {
    using CurrencyLibrary for Currency;

    LiquidShieldHook public hook;
    LiquidShieldRouter public router;
    LiquidShieldSettler public settlerContract;
    SharedLiquidityPool public sharedPool;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public rscCallbackAddr = makeAddr("rscCallback");
    address public fillerAddr = makeAddr("filler");

    function setUp() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        // Deploy SharedLiquidityPool
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
            abi.encode(address(manager), address(sharedPool)),
            hookAddr
        );
        hook = LiquidShieldHook(payable(hookAddr));

        // Set hook on SharedLiquidityPool

        // Deploy settler
        settlerContract = new LiquidShieldSettler(hookAddr);
        settlerContract.setAuthorizedFiller(fillerAddr);

        // Deploy router
        router = new LiquidShieldRouter(hookAddr);

        // Configure hook: set router as authorized
        hook.setRscCallback(rscCallbackAddr);
        hook.setFillerAddress(fillerAddr);
        hook.setSettler(address(settlerContract));
        hook.setAuthorizedRouter(address(router));

        // Initialize pool
        PoolKey memory pk = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddr)
        });
        manager.initialize(pk, SQRT_PRICE_1_1);

        // Fund users
        _mintAndApproveUser(alice);
        _mintAndApproveUser(bob);
    }

    function _mintAndApproveUser(address user) internal {
        address token0Addr = Currency.unwrap(currency0);
        address token1Addr = Currency.unwrap(currency1);

        deal(token0Addr, user, 1000 ether);
        deal(token1Addr, user, 1000 ether);

        vm.startPrank(user);
        // Approve router for premium token transfers
        MockERC20(token0Addr).approve(address(router), type(uint256).max);
        MockERC20(token1Addr).approve(address(router), type(uint256).max);
        // Also approve hook directly for premium payments and reserve deposits
        MockERC20(token0Addr).approve(address(hook), type(uint256).max);
        MockERC20(token1Addr).approve(address(hook), type(uint256).max);
        vm.stopPrank();
    }

    // ================================================================
    // REGISTER AND PAY PREMIUM — HAPPY PATHS
    // ================================================================

    function test_registerAndPayPremium_registersWithCorrectOwner() public {
        bytes32 posId = keccak256("routerPos1");

        vm.prank(alice);
        router.registerAndPayPremium(
            posId, Currency.unwrap(currency0), Currency.unwrap(currency1), 10 ether,
            13e17, ILiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6,
            Currency.unwrap(currency0), 100 ether
        );

        // The position owner should be alice, NOT the router
        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.owner, alice, "Position owner should be the actual user, not the router");
        assertEq(pos.positionSize, 10 ether);
        assertEq(pos.sourceChainId, 421614);
    }

    function test_registerAndPayPremium_transfersPremium() public {
        bytes32 posId = keccak256("routerPos1");
        address token0 = Currency.unwrap(currency0);
        uint256 premiumAmount = 100 ether;
        uint256 balanceBefore = IERC20(token0).balanceOf(alice);

        vm.prank(alice);
        router.registerAndPayPremium(
            posId, token0, Currency.unwrap(currency1), 10 ether,
            13e17, ILiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6,
            token0, premiumAmount
        );

        uint256 balanceAfter = IERC20(token0).balanceOf(alice);
        assertEq(balanceBefore - balanceAfter, premiumAmount);

        // Premium should be split: 60% reserve, 40% accumulated
        (uint256 reserve0,) = hook.getReserveBalances();
        (uint256 premiums0,) = hook.getAccumulatedPremiums();
        assertEq(reserve0, (premiumAmount * 60) / 100);
        assertEq(premiums0, premiumAmount - (premiumAmount * 60) / 100);
    }

    function test_registerAndPayPremium_zeroPremium() public {
        bytes32 posId = keccak256("routerPos1");

        vm.prank(alice);
        router.registerAndPayPremium(
            posId, Currency.unwrap(currency0), Currency.unwrap(currency1), 10 ether,
            13e17, ILiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6,
            Currency.unwrap(currency0), 0 // No premium
        );

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.owner, alice);
    }

    // ================================================================
    // UNREGISTER — HAPPY PATHS
    // ================================================================

    function test_unregister_succeeds() public {
        bytes32 posId = keccak256("routerPos1");

        vm.prank(alice);
        router.registerAndPayPremium(
            posId, Currency.unwrap(currency0), Currency.unwrap(currency1), 10 ether,
            13e17, ILiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6,
            Currency.unwrap(currency0), 0
        );

        // Unregister via router — router is authorized, so it can act on behalf of alice
        vm.prank(alice);
        router.unregister(posId);

        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(posId);
        assertEq(pos.owner, address(0), "Position should be deleted");
    }

    // ================================================================
    // UNREGISTER — SAD PATHS
    // ================================================================

    function test_unregister_revertsWhenNotOwner() public {
        bytes32 posId = keccak256("routerPos1");

        vm.prank(alice);
        router.registerAndPayPremium(
            posId, Currency.unwrap(currency0), Currency.unwrap(currency1), 10 ether,
            13e17, ILiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 6,
            Currency.unwrap(currency0), 0
        );

        // Bob tries to unregister alice's position via router
        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(bob);
        router.unregister(posId);
    }

    // ================================================================
    // TOP UP PREMIUM — HAPPY PATHS
    // ================================================================

    function test_topUpPremium_succeeds() public {
        bytes32 posId = keccak256("routerPos1");

        vm.prank(alice);
        router.registerAndPayPremium(
            posId, Currency.unwrap(currency0), Currency.unwrap(currency1), 10 ether,
            13e17, ILiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614, address(0xBEEF), 3,
            Currency.unwrap(currency0), 0
        );

        LiquidShieldHook.ProtectedPosition memory posBefore = hook.getPosition(posId);

        vm.prank(alice);
        router.topUpPremium(posId, Currency.unwrap(currency0), 50 ether, 3);

        LiquidShieldHook.ProtectedPosition memory posAfter = hook.getPosition(posId);
        assertEq(posAfter.premiumPaidUntil, posBefore.premiumPaidUntil + (3 * 30 days));
    }

    // ================================================================
    // TOP UP PREMIUM — SAD PATHS
    // ================================================================

    function test_topUpPremium_revertsWhenZeroAmount() public {
        bytes32 posId = keccak256("routerPos1");

        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        router.topUpPremium(posId, Currency.unwrap(currency0), 0, 1);
    }
}

// Minimal mock for Deployers' MockERC20
interface MockERC20 is IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}
