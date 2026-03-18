// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {Aqua0BaseHook} from "../aqua0/Aqua0BaseHook.sol";
import {SharedLiquidityPool} from "../aqua0/SharedLiquidityPool.sol";
import {Errors} from "../lib/Errors.sol";
import {Events} from "../lib/Events.sol";

/// @notice Interface for the LiquidShield settler contract (ERC-7683 origin settler)
interface ILiquidShieldSettler {
    function open(
        bytes32 positionId, address collateralAsset, uint256 amount,
        uint256 sourceChainId, address lendingAdapter, uint8 strategy, address user
    ) external returns (bytes32 orderId);
}

/// @title LiquidShieldHook
/// @author LiquidShield Team
/// @notice Core Uniswap v4 hook that orchestrates cross-chain liquidation defense
/// @dev Manages protected positions, defense reserves (ERC-6909 claims), premium collection,
///      LP premium donation, defense-aware dynamic fees, and Aqua0 shared JIT liquidity.
contract LiquidShieldHook is IHooks, Aqua0BaseHook, IUnlockCallback {
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;
    using SafeERC20 for IERC20;

    // ============ ENUMS ============

    enum DefenseStrategy { COLLATERAL_TOPUP, BATCHED_UNWIND }
    enum PositionStatus { ACTIVE, DEFENDING, UNWINDING, CLOSED }

    // ============ STRUCTS ============

    /// @notice Data for a lending position protected by LiquidShield
    /// @dev Packed for storage efficiency: addresses grouped, uint256s grouped
    struct ProtectedPosition {
        address owner;
        address collateralAsset;
        address debtAsset;
        address lendingAdapter;
        uint256 positionSize;
        uint256 healthThreshold;
        uint256 sourceChainId;
        uint256 premiumPaidUntil;
        DefenseStrategy strategy;
        PositionStatus status;
    }

    // ============ STATE VARIABLES ============

    /// @notice Registered protected positions by ID
    mapping(bytes32 => ProtectedPosition) public positions;

    /// @notice LP share tracking for premium distribution
    mapping(address => uint256) public lpShares;

    /// @notice Total value of all protected positions
    uint256 public totalProtectedValue;

    /// @notice Defense reserve balance for currency0
    uint256 public defenseReserveToken0;

    /// @notice Defense reserve balance for currency1
    uint256 public defenseReserveToken1;

    /// @notice Accumulated premiums for currency0 (pending LP donation)
    uint256 public accumulatedPremiumsToken0;

    /// @notice Accumulated premiums for currency1 (pending LP donation)
    uint256 public accumulatedPremiumsToken1;

    /// @notice Address authorized to trigger defense callbacks (RSC)
    address public rscCallback;

    /// @notice Address authorized to settle defense actions (filler)
    address public fillerAddress;

    /// @notice ERC-7683 settler contract address
    address public settler;

    /// @notice Router contract authorized for delegation
    address public authorizedRouter;

    /// @notice Pool key set during afterInitialize
    PoolKey public poolKey;

    /// @notice Contract owner for admin operations
    address public owner;

    /// @notice Base swap fee in hundredths of a bip (0.30%)
    uint24 public baseFee = 3000;

    /// @notice Maximum swap fee in hundredths of a bip (1.00%)
    uint24 public maxFee = 10000;

    /// @notice Reserve utilization threshold for fee scaling (70% in bps)
    uint256 public reserveUtilizationThreshold = 7000;

    // ============ CONSTANTS ============

    /// @dev Premium split: 60% to defense reserve, 40% to LP premiums
    uint256 private constant RESERVE_SPLIT_BPS = 6000;

    /// @dev Defense settlement fee: 1.5%
    uint256 private constant DEFENSE_FEE_BPS = 150;

    /// @dev BPS denominator
    uint256 private constant BPS_DENOMINATOR = 10000;

    // ============ MODIFIERS ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert Errors.UnauthorizedCaller();
        _;
    }

    // ============ CONSTRUCTOR ============

    /// @notice Deploys the LiquidShield hook
    /// @param _poolManager Uniswap v4 PoolManager address
    /// @param _sharedPool Aqua0 SharedLiquidityPool address
    constructor(IPoolManager _poolManager, SharedLiquidityPool _sharedPool, address _owner)
        Aqua0BaseHook(_poolManager, _sharedPool)
    {
        owner = _owner;
    }

    /// @notice Accept ETH for Aqua0 delta settlement
    receive() external payable {}

    // ============ EXTERNAL FUNCTIONS (VIEW/PURE) ============

    /// @notice Returns the hook's required permissions
    /// @return Permissions struct with enabled callbacks
    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: true,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: true,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice Returns position data for a given position ID
    /// @param positionId The unique position identifier
    /// @return The protected position struct
    function getPosition(bytes32 positionId) external view returns (ProtectedPosition memory) {
        return positions[positionId];
    }

    /// @notice Returns the current defense reserve balances
    /// @return reserve0 Defense reserve for currency0
    /// @return reserve1 Defense reserve for currency1
    function getReserveBalances() external view returns (uint256 reserve0, uint256 reserve1) {
        return (defenseReserveToken0, defenseReserveToken1);
    }

    /// @notice Returns the accumulated premium balances pending LP donation
    /// @return premiums0 Accumulated premiums for currency0
    /// @return premiums1 Accumulated premiums for currency1
    function getAccumulatedPremiums() external view returns (uint256 premiums0, uint256 premiums1) {
        return (accumulatedPremiumsToken0, accumulatedPremiumsToken1);
    }

    // ============ IHooks IMPLEMENTATIONS ============

    function beforeInitialize(address, PoolKey calldata, uint160)
        external pure returns (bytes4)
    {
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata key, uint160, int24)
        external onlyPoolManager returns (bytes4)
    {
        poolKey = key;
        return IHooks.afterInitialize.selector;
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external pure returns (bytes4)
    {
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterAddLiquidity(
        address sender, PoolKey calldata, ModifyLiquidityParams calldata,
        BalanceDelta delta, BalanceDelta, bytes calldata
    ) external onlyPoolManager returns (bytes4, BalanceDelta) {
        int128 amt = delta.amount0();
        uint256 absAmt = amt > 0 ? uint256(int256(amt)) : uint256(int256(-amt));
        lpShares[sender] += absAmt;
        return (IHooks.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external pure returns (bytes4)
    {
        return IHooks.beforeRemoveLiquidity.selector;
    }

    function afterRemoveLiquidity(
        address sender, PoolKey calldata, ModifyLiquidityParams calldata,
        BalanceDelta delta, BalanceDelta, bytes calldata
    ) external onlyPoolManager returns (bytes4, BalanceDelta) {
        int128 amt = delta.amount0();
        uint256 absAmt = amt > 0 ? uint256(int256(amt)) : uint256(int256(-amt));
        if (lpShares[sender] >= absAmt) {
            lpShares[sender] -= absAmt;
        } else {
            lpShares[sender] = 0;
        }
        return (IHooks.afterRemoveLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        external onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24)
    {
        // Inject Aqua0 shared JIT liquidity
        _addVirtualLiquidity(key);

        // Apply defense-aware dynamic fee
        uint24 fee = _calculateDynamicFee();
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata, BalanceDelta, bytes calldata)
        external onlyPoolManager returns (bytes4, int128)
    {
        // Remove Aqua0 JIT liquidity and settle deltas
        (bool hasJIT,) = _removeVirtualLiquidity(key);
        if (hasJIT) {
            _settleVirtualLiquidityDeltas(key);
        }

        return (IHooks.afterSwap.selector, 0);
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return IHooks.beforeDonate.selector;
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return IHooks.afterDonate.selector;
    }

    // ============ EXTERNAL FUNCTIONS (STATE-CHANGING) ============

    // --- Admin ---

    /// @notice Sets the RSC callback address authorized to trigger defenses
    /// @param _rscCallback Address of the RSC callback contract
    function setRscCallback(address _rscCallback) external onlyOwner {
        rscCallback = _rscCallback;
    }

    /// @notice Sets the filler address authorized to settle defenses
    /// @param _fillerAddress Address of the authorized filler
    function setFillerAddress(address _fillerAddress) external onlyOwner {
        fillerAddress = _fillerAddress;
    }

    /// @notice Sets the ERC-7683 settler contract address
    /// @param _settler Address of the settler contract
    function setSettler(address _settler) external onlyOwner {
        settler = _settler;
    }

    /// @notice Sets the authorized router for delegation
    /// @param _router Address of the authorized router contract
    function setAuthorizedRouter(address _router) external onlyOwner {
        authorizedRouter = _router;
    }

    /// @notice Updates the defense-aware dynamic fee parameters
    /// @param _baseFee Base swap fee in hundredths of a bip
    /// @param _maxFee Maximum swap fee in hundredths of a bip
    /// @param _threshold Reserve utilization threshold in bps
    function setFeeParameters(uint24 _baseFee, uint24 _maxFee, uint256 _threshold) external onlyOwner {
        baseFee = _baseFee;
        maxFee = _maxFee;
        reserveUtilizationThreshold = _threshold;
    }

    // --- Position Management ---

    /// @notice Registers a lending position for liquidation protection
    /// @param positionId Unique identifier for the position
    /// @param onBehalfOf Address of the position owner (used by router delegation)
    /// @param collateralAsset Address of the collateral token on the source chain
    /// @param debtAsset Address of the debt token on the source chain
    /// @param positionSize Size of the position in collateral terms
    /// @param healthThreshold Health factor threshold below which defense triggers
    /// @param strategy Defense strategy to use (COLLATERAL_TOPUP or BATCHED_UNWIND)
    /// @param sourceChainId Chain ID where the lending position resides
    /// @param lendingAdapter Address of the lending adapter on the source chain
    /// @param premiumMonths Number of months of premium coverage
    function registerPosition(
        bytes32 positionId, address onBehalfOf, address collateralAsset, address debtAsset,
        uint256 positionSize, uint256 healthThreshold, DefenseStrategy strategy,
        uint256 sourceChainId, address lendingAdapter, uint256 premiumMonths
    ) external {
        if (positions[positionId].owner != address(0)) revert Errors.PositionAlreadyRegistered();
        if (positionSize == 0) revert Errors.InvalidAmount();

        address positionOwner = _resolveUser(onBehalfOf);

        positions[positionId] = ProtectedPosition({
            owner: positionOwner,
            collateralAsset: collateralAsset,
            debtAsset: debtAsset,
            lendingAdapter: lendingAdapter,
            positionSize: positionSize,
            healthThreshold: healthThreshold,
            sourceChainId: sourceChainId,
            premiumPaidUntil: block.timestamp + (premiumMonths * 30 days),
            strategy: strategy,
            status: PositionStatus.ACTIVE
        });
        totalProtectedValue += positionSize;

        emit Events.PositionRegistered(positionId, positionOwner, uint8(strategy));
    }

    /// @notice Unregisters a protected position and removes it from tracking
    /// @param positionId Unique identifier of the position to unregister
    /// @param onBehalfOf Address of the position owner (used by router delegation)
    function unregisterPosition(bytes32 positionId, address onBehalfOf) external {
        ProtectedPosition storage pos = positions[positionId];
        address caller = _resolveUser(onBehalfOf);
        if (pos.owner != caller) revert Errors.UnauthorizedCaller();
        if (pos.status == PositionStatus.DEFENDING) revert Errors.PositionCurrentlyDefending();

        totalProtectedValue -= pos.positionSize;
        delete positions[positionId];

        emit Events.PositionUnregistered(positionId);
    }

    // --- Premium ---

    /// @notice Pays premium for a protected position, extending coverage duration
    /// @param positionId Unique identifier of the position
    /// @param token Address of the token used for premium payment
    /// @param amount Amount of premium to pay
    /// @param additionalMonths Number of additional months of coverage
    function payPremium(bytes32 positionId, address token, uint256 amount, uint256 additionalMonths) external {
        ProtectedPosition storage pos = positions[positionId];
        if (pos.owner == address(0)) revert Errors.PositionNotFound();
        if (amount == 0) revert Errors.InvalidAmount();

        // Effects: update reserve and premium balances
        uint256 reservePortion = (amount * RESERVE_SPLIT_BPS) / BPS_DENOMINATOR;
        uint256 premiumPortion = amount - reservePortion;

        if (token == Currency.unwrap(poolKey.currency0)) {
            defenseReserveToken0 += reservePortion;
            accumulatedPremiumsToken0 += premiumPortion;
        } else {
            defenseReserveToken1 += reservePortion;
            accumulatedPremiumsToken1 += premiumPortion;
        }

        if (pos.premiumPaidUntil < block.timestamp) {
            pos.premiumPaidUntil = block.timestamp + (additionalMonths * 30 days);
        } else {
            pos.premiumPaidUntil += (additionalMonths * 30 days);
        }

        // Interactions: transfer tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit Events.PremiumCollected(positionId, token, amount);
    }

    // --- Defense ---

    /// @notice Triggers a defense action for a position when health drops below threshold
    /// @dev Only callable by the authorized RSC callback address
    /// @param positionId Unique identifier of the position to defend
    /// @param currentHealth Current health factor reported by the RSC
    function triggerDefense(bytes32 positionId, uint256 currentHealth) external {
        if (msg.sender != rscCallback) revert Errors.UnauthorizedCaller();

        ProtectedPosition storage pos = positions[positionId];
        if (pos.owner == address(0)) revert Errors.PositionNotFound();
        if (pos.premiumPaidUntil < block.timestamp) revert Errors.PremiumExpired();

        // Effects: update status and reserve
        pos.status = PositionStatus.DEFENDING;
        uint256 defenseAmount = _calculateDefenseAmount(pos, currentHealth);

        Currency defenseCurrency;
        if (pos.collateralAsset == Currency.unwrap(poolKey.currency0)) {
            if (defenseReserveToken0 < defenseAmount) revert Errors.InsufficientReserve();
            defenseReserveToken0 -= defenseAmount;
            defenseCurrency = poolKey.currency0;
        } else {
            if (defenseReserveToken1 < defenseAmount) revert Errors.InsufficientReserve();
            defenseReserveToken1 -= defenseAmount;
            defenseCurrency = poolKey.currency1;
        }

        // Interactions: unlock PoolManager for defense extraction
        poolManager.unlock(abi.encode(uint8(0), positionId, defenseCurrency, defenseAmount));

        // Emit cross-chain intent via settler if configured
        if (settler != address(0)) {
            ILiquidShieldSettler(settler).open(
                positionId, pos.collateralAsset, defenseAmount,
                pos.sourceChainId, pos.lendingAdapter, uint8(pos.strategy), pos.owner
            );
        }

        emit Events.DefenseTriggered(positionId, uint8(pos.strategy), defenseAmount);
    }

    /// @notice Settles a defense action after the filler executes on the source chain
    /// @dev Only callable by the authorized filler address. Charges 1.5% settlement fee.
    /// @param positionId Unique identifier of the defended position
    /// @param defenseAmount Amount returned by the filler
    function settleDefense(bytes32 positionId, uint256 defenseAmount) external {
        if (msg.sender != fillerAddress) revert Errors.UnauthorizedCaller();

        ProtectedPosition storage pos = positions[positionId];

        // Effects: calculate fee and update balances
        uint256 defenseFee = (defenseAmount * DEFENSE_FEE_BPS) / BPS_DENOMINATOR;

        if (pos.collateralAsset == Currency.unwrap(poolKey.currency0)) {
            defenseReserveToken0 += (defenseAmount - defenseFee);
            accumulatedPremiumsToken0 += defenseFee;
        } else {
            defenseReserveToken1 += (defenseAmount - defenseFee);
            accumulatedPremiumsToken1 += defenseFee;
        }

        pos.status = PositionStatus.ACTIVE;

        emit Events.DefenseSettled(positionId, defenseAmount, defenseFee);
    }

    // --- Reserve ---

    /// @notice Deposits tokens into the defense reserve
    /// @param token Address of the token to deposit
    /// @param amount Amount to deposit
    function depositToReserve(address token, uint256 amount) external {
        if (amount == 0) revert Errors.InvalidAmount();

        // Effects: update reserve balance
        if (token == Currency.unwrap(poolKey.currency0)) {
            defenseReserveToken0 += amount;
        } else {
            defenseReserveToken1 += amount;
        }

        // Interactions: transfer tokens and mint ERC-6909 claims
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        poolManager.unlock(abi.encode(uint8(1), token, amount, bytes32(0)));

        emit Events.ReserveDeposited(token, amount);
    }

    /// @notice Donates accumulated premiums to in-range LPs via poolManager.donate()
    function donatePremiumsToLPs() external {
        uint256 amount0 = accumulatedPremiumsToken0;
        uint256 amount1 = accumulatedPremiumsToken1;
        if (amount0 == 0 && amount1 == 0) revert Errors.InvalidAmount();

        // Effects: clear accumulated premiums
        accumulatedPremiumsToken0 = 0;
        accumulatedPremiumsToken1 = 0;

        // Interactions: unlock PoolManager for donation
        poolManager.unlock(abi.encode(uint8(2), amount0, amount1, bytes32(0)));

        emit Events.PremiumsDonated(amount0, amount1);
    }

    // --- Unlock Callback ---

    /// @notice Callback from PoolManager during unlock for delta-resolving operations
    /// @dev Only callable by PoolManager. Handles three action types:
    ///      0 = Defense extraction (burn ERC-6909 + take tokens)
    ///      1 = Reserve deposit (sync + transfer + settle + mint ERC-6909)
    ///      2 = Premium donation (sync + transfer + settle + donate)
    /// @param data ABI-encoded action type and parameters
    /// @return Empty bytes (no return data needed)
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert Errors.UnauthorizedCaller();

        uint8 action = abi.decode(data, (uint8));

        if (action == 0) {
            _handleDefenseExtraction(data);
        } else if (action == 1) {
            _handleReserveDeposit(data);
        } else if (action == 2) {
            _handlePremiumDonation(data);
        }

        return "";
    }

    // ============ INTERNAL FUNCTIONS (VIEW/PURE) ============

    /// @notice Resolves the effective user address for router delegation
    /// @param onBehalfOf Address passed by the router for delegation
    /// @return The resolved user address
    function _resolveUser(address onBehalfOf) internal view returns (address) {
        if (msg.sender == authorizedRouter && authorizedRouter != address(0)) {
            return onBehalfOf;
        }
        return msg.sender;
    }

    /// @notice Calculates the defense-aware dynamic fee based on reserve utilization
    /// @return The calculated fee in hundredths of a bip with LP fee flag
    function _calculateDynamicFee() internal view returns (uint24) {
        uint256 totalReserve = defenseReserveToken0 + defenseReserveToken1;
        if (totalReserve == 0) return baseFee;

        uint256 utilization = (totalProtectedValue * BPS_DENOMINATOR) / totalReserve;
        if (utilization > reserveUtilizationThreshold) {
            uint256 excess = utilization - reserveUtilizationThreshold;
            uint256 feeIncrease = (uint256(maxFee - baseFee) * excess) / (BPS_DENOMINATOR - reserveUtilizationThreshold);
            return baseFee + uint24(feeIncrease);
        }

        return baseFee;
    }

    /// @notice Calculates the required defense amount based on health gap
    /// @param pos The protected position being defended
    /// @param currentHealth The current health factor
    /// @return The calculated defense amount
    function _calculateDefenseAmount(
        ProtectedPosition storage pos,
        uint256 currentHealth
    ) internal view returns (uint256) {
        if (currentHealth >= pos.healthThreshold) return 0;
        uint256 gap = pos.healthThreshold - currentHealth;
        uint256 amount = (pos.positionSize * gap) / pos.healthThreshold;
        uint256 minDefense = pos.positionSize / 100;
        return amount > minDefense ? amount : minDefense;
    }

    // ============ INTERNAL FUNCTIONS (STATE-CHANGING) ============

    /// @notice Handles defense extraction in the unlock callback (action 0)
    /// @dev Burns ERC-6909 claims and takes tokens from PoolManager
    function _handleDefenseExtraction(bytes calldata data) internal {
        (, bytes32 positionId, Currency currency, uint256 amount) =
            abi.decode(data, (uint8, bytes32, Currency, uint256));
        poolManager.burn(address(this), currency.toId(), amount);
        poolManager.take(currency, address(this), amount);
        _emitCrossChainIntent(positionId, currency, amount);
    }

    /// @notice Handles reserve deposit in the unlock callback (action 1)
    /// @dev Syncs, transfers, settles, and mints ERC-6909 claims
    function _handleReserveDeposit(bytes calldata data) internal {
        (, address token, uint256 amount,) = abi.decode(data, (uint8, address, uint256, bytes32));
        Currency currency = Currency.wrap(token);
        poolManager.sync(currency);
        IERC20(token).safeTransfer(address(poolManager), amount);
        poolManager.settle();
        poolManager.mint(address(this), currency.toId(), amount);
    }

    /// @notice Handles premium donation in the unlock callback (action 2)
    /// @dev Syncs, transfers, settles for each currency, then donates to LPs
    function _handlePremiumDonation(bytes calldata data) internal {
        (, uint256 amount0, uint256 amount1,) = abi.decode(data, (uint8, uint256, uint256, bytes32));
        if (amount0 > 0) {
            poolManager.sync(poolKey.currency0);
            IERC20(Currency.unwrap(poolKey.currency0)).safeTransfer(address(poolManager), amount0);
            poolManager.settle();
        }
        if (amount1 > 0) {
            poolManager.sync(poolKey.currency1);
            IERC20(Currency.unwrap(poolKey.currency1)).safeTransfer(address(poolManager), amount1);
            poolManager.settle();
        }
        poolManager.donate(poolKey, amount0, amount1, "");
    }

    /// @notice Emits a cross-chain intent event for defense tracking
    function _emitCrossChainIntent(bytes32 positionId, Currency currency, uint256 amount) internal {
        bytes32 intentId = keccak256(abi.encode(positionId, currency, amount, block.timestamp));
        emit Events.IntentEmitted(positionId, intentId);
    }
}
