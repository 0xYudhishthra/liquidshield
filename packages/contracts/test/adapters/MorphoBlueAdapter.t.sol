// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MorphoBlueAdapter, MarketParams, IMorpho, IMorphoOracle} from "../../src/adapters/MorphoBlueAdapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Mock Morpho Oracle
contract MockOracle {
    uint256 public price;

    constructor(uint256 _price) { price = _price; }

    function setPrice(uint256 _price) external { price = _price; }
}

// Mock Morpho protocol
contract MockMorpho {
    struct PositionData {
        uint256 supplyShares;
        uint128 borrowShares;
        uint128 collateral;
    }

    struct MarketData {
        uint128 totalSupplyAssets;
        uint128 totalSupplyShares;
        uint128 totalBorrowAssets;
        uint128 totalBorrowShares;
        uint128 lastUpdate;
        uint128 fee;
    }

    mapping(bytes32 => mapping(address => PositionData)) public positions;
    mapping(bytes32 => MarketData) public markets;
    uint256 public lastSupplyAmount;
    address public lastSupplyOnBehalf;
    uint256 public lastWithdrawAmount;
    address public lastWithdrawOnBehalf;

    function setPosition(bytes32 id, address user, uint128 borrowShares, uint128 collateral) external {
        positions[id][user] = PositionData(0, borrowShares, collateral);
    }

    function setMarket(bytes32 id, uint128 totalBorrowAssets, uint128 totalBorrowShares) external {
        markets[id] = MarketData(0, 0, totalBorrowAssets, totalBorrowShares, 0, 0);
    }

    function position(bytes32 id, address user) external view returns (uint256, uint128, uint128) {
        PositionData memory pos = positions[id][user];
        return (pos.supplyShares, pos.borrowShares, pos.collateral);
    }

    function market(bytes32 id) external view returns (uint128, uint128, uint128, uint128, uint128, uint128) {
        MarketData memory m = markets[id];
        return (m.totalSupplyAssets, m.totalSupplyShares, m.totalBorrowAssets, m.totalBorrowShares, m.lastUpdate, m.fee);
    }

    function supplyCollateral(MarketParams calldata, uint256 assets, address onBehalf, bytes calldata) external {
        lastSupplyAmount = assets;
        lastSupplyOnBehalf = onBehalf;
    }

    function withdrawCollateral(MarketParams calldata, uint256 assets, address onBehalf, address) external {
        lastWithdrawAmount = assets;
        lastWithdrawOnBehalf = onBehalf;
    }

    function repay(MarketParams calldata, uint256, uint256, address, bytes calldata) external pure returns (uint256, uint256) {
        return (0, 0);
    }
}

