// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {Currency} from "v4-core/src/types/Currency.sol";

/// @notice Initializes the USDC/WETH pool on Unichain Sepolia with the LiquidShield hook attached
contract InitializePool is Script {
    address constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("LIQUIDSHIELD_HOOK_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address weth = vm.envAddress("WETH_ADDRESS");

        // Ensure currency0 < currency1 (v4 requirement)
        address token0;
        address token1;
        if (usdc < weth) {
            token0 = usdc;
            token1 = weth;
        } else {
            token0 = weth;
            token1 = usdc;
        }

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddress)
        });

        // Starting price: use env var or default to 1:1 (sqrtPriceX96 for 1:1)
        uint160 startingPrice = uint160(vm.envOr("SQRT_PRICE_X96", uint256(79228162514264337593543950336)));

        vm.startBroadcast(deployerPrivateKey);

        IPoolManager(POOL_MANAGER).initialize(key, startingPrice);

        console.log("Pool initialized");
        console.log("  token0:", token0);
        console.log("  token1:", token1);
        console.log("  tickSpacing: 60");
        console.log("  fee: DYNAMIC");
        console.log("  hook:", hookAddress);

        vm.stopBroadcast();
    }
}
