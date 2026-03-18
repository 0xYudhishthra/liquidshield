// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {Test} from "forge-std/Test.sol";
import {PositionMonitor} from "../src/rsc/PositionMonitor.sol";
import {IReactive} from "reactive-lib/src/interfaces/IReactive.sol";

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
    }

    function test_constructor_subscribesToCronAndHealthDanger() public view {
        // Should have 2 subscriptions: CRON + HealthDanger
        MockSystemContract mock = MockSystemContract(payable(SERVICE_ADDR));
        assertEq(mock.subscribeCallCount(), 2);
    }

    function test_healthDangerTopic_isCorrect() public view {
        uint256 expected = uint256(keccak256("HealthDanger(bytes32,uint256,address)"));
        assertEq(monitor.HEALTH_DANGER_TOPIC(), expected);
    }

    function test_react_cronTick_emitsHealthCheckerCallback() public {
        // Deploy in VM mode (no service)
        vm.etch(SERVICE_ADDR, "");
        PositionMonitor vmMonitor = new PositionMonitor(
            healthChecker, SOURCE_CHAIN_ID, defenseCallback, UNICHAIN_CHAIN_ID, CRON_TOPIC
        );

        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: 5318007, _contract: SERVICE_ADDR,
            topic_0: CRON_TOPIC, topic_1: 0, topic_2: 0, topic_3: 0,
            data: "", block_number: 100, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });

        // Should emit Callback to healthChecker on source chain
        vm.expectEmit(true, true, true, false);
        emit IReactive.Callback(SOURCE_CHAIN_ID, healthChecker, 2_000_000, "");
        vmMonitor.react(log);
    }

    function test_react_healthDanger_emitsDefenseCallback() public {
        vm.etch(SERVICE_ADDR, "");
        PositionMonitor vmMonitor = new PositionMonitor(
            healthChecker, SOURCE_CHAIN_ID, defenseCallback, UNICHAIN_CHAIN_ID, CRON_TOPIC
        );

        bytes32 positionId = keccak256("pos1");
        uint256 healthFactor = 12e17; // 1.2

        uint256 healthDangerTopic = uint256(keccak256("HealthDanger(bytes32,uint256,address)"));

        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: SOURCE_CHAIN_ID, _contract: healthChecker,
            topic_0: healthDangerTopic,
            topic_1: uint256(positionId),
            topic_2: healthFactor,
            topic_3: uint256(uint160(makeAddr("user"))),
            data: "", block_number: 200, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });

        // Should emit Callback to defenseCallback on Unichain
        vm.expectEmit(true, true, true, false);
        emit IReactive.Callback(UNICHAIN_CHAIN_ID, defenseCallback, 2_000_000, "");
        vmMonitor.react(log);
    }

    function test_react_ignoresUnknownEvents() public {
        vm.etch(SERVICE_ADDR, "");
        PositionMonitor vmMonitor = new PositionMonitor(
            healthChecker, SOURCE_CHAIN_ID, defenseCallback, UNICHAIN_CHAIN_ID, CRON_TOPIC
        );

        IReactive.LogRecord memory log = IReactive.LogRecord({
            chain_id: 5318007, _contract: SERVICE_ADDR,
            topic_0: 999999, topic_1: 0, topic_2: 0, topic_3: 0,
            data: "", block_number: 100, op_code: 0,
            block_hash: 0, tx_hash: 0, log_index: 0
        });

        // Should not revert, just return silently
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
