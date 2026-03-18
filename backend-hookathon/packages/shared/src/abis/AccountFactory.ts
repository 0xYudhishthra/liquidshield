// AccountFactory ABI — merged from api (functions) + Events.sol (events)

export const AccountFactoryAbi = [
  // ============================================
  // EVENTS
  // ============================================
  {
    type: "event",
    name: "AccountCreated",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "salt", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AccountImplementationUpgraded",
    inputs: [
      { name: "newImplementation", type: "address", indexed: true },
    ],
  },

  // ============================================
  // FUNCTIONS
  // ============================================
  {
    type: "function",
    name: "createAccount",
    inputs: [{ name: "signature", type: "bytes" }],
    outputs: [{ name: "account", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getAccount",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isAccount",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "accounts",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "AQUA",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "SWAP_VM_ROUTER",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "CREATEX",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "BEACON",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "upgradeAccountImplementation",
    inputs: [{ name: "newImpl", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;
