// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";
import {PositionMonitor} from "../src/rsc/PositionMonitor.sol";

/// @notice Deploys PositionMonitor RSC on Reactive Network Lasna testnet
/// @dev Usage: HEALTH_CHECKER=0x... SOURCE_CHAIN_ID=84532 \
///       DEFENSE_CALLBACK=0x... CRON_TOPIC=0x... \
///       forge create --broadcast --rpc-url reactive_lasna --value 5ether \
///       src/rsc/PositionMonitor.sol:PositionMonitor \
///       --constructor-args $HEALTH_CHECKER $SOURCE_CHAIN_ID $DEFENSE_CALLBACK 1301 $CRON_TOPIC
///
///  Note: Use forge create (not forge script) for Reactive Network deployments
///  to avoid subscription failures in simulation mode.
contract DeployRSC is Script {
    uint256 constant UNICHAIN_CHAIN_ID = 1301;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address healthChecker = vm.envAddress("HEALTH_CHECKER");
        uint256 sourceChainId = vm.envUint("SOURCE_CHAIN_ID");
        address defenseCallback = vm.envAddress("DEFENSE_CALLBACK");
        uint256 cronTopic = vm.envUint("CRON_TOPIC");

        vm.startBroadcast(deployerPrivateKey);

        PositionMonitor monitor = new PositionMonitor{value: 5 ether}(
            healthChecker,
            sourceChainId,
            defenseCallback,
            UNICHAIN_CHAIN_ID,
            cronTopic
        );
        console.log("PositionMonitor (RSC) deployed:", address(monitor));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Add to .env ===");
        console.log(string.concat("POSITION_MONITOR_ADDRESS=", vm.toString(address(monitor))));
    }
}
