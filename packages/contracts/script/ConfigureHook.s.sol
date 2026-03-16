// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {LiquidShieldHook} from "../src/hooks/LiquidShieldHook.sol";
import {LiquidShieldSettler} from "../src/settler/LiquidShieldSettler.sol";

/// @notice Configures the LiquidShield hook after deployment: sets RSC callback, filler, router, settler
contract ConfigureHook is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("LIQUIDSHIELD_HOOK_ADDRESS");

        // All optional — only configures what's provided
        address rscCallback = vm.envOr("RSC_CALLBACK_ADDRESS", address(0));
        address filler = vm.envOr("FILLER_ADDRESS", address(0));
        address router = vm.envOr("LIQUIDSHIELD_ROUTER_ADDRESS", address(0));
        address settler = vm.envOr("LIQUIDSHIELD_SETTLER_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        LiquidShieldHook hook = LiquidShieldHook(payable(hookAddress));

        if (rscCallback != address(0)) {
            hook.setRscCallback(rscCallback);
            console.log("RSC callback set:", rscCallback);
        }

        if (filler != address(0)) {
            hook.setFillerAddress(filler);
            console.log("Filler set on hook:", filler);

            // Also authorize filler on settler (fixes bug: settler's onlyFillerOrOwner blocks filler)
            if (settler != address(0)) {
                LiquidShieldSettler(settler).setAuthorizedFiller(filler);
                console.log("Filler set on settler:", filler);
            } else {
                address settlerAddr = hook.settler();
                if (settlerAddr != address(0)) {
                    LiquidShieldSettler(settlerAddr).setAuthorizedFiller(filler);
                    console.log("Filler set on settler (from hook):", filler);
                }
            }
        }

        if (router != address(0)) {
            hook.setAuthorizedRouter(router);
            console.log("Router set:", router);
        }

        if (settler != address(0)) {
            hook.setSettler(settler);
            console.log("Settler set:", settler);
        }

        vm.stopBroadcast();
    }
}
