// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";
import {HealthChecker} from "../src/rsc/HealthChecker.sol";

/// @notice Deploys HealthChecker on the source chain (same chain as Aave)
/// @dev Usage: CALLBACK_PROXY=0x... AAVE_POOL=0x... \
///       forge script script/DeployHealthChecker.s.sol:DeployHealthChecker --broadcast --rpc-url base_sepolia
contract DeployHealthChecker is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address callbackProxy = vm.envAddress("CALLBACK_PROXY");
        address aavePool = vm.envAddress("AAVE_POOL");

        vm.startBroadcast(deployerPrivateKey);

        HealthChecker checker = new HealthChecker{value: 0.01 ether}(callbackProxy, aavePool);
        console.log("HealthChecker deployed:", address(checker));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Add to .env ===");
        console.log(string.concat("HEALTH_CHECKER_ADDRESS=", vm.toString(address(checker))));
    }
}
