// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

/// @title Events
/// @author LiquidShield Team
/// @notice Events emitted across LiquidShield contracts
/// @dev Library containing all event definitions for the LiquidShield protocol.
///      Events are organized by the contract category that emits them.
///
///      ## Event Categories
///      - Hook Events: Position management, defense, premiums, reserves
///      - Settler Events: Cross-chain intent lifecycle
///      - Executor Events: Source-chain defense execution
///      - RSC Events: Position monitoring and callbacks
library Events {
    // ========================== Hook Events ==========================

    /// @notice Emitted when a new lending position is registered for protection
    /// @param positionId Unique position identifier
    /// @param positionOwner Address of the position owner
    /// @param strategy Defense strategy (COLLATERAL_TOPUP or BATCHED_UNWIND)
    event PositionRegistered(bytes32 indexed positionId, address indexed positionOwner, uint8 strategy);

    /// @notice Emitted when a protected position is unregistered
    /// @param positionId Unique position identifier
    event PositionUnregistered(bytes32 indexed positionId);

    /// @notice Emitted when a defense action is triggered for a position
    /// @param positionId Unique position identifier
    /// @param strategy Defense strategy used
    /// @param amount Amount of defense capital deployed
    event DefenseTriggered(bytes32 indexed positionId, uint8 strategy, uint256 amount);

    /// @notice Emitted when a defense action is settled by the filler
    /// @param positionId Unique position identifier
    /// @param defenseAmount Amount returned by the filler
    /// @param feeCharged Fee deducted from the returned amount
    event DefenseSettled(bytes32 indexed positionId, uint256 defenseAmount, uint256 feeCharged);

    /// @notice Emitted when a premium payment is collected for a position
    /// @param positionId Unique position identifier
    /// @param token Premium token address
    /// @param amount Premium amount paid
    event PremiumCollected(bytes32 indexed positionId, address indexed token, uint256 amount);

    /// @notice Emitted when accumulated premiums are donated to LPs via poolManager.donate()
    /// @param amount0 Amount of currency0 donated
    /// @param amount1 Amount of currency1 donated
    event PremiumsDonated(uint256 amount0, uint256 amount1);

    /// @notice Emitted when tokens are deposited into the defense reserve
    /// @param token Token address deposited
    /// @param amount Amount deposited
    event ReserveDeposited(address indexed token, uint256 amount);

    /// @notice Emitted when a cross-chain intent is created during defense
    /// @param positionId Unique position identifier
    /// @param intentId Unique intent identifier
    event IntentEmitted(bytes32 indexed positionId, bytes32 indexed intentId);

    // ========================== Settler Events ==========================

    /// @notice Emitted when a new cross-chain defense order is opened
    /// @param orderId Unique order identifier
    /// @param swapper Address of the user whose position is being defended
    /// @param nonce Order nonce for deduplication
    event OrderOpened(bytes32 indexed orderId, address indexed swapper, uint256 nonce);

    /// @notice Emitted when a cross-chain defense order is settled
    /// @param orderId Unique order identifier
    /// @param filler Address of the filler who settled the order
    event OrderSettled(bytes32 indexed orderId, address indexed filler);

    // ========================== Executor Events ==========================

    /// @notice Emitted when a defense action is executed on the source chain
    /// @param positionId Unique position identifier
    /// @param adapter Lending adapter address used for execution
    /// @param amount Amount of collateral deposited or withdrawn
    /// @param strategy Defense strategy executed (0 = COLLATERAL_TOPUP, 1 = BATCHED_UNWIND)
    event DefenseExecuted(bytes32 indexed positionId, address indexed adapter, uint256 amount, uint8 strategy);

    // ========================== RSC Events ==========================

    /// @notice Emitted when a defense callback is sent to the hook via Reactive Network
    /// @param positionId Unique position identifier
    /// @param healthFactor Current health factor that triggered the callback
    event DefenseCallbackEmitted(bytes32 indexed positionId, uint256 healthFactor);

    /// @notice Emitted when a new position starts being monitored by the RSC
    /// @param positionId Unique position identifier
    /// @param user Address of the position owner
    /// @param chainId Source chain ID being monitored
    event PositionMonitoringStarted(bytes32 indexed positionId, address indexed user, uint256 chainId);
}
