// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PositionMonitor} from "../src/rsc/PositionMonitor.sol";
import {Errors} from "../src/lib/Errors.sol";
import {Events} from "../src/lib/Events.sol";

/// @notice Mock deployed at the REACTIVE_CALLBACK address to capture subscribe() and callback calls
contract MockReactiveCallback {
    // Track subscribe calls
    uint256 public lastSubscribeChainId;
    address public lastSubscribeContract;
    uint256 public lastSubscribeTopic0;
    uint256 public subscribeCallCount;

    // Track callback calls (from react → REACTIVE_CALLBACK.call)
    uint256 public lastCallbackChainId;
    address public lastCallbackTarget;
    bytes public lastCallbackPayload;
    uint256 public callbackCallCount;

    /// @dev Matches ISubscriptionService.subscribe
    function subscribe(
        uint256 chain_id, address _contract,
        uint256 topic_0, uint256, uint256, uint256
    ) external {
        lastSubscribeChainId = chain_id;
        lastSubscribeContract = _contract;
        lastSubscribeTopic0 = topic_0;
        subscribeCallCount++;
    }

    /// @dev Fallback to capture the callback call from react()
    fallback(bytes calldata data) external returns (bytes memory) {
        // The react() function encodes: abi.encode(unichainChainId, liquidShieldHook, payload)
        if (data.length > 0) {
            (uint256 chainId, address target, bytes memory payload) = abi.decode(data, (uint256, address, bytes));
            lastCallbackChainId = chainId;
            lastCallbackTarget = target;
            lastCallbackPayload = payload;
            callbackCallCount++;
        }
        return abi.encode(true);
    }
}