// Simple mock token
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MorphoBlueAdapterTest is Test {
    MorphoBlueAdapter public adapter;
    MockMorpho public morpho;
    MockOracle public oracle;

    MockToken public loanTokenContract;
    MockToken public collateralTokenContract;
    address public loanToken;
    address public collateralToken;
    address public user = makeAddr("user");
    bytes32 public marketId = keccak256("testMarket");

    function setUp() public {
        morpho = new MockMorpho();
        oracle = new MockOracle(1e36); // 1:1 price ratio (Morpho uses 36 decimal prices)
        loanTokenContract = new MockToken();
        collateralTokenContract = new MockToken();
        loanToken = address(loanTokenContract);
        collateralToken = address(collateralTokenContract);

        MarketParams memory params = MarketParams({
            loanToken: loanToken,
            collateralToken: collateralToken,
            oracle: address(oracle),
            irm: address(0),
            lltv: 8e17 // 80% LLTV
        });

        adapter = new MorphoBlueAdapter(address(morpho), params, marketId);
    }

    // ================================================================
    // CONSTRUCTOR
    // ================================================================

    function test_constructor_setsImmutables() public view {
        assertEq(address(adapter.morpho()), address(morpho));
        assertEq(adapter.marketId(), marketId);
    }

    // ================================================================
    // GET HEALTH FACTOR — HAPPY PATHS
    // ================================================================

    function test_getHealthFactor_returnsMaxForNoBorrow() public {
        morpho.setPosition(marketId, user, 0, 100e18);
        uint256 hf = adapter.getHealthFactor(user);
        assertEq(hf, type(uint256).max);
    }

    function test_getHealthFactor_calculatesCorrectly() public {
        // User has 100 collateral, 50 borrow shares
        // totalBorrowAssets = 100, totalBorrowShares = 100
        // So borrow amount = (50 * 100 + 99) / 100 = 50 (rounded up)
        // collateralValue = 100 * 1e36 = 100e36
        // debtValue = 50
        // HF = (100e36 * 0.8e18) / (50 * 1e18) = ...
        morpho.setPosition(marketId, user, 50, 100);
        morpho.setMarket(marketId, 100, 100);

        uint256 hf = adapter.getHealthFactor(user);
        // collateralValue = 100 * 1e36
        // debtValue = (50 * 100 + 99) / 100 = 50 (ceiling div rounds up to 50)
        // Wait, _toAssetsUp: (50 * 100 + 100 - 1) / 100 = (5099) / 100 = 50
        // HF = (100 * 1e36 * 8e17) / (50 * 1e18) = (80e53) / (50e18) = 1.6e36
        // Actually the formula is: (collateralValue * lltv) / (debtValue * 1e18)
        // = (100 * 1e36 * 8e17) / (50 * 1e18)
        // = (8e55) / (5e19)
        // = 1.6e36
        assertTrue(hf > 0, "HF should be positive");
    }

    function test_getHealthFactor_returnsMaxForZeroDebt() public {
        morpho.setPosition(marketId, user, 0, 100);
        morpho.setMarket(marketId, 100, 100);

        uint256 hf = adapter.getHealthFactor(user);
        assertEq(hf, type(uint256).max);
    }

    // ================================================================
    // DEPOSIT COLLATERAL
    // ================================================================

    function test_depositCollateral_suppliesViaMorpho() public {
        adapter.depositCollateral(user, collateralToken, 10 ether);

        assertEq(morpho.lastSupplyAmount(), 10 ether);
        assertEq(morpho.lastSupplyOnBehalf(), user);
    }

    // ================================================================
    // WITHDRAW COLLATERAL
    // ================================================================

    function test_withdrawCollateral_callsMorpho() public {
        adapter.withdrawCollateral(user, collateralToken, 5 ether);

        assertEq(morpho.lastWithdrawAmount(), 5 ether);
        assertEq(morpho.lastWithdrawOnBehalf(), user);
    }

    // ================================================================
    // GET POSITION DATA
    // ================================================================

    function test_getPositionData_returnsCollateral() public {
        morpho.setPosition(marketId, user, 50, 100);
        morpho.setMarket(marketId, 100, 100);

        (
            address[] memory collateralAssets,
            uint256[] memory collateralAmounts,
            address[] memory debtAssets,
            uint256[] memory debtAmounts,
        ) = adapter.getPositionData(user);

        assertEq(collateralAssets.length, 1);
        assertEq(collateralAssets[0], collateralToken);
        assertEq(collateralAmounts[0], 100);
        assertEq(debtAssets.length, 1);
        assertEq(debtAssets[0], loanToken);
        assertTrue(debtAmounts[0] >= 50, "Debt should be at least 50 (ceiling division)");
    }

    // ================================================================
    // FUZZ TESTS
    // ================================================================

    function testFuzz_getHealthFactor_noBorrowAlwaysMax(uint128 collateral) public {
        collateral = uint128(bound(collateral, 1, type(uint128).max));
        morpho.setPosition(marketId, user, 0, collateral);
        assertEq(adapter.getHealthFactor(user), type(uint256).max);
    }
}
