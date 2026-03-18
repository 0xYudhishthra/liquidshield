// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {AbstractCallback} from "reactive-lib/src/abstract-base/AbstractCallback.sol";

interface IAavePool {
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
}

/// @title HealthChecker
/// @author LiquidShield Team
/// @notice Deployed on the same chain as Aave (e.g., Base Sepolia).
///         Receives CRON callbacks from the RSC, reads the user's Aave health
///         factor on-chain, and emits HealthDanger if below threshold.
///         The RSC subscribes to HealthDanger events and triggers defense on Unichain.
/// @dev Follows the Aave Liquidation Protection demo pattern:
///      "Put the health check in the callback contract on the chain where Aave lives."
contract HealthChecker is AbstractCallback {

    // ============ EVENTS ============

    /// @notice Emitted when a position's health factor is below threshold
    /// @dev The RSC subscribes to this event to trigger the second hop to Unichain
    event HealthDanger(
        bytes32 indexed positionId,
        uint256 indexed healthFactor,
        address indexed user
    );

    /// @notice Emitted after every check cycle (healthy or not) so the RSC can reset its lock
    event CheckCycleCompleted(uint256 timestamp, uint256 positionsChecked, uint256 dangersFound);

    // ============ STRUCTS ============

    struct MonitoredPosition {
        bytes32 positionId;
        address user;
        uint256 healthThreshold;
        bool active;
    }

    // ============ STATE ============

    IAavePool public immutable aavePool;
    address public owner;

    bytes32[] public positionIds;
    mapping(bytes32 => MonitoredPosition) public positions;

    // ============ MODIFIERS ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ============ CONSTRUCTOR ============

    /// @param _callbackProxy Reactive Network callback proxy on this chain
    /// @param _aavePool Aave V3 Pool address on this chain
    constructor(
        address _callbackProxy,
        address _aavePool
    ) AbstractCallback(_callbackProxy) payable {
        aavePool = IAavePool(_aavePool);
        owner = msg.sender;
    }

    // ============ POSITION MANAGEMENT ============

    function addPosition(
        bytes32 positionId,
        address user,
        uint256 healthThreshold
    ) external onlyOwner {
        positions[positionId] = MonitoredPosition(positionId, user, healthThreshold, true);
        positionIds.push(positionId);
    }

    function removePosition(bytes32 positionId) external onlyOwner {
        positions[positionId].active = false;
    }

    // ============ CALLBACK FROM RSC ============

    /// @notice Called by the RSC via Reactive callback proxy on each CRON tick.
    ///         Reads health factor from Aave on-chain and emits HealthDanger if needed.
    function checkPositions(
        address /* _rvm_sender — overwritten by Reactive with RVM ID */
    ) external authorizedSenderOnly {
        uint256 dangersFound = 0;

        for (uint256 i = 0; i < positionIds.length; i++) {
            MonitoredPosition storage pos = positions[positionIds[i]];
            if (!pos.active) continue;

            // Read health factor directly from Aave on this chain
            (,,,,, uint256 healthFactor) = aavePool.getUserAccountData(pos.user);

            if (healthFactor < pos.healthThreshold) {
                emit HealthDanger(pos.positionId, healthFactor, pos.user);
                dangersFound++;
            }
        }

        emit CheckCycleCompleted(block.timestamp, positionIds.length, dangersFound);
    }
}
