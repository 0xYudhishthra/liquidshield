// Aqua ABI — copied from api/abis.ts (1inch Aqua protocol — read-only subset)

export const AquaAbi = [
  {
    type: "function",
    name: "rawBalances",
    inputs: [
      { name: "maker", type: "address" },
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "token", type: "address" },
    ],
    outputs: [
      { name: "balance", type: "uint248" },
      { name: "tokensCount", type: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "safeBalances",
    inputs: [
      { name: "maker", type: "address" },
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
    ],
    outputs: [
      { name: "balance0", type: "uint256" },
      { name: "balance1", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;
