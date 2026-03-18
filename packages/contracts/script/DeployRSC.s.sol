// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";

/// @notice Documentation-only script for PositionMonitor RSC deployment.
/// @dev IMPORTANT: Do NOT use `forge script` for RSC deployments on Reactive Network.
///      The subscription calls in the constructor fail during simulation mode.
///      Use `forge create` directly instead.
///
///      Deploy command:
///
///      forge create \
///        --rpc-url https://lasna-rpc.rnk.dev \
///        --private-key $PRIVATE_KEY \
///        --value 10ether \
///        src/rsc/PositionMonitor.sol:PositionMonitor \
///        --constructor-args \
///          $HEALTH_CHECKER \
///          $SOURCE_CHAIN_ID \
///          $DEFENSE_CALLBACK \
///          1301 \
///          0x04463f7c1651e6b9774d7f85c85bb94654e3c46ca79b0c16fb16d4183307b687
///
///      Environment variables:
///        HEALTH_CHECKER    - HealthChecker address on source chain (e.g., Base Sepolia)
///        SOURCE_CHAIN_ID   - Source chain ID (e.g., 84532 for Base Sepolia)
///        DEFENSE_CALLBACK  - DefenseCallback address on Unichain Sepolia
///        PRIVATE_KEY       - Deployer private key
///
///      After deployment:
///        - Fund the RSC with ETH (at least 10 ETH on Lasna for gas)
///        - No addPosition() call needed — position data lives on HealthChecker
///        - RSC auto-subscribes to CRON ticks + HealthDanger events in constructor
contract DeployRSC is Script {
    function run() external pure {
        revert("Use forge create, not forge script. See natspec above for the command.");
    }
}
