// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {LiquidShieldHook} from "../src/hooks/LiquidShieldHook.sol";

contract RegisterPosition is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("LIQUIDSHIELD_HOOK_ADDRESS");
        vm.startBroadcast(deployerPrivateKey);

        LiquidShieldHook hook = LiquidShieldHook(hookAddress);
        bytes32 positionId = keccak256(abi.encode(msg.sender, block.timestamp));

        hook.registerPosition(
            positionId,
            msg.sender,   // onBehalfOf (register for self)
            address(0),   // collateral asset
            address(0),   // debt asset
            1 ether,      // position size
            1.3e18,       // health threshold
            LiquidShieldHook.DefenseStrategy.COLLATERAL_TOPUP,
            421614,       // source chain (Arbitrum Sepolia)
            address(0),   // lending adapter
            3             // 3 months premium
        );

        console.log("Position registered:", vm.toString(positionId));
        vm.stopBroadcast();
    }
}
