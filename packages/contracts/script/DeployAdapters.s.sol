// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";
import {AaveV3Adapter} from "../src/adapters/AaveV3Adapter.sol";
import {MorphoBlueAdapter, MarketParams} from "../src/adapters/MorphoBlueAdapter.sol";

/// @notice Deploys lending adapters on source chains
/// @dev Run once on Arbitrum Sepolia for Aave, once on Ethereum Sepolia for Morpho
///
/// Usage:
///   Aave (Arbitrum Sepolia):
///     ADAPTER_TYPE=aave AAVE_POOL=0x... forge script script/DeployAdapters.s.sol --broadcast --rpc-url arbitrum_sepolia
///
///   Morpho (Ethereum Sepolia):
///     ADAPTER_TYPE=morpho MORPHO_ADDRESS=0x... MORPHO_MARKET_ID=0x... \
///     MORPHO_LOAN_TOKEN=0x... MORPHO_COLLATERAL_TOKEN=0x... MORPHO_ORACLE=0x... \
///     MORPHO_IRM=0x... MORPHO_LLTV=860000000000000000 \
///     forge script script/DeployAdapters.s.sol --broadcast --rpc-url ethereum_sepolia
contract DeployAdapters is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        string memory adapterType = vm.envString("ADAPTER_TYPE");

        vm.startBroadcast(deployerPrivateKey);

        if (_strEq(adapterType, "aave")) {
            _deployAave();
        } else if (_strEq(adapterType, "morpho")) {
            _deployMorpho();
        } else {
            revert("ADAPTER_TYPE must be 'aave' or 'morpho'");
        }

        vm.stopBroadcast();
    }

    function _deployAave() internal {
        address aavePool = vm.envAddress("AAVE_POOL");

        AaveV3Adapter adapter = new AaveV3Adapter(aavePool);
        console.log("AaveV3Adapter deployed:", address(adapter));
        console.log("  Aave Pool:", aavePool);
    }

    function _deployMorpho() internal {
        address morpho = vm.envAddress("MORPHO_ADDRESS");
        bytes32 marketId = vm.envBytes32("MORPHO_MARKET_ID");

        MarketParams memory marketParams = MarketParams({
            loanToken: vm.envAddress("MORPHO_LOAN_TOKEN"),
            collateralToken: vm.envAddress("MORPHO_COLLATERAL_TOKEN"),
            oracle: vm.envAddress("MORPHO_ORACLE"),
            irm: vm.envAddress("MORPHO_IRM"),
            lltv: vm.envUint("MORPHO_LLTV")
        });

        MorphoBlueAdapter adapter = new MorphoBlueAdapter(morpho, marketParams, marketId);
        console.log("MorphoBlueAdapter deployed:", address(adapter));
        console.log("  Morpho:", morpho);
        console.log("  Market ID:", vm.toString(marketId));
    }

    function _strEq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
