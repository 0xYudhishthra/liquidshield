// LayerZero V2 Endpoint ABI — copied from ponder abis/LayerZeroEndpointV2.ts
// Cross-chain messaging for rebalancing operations

export const LayerZeroEndpointV2Abi = [
  // ============================================
  // PACKET EVENTS
  // ============================================
  {
    type: "event",
    name: "PacketSent",
    inputs: [
      { name: "encodedPayload", type: "bytes", indexed: false },
      { name: "options", type: "bytes", indexed: false },
      { name: "sendLibrary", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PacketReceived",
    inputs: [
      {
        name: "origin",
        type: "tuple",
        indexed: false,
        components: [
          { name: "srcEid", type: "uint32" },
          { name: "sender", type: "bytes32" },
          { name: "nonce", type: "uint64" },
        ],
      },
      { name: "receiver", type: "address", indexed: false },
    ],
  },

  // ============================================
  // PACKET SENT DETAILED (from UltraLightNodeV2)
  // ============================================
  {
    type: "event",
    name: "PacketSentDetailed",
    inputs: [
      { name: "guid", type: "bytes32", indexed: true },
      { name: "dstEid", type: "uint32", indexed: false },
      { name: "sender", type: "address", indexed: true },
      { name: "nonce", type: "uint64", indexed: false },
      { name: "payloadHash", type: "bytes32", indexed: false },
      { name: "nativeFee", type: "uint256", indexed: false },
      { name: "lzTokenFee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PacketReceivedDetailed",
    inputs: [
      { name: "guid", type: "bytes32", indexed: true },
      { name: "srcEid", type: "uint32", indexed: false },
      { name: "receiver", type: "address", indexed: true },
    ],
  },

  // ============================================
  // VIEW FUNCTIONS
  // ============================================
  {
    type: "function",
    name: "eid",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
] as const;
