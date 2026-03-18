// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {Test} from "forge-std/Test.sol";
import {PositionMonitor} from "../src/rsc/PositionMonitor.sol";
import {IReactive} from "reactive-lib/src/interfaces/IReactive.sol";
import {Events} from "../src/lib/Events.sol";

/// @notice Mock deployed at the SERVICE_ADDR to capture subscribe() calls
contract MockSystemContract {
    uint256 public lastSubscribeChainId;
    address public lastSubscribeContract;
    uint256 public lastSubscribeTopic0;
    uint256 public subscribeCallCount;

    function subscribe(
        uint256 chain_id, address _contract,
        uint256 topic_0, uint256, uint256, uint256
    ) external {
        lastSubscribeChainId = chain_id;
        lastSubscribeContract = _contract;
        lastSubscribeTopic0 = topic_0;
        subscribeCallCount++;
    }

    // Needed for AbstractPayer (debt check, pay)
    function debt(address) external pure returns (uint256) { return 0; }

    receive() external payable {}
    fallback() external payable {}
}

contract PositionMonitorTest is Test {
    PositionMonitor public monitor;
    MockSystemContract public mockService;

    address public callbackReceiver = makeAddr("callbackReceiver");
    address public ownerAddr;
    address public user = makeAddr("user");
    address public attacker = makeAddr("attacker");
    address public lendingProtocol = makeAddr("aavePool");

    uint256 public constant UNICHAIN_CHAIN_ID = 1301;
    address public constant SERVICE_ADDR = 0x0000000000000000000000000000000000fffFfF;

    function setUp() public {
        ownerAddr = address(this);

        // Deploy mock at the SERVICE_ADDR so AbstractReactive's constructor works
        mockService = new MockSystemContract();
        vm.etch(SERVICE_ADDR, address(mockService).code);

        // Deploy PositionMonitor (on Reactive Network — SERVICE_ADDR has code, so vm=false)
        monitor = new PositionMonitor(callbackReceiver, UNICHAIN_CHAIN_ID, lendingProtocol, 421614);
    }

    // Helper: create a LogRecord for testing react()
    function _makeLogRecord(address contractAddr) internal pure returns (IReactive.LogRecord memory) {
        return IReactive.LogRecord({
            chain_id: 421614,
            _contract: contractAddr,
            topic_0: 0,
            topic_1: 0,
            topic_2: 0,
            topic_3: 0,
            data: "",
            block_number: 100,
            op_code: 0,
            block_hash: 0,
            tx_hash: 0,
            log_index: 0
        });
    }

    // ================================================================
    // CONSTRUCTOR
    // ================================================================

    function test_constructor_setsState() public view {
        assertEq(monitor.callbackReceiver(), callbackReceiver);
        assertEq(monitor.unichainChainId(), UNICHAIN_CHAIN_ID);
        assertEq(monitor.owner(), ownerAddr);
    }

    function test_constructor_revertsWhenZeroReceiver() public {
        vm.expectRevert("Zero callback receiver");
        new PositionMonitor(address(0), UNICHAIN_CHAIN_ID, lendingProtocol, 421614);
    }

    // ================================================================
    // START MONITORING
    // ================================================================

    function test_startMonitoring_storesPosition() public {
        bytes32 posId = keccak256("pos1");
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);

        (bytes32 storedPosId, address storedUser, address storedProtocol,
         uint256 storedChainId, uint256 storedThreshold, bool active) = monitor.monitoredPositions(posId);

        assertEq(storedPosId, posId);
        assertEq(storedUser, user);
        assertEq(storedProtocol, lendingProtocol);
        assertEq(storedChainId, 421614);
        assertEq(storedThreshold, 13e17);
        assertTrue(active);
    }

    function test_startMonitoring_subscribesToReactive() public {
        bytes32 posId = keccak256("pos1");
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);

        // Check subscribe was called on the mock service
        MockSystemContract mock = MockSystemContract(payable(SERVICE_ADDR));
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
        monitor.startMonitoring(posId1, user, lendingProtocol, 421614, 13e17);
        monitor.startMonitoring(posId2, makeAddr("user2"), lendingProtocol, 11155111, 15e17);

        (,,,,, bool active1) = monitor.monitoredPositions(posId1);
        (,,,,, bool active2) = monitor.monitoredPositions(posId2);
        assertTrue(active1);
        assertTrue(active2);
    }

    function test_startMonitoring_revertsWhenNotOwner() public {
        vm.expectRevert("Only owner");
        vm.prank(attacker);
        monitor.startMonitoring(keccak256("pos1"), user, lendingProtocol, 421614, 13e17);
    }

    // ================================================================
    // STOP MONITORING
    // ================================================================

    function test_stopMonitoring_deactivatesPosition() public {
        bytes32 posId = keccak256("pos1");
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);
        monitor.stopMonitoring(posId);

        (,,,,, bool active) = monitor.monitoredPositions(posId);
        assertFalse(active);
    }

    function test_stopMonitoring_revertsWhenNotOwner() public {
        bytes32 posId = keccak256("pos1");
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, 13e17);

        vm.expectRevert("Only owner");
        vm.prank(attacker);
        monitor.stopMonitoring(posId);
    }

    // ================================================================
    // REACT (vmOnly — must simulate ReactVM context)
    // ================================================================

    function test_react_emitsCallbackEvent() public {
        bytes32 posId = keccak256("pos1");
        uint256 threshold = 13e17;
        monitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        // In the real ReactVM, SERVICE_ADDR has no code → vm=true
        // We need to remove the code at SERVICE_ADDR to simulate VM context
        vm.etch(SERVICE_ADDR, "");

        // Re-deploy in VM context (vm=true because SERVICE_ADDR has no code)
        PositionMonitor vmMonitor = new PositionMonitor(callbackReceiver, UNICHAIN_CHAIN_ID, lendingProtocol, 421614);
        // Re-register position (new instance)
        vmMonitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        IReactive.LogRecord memory log = _makeLogRecord(lendingProtocol);

        // react() should emit Callback event
        vm.expectEmit(true, true, true, false);
        emit IReactive.Callback(UNICHAIN_CHAIN_ID, callbackReceiver, 1_000_000, "");

        vmMonitor.react(log);
    }

    function test_react_emitsDefenseCallbackEvent() public {
        bytes32 posId = keccak256("pos1");
        uint256 threshold = 13e17;

        // Deploy in VM context
        vm.etch(SERVICE_ADDR, "");
        PositionMonitor vmMonitor = new PositionMonitor(callbackReceiver, UNICHAIN_CHAIN_ID, lendingProtocol, 421614);
        vmMonitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        IReactive.LogRecord memory log = _makeLogRecord(lendingProtocol);

        vm.expectEmit(true, false, false, true);
        emit Events.DefenseCallbackEmitted(posId, threshold - 1);

        vmMonitor.react(log);
    }

    function test_react_revertsWhenNotVm() public {
        // monitor was deployed with SERVICE_ADDR having code → vm=false
        // react() should revert with "VM only"
        IReactive.LogRecord memory log = _makeLogRecord(lendingProtocol);

        vm.expectRevert("VM only");
        monitor.react(log);
    }

    // ================================================================
    // FUZZ TESTS
    // ================================================================

    function testFuzz_startMonitoring_arbitraryThreshold(uint256 threshold) public {
        threshold = bound(threshold, 1e17, 100e18);
        bytes32 posId = keccak256(abi.encode("fuzz", threshold));

        monitor.startMonitoring(posId, user, lendingProtocol, 421614, threshold);

        (,,,, uint256 storedThreshold, bool active) = monitor.monitoredPositions(posId);
        assertEq(storedThreshold, threshold);
        assertTrue(active);
    }

    function testFuzz_startMonitoring_arbitraryChainId(uint256 chainId) public {
        chainId = bound(chainId, 1, type(uint64).max);
        bytes32 posId = keccak256(abi.encode("fuzz_chain", chainId));

        monitor.startMonitoring(posId, user, lendingProtocol, chainId, 13e17);

        (,,, uint256 storedChainId,, bool active) = monitor.monitoredPositions(posId);
        assertEq(storedChainId, chainId);
        assertTrue(active);
    }
}
