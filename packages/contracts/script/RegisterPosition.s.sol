// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILiquidShieldHook} from "../src/interfaces/ILiquidShieldHook.sol";
import {LiquidShieldRouter} from "../src/router/LiquidShieldRouter.sol";

/// @notice Registers a lending position for protection and pays initial premium via the Router
///
/// Usage:
///   LIQUIDSHIELD_ROUTER_ADDRESS=0x... COLLATERAL_ASSET=0x... DEBT_ASSET=0x... \
///   POSITION_SIZE=1000000000000000000 HEALTH_THRESHOLD=1300000000000000000 \
///   DEFENSE_STRATEGY=0 SOURCE_CHAIN_ID=421614 LENDING_ADAPTER=0x... \
///   PREMIUM_TOKEN=0x... PREMIUM_AMOUNT=10000000 PREMIUM_MONTHS=3 \
///   forge script script/RegisterPosition.s.sol --broadcast --rpc-url unichain_sepolia
contract RegisterPosition is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address routerAddress = vm.envAddress("LIQUIDSHIELD_ROUTER_ADDRESS");

        // Position parameters
        address collateralAsset = vm.envAddress("COLLATERAL_ASSET");
        address debtAsset = vm.envAddress("DEBT_ASSET");
        uint256 positionSize = vm.envUint("POSITION_SIZE");
        uint256 healthThreshold = vm.envOr("HEALTH_THRESHOLD", uint256(1.3e18));
        uint8 strategyRaw = uint8(vm.envOr("DEFENSE_STRATEGY", uint256(0)));
        uint256 sourceChainId = vm.envUint("SOURCE_CHAIN_ID");
        address lendingAdapter = vm.envAddress("LENDING_ADAPTER");

        // Premium parameters
        address premiumToken = vm.envAddress("PREMIUM_TOKEN");
        uint256 premiumAmount = vm.envUint("PREMIUM_AMOUNT");
        uint256 premiumMonths = vm.envOr("PREMIUM_MONTHS", uint256(3));

        ILiquidShieldHook.DefenseStrategy strategy = ILiquidShieldHook.DefenseStrategy(strategyRaw);

        vm.startBroadcast(deployerPrivateKey);

        // Generate deterministic position ID from sender + params
        bytes32 positionId = keccak256(
            abi.encode(vm.addr(deployerPrivateKey), collateralAsset, debtAsset, sourceChainId, block.timestamp)
        );

        // Approve premium token for router
        IERC20(premiumToken).approve(routerAddress, premiumAmount);

        // Register and pay premium in one transaction
        LiquidShieldRouter(routerAddress).registerAndPayPremium(
            positionId,
            collateralAsset,
            debtAsset,
            positionSize,
            healthThreshold,
            strategy,
            sourceChainId,
            lendingAdapter,
            premiumMonths,
            premiumToken,
            premiumAmount
        );

        console.log("Position registered:", vm.toString(positionId));
        console.log("  Collateral:", collateralAsset);
        console.log("  Debt:", debtAsset);
        console.log("  Size:", positionSize);
        string memory strategyName = strategyRaw == 0 ? "COLLATERAL_TOPUP" : "BATCHED_UNWIND";
        console.log("  Strategy:", strategyName);
        console.log("  Source chain:", sourceChainId);

        vm.stopBroadcast();
    }
}
