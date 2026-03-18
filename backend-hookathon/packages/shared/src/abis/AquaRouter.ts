// AquaRouter ABI — copied from ponder abis/AquaRouter.ts
// 1inch Aqua Protocol: strategies, virtual balances, and swap execution

export const AquaRouterAbi = [
  // ============================================
  // STRATEGY EVENTS
  // ============================================
  {
    type: "event",
    name: "StrategyRegistered",
    inputs: [
      { name: "strategyHash", type: "bytes32", indexed: true },
      { name: "app", type: "address", indexed: true },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "bytecode", type: "bytes", indexed: false },
      { name: "feeRecipient", type: "address", indexed: false },
      { name: "feeBps", type: "uint16", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StrategyShipped",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "app", type: "address", indexed: true },
      { name: "strategyHash", type: "bytes32", indexed: true },
      { name: "tokens", type: "address[]", indexed: false },
      { name: "amounts", type: "uint256[]", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StrategyDocked",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "app", type: "address", indexed: true },
      { name: "strategyHash", type: "bytes32", indexed: true },
      { name: "tokens", type: "address[]", indexed: false },
      { name: "amounts", type: "uint256[]", indexed: false },
    ],
  },

  // ============================================
  // SWAP EVENTS
  // ============================================
  {
    type: "event",
    name: "SwapExecuted",
    inputs: [
      { name: "taker", type: "address", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "strategyHash", type: "bytes32", indexed: true },
      { name: "app", type: "address", indexed: false },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
      { name: "protocolFee", type: "uint256", indexed: false },
      { name: "lpFee", type: "uint256", indexed: false },
    ],
  },

  // ============================================
  // TOKEN SETTLEMENT EVENTS (Pull/Push Pattern)
  // ============================================
  {
    type: "event",
    name: "TokenPulled",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "app", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TokenPushed",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "app", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },

  // ============================================
  // BALANCE EVENTS
  // ============================================
  {
    type: "event",
    name: "BalanceUpdated",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "app", type: "address", indexed: true },
      { name: "strategyHash", type: "bytes32", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "newBalance", type: "uint256", indexed: false },
    ],
  },

  // ============================================
  // DELEGATE EVENTS
  // ============================================
  {
    type: "event",
    name: "DelegateUpdated",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "delegate", type: "address", indexed: true },
      { name: "authorized", type: "bool", indexed: false },
    ],
  },

  // ============================================
  // VIEW FUNCTIONS
  // ============================================
  {
    type: "function",
    name: "balances",
    inputs: [
      { name: "maker", type: "address" },
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "strategies",
    inputs: [{ name: "strategyHash", type: "bytes32" }],
    outputs: [
      { name: "app", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "feeBps", type: "uint16" },
      { name: "isActive", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "delegates",
    inputs: [
      { name: "maker", type: "address" },
      { name: "delegate", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;
