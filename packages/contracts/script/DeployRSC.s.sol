// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";
import {PositionMonitor} from "../src/rsc/PositionMonitor.sol";

/// @notice Deploys PositionMonitor RSC on Reactive Network Lasna testnet
/// @dev Usage: forge script script/DeployRSC.s.sol --broadcast --rpc-url reactive_lasna
contract DeployRSC is Script {
    /// @dev Unichain Sepolia chain ID
    uint256 constant UNICHAIN_CHAIN_ID = 1301;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address callbackAddress = vm.envAddress("DEFENSE_CALLBACK_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        PositionMonitor monitor = new PositionMonitor{value: 0.1 ether}(callbackAddress, UNICHAIN_CHAIN_ID);
        console.log("PositionMonitor (RSC) deployed:", address(monitor));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Add to .env ===");
        console.log(string.concat("POSITION_MONITOR_ADDRESS=", vm.toString(address(monitor))));
    }
}
