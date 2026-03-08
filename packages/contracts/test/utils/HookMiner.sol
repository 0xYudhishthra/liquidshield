// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library HookMiner {
    function find(address deployer, uint160 flags, bytes memory creationCode, bytes memory constructorArgs) internal pure returns (address, bytes32) {
        bytes memory initCode = abi.encodePacked(creationCode, constructorArgs);
        bytes32 initCodeHash = keccak256(initCode);
        for (uint256 i = 0; i < 10000; i++) {
            bytes32 salt = bytes32(i);
            address hookAddress = computeAddress(deployer, salt, initCodeHash);
            if (uint160(hookAddress) & flags == flags) return (hookAddress, salt);
        }
        revert("HookMiner: could not find salt");
    }

    function computeAddress(address deployer, bytes32 salt, bytes32 initCodeHash) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }
}
