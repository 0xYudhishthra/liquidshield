// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

/// @title Errors
/// @author LiquidShield Team
/// @notice Custom errors used across LiquidShield contracts
/// @dev Library containing all custom error definitions for gas-efficient error handling.
///      Custom errors are preferred over require() strings for lower gas costs.
///
///      ## Error Categories
///      - Hook Errors: Core hook position and defense operations
///      - Settler Errors: ERC-7683 cross-chain intent settlement
///      - Executor Errors: Source-chain defense execution
///      - Adapter Errors: Lending protocol adapter operations
///      - RSC Errors: Reactive Smart Contract monitoring
///      - Common Errors: Shared across multiple contracts
library Errors {
    // ========================== Common Errors ==========================

    /// @notice Thrown when caller is not authorized to perform the operation
    error UnauthorizedCaller();

    /// @notice Thrown when a required address parameter is zero
    error ZeroAddress();

    /// @notice Thrown when an operation amount is zero or invalid
    error InvalidAmount();

    // ========================== Hook Errors ==========================

    /// @notice Thrown when attempting to register a position with an ID that already exists
    error PositionAlreadyRegistered();

    /// @notice Thrown when referencing a position that does not exist
    error PositionNotFound();

    /// @notice Thrown when defense reserve is insufficient to cover the defense amount
    error InsufficientReserve();

    /// @notice Thrown when a position's premium coverage has expired
    error PremiumExpired();

    /// @notice Thrown when attempting to unregister a position that is currently being defended
    error PositionCurrentlyDefending();

    // ========================== Settler Errors ==========================

    /// @notice Thrown when attempting to open an order with an ID that already exists
    error OrderAlreadyExists();

    /// @notice Thrown when referencing an order that does not exist or is not open
    error OrderNotFound();

    // ========================== Executor Errors ==========================

    /// @notice Thrown when a lending adapter address is invalid (zero address)
    error InvalidAdapter();

    // ========================== RSC Errors ==========================

    /// @notice Thrown when a reactive callback references a position that is not being monitored
    error PositionNotMonitored();

    // ========================== Router Errors ==========================
    // (Router uses common errors: InvalidAmount, UnauthorizedCaller)
}
