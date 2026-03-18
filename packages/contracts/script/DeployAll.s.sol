// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LiquidShieldHook} from "../src/hooks/LiquidShieldHook.sol";
import {LiquidShieldRouter} from "../src/router/LiquidShieldRouter.sol";
import {LiquidShieldSettler} from "../src/settler/LiquidShieldSettler.sol";

/// @notice CREATE2 factory deployed inline for hook address salt mining
contract SimpleCreate2Factory {
    function deploy(bytes32 salt, bytes memory initCode) external returns (address hook) {
        assembly {
            hook := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        require(hook != address(0), "CREATE2 failed");
    }
}

/// @notice Single deployment script for all Unichain contracts
/// @dev Usage: forge script script/DeployAll.s.sol --broadcast --rpc-url unichain_sepolia
contract DeployAll is Script {
    // Aqua0's PoolManager on Unichain Sepolia
    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;

    // Hook permission flags
    uint160 constant HOOK_FLAGS = uint160(
        Hooks.AFTER_INITIALIZE_FLAG
            | Hooks.AFTER_ADD_LIQUIDITY_FLAG
            | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
            | Hooks.BEFORE_SWAP_FLAG
            | Hooks.AFTER_SWAP_FLAG
    );

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address sharedPoolAddr = vm.envAddress("SHARED_LIQUIDITY_POOL");

        vm.startBroadcast(deployerPrivateKey);

        // Phase 1: Deploy CREATE2 factory
        SimpleCreate2Factory factory = new SimpleCreate2Factory();
        console.log("CREATE2 factory:", address(factory));

        // Phase 2: Mine salt and deploy hook via factory
        LiquidShieldHook hook = _deployHook(address(factory), sharedPoolAddr);

        // Phase 3: Deploy Settler + Router
        LiquidShieldSettler settler = new LiquidShieldSettler(address(hook));
        LiquidShieldRouter router = new LiquidShieldRouter(address(hook));
        hook.setSettler(address(settler));
        hook.setAuthorizedRouter(address(router));
        console.log("Settler deployed:", address(settler));
        console.log("Router deployed:", address(router));

        // Phase 4: Initialize pool
        _initializePool(address(hook));

        // Phase 5: Configure
        _configure(hook, settler);

        // Phase 6: Seed reserve (optional)
        _seedReserve(hook);

        vm.stopBroadcast();

        // Phase 7: Print .env output
        console.log("");
        console.log("=== Add to .env ===");
        console.log(string.concat("LIQUIDSHIELD_HOOK_ADDRESS=", vm.toString(address(hook))));
        console.log(string.concat("LIQUIDSHIELD_SETTLER_ADDRESS=", vm.toString(address(settler))));
        console.log(string.concat("LIQUIDSHIELD_ROUTER_ADDRESS=", vm.toString(address(router))));
        console.log(string.concat("NEXT_PUBLIC_HOOK_ADDRESS=", vm.toString(address(hook))));
        console.log(string.concat("NEXT_PUBLIC_ROUTER_ADDRESS=", vm.toString(address(router))));
        console.log(string.concat("NEXT_PUBLIC_SETTLER_ADDRESS=", vm.toString(address(settler))));
    }

    function _deployHook(address factoryAddr, address sharedPoolAddr) internal returns (LiquidShieldHook hook) {
        console.log("SharedLiquidityPool (existing):", sharedPoolAddr);

        // Pass the deployer EOA as owner (3rd constructor arg)
        address deployer = msg.sender;
        bytes memory initCode = abi.encodePacked(
            type(LiquidShieldHook).creationCode,
            abi.encode(POOL_MANAGER, sharedPoolAddr, deployer)
        );
        bytes32 initCodeHash = keccak256(initCode);

        // Mine salt using the factory address as the CREATE2 deployer
        address hookAddress;
        bytes32 salt;
        for (uint256 i = 0; i < 200000; i++) {
            salt = bytes32(i);
            hookAddress = _computeCreate2Address(factoryAddr, salt, initCodeHash);
            // V4 checks lower 14 bits exactly match declared permissions
            if ((uint160(hookAddress) & 0x3FFF) == HOOK_FLAGS) break;
            if (i == 199999) revert("Could not find valid salt in 200000 iterations");
        }
        console.log("Found salt:", vm.toString(salt));
        console.log("Expected hook address:", hookAddress);

        // Deploy via factory
        address deployed = SimpleCreate2Factory(factoryAddr).deploy(salt, initCode);
        require(deployed == hookAddress, "CREATE2 address mismatch");
        hook = LiquidShieldHook(payable(deployed));
        console.log("Hook deployed:", address(hook));
    }

    function _initializePool(address hookAddress) internal {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address weth = vm.envAddress("WETH_ADDRESS");
        uint160 startingPrice = uint160(vm.envOr("SQRT_PRICE_X96", uint256(79228162514264337593543950336)));

        address token0 = usdc < weth ? usdc : weth;
        address token1 = usdc < weth ? weth : usdc;

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddress)
        });

        IPoolManager(POOL_MANAGER).initialize(key, startingPrice);
        console.log("Pool initialized");
        console.log("  token0:", token0);
        console.log("  token1:", token1);
    }

    function _configure(LiquidShieldHook hook, LiquidShieldSettler settler) internal {
        address deployer = msg.sender;
        address rscCallback = vm.envOr("RSC_CALLBACK_ADDRESS", deployer);
        address fillerAddress = vm.addr(vm.envUint("FILLER_PRIVATE_KEY"));

        hook.setRscCallback(rscCallback);
        hook.setFillerAddress(fillerAddress);
        settler.setAuthorizedFiller(fillerAddress);

        console.log("RSC callback set:", rscCallback);
        console.log("Filler set:", fillerAddress);
        console.log("Settler authorized filler set:", fillerAddress);
    }

    function _seedReserve(LiquidShieldHook hook) internal {
        address weth = vm.envOr("WETH_ADDRESS", address(0));
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        uint256 seedWeth = vm.envOr("SEED_WETH_AMOUNT", uint256(0));
        uint256 seedUsdc = vm.envOr("SEED_USDC_AMOUNT", uint256(0));

        if (weth != address(0) && seedWeth > 0) {
            IERC20(weth).approve(address(hook), seedWeth);
            hook.depositToReserve(weth, seedWeth);
            console.log("WETH deposited to reserve:", seedWeth);
        }

        if (usdc != address(0) && seedUsdc > 0) {
            IERC20(usdc).approve(address(hook), seedUsdc);
            hook.depositToReserve(usdc, seedUsdc);
            console.log("USDC deposited to reserve:", seedUsdc);
        }
    }

    function _computeCreate2Address(address deployer, bytes32 _salt, bytes32 _initCodeHash)
        internal
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, _salt, _initCodeHash)))));
    }
}
