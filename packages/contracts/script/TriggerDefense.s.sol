// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {LiquidShieldHook} from "../src/hooks/LiquidShieldHook.sol";

/// @notice Manually triggers a defense action for testing (simulates RSC callback)
/// @dev Must be called from the RSC callback address configured on the hook
///
/// Usage:
///   LIQUIDSHIELD_HOOK_ADDRESS=0x... POSITION_ID=0x... CURRENT_HEALTH=1200000000000000000 \
///   forge script script/TriggerDefense.s.sol --broadcast --rpc-url unichain_sepolia
contract TriggerDefense is Script {
    function run() external {
        // Use the RSC callback private key (must match hook.rscCallback())
        uint256 rscPrivateKey = vm.envUint("RSC_PRIVATE_KEY");
        address hookAddress = vm.envAddress("LIQUIDSHIELD_HOOK_ADDRESS");
        bytes32 positionId = vm.envBytes32("POSITION_ID");
        uint256 currentHealth = vm.envUint("CURRENT_HEALTH");

        vm.startBroadcast(rscPrivateKey);

        LiquidShieldHook hook = LiquidShieldHook(payable(hookAddress));

        // Verify caller is authorized
        address rscCallback = hook.rscCallback();
        address caller = vm.addr(rscPrivateKey);
        require(caller == rscCallback, "Caller is not the authorized RSC callback address");

        // Fetch position info for logging
        LiquidShieldHook.ProtectedPosition memory pos = hook.getPosition(positionId);
        console.log("Triggering defense for position:", vm.toString(positionId));
        console.log("  Owner:", pos.owner);
        console.log("  Health threshold:", pos.healthThreshold);
        console.log("  Current health:", currentHealth);
        console.log("  Strategy:", uint8(pos.strategy) == 0 ? "COLLATERAL_TOPUP" : "BATCHED_UNWIND");

        // Trigger the defense
        hook.triggerDefense(positionId, currentHealth);

        console.log("Defense triggered successfully");

        // Log reserve state after defense
        (uint256 reserve0, uint256 reserve1) = hook.getReserveBalances();
        console.log("  Reserve token0 remaining:", reserve0);
        console.log("  Reserve token1 remaining:", reserve1);

        vm.stopBroadcast();
    }
}
