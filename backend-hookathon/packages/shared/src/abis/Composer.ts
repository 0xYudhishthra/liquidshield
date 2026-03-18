// Composer ABI — merged from Composer.sol (functions) + Events.sol (events)
// Refactored: multi-asset pool registry (pool → token mapping)

export const ComposerAbi = [
  // ============================================
  // EVENTS
  // ============================================
  {
    type: "event",
    name: "ComposeReceived",
    inputs: [
      { name: "guid", type: "bytes32", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "strategyHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LzEndpointSet",
    inputs: [
      { name: "oldEndpoint", type: "address", indexed: true },
      { name: "newEndpoint", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "ComposerPoolRegistered",
    inputs: [
      { name: "stargatePool", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "ComposerPoolRemoved",
    inputs: [
      { name: "stargatePool", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
    ],
  },

  // ============================================
  // FUNCTIONS — state-changing
  // ============================================
  {
    type: "function",
    name: "registerPool",
    inputs: [
      { name: "_stargatePool", type: "address" },
      { name: "_token", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removePool",
    inputs: [{ name: "_stargatePool", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setLzEndpoint",
    inputs: [{ name: "_lzEndpoint", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "lzCompose",
    inputs: [
      { name: "_from", type: "address" },
      { name: "_guid", type: "bytes32" },
      { name: "_message", type: "bytes" },
      { name: "_executor", type: "address" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "payable",
  },

  // ============================================
  // FUNCTIONS — view
  // ============================================
  {
    type: "function",
    name: "getToken",
    inputs: [{ name: "_stargatePool", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRegisteredPools",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "LZ_ENDPOINT",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;
