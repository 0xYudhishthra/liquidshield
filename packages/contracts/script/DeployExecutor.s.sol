// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {DefenseExecutor} from "../src/executor/DefenseExecutor.sol";

contract DeployExecutor is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        DefenseExecutor executor = new DefenseExecutor(vm.envAddress("FILLER_ADDRESS"));
        console.log("DefenseExecutor:", address(executor));
        vm.stopBroadcast();
    }
}
