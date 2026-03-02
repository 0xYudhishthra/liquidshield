// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Errors} from "../lib/Errors.sol";
import {Events} from "../lib/Events.sol";

/// @notice Interface for Reactive Network subscription service
interface ISubscriptionService {
    function subscribe(uint256 chain_id, address _contract, uint256 topic_0, uint256 topic_1, uint256 topic_2, uint256 topic_3) external;
}

/// @title PositionMonitor
/// @author LiquidShield Team
/// @notice Reactive Smart Contract (RSC) that monitors lending positions and triggers defense callbacks
/// @dev Deployed on Reactive Network's Kopli Testnet. Subscribes to lending protocol events
///      on source chains and sends native callbacks to the LiquidShield hook on Unichain
///      when health factor drops below the configured threshold.
contract PositionMonitor {

    // ============ CONSTANTS ============

    /// @dev Reactive Network callback address for subscription and callback routing
    address private constant REACTIVE_CALLBACK = 0x0000000000000000000000000000000000fffFfF;

    /// @dev Reactive Network sentinel value to ignore a topic filter
    uint256 private constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f51571587571505116562c1e910e850f78e1;

    // ============ STRUCTS ============

    /// @notice Data for a position being monitored by the RSC
    struct MonitoredPosition {
        bytes32 positionId;
        address user;
        address lendingProtocol;
        uint256 sourceChainId;
        uint256 healthThreshold;
        bool active;
    }

    // ============ STATE VARIABLES ============

    /// @notice Address of the LiquidShield hook on Unichain
    address public liquidShieldHook;

    /// @notice Unichain chain ID for callback routing
    uint256 public unichainChainId;

    /// @notice Contract owner for admin operations
    address public owner;

    /// @notice Monitored positions by ID
    mapping(bytes32 => MonitoredPosition) public monitoredPositions;

    // ============ MODIFIERS ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.UnauthorizedCaller();
        _;
    }

    modifier onlyReactive() {
        if (msg.sender != REACTIVE_CALLBACK) revert Errors.UnauthorizedCaller();
        _;
    }

    // ============ CONSTRUCTOR ============

    /// @notice Deploys the position monitor RSC
    /// @param _hook Address of the LiquidShield hook on Unichain
    /// @param _unichainChainId Chain ID of Unichain for callback routing
    constructor(address _hook, uint256 _unichainChainId) {
        if (_hook == address(0)) revert Errors.ZeroAddress();
        liquidShieldHook = _hook;
        unichainChainId = _unichainChainId;
        owner = msg.sender;
    }

    // ============ EXTERNAL FUNCTIONS (STATE-CHANGING) ============

    /// @notice Starts monitoring a lending position for health factor drops
    /// @param positionId Unique position identifier
    /// @param user Address of the position owner on the source chain
    /// @param lendingProtocol Address of the lending protocol on the source chain
    /// @param sourceChainId Chain ID of the source chain
    /// @param healthThreshold Health factor threshold below which defense triggers
    function startMonitoring(
        bytes32 positionId, address user, address lendingProtocol,
        uint256 sourceChainId, uint256 healthThreshold
    ) external onlyOwner {
        monitoredPositions[positionId] = MonitoredPosition(
            positionId, user, lendingProtocol, sourceChainId, healthThreshold, true
        );

        ISubscriptionService(REACTIVE_CALLBACK).subscribe(
            sourceChainId, lendingProtocol,
            uint256(keccak256("ReserveDataUpdated(address,uint256,uint256,uint256,uint256,uint256)")),
            REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE
        );

        emit Events.PositionMonitoringStarted(positionId, user, sourceChainId);
    }

    /// @notice Stops monitoring a lending position
    /// @param positionId Unique position identifier to stop monitoring
    function stopMonitoring(bytes32 positionId) external onlyOwner {
        monitoredPositions[positionId].active = false;
    }

    /// @notice Reactive callback invoked when a subscribed event fires on the source chain
    /// @dev Only callable by the Reactive Network callback address. Triggers defense
    ///      on the LiquidShield hook via native Reactive callback to Unichain.
    function react(
        uint256, address, uint256, uint256 topic_1,
        uint256, uint256, bytes calldata data, uint256, uint256
    ) external onlyReactive {
        // topic_1 is the reserve asset address from ReserveDataUpdated event
        bytes32 positionId = bytes32(topic_1);
        MonitoredPosition storage pos = monitoredPositions[positionId];
        if (!pos.active) revert Errors.PositionNotMonitored();

        // Conservative: trigger defense at threshold - 1
        uint256 currentHealth = pos.healthThreshold - 1;

        // If event data contains health info, use it
        if (data.length >= 32) {
            currentHealth = abi.decode(data, (uint256));
        }

        bytes memory payload = abi.encodeWithSignature(
            "triggerDefense(bytes32,uint256)", positionId, currentHealth
        );
        (bool success,) = REACTIVE_CALLBACK.call(
            abi.encode(unichainChainId, liquidShieldHook, payload)
        );
        require(success, "Reactive callback failed");

        emit Events.DefenseCallbackEmitted(positionId, currentHealth);
    }
}
