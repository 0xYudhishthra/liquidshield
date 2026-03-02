// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Errors} from "../lib/Errors.sol";
import {Events} from "../lib/Events.sol";

/// @title LiquidShieldSettler
/// @author LiquidShield Team
/// @notice ERC-7683 origin settler that manages cross-chain defense orders
/// @dev Opens orders when the hook triggers defense, and settles them when fillers complete
///      execution on the source chain. Follows CEI pattern throughout.
contract LiquidShieldSettler {

    // ============ STRUCTS ============

    /// @notice ERC-7683 cross-chain order structure
    struct CrossChainOrder {
        address settlementContract;
        address swapper;
        uint256 nonce;
        uint32 originChainId;
        uint32 initiateDeadline;
        uint32 fillDeadline;
        bytes orderData;
    }

    /// @notice Defense-specific order data encoded within CrossChainOrder.orderData
    struct DefenseOrderData {
        bytes32 positionId;
        address collateralAsset;
        uint256 amount;
        uint256 sourceChainId;
        address lendingAdapter;
        uint8 strategy;
        address user;
    }

    // ============ STATE VARIABLES ============

    /// @notice Address of the LiquidShield hook (only caller for open)
    address public immutable hook;

    /// @notice Contract owner for admin operations
    address public owner;

    /// @notice Authorized filler address for settlement
    address public authorizedFiller;

    /// @notice Monotonically increasing order nonce
    uint256 public nonce;

    /// @notice Tracks currently open orders
    mapping(bytes32 => bool) public openOrders;

    /// @notice Tracks settled orders
    mapping(bytes32 => bool) public settledOrders;

    // ============ MODIFIERS ============

    modifier onlyHook() {
        if (msg.sender != hook) revert Errors.UnauthorizedCaller();
        _;
    }

    modifier onlyFillerOrOwner() {
        if (msg.sender != authorizedFiller && msg.sender != owner) revert Errors.UnauthorizedCaller();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.UnauthorizedCaller();
        _;
    }

    // ============ CONSTRUCTOR ============

    /// @notice Deploys the settler contract
    /// @param _hook Address of the LiquidShield hook contract
    constructor(address _hook) {
        if (_hook == address(0)) revert Errors.ZeroAddress();
        hook = _hook;
        owner = msg.sender;
    }

    // ============ EXTERNAL FUNCTIONS (VIEW/PURE) ============
    // (All view functions are auto-generated public getters on state variables)

    // ============ EXTERNAL FUNCTIONS (STATE-CHANGING) ============

    /// @notice Sets the authorized filler address for settlement
    /// @param _filler Address of the authorized filler
    function setAuthorizedFiller(address _filler) external onlyOwner {
        authorizedFiller = _filler;
    }

    /// @notice Opens a new cross-chain defense order
    /// @dev Only callable by the hook contract during triggerDefense
    /// @param positionId Position being defended
    /// @param collateralAsset Collateral token on the source chain
    /// @param amount Amount of defense capital
    /// @param sourceChainId Chain ID where defense will be executed
    /// @param lendingAdapter Adapter address on the source chain
    /// @param strategy Defense strategy (0 = COLLATERAL_TOPUP, 1 = BATCHED_UNWIND)
    /// @param user Address of the position owner
    /// @return orderId Unique identifier for the created order
    function open(
        bytes32 positionId, address collateralAsset, uint256 amount,
        uint256 sourceChainId, address lendingAdapter, uint8 strategy, address user
    ) external onlyHook returns (bytes32 orderId) {
        // Effects: increment nonce and create order
        uint256 currentNonce = nonce++;
        orderId = keccak256(abi.encode(positionId, collateralAsset, amount, sourceChainId, currentNonce));
        if (openOrders[orderId]) revert Errors.OrderAlreadyExists();
        openOrders[orderId] = true;

        emit Events.OrderOpened(orderId, user, currentNonce);
    }

    /// @notice Settles an open cross-chain defense order
    /// @dev Only callable by the authorized filler or contract owner
    /// @param orderId Unique identifier of the order to settle
    /// @param filler Address of the filler who executed the defense
    function settle(bytes32 orderId, address filler) external onlyFillerOrOwner {
        if (!openOrders[orderId]) revert Errors.OrderNotFound();

        // Effects: close order and mark as settled
        openOrders[orderId] = false;
        settledOrders[orderId] = true;

        emit Events.OrderSettled(orderId, filler);
    }
}
