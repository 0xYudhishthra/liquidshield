// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";
import {PositionMonitor} from "../src/rsc/PositionMonitor.sol";

/// @notice Deploys PositionMonitor RSC on Reactive Network Lasna testnet
/// @dev Usage: DEFENSE_CALLBACK_ADDRESS=0x... LENDING_PROTOCOL=0x... SOURCE_CHAIN_ID=84532 \
///       forge script script/DeployRSC.s.sol:DeployRSC --broadcast --rpc-url reactive_lasna
contract DeployRSC is Script {
    uint256 constant UNICHAIN_CHAIN_ID = 1301;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address callbackAddress = vm.envAddress("DEFENSE_CALLBACK_ADDRESS");
        address lendingProtocol = vm.envAddress("LENDING_PROTOCOL");
        uint256 sourceChainId = vm.envUint("SOURCE_CHAIN_ID");

        vm.startBroadcast(deployerPrivateKey);

        PositionMonitor monitor = new PositionMonitor{value: 1 ether}(
            callbackAddress,
            UNICHAIN_CHAIN_ID,
            lendingProtocol,
            sourceChainId
        );
        console.log("PositionMonitor (RSC) deployed:", address(monitor));
        console.log("  Monitoring:", lendingProtocol);
        console.log("  Source chain:", sourceChainId);
        console.log("  Callback receiver:", callbackAddress);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Add to .env ===");
        console.log(string.concat("POSITION_MONITOR_ADDRESS=", vm.toString(address(monitor))));
    }
}
