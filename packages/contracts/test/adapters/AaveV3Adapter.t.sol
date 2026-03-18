// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {Test} from "forge-std/Test.sol";
import {AaveV3Adapter, IAavePool} from "../../src/adapters/AaveV3Adapter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Mock Aave Pool for unit testing
contract MockAavePool {
    mapping(address => uint256) public healthFactors;
    mapping(address => uint256) public suppliedAmounts;
    mapping(address => uint256) public repaidAmounts;
    mapping(address => uint256) public withdrawnAmounts;
    address public lastSupplyAsset;
    address public lastSupplyOnBehalfOf;
    address public lastRepayAsset;
    address public lastRepayOnBehalfOf;

    function setHealthFactor(address user, uint256 hf) external {
        healthFactors[user] = hf;
    }

    function getUserAccountData(address user) external view returns (
        uint256, uint256, uint256, uint256, uint256, uint256
    ) {
        return (0, 0, 0, 0, 0, healthFactors[user]);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        lastSupplyAsset = asset;
        lastSupplyOnBehalfOf = onBehalfOf;
        suppliedAmounts[onBehalfOf] += amount;
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
    }

    function repay(address asset, uint256 amount, uint256, address onBehalfOf) external returns (uint256) {
        lastRepayAsset = asset;
        lastRepayOnBehalfOf = onBehalfOf;
        repaidAmounts[onBehalfOf] += amount;
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        return amount;
    }

    function withdraw(address, uint256 amount, address to) external returns (uint256) {
        withdrawnAmounts[to] += amount;
        return amount;
    }
}

// Simple test token
contract TestToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

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
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract AaveV3AdapterTest is Test {
    AaveV3Adapter public adapter;
    MockAavePool public pool;
    TestToken public token;

    address public user = makeAddr("user");
    address public executor = makeAddr("executor");

    function setUp() public {
        pool = new MockAavePool();
        adapter = new AaveV3Adapter(address(pool));
        token = new TestToken();

        // Fund executor with tokens
        token.mint(executor, 1000 ether);
    }

    // ================================================================
    // CONSTRUCTOR
    // ================================================================

    function test_constructor_setsPool() public view {
        assertEq(address(adapter.aavePool()), address(pool));
    }

    // ================================================================
    // GET HEALTH FACTOR — HAPPY PATHS
    // ================================================================

    function test_getHealthFactor_returnsCorrectValue() public {
        pool.setHealthFactor(user, 1.5e18);
        uint256 hf = adapter.getHealthFactor(user);
        assertEq(hf, 1.5e18);
    }

    function test_getHealthFactor_returnsZeroForUnknownUser() public view {
        uint256 hf = adapter.getHealthFactor(user);
        assertEq(hf, 0);
    }

    // ================================================================
    // DEPOSIT COLLATERAL — HAPPY PATHS
    // ================================================================

    function test_depositCollateral_suppliesViaPool() public {
        uint256 amount = 10 ether;

        // Executor sends tokens to adapter, adapter supplies on behalf of user
        vm.startPrank(executor);
        token.transfer(address(adapter), amount);
        vm.stopPrank();

        // Adapter calls pool.supply (adapter has tokens from executor)
        adapter.depositCollateral(user, address(token), amount);

        assertEq(pool.suppliedAmounts(user), amount);
        assertEq(pool.lastSupplyAsset(), address(token));
        assertEq(pool.lastSupplyOnBehalfOf(), user);
    }

    // ================================================================
    // REPAY DEBT — HAPPY PATHS
    // ================================================================

    function test_repayDebt_repaysViaPool() public {
        uint256 amount = 5 ether;

        vm.startPrank(executor);
        token.transfer(address(adapter), amount);
        vm.stopPrank();

        adapter.repayDebt(user, address(token), amount);

        assertEq(pool.repaidAmounts(user), amount);
        assertEq(pool.lastRepayAsset(), address(token));
        assertEq(pool.lastRepayOnBehalfOf(), user);
    }

    // ================================================================
    // WITHDRAW COLLATERAL
    // ================================================================

    function test_withdrawCollateral_callsPool() public {
        adapter.withdrawCollateral(user, address(token), 5 ether);
        // adapter calls pool.withdraw(asset, amount, msg.sender) where msg.sender = this test
        assertEq(pool.withdrawnAmounts(address(this)), 5 ether);
    }

    // ================================================================
    // GET POSITION DATA
    // ================================================================

    function test_getPositionData_returnsHealthFactor() public {
        pool.setHealthFactor(user, 2e18);
        (,,,, uint256 hf) = adapter.getPositionData(user);
        assertEq(hf, 2e18);
    }

    // ================================================================
    // FUZZ TESTS
    // ================================================================

    function testFuzz_getHealthFactor_arbitraryValue(uint256 hf) public {
        pool.setHealthFactor(user, hf);
        assertEq(adapter.getHealthFactor(user), hf);
    }

    function testFuzz_depositCollateral_arbitraryAmount(uint256 amount) public {
        amount = bound(amount, 1, 1000 ether);

        vm.startPrank(executor);
        token.transfer(address(adapter), amount);
        vm.stopPrank();

        adapter.depositCollateral(user, address(token), amount);
        assertEq(pool.suppliedAmounts(user), amount);
    }
}
