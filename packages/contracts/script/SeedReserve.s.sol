// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LiquidShieldHook} from "../src/hooks/LiquidShieldHook.sol";

/// @notice Seeds the hook's ERC-6909 defense reserve with WETH and/or USDC
contract SeedReserve is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("LIQUIDSHIELD_HOOK_ADDRESS");

        // Token addresses and amounts — set 0 to skip a token
        address weth = vm.envOr("WETH_ADDRESS", address(0));
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        uint256 wethAmount = vm.envOr("SEED_WETH_AMOUNT", uint256(0));
        uint256 usdcAmount = vm.envOr("SEED_USDC_AMOUNT", uint256(0));

        vm.startBroadcast(deployerPrivateKey);

        LiquidShieldHook hook = LiquidShieldHook(payable(hookAddress));

        if (weth != address(0) && wethAmount > 0) {
            IERC20(weth).approve(hookAddress, wethAmount);
            hook.depositToReserve(weth, wethAmount);
            console.log("WETH deposited to reserve:", wethAmount);
        }

        if (usdc != address(0) && usdcAmount > 0) {
            IERC20(usdc).approve(hookAddress, usdcAmount);
            hook.depositToReserve(usdc, usdcAmount);
            console.log("USDC deposited to reserve:", usdcAmount);
        }

        (uint256 reserve0, uint256 reserve1) = hook.getReserveBalances();
        console.log("Reserve token0:", reserve0);
        console.log("Reserve token1:", reserve1);

        vm.stopBroadcast();
    }
}
