// Account ABI — merged from Account.sol (functions) + Events.sol (events)

export const AccountAbi = [
  // ============================================
  // EVENTS
  // ============================================
  {
    type: "event",
    name: "RebalancerAuthorized",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "rebalancer", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "RebalancerRevoked",
    inputs: [{ name: "account", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "to", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SwapVMRouterSet",
    inputs: [
      { name: "oldRouter", type: "address", indexed: true },
      { name: "newRouter", type: "address", indexed: true },
    ],
  },

  // ============================================
  // FUNCTIONS — initialization
  // ============================================
  {
    type: "function",
    name: "initialize",
    inputs: [
      { name: "_owner", type: "address" },
      { name: "factory_", type: "address" },
      { name: "aqua_", type: "address" },
      { name: "_swapVMRouter", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ============================================
  // FUNCTIONS — state-changing
  // ============================================
  {
    type: "function",
    name: "ship",
    inputs: [
      { name: "strategyBytes", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ name: "strategyHash", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "dock",
    inputs: [{ name: "strategyHash", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approveAqua",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setSwapVMRouter",
    inputs: [{ name: "_swapVMRouter", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "authorizeRebalancer",
    inputs: [{ name: "_rebalancer", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeRebalancer",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawETH",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "onCrosschainDeposit",
    inputs: [
      { name: "strategyBytes", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ name: "strategyHash", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "bridgeStargate",
    inputs: [
      { name: "_dstEid", type: "uint32" },
      { name: "_dstComposer", type: "address" },
      { name: "_composeMsg", type: "bytes" },
      { name: "_token", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_minAmount", type: "uint256" },
      { name: "_lzReceiveGas", type: "uint128" },
      { name: "_lzComposeGas", type: "uint128" },
    ],
    outputs: [{ name: "guid", type: "bytes32" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "bridgeCCTP",
    inputs: [
      { name: "dstDomain", type: "uint32" },
      { name: "dstComposer", type: "address" },
      { name: "hookData", type: "bytes" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
    stateMutability: "payable",
  },

  // ============================================
  // FUNCTIONS — view
  // ============================================
  {
    type: "function",
    name: "getRawBalance",
    inputs: [
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
    name: "getStrategyTokens",
    inputs: [{ name: "strategyHash", type: "bytes32" }],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getTokenBalance",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "FACTORY",
    inputs: [],
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
    name: "swapVMRouter",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rebalancer",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "rebalancerAuthorized",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;
