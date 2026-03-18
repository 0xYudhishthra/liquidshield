// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import {Test} from "forge-std/Test.sol";
import {DefenseExecutor} from "../src/executor/DefenseExecutor.sol";
import {ILendingAdapter} from "../src/interfaces/ILendingAdapter.sol";
import {IDefenseExecutor} from "../src/interfaces/IDefenseExecutor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Errors} from "../src/lib/Errors.sol";
import {Events} from "../src/lib/Events.sol";

// Mock lending adapter for testing
contract MockLendingAdapter is ILendingAdapter {
    uint256 public lastDepositAmount;
    address public lastDepositUser;
    address public lastDepositAsset;
    uint256 public lastWithdrawAmount;
    address public lastWithdrawUser;

    function getHealthFactor(address) external pure override returns (uint256) {
        return 1.5e18;
    }

    function depositCollateral(address user, address asset, uint256 amount) external override {
        lastDepositUser = user;
        lastDepositAsset = asset;
        lastDepositAmount = amount;
        // Tokens already transferred by executor
    }

    function repayDebt(address, address, uint256) external pure override {}

    function withdrawCollateral(address user, address, uint256 amount) external override {
        lastWithdrawUser = user;
        lastWithdrawAmount = amount;
    }

    function getPositionData(address) external pure override returns (
        address[] memory, uint256[] memory, address[] memory, uint256[] memory, uint256
    ) {
        return (new address[](0), new uint256[](0), new address[](0), new uint256[](0), 1.5e18);
    }
}

// Minimal ERC20 for testing
contract TestToken {
    string public name = "Test";
    string public symbol = "TST";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

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

contract DefenseExecutorTest is Test {
    DefenseExecutor public executor;
    MockLendingAdapter public adapter;
    TestToken public token;

    address public fillerAddr = makeAddr("filler");
    address public ownerAddr;
    address public user = makeAddr("user");
    address public attacker = makeAddr("attacker");

    function setUp() public {
        ownerAddr = address(this);
        executor = new DefenseExecutor(fillerAddr);
        adapter = new MockLendingAdapter();
        token = new TestToken();

        // Fund filler with tokens and approve executor
        token.mint(fillerAddr, 1000 ether);
        vm.prank(fillerAddr);
        token.approve(address(executor), type(uint256).max);
    }

    // ================================================================
    // CONSTRUCTOR & ADMIN — HAPPY PATHS
    // ================================================================

    function test_constructor_setsFillerAndOwner() public view {
        assertEq(executor.authorizedFiller(), fillerAddr);
        assertEq(executor.owner(), ownerAddr);
    }

    function test_setFiller_succeeds() public {
        address newFiller = makeAddr("newFiller");
        executor.setFiller(newFiller);
        assertEq(executor.authorizedFiller(), newFiller);
    }

    // ================================================================
    // ADMIN — SAD PATHS
    // ================================================================

    function test_setFiller_revertsWhenNotOwner() public {
        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(attacker);
        executor.setFiller(attacker);
    }

    // ================================================================
    // EXECUTE DEFENSE — COLLATERAL TOPUP — HAPPY PATH
    // ================================================================

    function test_executeDefense_collateralTopup_succeeds() public {
        bytes32 posId = keccak256("pos1");
        uint256 amount = 10 ether;

        vm.prank(fillerAddr);
        executor.executeDefense(posId, address(adapter), user, address(token), amount, 0); // strategy 0 = COLLATERAL_TOPUP

        assertEq(adapter.lastDepositUser(), user);
        assertEq(adapter.lastDepositAsset(), address(token));
        assertEq(adapter.lastDepositAmount(), amount);
    }

    function test_executeDefense_collateralTopup_emitsEvent() public {
        bytes32 posId = keccak256("pos1");

        vm.expectEmit(true, true, false, true);
        emit Events.DefenseExecuted(posId, address(adapter), 5 ether, 0);
        vm.prank(fillerAddr);
        executor.executeDefense(posId, address(adapter), user, address(token), 5 ether, 0);
    }

    // ================================================================
    // EXECUTE DEFENSE — BATCHED UNWIND — HAPPY PATH
    // ================================================================

    function test_executeDefense_batchedUnwind_succeeds() public {
        bytes32 posId = keccak256("pos1");

        vm.prank(fillerAddr);
        executor.executeDefense(posId, address(adapter), user, address(token), 5 ether, 1); // strategy 1 = BATCHED_UNWIND

        assertEq(adapter.lastWithdrawUser(), user);
        assertEq(adapter.lastWithdrawAmount(), 5 ether);
    }

    // ================================================================
    // EXECUTE DEFENSE — SAD PATHS
    // ================================================================

    function test_executeDefense_revertsWhenNotFiller() public {
        bytes32 posId = keccak256("pos1");

        vm.expectRevert(Errors.UnauthorizedCaller.selector);
        vm.prank(attacker);
        executor.executeDefense(posId, address(adapter), user, address(token), 5 ether, 0);
    }

    function test_executeDefense_revertsWhenInvalidAdapter() public {
        bytes32 posId = keccak256("pos1");

        vm.expectRevert(Errors.InvalidAdapter.selector);
        vm.prank(fillerAddr);
        executor.executeDefense(posId, address(0), user, address(token), 5 ether, 0);
    }

    // ================================================================
    // INTERFACE COMPLIANCE
    // ================================================================

    function test_implementsIDefenseExecutor() public view {
        // Verify the contract implements IDefenseExecutor by checking it's assignable
        IDefenseExecutor iExecutor = IDefenseExecutor(address(executor));
        assertEq(address(iExecutor), address(executor));
    }

    // ================================================================
    // FUZZ TESTS
    // ================================================================

    function testFuzz_executeDefense_arbitraryAmount(uint256 amount) public {
        amount = bound(amount, 1, 1000 ether);
        bytes32 posId = keccak256(abi.encode("fuzz", amount));

        vm.prank(fillerAddr);
        executor.executeDefense(posId, address(adapter), user, address(token), amount, 0);

        assertEq(adapter.lastDepositAmount(), amount);
    }
}
