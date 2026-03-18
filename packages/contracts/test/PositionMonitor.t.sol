// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {Test} from "forge-std/Test.sol";
import {PositionMonitor} from "../src/rsc/PositionMonitor.sol";
import {IReactive} from "reactive-lib/src/interfaces/IReactive.sol";
import {Events} from "../src/lib/Events.sol";

contract MockSystemContract {
    uint256 public subscribeCallCount;

    function subscribe(uint256, address, uint256, uint256, uint256, uint256) external {
        subscribeCallCount++;
    }

    function debt(address) external pure returns (uint256) { return 0; }
    receive() external payable {}
    fallback() external payable {}
}

contract PositionMonitorTest is Test {
    PositionMonitor public monitor;
    address public healthChecker = makeAddr("healthChecker");
    address public defenseCallback = makeAddr("defenseCallback");
    uint256 public constant UNICHAIN_CHAIN_ID = 1301;
    uint256 public constant SOURCE_CHAIN_ID = 84532;
    uint256 public constant CRON_TOPIC = 123456;
    address public constant SERVICE_ADDR = 0x0000000000000000000000000000000000fffFfF;

    uint256 public constant HEALTH_DANGER_TOPIC =
        uint256(keccak256("HealthDanger(bytes32,uint256,address)"));
    uint256 public constant CHECK_CYCLE_COMPLETED_TOPIC =
        uint256(keccak256("CheckCycleCompleted(uint256,uint256,uint256)"));

    function setUp() public {
        MockSystemContract mockService = new MockSystemContract();
        vm.etch(SERVICE_ADDR, address(mockService).code);
        monitor = new PositionMonitor(
            healthChecker, SOURCE_CHAIN_ID, defenseCallback, UNICHAIN_CHAIN_ID, CRON_TOPIC
        );
    }

    function test_constructor_setsState() public view {
        assertEq(monitor.healthChecker(), healthChecker);
        assertEq(monitor.sourceChainId(), SOURCE_CHAIN_ID);
        assertEq(monitor.defenseCallback(), defenseCallback);
        assertEq(monitor.unichainChainId(), UNICHAIN_CHAIN_ID);
        assertEq(monitor.cronTopic(), CRON_TOPIC);
        assertFalse(monitor.processingActive());
    }

    function test_constructor_subscribes3Topics() public view {
        // CRON + HealthDanger + CheckCycleCompleted = 3 subscriptions
        MockSystemContract mock = MockSystemContract(payable(SERVICE_ADDR));
        assertEq(mock.subscribeCallCount(), 3);
    }

    function test_react_cronTriggersSendToHealthChecker() public {
        // Deploy in VM context
        vm.etch(SERVICE_ADDR, "");
        PositionMonitor vmMonitor = new PositionMonitor(
            healthChecker, SOURCE_CHAIN_ID, defenseCallback, UNICHAIN_CHAIN_ID, CRON_TOPIC
        );

        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: 5318007,
            _contract: SERVICE_ADDR,
            topic_0: CRON_TOPIC,
            topic_1: 0, topic_2: 0, topic_3: 0,
            data: "", block_number: 100, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });

        // Should emit Callback to healthChecker on source chain
        vm.expectEmit(true, true, true, false);
        emit IReactive.Callback(SOURCE_CHAIN_ID, healthChecker, 2_000_000, "");

        vmMonitor.react(log);
        assertTrue(vmMonitor.processingActive());
    }

    function test_react_healthDangerTriggersDefenseCallback() public {
        vm.etch(SERVICE_ADDR, "");
        PositionMonitor vmMonitor = new PositionMonitor(
            healthChecker, SOURCE_CHAIN_ID, defenseCallback, UNICHAIN_CHAIN_ID, CRON_TOPIC
        );

        bytes32 posId = keccak256("test_pos");
        uint256 currentHealth = 11e17; // 1.1x — below threshold

        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: SOURCE_CHAIN_ID,
            _contract: healthChecker,
            topic_0: HEALTH_DANGER_TOPIC,
            topic_1: uint256(posId),
            topic_2: currentHealth,
            topic_3: 0,
            data: "", block_number: 200, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });

        // Should emit Callback to defenseCallback on Unichain
        vm.expectEmit(true, true, true, false);
        emit IReactive.Callback(UNICHAIN_CHAIN_ID, defenseCallback, 2_000_000, "");

        vmMonitor.react(log);
    }

    function test_react_cycleCompletedResetsLock() public {
        vm.etch(SERVICE_ADDR, "");
        PositionMonitor vmMonitor = new PositionMonitor(
            healthChecker, SOURCE_CHAIN_ID, defenseCallback, UNICHAIN_CHAIN_ID, CRON_TOPIC
        );

        // First trigger CRON to set processingActive = true
        IReactive.LogRecord memory cronLog = IReactive.LogRecord({
            chain_id: 5318007, _contract: SERVICE_ADDR,
            topic_0: CRON_TOPIC, topic_1: 0, topic_2: 0, topic_3: 0,
            data: "", block_number: 100, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });
        vmMonitor.react(cronLog);
        assertTrue(vmMonitor.processingActive());

        // Then CheckCycleCompleted resets it
        IReactive.LogRecord memory completedLog = IReactive.LogRecord({
            chain_id: SOURCE_CHAIN_ID, _contract: healthChecker,
            topic_0: CHECK_CYCLE_COMPLETED_TOPIC, topic_1: 0, topic_2: 0, topic_3: 0,
            data: "", block_number: 201, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });
        vmMonitor.react(completedLog);
        assertFalse(vmMonitor.processingActive());
    }

    function test_react_cronSkipsWhenProcessing() public {
        vm.etch(SERVICE_ADDR, "");
        PositionMonitor vmMonitor = new PositionMonitor(
            healthChecker, SOURCE_CHAIN_ID, defenseCallback, UNICHAIN_CHAIN_ID, CRON_TOPIC
        );

        IReactive.LogRecord memory cronLog = IReactive.LogRecord({
            chain_id: 5318007, _contract: SERVICE_ADDR,
            topic_0: CRON_TOPIC, topic_1: 0, topic_2: 0, topic_3: 0,
            data: "", block_number: 100, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });

        vmMonitor.react(cronLog); // first tick — triggers
        assertTrue(vmMonitor.processingActive());

        // Second tick — should be skipped (no additional Callback)
        vmMonitor.react(cronLog);
        // Still processing, didn't crash
        assertTrue(vmMonitor.processingActive());
    }

    function test_react_ignoresUnknownEvents() public {
        vm.etch(SERVICE_ADDR, "");
        PositionMonitor vmMonitor = new PositionMonitor(
            healthChecker, SOURCE_CHAIN_ID, defenseCallback, UNICHAIN_CHAIN_ID, CRON_TOPIC
        );

        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: SOURCE_CHAIN_ID, _contract: healthChecker,
            topic_0: 999999, // unknown topic
            topic_1: 0, topic_2: 0, topic_3: 0,
            data: "", block_number: 100, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });

        // Should not revert, just no-op
        vmMonitor.react(log);
    }

    function test_react_revertsWhenNotVm() public {
        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: 5318007, _contract: SERVICE_ADDR,
            topic_0: CRON_TOPIC, topic_1: 0, topic_2: 0, topic_3: 0,
            data: "", block_number: 100, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });
        vm.expectRevert("VM only");
        monitor.react(log);
    }
}
