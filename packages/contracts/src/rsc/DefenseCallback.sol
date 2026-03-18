// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {AbstractCallback} from "reactive-lib/src/abstract-base/AbstractCallback.sol";
import {ILiquidShieldHook} from "../interfaces/ILiquidShieldHook.sol";

/// @title DefenseCallback
/// @author LiquidShield Team
/// @notice Deployed on Unichain Sepolia. Receives callbacks from the Reactive Network
///         callback proxy and forwards defense triggers to the LiquidShield hook.
/// @dev Inherits AbstractCallback for proper Reactive Network callback authentication.
///      The callback proxy address on Unichain Sepolia is 0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4.
contract DefenseCallback is AbstractCallback {

    /// @notice The LiquidShield hook that will receive defense triggers
    address public liquidShieldHook;

    /// @notice Emitted when a defense callback is received and forwarded
    event DefenseForwarded(bytes32 indexed positionId, uint256 currentHealth);

    /// @param _callbackProxy The Reactive Network callback proxy on Unichain Sepolia
    /// @param _hook The LiquidShield hook address on Unichain
    constructor(
        address _callbackProxy,
        address _hook
    ) AbstractCallback(_callbackProxy) payable {
        require(_hook != address(0), "Zero hook address");
        liquidShieldHook = _hook;
    }

    /// @notice Called by the Reactive Network callback proxy when a defense is triggered
    /// @dev Only callable by the authorized callback proxy (enforced by AbstractCallback)
    /// @param positionId The position that needs defense
    /// @param currentHealth The current health factor reported by the RSC
    function onDefenseTriggered(
        bytes32 positionId,
        uint256 currentHealth
    ) external authorizedSenderOnly {
        ILiquidShieldHook(liquidShieldHook).triggerDefense(positionId, currentHealth);
        emit DefenseForwarded(positionId, currentHealth);
    }
}
