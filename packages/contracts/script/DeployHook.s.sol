// SPDX-License-Identifier: MIT
pragma solidity >=0.8.26;

import "forge-std/Script.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {LiquidShieldHook} from "../src/hooks/LiquidShieldHook.sol";
import {LiquidShieldRouter} from "../src/router/LiquidShieldRouter.sol";
import {LiquidShieldSettler} from "../src/settler/LiquidShieldSettler.sol";
import {SharedLiquidityPool} from "../src/aqua0/SharedLiquidityPool.sol";

/// @notice Deploys LiquidShieldHook (with CREATE2 salt mining), Settler, and Router to Unichain Sepolia
contract DeployHook is Script {
    address constant POOL_MANAGER = 0x00B036B58a818B1BC34d502D3fE730Db729e62AC;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // SharedLiquidityPool: deploy fresh or use existing
        address sharedPoolAddr = vm.envOr("SHARED_LIQUIDITY_POOL", address(0));

        vm.startBroadcast(deployerPrivateKey);

        // Deploy SharedLiquidityPool if not provided
        SharedLiquidityPool sharedPool;
        if (sharedPoolAddr == address(0)) {
            sharedPool = new SharedLiquidityPool(deployer);
            console.log("SharedLiquidityPool deployed:", address(sharedPool));
        } else {
            sharedPool = SharedLiquidityPool(payable(sharedPoolAddr));
            console.log("SharedLiquidityPool (existing):", sharedPoolAddr);
        }

        // Mine CREATE2 salt for correct hook address flags
        uint160 hookFlags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG
                | Hooks.AFTER_ADD_LIQUIDITY_FLAG
                | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG
                | Hooks.AFTER_SWAP_FLAG
        );

        bytes memory creationCode = type(LiquidShieldHook).creationCode;
        bytes memory constructorArgs = abi.encode(POOL_MANAGER, address(sharedPool));
        bytes memory initCode = abi.encodePacked(creationCode, constructorArgs);
        bytes32 initCodeHash = keccak256(initCode);

        // Find a salt where the deployed address has the correct flag bits
        address hookAddress;
        bytes32 salt;
        for (uint256 i = 0; i < 100000; i++) {
            salt = bytes32(i);
            hookAddress = _computeCreate2Address(deployer, salt, initCodeHash);
            if (uint160(hookAddress) & hookFlags == hookFlags) break;
            if (i == 99999) revert("Could not find valid salt in 100000 iterations");
        }
        console.log("Found salt:", vm.toString(salt));
        console.log("Expected hook address:", hookAddress);

        // Deploy hook via CREATE2
        LiquidShieldHook hook;
        assembly {
            hook := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        require(address(hook) == hookAddress, "CREATE2 address mismatch");
        console.log("Hook deployed:", address(hook));

        // No registration needed - SharedLiquidityPool's onlyHook modifier
        // checks ERC165 supportsInterface on msg.sender dynamically
        console.log("Hook implements IAqua0BaseHookMarker - permissionless access to SharedLiquidityPool");

        // Deploy Settler and Router
        LiquidShieldSettler settler = new LiquidShieldSettler(address(hook));
        LiquidShieldRouter router = new LiquidShieldRouter(address(hook));

        // Wire settler into hook
        hook.setSettler(address(settler));
        hook.setAuthorizedRouter(address(router));

        console.log("Settler deployed:", address(settler));
        console.log("Router deployed:", address(router));

        vm.stopBroadcast();
    }

    function _computeCreate2Address(address deployer, bytes32 _salt, bytes32 _initCodeHash)
        internal
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, _salt, _initCodeHash)))));
    }
}
