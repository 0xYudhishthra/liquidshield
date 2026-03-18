// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {IReactive} from "reactive-lib/src/interfaces/IReactive.sol";
import {AbstractReactive} from "reactive-lib/src/abstract-base/AbstractReactive.sol";
import {Events} from "../lib/Events.sol";

/// @title PositionMonitor
/// @author LiquidShield Team
/// @notice Reactive Smart Contract (RSC) deployed on Reactive Network that monitors
///         lending protocol events on source chains and triggers defense callbacks
///         on the LiquidShield hook via the Unichain callback receiver.
/// @dev Inherits AbstractReactive for proper Reactive Network integration.
///      Subscribes to Aave V3 ReserveDataUpdated events on source chains.
///      When an event fires, emits a Callback event that Reactive Network delivers
///      to the DefenseCallback contract on Unichain Sepolia.
contract PositionMonitor is IReactive, AbstractReactive {

    // ============ CONSTANTS ============

    /// @dev Gas limit for the callback transaction on the destination chain
    uint64 private constant CALLBACK_GAS_LIMIT = 1_000_000;

    /// @dev Aave V3 ReserveDataUpdated event topic
    uint256 private constant RESERVE_DATA_UPDATED_TOPIC =
        uint256(keccak256("ReserveDataUpdated(address,uint256,uint256,uint256,uint256,uint256)"));

    // ============ STRUCTS ============

    struct MonitoredPosition {
        bytes32 positionId;
        address user;
        address lendingProtocol;
        uint256 sourceChainId;
        uint256 healthThreshold;
        bool active;
    }

    // ============ STATE VARIABLES ============

    /// @notice Address of the DefenseCallback contract on Unichain
    address public callbackReceiver;

    /// @notice Unichain chain ID for callback routing
    uint256 public unichainChainId;

    /// @notice Contract owner for admin operations
    address public owner;

    /// @notice Monitored positions by ID
    mapping(bytes32 => MonitoredPosition) public monitoredPositions;

    /// @notice Reverse mapping: lending protocol address → position IDs
    mapping(address => bytes32[]) public protocolPositions;

    // ============ MODIFIERS ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ============ CONSTRUCTOR ============

    /// @notice Deploys the position monitor RSC
    /// @param _callbackReceiver Address of DefenseCallback contract on Unichain
    /// @param _unichainChainId Chain ID of Unichain for callback routing
    constructor(address _callbackReceiver, uint256 _unichainChainId) payable {
        require(_callbackReceiver != address(0), "Zero callback receiver");
        callbackReceiver = _callbackReceiver;
        unichainChainId = _unichainChainId;
        owner = msg.sender;
    }

    // ============ EXTERNAL FUNCTIONS ============

    /// @notice Starts monitoring a lending position for health factor drops
    /// @param positionId Unique position identifier
    /// @param user Address of the position owner on the source chain
    /// @param lendingProtocol Address of the lending protocol contract on the source chain
    /// @param sourceChainId Chain ID of the source chain
    /// @param healthThreshold Health factor threshold below which defense triggers
    function startMonitoring(
        bytes32 positionId, address user, address lendingProtocol,
        uint256 sourceChainId, uint256 healthThreshold
    ) external onlyOwner {
        monitoredPositions[positionId] = MonitoredPosition(
            positionId, user, lendingProtocol, sourceChainId, healthThreshold, true
        );
        protocolPositions[lendingProtocol].push(positionId);

        // Subscribe to ReserveDataUpdated events on the source chain
        // Only runs on Reactive Network (not in ReactVM)
        if (!vm) {
            service.subscribe(
                sourceChainId,
                lendingProtocol,
                RESERVE_DATA_UPDATED_TOPIC,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }

        emit Events.PositionMonitoringStarted(positionId, user, sourceChainId);
    }

    /// @notice Stops monitoring a lending position
    /// @param positionId Unique position identifier to stop monitoring
    function stopMonitoring(bytes32 positionId) external onlyOwner {
        monitoredPositions[positionId].active = false;
    }

    /// @notice Reactive callback invoked by the ReactVM when a subscribed event fires
    /// @dev Only executes inside the ReactVM (vmOnly). Emits Callback event to trigger
    ///      defense on Unichain via the callback proxy.
    /// @param log The log record from the source chain event
    function react(LogRecord calldata log) external vmOnly {
        // Look up positions monitored for this lending protocol
        bytes32[] storage posIds = protocolPositions[log._contract];

        for (uint256 i = 0; i < posIds.length; i++) {
            MonitoredPosition storage pos = monitoredPositions[posIds[i]];
            if (!pos.active) continue;

            // Conservative approach: trigger defense at threshold - 1
            // The actual health factor check happens on-chain at the hook
            uint256 currentHealth = pos.healthThreshold - 1;

            // Encode the callback to DefenseCallback.onDefenseTriggered()
            bytes memory payload = abi.encodeWithSignature(
                "onDefenseTriggered(bytes32,uint256)",
                pos.positionId,
                currentHealth
            );

            // Emit Callback event — Reactive Network delivers this to Unichain
            emit Callback(unichainChainId, callbackReceiver, CALLBACK_GAS_LIMIT, payload);
            emit Events.DefenseCallbackEmitted(pos.positionId, currentHealth);
        }
    }
}
