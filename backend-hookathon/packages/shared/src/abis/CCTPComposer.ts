// CCTPComposer ABI — from CCTPComposer.sol + Events.sol

export const CCTPComposerAbi = [
  // ============================================
  // EVENTS
  // ============================================
  {
    type: "event",
    name: "CCTPComposeReceived",
    inputs: [
      { name: "amount", type: "uint256", indexed: false },
      { name: "strategyHash", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "MessageTransmitterSet",
    inputs: [
      { name: "oldTransmitter", type: "address", indexed: true },
      { name: "newTransmitter", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "CCTPComposerTokenSet",
    inputs: [
      { name: "oldToken", type: "address", indexed: true },
      { name: "newToken", type: "address", indexed: true },
    ],
  },

  // ============================================
  // FUNCTIONS — state-changing
  // ============================================
  {
    type: "function",
    name: "relayAndCompose",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
      { name: "composePayload", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMessageTransmitter",
    inputs: [{ name: "_messageTransmitter", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setToken",
    inputs: [{ name: "_token", type: "address" }],
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
