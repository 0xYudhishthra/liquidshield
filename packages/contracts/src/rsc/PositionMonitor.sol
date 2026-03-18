// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {IReactive} from "reactive-lib/src/interfaces/IReactive.sol";
import {AbstractReactive} from "reactive-lib/src/abstract-base/AbstractReactive.sol";
import {Events} from "../lib/Events.sol";

/// @title PositionMonitor
/// @author LiquidShield Team
/// @notice Reactive Smart Contract (RSC) deployed on Reactive Network (Lasna).
///         Two-hop architecture:
///         Hop 1: CRON tick → callback to HealthChecker on source chain (reads Aave health on-chain)
///         Hop 2: HealthChecker emits HealthDanger → RSC reacts → callback to DefenseCallback on Unichain
/// @dev Follows patterns from Reactive Network's official demos:
///      - CRON subscription from Aave Liquidation Protection demo
///      - Event-based reaction from Uniswap Stop Order demo
///      - Health factor read on the chain where Aave lives (not in RSC)
contract PositionMonitor is IReactive, AbstractReactive {

    // ============ CONSTANTS ============

    uint64 private constant CALLBACK_GAS_LIMIT = 2_000_000;

    /// @dev keccak256("HealthDanger(bytes32,uint256,address)")
    uint256 private constant HEALTH_DANGER_TOPIC =
        uint256(keccak256("HealthDanger(bytes32,uint256,address)"));

    /// @dev keccak256("CheckCycleCompleted(uint256,uint256,uint256)")
    uint256 private constant CHECK_CYCLE_COMPLETED_TOPIC =
        uint256(keccak256("CheckCycleCompleted(uint256,uint256,uint256)"));

    // ============ STATE ============

    /// @notice HealthChecker contract on the source chain (same chain as Aave)
    address public healthChecker;

    /// @notice Source chain ID where HealthChecker + Aave live
    uint256 public sourceChainId;

    /// @notice DefenseCallback contract on Unichain
    address public defenseCallback;

    /// @notice Unichain chain ID
    uint256 public unichainChainId;

    /// @notice CRON topic for periodic health checks
    uint256 public cronTopic;

    /// @notice Owner
    address public owner;

    /// @notice Processing lock (prevents overlapping CRON cycles)
    bool public processingActive;

    // ============ CONSTRUCTOR ============

    /// @param _healthChecker HealthChecker contract on the source chain
    /// @param _sourceChainId Chain ID where HealthChecker lives (e.g., 84532 for Base Sepolia)
    /// @param _defenseCallback DefenseCallback contract on Unichain
    /// @param _unichainChainId Unichain chain ID (1301)
    /// @param _cronTopic CRON topic for periodic monitoring
    constructor(
        address _healthChecker,
        uint256 _sourceChainId,
        address _defenseCallback,
        uint256 _unichainChainId,
        uint256 _cronTopic
    ) payable {
        healthChecker = _healthChecker;
        sourceChainId = _sourceChainId;
        defenseCallback = _defenseCallback;
        unichainChainId = _unichainChainId;
        cronTopic = _cronTopic;
        owner = msg.sender;
        processingActive = false;

        if (!vm) {
            // Hop 1 trigger: subscribe to CRON events on Reactive Network
            service.subscribe(
                block.chainid,
                address(service),
                _cronTopic,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            // Hop 2 trigger: subscribe to HealthDanger events from HealthChecker
            service.subscribe(
                _sourceChainId,
                _healthChecker,
                HEALTH_DANGER_TOPIC,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            // Reset lock: subscribe to CheckCycleCompleted events
            service.subscribe(
                _sourceChainId,
                _healthChecker,
                CHECK_CYCLE_COMPLETED_TOPIC,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    // ============ REACT ============

    function react(LogRecord calldata log) external vmOnly {

        if (log.topic_0 == cronTopic) {
            // ─── HOP 1: CRON tick → send callback to HealthChecker on source chain ───
            if (processingActive) return;
            processingActive = true;

            bytes memory payload = abi.encodeWithSignature(
                "checkPositions(address)",
                address(0) // placeholder — Reactive overwrites first 160 bits with RVM ID
            );

            emit Callback(sourceChainId, healthChecker, CALLBACK_GAS_LIMIT, payload);

        } else if (log.topic_0 == HEALTH_DANGER_TOPIC && log._contract == healthChecker) {
            // ─── HOP 2: HealthDanger detected → trigger defense on Unichain ───
            bytes32 positionId = bytes32(log.topic_1);
            uint256 currentHealth = uint256(log.topic_2);

            bytes memory payload = abi.encodeWithSignature(
                "onDefenseTriggered(bytes32,uint256)",
                positionId,
                currentHealth
            );

            emit Callback(unichainChainId, defenseCallback, CALLBACK_GAS_LIMIT, payload);
            emit Events.DefenseCallbackEmitted(positionId, currentHealth);

        } else if (log.topic_0 == CHECK_CYCLE_COMPLETED_TOPIC && log._contract == healthChecker) {
            // ─── RESET: cycle completed, allow next CRON trigger ───
            processingActive = false;
        }
    }

    // ============ ADMIN ============

    function resetProcessing() external {
        require(msg.sender == owner, "Only owner");
        processingActive = false;
    }
}
