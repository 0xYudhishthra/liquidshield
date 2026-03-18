// Rebalancer ABI — merged from Rebalancer.sol (functions) + Events.sol (events)

export const RebalancerAbi = [
  // ============================================
  // EVENTS
  // ============================================
  {
    type: "event",
    name: "RebalanceTriggered",
    inputs: [
      { name: "operationId", type: "bytes32", indexed: true },
      { name: "lpAccount", type: "address", indexed: true },
      { name: "srcChainId", type: "uint32", indexed: false },
      { name: "dstChainId", type: "uint32", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RebalanceCompleted",
    inputs: [
      { name: "operationId", type: "bytes32", indexed: true },
      { name: "messageGuid", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "RebalanceFailed",
    inputs: [
      { name: "operationId", type: "bytes32", indexed: true },
      { name: "reason", type: "string", indexed: false },
    ],
  },

  // ============================================
  // FUNCTIONS — initialization
  // ============================================
  {
    type: "function",
    name: "initialize",
    inputs: [{ name: "_owner", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ============================================
  // FUNCTIONS — state-changing
  // ============================================
  {
    type: "function",
    name: "setRebalancer",
    inputs: [{ name: "_rebalancer", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "triggerRebalance",
    inputs: [
      { name: "lpAccount", type: "address" },
      { name: "srcChainId", type: "uint32" },
      { name: "dstChainId", type: "uint32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "operationId", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "executeDock",
    inputs: [
      { name: "operationId", type: "bytes32" },
      { name: "strategyHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "executeBridgeStargate",
    inputs: [
      { name: "operationId", type: "bytes32" },
      { name: "dstEid", type: "uint32" },
      { name: "dstComposer", type: "address" },
      { name: "composeMsg", type: "bytes" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "minAmount", type: "uint256" },
      { name: "lzReceiveGas", type: "uint128" },
      { name: "lzComposeGas", type: "uint128" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "executeBridgeCCTP",
    inputs: [
      { name: "operationId", type: "bytes32" },
      { name: "dstDomain", type: "uint32" },
      { name: "dstComposer", type: "address" },
      { name: "hookData", type: "bytes" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "recordBridging",
    inputs: [
      { name: "operationId", type: "bytes32" },
      { name: "messageGuid", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "confirmRebalance",
    inputs: [{ name: "operationId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "failRebalance",
    inputs: [
      { name: "operationId", type: "bytes32" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ============================================
  // FUNCTIONS — view
  // ============================================
  {
    type: "function",
    name: "getOperation",
    inputs: [{ name: "operationId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "lpAccount", type: "address" },
          { name: "srcChainId", type: "uint32" },
          { name: "dstChainId", type: "uint32" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "messageGuid", type: "bytes32" },
          { name: "status", type: "uint8" },
          { name: "initiatedAt", type: "uint256" },
          { name: "completedAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "operationExists",
    inputs: [{ name: "operationId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
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
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;
