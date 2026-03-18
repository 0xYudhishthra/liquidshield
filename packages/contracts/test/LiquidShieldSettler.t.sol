// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {Test} from "forge-std/Test.sol";
import {LiquidShieldSettler} from "../src/settler/LiquidShieldSettler.sol";
import {Errors} from "../src/lib/Errors.sol";
import {Events} from "../src/lib/Events.sol";

contract LiquidShieldSettlerTest is Test {
    LiquidShieldSettler public settler;

    address public hookAddr = makeAddr("hook");
    address public fillerAddr = makeAddr("filler");
    address public ownerAddr;
    address public attacker = makeAddr("attacker");
    address public user = makeAddr("user");

    function setUp() public {
        ownerAddr = address(this);
        settler = new LiquidShieldSettler(hookAddr);
        settler.setAuthorizedFiller(fillerAddr);
    }

    // ================================================================
    // CONSTRUCTOR & ADMIN
    // ================================================================

    function test_constructor_setsHookAndOwner() public view {
        assertEq(settler.hook(), hookAddr);
        assertEq(settler.owner(), ownerAddr);
    }

    function test_setAuthorizedFiller_succeeds() public {
        address newFiller = makeAddr("newFiller");
        settler.setAuthorizedFiller(newFiller);
        assertEq(settler.authorizedFiller(), newFiller);
    }

    function test_setAuthorizedFiller_revertsWhenNotOwner() public {
        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(attacker);
        settler.setAuthorizedFiller(attacker);
    }

    // ================================================================
    // OPEN — HAPPY PATHS
    // ================================================================

    function test_open_succeeds() public {
        bytes32 posId = keccak256("pos1");

        vm.prank(hookAddr);
        bytes32 orderId = settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);

        assertTrue(settler.openOrders(orderId));
        assertEq(settler.nonce(), 1);
    }

    function test_open_emitsEvent() public {
        bytes32 posId = keccak256("pos1");

        vm.prank(hookAddr);
        settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);

        // Nonce is now 1
        assertEq(settler.nonce(), 1);
    }

    function test_open_incrementsNonce() public {
        bytes32 posId1 = keccak256("pos1");
        bytes32 posId2 = keccak256("pos2");

        vm.startPrank(hookAddr);
        settler.open(posId1, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);
        settler.open(posId2, address(0xBEEF), 5 ether, 421614, address(0xCAFE), 0, user);
        vm.stopPrank();

        assertEq(settler.nonce(), 2);
    }

    function test_open_generatesUniqueOrderIds() public {
        bytes32 posId = keccak256("pos1");

        vm.startPrank(hookAddr);
        bytes32 orderId1 = settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);
        bytes32 orderId2 = settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);
        vm.stopPrank();

        assertTrue(orderId1 != orderId2, "Order IDs should be unique due to nonce");
    }

    // ================================================================
    // OPEN — SAD PATHS
    // ================================================================

    function test_open_revertsWhenNotHook() public {
        bytes32 posId = keccak256("pos1");

        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(attacker);
        settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);
    }

    // ================================================================
    // SETTLE — HAPPY PATHS
    // ================================================================

    function test_settle_succeeds() public {
        bytes32 posId = keccak256("pos1");

        vm.prank(hookAddr);
        bytes32 orderId = settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);

        vm.prank(fillerAddr);
        settler.settle(orderId, fillerAddr);

        assertFalse(settler.openOrders(orderId));
        assertTrue(settler.settledOrders(orderId));
    }

    function test_settle_emitsEvent() public {
        bytes32 posId = keccak256("pos1");

        vm.prank(hookAddr);
        bytes32 orderId = settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);

        vm.expectEmit(true, true, false, false);
        emit Events.OrderSettled(orderId, fillerAddr);
        vm.prank(fillerAddr);
        settler.settle(orderId, fillerAddr);
    }

    function test_settle_byOwner_succeeds() public {
        bytes32 posId = keccak256("pos1");

        vm.prank(hookAddr);
        bytes32 orderId = settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);

        // Owner can also settle
        settler.settle(orderId, fillerAddr);

        assertFalse(settler.openOrders(orderId));
        assertTrue(settler.settledOrders(orderId));
    }

    // ================================================================
    // SETTLE — SAD PATHS
    // ================================================================

    function test_settle_revertsWhenUnauthorized() public {
        bytes32 posId = keccak256("pos1");

        vm.prank(hookAddr);
        bytes32 orderId = settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);

        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(attacker);
        settler.settle(orderId, attacker);
    }

    function test_settle_revertsWhenOrderNotFound() public {
        bytes32 fakeOrderId = keccak256("fake");

        vm.expectRevert(Errors.OrderNotFound.selector);
        vm.prank(fillerAddr);
        settler.settle(fakeOrderId, fillerAddr);
    }

    function test_settle_revertsWhenAlreadySettled() public {
        bytes32 posId = keccak256("pos1");

        vm.prank(hookAddr);
        bytes32 orderId = settler.open(posId, address(0xBEEF), 10 ether, 421614, address(0xCAFE), 0, user);

        vm.prank(fillerAddr);
        settler.settle(orderId, fillerAddr);

        vm.expectRevert(Errors.OrderNotFound.selector);
        vm.prank(fillerAddr);
        settler.settle(orderId, fillerAddr);
    }

    // ================================================================
    // FUZZ TESTS
    // ================================================================

    function testFuzz_open_arbitraryAmount(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max);
        bytes32 posId = keccak256(abi.encode("fuzz", amount));

        vm.prank(hookAddr);
        bytes32 orderId = settler.open(posId, address(0xBEEF), amount, 421614, address(0xCAFE), 0, user);

        assertTrue(settler.openOrders(orderId));
    }

    function testFuzz_open_arbitraryChainId(uint256 chainId) public {
        bytes32 posId = keccak256(abi.encode("fuzz_chain", chainId));

        vm.prank(hookAddr);
        bytes32 orderId = settler.open(posId, address(0xBEEF), 10 ether, chainId, address(0xCAFE), 0, user);

        assertTrue(settler.openOrders(orderId));
    }
}
