// CCTPAdapter ABI — from CCTPAdapter.sol + Events.sol

export const CCTPAdapterAbi = [
  // ============================================
  // EVENTS
  // ============================================
  {
    type: "event",
    name: "CCTPBridged",
    inputs: [
      { name: "dstDomain", type: "uint32", indexed: true },
      { name: "mintRecipient", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "nonce", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TokenMessengerSet",
    inputs: [
      { name: "oldMessenger", type: "address", indexed: true },
      { name: "newMessenger", type: "address", indexed: true },
    ],
  },

  // ============================================
  // FUNCTIONS — state-changing
  // ============================================
  {
    type: "function",
    name: "bridgeWithHook",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "dstDomain", type: "uint32" },
      { name: "mintRecipient", type: "address" },
      { name: "hookData", type: "bytes" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "setTokenMessenger",
    inputs: [{ name: "_tokenMessenger", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ============================================
  // FUNCTIONS — view
  // ============================================
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;
