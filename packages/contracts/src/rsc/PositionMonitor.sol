// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {IReactive} from "reactive-lib/src/interfaces/IReactive.sol";
import {AbstractReactive} from "reactive-lib/src/abstract-base/AbstractReactive.sol";

/// @title PositionMonitor
/// @author LiquidShield Team
/// @notice RSC deployed on Reactive Network (Lasna). Two-hop architecture:
///         Hop 1: On CRON tick, sends callback to HealthChecker on source chain.
///                HealthChecker reads Aave health on-chain. If dangerous, emits HealthDanger.
///         Hop 2: RSC subscribes to HealthDanger events from HealthChecker.
///                On HealthDanger, sends callback to DefenseCallback on Unichain.
/// @dev No position storage in RSC. Position data lives exclusively on HealthChecker.
///      The RSC is a pure event router — CRON → HealthChecker, HealthDanger → DefenseCallback.
contract PositionMonitor is IReactive, AbstractReactive {

    uint64 private constant CALLBACK_GAS_LIMIT = 2_000_000;

    /// @notice HealthChecker contract on the source chain (e.g., Base Sepolia)
    address public healthChecker;

    /// @notice Source chain ID where HealthChecker + Aave live
    uint256 public sourceChainId;

    /// @notice DefenseCallback contract on Unichain
    address public defenseCallback;

    /// @notice Unichain chain ID (1301)
    uint256 public unichainChainId;

    /// @notice CRON topic for periodic ticks
    uint256 public cronTopic;

    /// @notice HealthDanger event topic from HealthChecker
    /// @dev keccak256("HealthDanger(bytes32,uint256,address)")
    uint256 public constant HEALTH_DANGER_TOPIC = uint256(keccak256("HealthDanger(bytes32,uint256,address)"));

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

        if (!vm) {
            // Subscribe to CRON ticks (Hop 1 trigger)
            service.subscribe(
                block.chainid,
                address(service),
                _cronTopic,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            // Subscribe to HealthDanger events from HealthChecker on source chain (Hop 2 trigger)
            service.subscribe(
                _sourceChainId,
                _healthChecker,
                HEALTH_DANGER_TOPIC,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    function react(LogRecord calldata log) external vmOnly {
        if (log.topic_0 == cronTopic) {
            // Hop 1: CRON tick → send checkPositions() to HealthChecker on source chain
            bytes memory healthPayload = abi.encodeWithSignature(
                "checkPositions(address)",
                address(0)
            );
            emit Callback(sourceChainId, healthChecker, CALLBACK_GAS_LIMIT, healthPayload);

        } else if (log.topic_0 == HEALTH_DANGER_TOPIC) {
            // Hop 2: HealthDanger event → forward to DefenseCallback on Unichain
            // HealthDanger(bytes32 indexed positionId, uint256 indexed healthFactor, address indexed user)
            // topic_1 = positionId, topic_2 = healthFactor
            bytes32 positionId = bytes32(log.topic_1);
            uint256 healthFactor = log.topic_2;

            bytes memory defensePayload = abi.encodeWithSignature(
                "onDefenseTriggered(address,bytes32,uint256)",
                address(0),
                positionId,
                healthFactor
            );
            emit Callback(unichainChainId, defenseCallback, CALLBACK_GAS_LIMIT, defensePayload);
        }
    }
}