contract PositionMonitorTest is Test {
    PositionMonitor public monitor;
    MockReactiveCallback public mockReactive;

    address public hookAddr = makeAddr("hook");
    address public ownerAddr;
    address public user = makeAddr("user");
    address public attacker = makeAddr("attacker");
    address public lendingProtocol = makeAddr("aavePool");

    uint256 public constant UNICHAIN_CHAIN_ID = 1301;
    address public constant REACTIVE_CALLBACK = 0x0000000000000000000000000000000000fffFfF;

    function setUp() public {
        ownerAddr = address(this);

        // Deploy mock at the REACTIVE_CALLBACK address
        mockReactive = new MockReactiveCallback();
        vm.etch(REACTIVE_CALLBACK, address(mockReactive).code);

        // Deploy PositionMonitor
        monitor = new PositionMonitor(hookAddr, UNICHAIN_CHAIN_ID);
    }

    // ================================================================
    // CONSTRUCTOR — HAPPY PATHS
    // ================================================================

    function test_constructor_setsImmutables() public view {
        assertEq(monitor.liquidShieldHook(), hookAddr);
        assertEq(monitor.unichainChainId(), UNICHAIN_CHAIN_ID);
        assertEq(monitor.owner(), ownerAddr);
    }

    // ================================================================
    // CONSTRUCTOR — SAD PATHS
    // ================================================================

    function test_constructor_revertsWhenZeroHook() public {
        vm.expectRevert(Errors.ZeroAddress.selector);
        new PositionMonitor(address(0), UNICHAIN_CHAIN_ID);
    }

    // ================================================================
    // START MONITORING — HAPPY PATHS
    // ================================================================

    function test_startMonitoring_storesPosition() public {
        bytes32 posId = keccak256("pos1");
        uint256 threshold = 13e17;

        monitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        (
            bytes32 storedPosId, address storedUser, address storedProtocol,
            uint256 storedChainId, uint256 storedThreshold, bool active
        ) = monitor.monitoredPositions(posId);

        assertEq(storedPosId, posId);
        assertEq(storedUser, user);
        assertEq(storedProtocol, lendingProtocol);
        assertEq(storedChainId, 421614);
        assertEq(storedThreshold, threshold);
        assertTrue(active);
    }

    function test_startMonitoring_subscribesToReactive() public {
        bytes32 posId = keccak256("pos1");

        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);

        // Check subscribe was called on the mock at REACTIVE_CALLBACK
        MockReactiveCallback mock = MockReactiveCallback(REACTIVE_CALLBACK);
        assertEq(mock.lastSubscribeChainId(), 421614);
        assertEq(mock.lastSubscribeContract(), lendingProtocol);
        assertEq(
            mock.lastSubscribeTopic0(),
            uint256(keccak256("ReserveDataUpdated(address,uint256,uint256,uint256,uint256,uint256)"))
        );
    }

    function test_startMonitoring_emitsEvent() public {
        bytes32 posId = keccak256("pos1");

        vm.expectEmit(true, true, false, true);
        emit Events.PositionMonitoringStarted(posId, user, 421614);

        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);
    }

    function test_startMonitoring_multiplePositions() public {
        bytes32 posId1 = keccak256("pos1");
        bytes32 posId2 = keccak256("pos2");
        address user2 = makeAddr("user2");

        monitor.startMonitoring(posId1, user, lendingProtocol, 421614, 13e17);
        monitor.startMonitoring(posId2, user2, lendingProtocol, 11155111, 15e17);

        (,, , , , bool active1) = monitor.monitoredPositions(posId1);
        (,, , , , bool active2) = monitor.monitoredPositions(posId2);
        assertTrue(active1);
        assertTrue(active2);
    }

    // ================================================================
    // START MONITORING — SAD PATHS
    // ================================================================

    function test_startMonitoring_revertsWhenNotOwner() public {
        bytes32 posId = keccak256("pos1");

        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(attacker);
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);
    }

    // ================================================================
    // STOP MONITORING — HAPPY PATHS
    // ================================================================

    function test_stopMonitoring_deactivatesPosition() public {
        bytes32 posId = keccak256("pos1");
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);

        monitor.stopMonitoring(posId);

        (,, , , , bool active) = monitor.monitoredPositions(posId);
        assertFalse(active);
    }

    // ================================================================
    // STOP MONITORING — SAD PATHS
    // ================================================================

    function test_stopMonitoring_revertsWhenNotOwner() public {
        bytes32 posId = keccak256("pos1");
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);

        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(attacker);
        monitor.stopMonitoring(posId);
    }

    // ================================================================
    // REACT — HAPPY PATHS
    // ================================================================

    function test_react_triggersCallback() public {
        bytes32 posId = keccak256("pos1");
        uint256 threshold = 13e17;
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        // Simulate reactive callback (msg.sender = REACTIVE_CALLBACK)
        vm.prank(REACTIVE_CALLBACK);
        monitor.react(
            0, // chain_id
            address(0), // _contract
            0, // topic_0
            uint256(posId), // topic_1 (used as positionId)
            0, 0, // topic_2, topic_3
            "", // data (empty = use conservative threshold - 1)
            0, 0 // block_number, op_code
        );

        // Verify callback was sent to REACTIVE_CALLBACK
        MockReactiveCallback mock = MockReactiveCallback(REACTIVE_CALLBACK);
        assertEq(mock.lastCallbackChainId(), UNICHAIN_CHAIN_ID);
        assertEq(mock.lastCallbackTarget(), hookAddr);
    }

    function test_react_usesConservativeHealthWhenNoData() public {
        bytes32 posId = keccak256("pos1");
        uint256 threshold = 13e17;
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        vm.prank(REACTIVE_CALLBACK);
        monitor.react(0, address(0), 0, uint256(posId), 0, 0, "", 0, 0);

        // The callback payload should encode triggerDefense(posId, threshold - 1)
        MockReactiveCallback mock = MockReactiveCallback(REACTIVE_CALLBACK);
        bytes memory expectedPayload = abi.encodeWithSignature(
            "triggerDefense(bytes32,uint256)", posId, threshold - 1
        );
        assertEq(mock.lastCallbackPayload(), expectedPayload);
    }

    function test_react_usesEventDataWhenPresent() public {
        bytes32 posId = keccak256("pos1");
        uint256 threshold = 13e17;
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        // Pass actual health factor in event data
        uint256 actualHealth = 11e17;
        bytes memory eventData = abi.encode(actualHealth);

        vm.prank(REACTIVE_CALLBACK);
        monitor.react(0, address(0), 0, uint256(posId), 0, 0, eventData, 0, 0);

        MockReactiveCallback mock = MockReactiveCallback(REACTIVE_CALLBACK);
        bytes memory expectedPayload = abi.encodeWithSignature(
            "triggerDefense(bytes32,uint256)", posId, actualHealth
        );
        assertEq(mock.lastCallbackPayload(), expectedPayload);
    }

    function test_react_emitsEvent() public {
        bytes32 posId = keccak256("pos1");
        uint256 threshold = 13e17;
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        vm.expectEmit(true, false, false, true);
        emit Events.DefenseCallbackEmitted(posId, threshold - 1);

        vm.prank(REACTIVE_CALLBACK);
        monitor.react(0, address(0), 0, uint256(posId), 0, 0, "", 0, 0);
    }

    // ================================================================
    // REACT — SAD PATHS
    // ================================================================

    function test_react_revertsWhenNotReactiveCallback() public {
        bytes32 posId = keccak256("pos1");
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);

        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(attacker);
        monitor.react(0, address(0), 0, uint256(posId), 0, 0, "", 0, 0);
    }

    function test_react_revertsWhenPositionNotMonitored() public {
        bytes32 posId = keccak256("nonexistent");

        vm.expectRevert(Errors.PositionNotMonitored.selector);
        vm.prank(REACTIVE_CALLBACK);
        monitor.react(0, address(0), 0, uint256(posId), 0, 0, "", 0, 0);
    }

    function test_react_revertsWhenPositionStopped() public {
        bytes32 posId = keccak256("pos1");
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);
        monitor.stopMonitoring(posId);

        vm.expectRevert(Errors.PositionNotMonitored.selector);
        vm.prank(REACTIVE_CALLBACK);
        monitor.react(0, address(0), 0, uint256(posId), 0, 0, "", 0, 0);
    }

    // ================================================================
    // FUZZ TESTS
    // ================================================================

    function testFuzz_startMonitoring_arbitraryThreshold(uint256 threshold) public {
        threshold = bound(threshold, 1e17, 100e18);
        bytes32 posId = keccak256(abi.encode("fuzz", threshold));

        monitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        (, , , , uint256 storedThreshold, bool active) = monitor.monitoredPositions(posId);
        assertEq(storedThreshold, threshold);
        assertTrue(active);
    }

    function testFuzz_startMonitoring_arbitraryChainId(uint256 chainId) public {
        chainId = bound(chainId, 1, type(uint64).max);
        bytes32 posId = keccak256(abi.encode("fuzz_chain", chainId));

        monitor.startMonitoring(posId, user, lendingProtocol, chainId, 13e17);

        (, , , uint256 storedChainId, , bool active) = monitor.monitoredPositions(posId);
        assertEq(storedChainId, chainId);
        assertTrue(active);
    }

    function testFuzz_react_withEventData(uint256 healthValue) public {
        healthValue = bound(healthValue, 1, 100e18);
        bytes32 posId = keccak256("fuzz_react");
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);

        bytes memory eventData = abi.encode(healthValue);

        vm.prank(REACTIVE_CALLBACK);
        monitor.react(0, address(0), 0, uint256(posId), 0, 0, eventData, 0, 0);

        // Verify the health value was passed through
        MockReactiveCallback mock = MockReactiveCallback(REACTIVE_CALLBACK);
        bytes memory expectedPayload = abi.encodeWithSignature(
            "triggerDefense(bytes32,uint256)", posId, healthValue
        );
        assertEq(mock.lastCallbackPayload(), expectedPayload);
    }
}
