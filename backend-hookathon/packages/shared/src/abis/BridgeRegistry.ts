// BridgeRegistry ABI — from BridgeRegistry.sol + Events.sol

export const BridgeRegistryAbi = [
  // ============================================
  // EVENTS
  // ============================================
  {
    type: "event",
    name: "AdapterSet",
    inputs: [
      { name: "key", type: "bytes32", indexed: true },
      { name: "adapter", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AdapterRemoved",
    inputs: [
      { name: "key", type: "bytes32", indexed: true },
      { name: "oldAdapter", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "ComposerAdded",
    inputs: [{ name: "composer", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "ComposerRemoved",
    inputs: [{ name: "composer", type: "address", indexed: true }],
  },

  // ============================================
  // FUNCTIONS — state-changing
  // ============================================
  {
    type: "function",
    name: "setAdapter",
    inputs: [
      { name: "key", type: "bytes32" },
      { name: "adapter", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeAdapter",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addComposer",
    inputs: [{ name: "composer", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeComposer",
    inputs: [{ name: "composer", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ============================================
  // FUNCTIONS — view
  // ============================================
  {
    type: "function",
    name: "getAdapter",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isTrustedComposer",
    inputs: [{ name: "composer", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;
