// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {
    BalanceDelta,
    BalanceDeltaLibrary
} from "v4-core/src/types/BalanceDelta.sol";
import {console} from "forge-std/console.sol";

/// @title SharedLiquidityPool
/// @author Aqua0 Team
/// @notice Single contract that holds all LP deposits and tracks virtual positions per user
///         per Uniswap V4 pool + tick range. The Aqua0Hook reads aggregated positions
///         and settles swap deltas against this contract via flash accounting.
///
///         Lifecycle:
///           1. LP calls deposit() to bring tokens into the pool.
///           2. LP calls addPosition() to allocate a portion to a specific V4 pool + tick range.
///              This is purely virtual - no tokens leave this contract.
///           3. On each swap: Aqua0Hook calls modifyLiquidity(+) in beforeSwap and
///              modifyLiquidity(-) in afterSwap. The hook calls settleSwapDelta() to
///              transfer only the net swap impact in/out of this contract.
///           4. LP calls removePosition() then withdraw() to exit.
contract SharedLiquidityPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    // ─── Structs ─────────────────────────────────────────────────────────────

    /// @notice A user's virtual position in a specific pool at a specific tick range
    struct UserPosition {
        PoolId poolId;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidityShares; // virtual liquidity requested
        uint256 token0Initial; // token0 backing this position
        uint256 token1Initial; // token1 backing this position
        bool active;
    }

    /// @notice Aggregated liquidity across all users for a (pool, tickLower, tickUpper) range
    struct RangeInfo {
        int24 tickLower;
        int24 tickUpper;
        uint128 totalLiquidity; // sum of all user shares
    }

    // ─── State ───────────────────────────────────────────────────────────────

    /// @notice The registered Aqua0Hook address - only hook can call settleSwapDelta
    address public hook;

    /// @notice user => token => free (unallocated) balance
    mapping(address => mapping(address => uint256)) public freeBalance;

    /// @notice user => positionId => UserPosition
    mapping(address => mapping(bytes32 => UserPosition)) public userPositions;

    /// @notice user => list of positionIds (for enumeration)
    mapping(address => bytes32[]) private _userPositionIds;

    /// @notice poolId => rangeKey => RangeInfo
    ///         rangeKey = keccak256(abi.encode(tickLower, tickUpper))
    mapping(PoolId => mapping(bytes32 => RangeInfo)) public aggregatedRanges;

    /// @notice poolId => list of active rangeKeys
    mapping(PoolId => bytes32[]) private _poolRangeKeys;

    /// @notice poolId => rangeKey => whether range exists in _poolRangeKeys
    mapping(PoolId => mapping(bytes32 => bool)) private _rangeExists;

    /// @notice poolId => rangeKey => list of user addresses active in this range
    mapping(PoolId => mapping(bytes32 => address[])) public rangeUsers;

    /// @notice Ephemeral scaled actual liquidity for the current swap (populated in preSwap, consumed in postSwap)
    /// poolId => rangeKey => user => actualLiquidity
    mapping(PoolId => mapping(bytes32 => mapping(address => uint128)))
        public ephemeralScaledLiquidity;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Deposited(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event Withdrawn(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event PositionAdded(
        address indexed user,
        bytes32 indexed positionId,
        PoolId indexed poolId,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    );
    event PositionRemoved(
        address indexed user,
        bytes32 indexed positionId,
        PoolId indexed poolId
    );
    event SwapSettled(address indexed token, int256 delta);
    event HookSet(address indexed hook);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientFreeBalance();
    error PositionNotFound();
    error PositionAlreadyExists();
    error NotHook();
    error InvalidTicks();
    error TransferFailed();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyHook() {
        if (msg.sender != hook) revert NotHook();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    receive() external payable {}

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Set the Aqua0Hook address. Only callable once (or by owner to upgrade).
    function setHook(address _hook) external onlyOwner {
        if (_hook == address(0)) revert ZeroAddress();
        hook = _hook;
        emit HookSet(_hook);
    }

    // ─── User: Deposit / Withdraw ─────────────────────────────────────────────

    function deposit(address token, uint256 amount) external nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        freeBalance[msg.sender][token] += amount;

        emit Deposited(msg.sender, token, amount);
    }

    /// @notice Deposit native ETH into the shared pool.
    function depositNative() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        freeBalance[msg.sender][address(0)] += msg.value;

        emit Deposited(msg.sender, address(0), msg.value);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (freeBalance[msg.sender][token] < amount)
            revert InsufficientFreeBalance();

        freeBalance[msg.sender][token] -= amount;

        if (token == address(0)) {
            (bool success, ) = msg.sender.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }

        emit Withdrawn(msg.sender, token, amount);
    }

    // ─── User: Positions ─────────────────────────────────────────────────────

    /// @notice Allocate liquidity from free balance into a specific V4 pool + tick range.
    function addPosition(
        PoolKey calldata key,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 token0Amount,
        uint256 token1Amount
    ) external nonReentrant returns (bytes32 positionId) {
        if (tickLower >= tickUpper) revert InvalidTicks();
        if (liquidity == 0) revert ZeroAmount();

        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);

        // Check but DO NOT lock free balances (true liquidity amplification)
        if (token0Amount > 0) {
            if (freeBalance[msg.sender][token0] < token0Amount)
                revert InsufficientFreeBalance();
        }
        if (token1Amount > 0) {
            if (freeBalance[msg.sender][token1] < token1Amount)
                revert InsufficientFreeBalance();
        }

        PoolId poolId = key.toId();
        positionId = _positionId(msg.sender, poolId, tickLower, tickUpper);

        if (userPositions[msg.sender][positionId].active)
            revert PositionAlreadyExists();

        // Store user position
        userPositions[msg.sender][positionId] = UserPosition({
            poolId: poolId,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidityShares: liquidity,
            token0Initial: token0Amount,
            token1Initial: token1Amount,
            active: true
        });
        _userPositionIds[msg.sender].push(positionId);

        // Update aggregated range
        bytes32 rangeKey = _rangeKey(tickLower, tickUpper);
        if (!_rangeExists[poolId][rangeKey]) {
            _rangeExists[poolId][rangeKey] = true;
            _poolRangeKeys[poolId].push(rangeKey);
            aggregatedRanges[poolId][rangeKey] = RangeInfo({
                tickLower: tickLower,
                tickUpper: tickUpper,
                totalLiquidity: liquidity
            });
        } else {
            aggregatedRanges[poolId][rangeKey].totalLiquidity += liquidity;
        }

        // Track user in range
        bool foundUser = false;
        address[] memory users = rangeUsers[poolId][rangeKey];
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] == msg.sender) {
                foundUser = true;
                break;
            }
        }
        if (!foundUser) {
            rangeUsers[poolId][rangeKey].push(msg.sender);
        }

        emit PositionAdded(
            msg.sender,
            positionId,
            poolId,
            tickLower,
            tickUpper,
            liquidity
        );
    }

    /// @notice Remove a virtual position, returning reserved tokens to free balance.
    function removePosition(
        PoolKey calldata key,
        int24 tickLower,
        int24 tickUpper,
        uint256 token0Return,
        uint256 token1Return
    ) external nonReentrant {
        PoolId poolId = key.toId();
        bytes32 positionId = _positionId(
            msg.sender,
            poolId,
            tickLower,
            tickUpper
        );

        UserPosition storage pos = userPositions[msg.sender][positionId];
        if (!pos.active) revert PositionNotFound();

        uint128 liquidity = pos.liquidityShares;

        // Deactivate user position
        pos.active = false;
        pos.liquidityShares = 0;

        // Calculate PnL vs initially backed amount
        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);

        int256 pnl0 = int256(token0Return) - int256(pos.token0Initial);
        int256 pnl1 = int256(token1Return) - int256(pos.token1Initial);

        pos.token0Initial = 0;
        pos.token1Initial = 0;

        // Apply Realized PnL strictly to the user's free balance.
        if (pnl0 > 0) {
            freeBalance[msg.sender][token0] += uint256(pnl0);
        } else if (pnl0 < 0) {
            uint256 loss = uint256(-pnl0);
            if (freeBalance[msg.sender][token0] < loss) {
                freeBalance[msg.sender][token0] = 0;
            } else {
                freeBalance[msg.sender][token0] -= loss;
            }
        }

        if (pnl1 > 0) {
            freeBalance[msg.sender][token1] += uint256(pnl1);
        } else if (pnl1 < 0) {
            uint256 loss = uint256(-pnl1);
            if (freeBalance[msg.sender][token1] < loss) {
                freeBalance[msg.sender][token1] = 0;
            } else {
                freeBalance[msg.sender][token1] -= loss;
            }
        }

        // Update aggregated range
        bytes32 rangeKey = _rangeKey(tickLower, tickUpper);
        aggregatedRanges[poolId][rangeKey].totalLiquidity -= liquidity;

        emit PositionRemoved(msg.sender, positionId, poolId);
    }

    // ─── Hook: Aggregation + Settlement ──────────────────────────────────────

    /// @notice Returns the dynamically scaled active tick ranges for the swap
    function preSwap(
        PoolKey calldata key
    ) external onlyHook returns (RangeInfo[] memory ranges) {
        PoolId poolId = key.toId();

        bytes32[] storage rangeKeys = _poolRangeKeys[poolId];
        uint256 count = rangeKeys.length;

        // Pre-count active ranges
        uint256 activeCount;
        for (uint256 i = 0; i < count; i++) {
            if (aggregatedRanges[poolId][rangeKeys[i]].totalLiquidity > 0) {
                activeCount++;
            }
        }

        ranges = new RangeInfo[](activeCount);
        uint256 idx;

        for (uint256 i = 0; i < count; i++) {
            RangeInfo storage r = aggregatedRanges[poolId][rangeKeys[i]];
            if (r.totalLiquidity == 0) continue;

            uint128 totalScaledLiquidity = _scaleRangeUsers(
                poolId,
                rangeKeys[i],
                r.tickLower,
                r.tickUpper,
                Currency.unwrap(key.currency0),
                Currency.unwrap(key.currency1)
            );

            ranges[idx] = RangeInfo({
                tickLower: r.tickLower,
                tickUpper: r.tickUpper,
                totalLiquidity: totalScaledLiquidity
            });
            idx++;
        }
    }

    struct ScaleContext {
        PoolId poolId;
        bytes32 rangeKey;
        int24 tickLower;
        int24 tickUpper;
        address token0;
        address token1;
    }

    function _scaleRangeUsers(
        PoolId poolId,
        bytes32 rangeKey,
        int24 tickLower,
        int24 tickUpper,
        address token0,
        address token1
    ) internal returns (uint128 totalScaledLiquidity) {
        ScaleContext memory ctx = ScaleContext(poolId, rangeKey, tickLower, tickUpper, token0, token1);
        address[] memory users = rangeUsers[poolId][rangeKey];

        for (uint256 j = 0; j < users.length; j++) {
            totalScaledLiquidity += _scaleUser(ctx, users[j]);
        }
    }

    function _scaleUser(ScaleContext memory ctx, address user) internal returns (uint128) {
        bytes32 posId = _positionId(user, ctx.poolId, ctx.tickLower, ctx.tickUpper);
        UserPosition storage pos = userPositions[user][posId];

        if (!pos.active) return 0;

        uint256 scale = 1e18;

        if (pos.token0Initial > 0) {
            uint256 s0 = (freeBalance[user][ctx.token0] * 1e18) / pos.token0Initial;
            if (s0 < scale) scale = s0;
        }
        if (pos.token1Initial > 0) {
            uint256 s1 = (freeBalance[user][ctx.token1] * 1e18) / pos.token1Initial;
            if (s1 < scale) scale = s1;
        }

        uint128 actualLiquidity = uint128((uint256(pos.liquidityShares) * scale) / 1e18);
        ephemeralScaledLiquidity[ctx.poolId][ctx.rangeKey][user] = actualLiquidity;
        return actualLiquidity;
    }

    /// @notice Takes the exact BalanceDeltas generated by the swap for each range, calculates Net PnL,
    ///         and distributes it precisely to users based on their ephemeral actual liquidity contribution.
    function postSwap(
        PoolKey calldata key,
        RangeInfo[] calldata injectedRanges,
        BalanceDelta[] calldata mintDeltas,
        BalanceDelta[] calldata burnDeltas
    ) external onlyHook {
        PoolId poolId = key.toId();
        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);

        for (uint256 i = 0; i < injectedRanges.length; i++) {
            _distributeRangePnL(
                poolId, token0, token1,
                injectedRanges[i],
                mintDeltas[i],
                burnDeltas[i]
            );
        }
    }

    struct PnLContext {
        PoolId poolId;
        bytes32 rangeKey;
        address token0;
        address token1;
        int256 netPnL0;
        int256 netPnL1;
        uint128 totalLiquidity;
    }

    function _distributeRangePnL(
        PoolId poolId,
        address token0,
        address token1,
        RangeInfo calldata r,
        BalanceDelta mintDelta,
        BalanceDelta burnDelta
    ) internal {
        if (r.totalLiquidity == 0) return;

        PnLContext memory ctx = PnLContext({
            poolId: poolId,
            rangeKey: _rangeKey(r.tickLower, r.tickUpper),
            token0: token0,
            token1: token1,
            netPnL0: int256(BalanceDeltaLibrary.amount0(mintDelta))
                + int256(BalanceDeltaLibrary.amount0(burnDelta)),
            netPnL1: int256(BalanceDeltaLibrary.amount1(mintDelta))
                + int256(BalanceDeltaLibrary.amount1(burnDelta)),
            totalLiquidity: r.totalLiquidity
        });

        address[] memory users = rangeUsers[poolId][ctx.rangeKey];

        for (uint256 j = 0; j < users.length; j++) {
            _distributeUserPnL(ctx, users[j]);
        }
    }

    function _distributeUserPnL(PnLContext memory ctx, address user) internal {
        uint128 userLiquidity = ephemeralScaledLiquidity[ctx.poolId][ctx.rangeKey][user];
        if (userLiquidity == 0) return;

        int256 userPnL0 = (ctx.netPnL0 * int256(uint256(userLiquidity)))
            / int256(uint256(ctx.totalLiquidity));
        int256 userPnL1 = (ctx.netPnL1 * int256(uint256(userLiquidity)))
            / int256(uint256(ctx.totalLiquidity));

        _applyNetPnL(user, ctx.token0, userPnL0);
        _applyNetPnL(user, ctx.token1, userPnL1);

        // Zero out storage to refund gas
        ephemeralScaledLiquidity[ctx.poolId][ctx.rangeKey][user] = 0;
    }

    function _applyNetPnL(address user, address token, int256 pnl) internal {
        if (pnl > 0) {
            freeBalance[user][token] += uint256(pnl);
        } else if (pnl < 0) {
            uint256 loss = uint256(-pnl);
            if (freeBalance[user][token] < loss) {
                freeBalance[user][token] = 0;
            } else {
                freeBalance[user][token] -= loss;
            }
        }
    }

    /// @notice Called by Aqua0Hook in afterSwap to settle net token movements.
    function settleSwapDelta(
        address token,
        int256 delta
    ) external payable nonReentrant onlyHook {
        if (delta == 0) return;

        console.log("\n[SharedLiquidityPool] settleSwapDelta");
        console.log("  token:              ", token);
        console.log(
            "  delta:              ",
            delta > 0 ? uint256(delta) : uint256(-delta),
            delta > 0 ? "(incoming +)" : "(outgoing -)"
        );
        console.log("  pool ETH balance:   ", address(this).balance, "wei");

        if (delta > 0) {
            // Hook is sending us tokens (we earned from swap)
            if (token == address(0)) {
                console.log("  -> Receiving ETH from hook via msg.value");
                require(msg.value == uint256(delta), "ETH amount mismatch");
            } else {
                console.log("  -> Pulling ERC20 from hook via transferFrom");
                IERC20(token).safeTransferFrom(
                    hook,
                    address(this),
                    uint256(delta)
                );
            }
        } else {
            // We owe tokens - send to hook so hook can settle with PoolManager
            uint256 owed = uint256(-delta);
            if (token == address(0)) {
                console.log("  -> Sending", owed, "wei ETH to hook", hook);
                (bool success, ) = hook.call{value: owed}("");
                if (!success) revert TransferFailed();
                console.log("  -> ETH sent OK");
            } else {
                console.log("  -> Sending", owed, "wei ERC20 to hook");
                IERC20(token).safeTransfer(hook, owed);
            }
        }

        emit SwapSettled(token, delta);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// @notice Get all position IDs for a user
    function getUserPositionIds(
        address user
    ) external view returns (bytes32[] memory) {
        return _userPositionIds[user];
    }

    /// @notice Get all active range keys for a pool
    function getPoolRangeKeys(
        PoolId poolId
    ) external view returns (bytes32[] memory) {
        return _poolRangeKeys[poolId];
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _positionId(
        address user,
        PoolId poolId,
        int24 tickLower,
        int24 tickUpper
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(user, poolId, tickLower, tickUpper));
    }

    function _rangeKey(
        int24 tickLower,
        int24 tickUpper
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(tickLower, tickUpper));
    }
}
