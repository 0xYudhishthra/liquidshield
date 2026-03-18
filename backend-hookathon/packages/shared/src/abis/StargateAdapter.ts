// StargateAdapter ABI — merged from StargateAdapter.sol (functions) + Events.sol (events)
// Refactored: multi-asset pool registry, all bridge functions now take _token param

export const StargateAdapterAbi = [
  // ============================================
  // EVENTS
  // ============================================
  {
    type: "event",
    name: "TokensBridged",
    inputs: [
      { name: "dstEid", type: "uint32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
      { name: "guid", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StargatePoolRegistered",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "StargatePoolRemoved",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: true },
    ],
  },

  // ============================================
  // FUNCTIONS — state-changing
  // ============================================
  {
    type: "function",
    name: "registerPool",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_pool", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removePool",
    inputs: [{ name: "_token", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "bridge",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_dstEid", type: "uint32" },
      { name: "_recipient", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_minAmount", type: "uint256" },
    ],
    outputs: [{ name: "guid", type: "bytes32" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "bridgeWithCompose",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_dstEid", type: "uint32" },
      { name: "_dstComposer", type: "address" },
      { name: "_composeMsg", type: "bytes" },
      { name: "_amount", type: "uint256" },
      { name: "_minAmount", type: "uint256" },
      { name: "_lzReceiveGas", type: "uint128" },
      { name: "_lzComposeGas", type: "uint128" },
    ],
    outputs: [{ name: "guid", type: "bytes32" }],
    stateMutability: "payable",
  },

  // ============================================
  // FUNCTIONS — view
  // ============================================
  {
    type: "function",
    name: "getPool",
    inputs: [{ name: "_token", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRegisteredTokens",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteBridgeFee",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_dstEid", type: "uint32" },
      { name: "_recipient", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_minAmount", type: "uint256" },
    ],
    outputs: [{ name: "fee", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quoteBridgeWithComposeFee",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_dstEid", type: "uint32" },
      { name: "_dstComposer", type: "address" },
      { name: "_composeMsg", type: "bytes" },
      { name: "_amount", type: "uint256" },
      { name: "_minAmount", type: "uint256" },
      { name: "_lzReceiveGas", type: "uint128" },
      { name: "_lzComposeGas", type: "uint128" },
    ],
    outputs: [{ name: "fee", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
