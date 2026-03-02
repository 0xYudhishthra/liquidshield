// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {LiquidShieldHook} from "../src/hooks/LiquidShieldHook.sol";
import {LiquidShieldRouter} from "../src/router/LiquidShieldRouter.sol";
import {LiquidShieldSettler} from "../src/settler/LiquidShieldSettler.sol";

contract DeployHook is Script {
    address constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        LiquidShieldHook hook = new LiquidShieldHook(IPoolManager(POOL_MANAGER));
        LiquidShieldSettler settler = new LiquidShieldSettler(address(hook));
        LiquidShieldRouter router = new LiquidShieldRouter(address(hook));

        hook.setSettler(address(settler));

        console.log("Hook:", address(hook));
        console.log("Settler:", address(settler));
        console.log("Router:", address(router));

        vm.stopBroadcast();
    }
}
