// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";
import {DefenseCallback} from "../src/rsc/DefenseCallback.sol";

/// @notice Deploys DefenseCallback on Unichain Sepolia
/// @dev Usage: forge script script/DeployCallback.s.sol --broadcast --rpc-url unichain_sepolia
contract DeployCallback is Script {
    /// @dev Reactive Network callback proxy on Unichain Sepolia
    address constant CALLBACK_PROXY = 0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envAddress("LIQUIDSHIELD_HOOK_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        DefenseCallback callback = new DefenseCallback(CALLBACK_PROXY, hookAddress);
        console.log("DefenseCallback deployed:", address(callback));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Add to .env ===");
        console.log(string.concat("DEFENSE_CALLBACK_ADDRESS=", vm.toString(address(callback))));
    }
}
