// ============================================
// Deployment Addresses
// Known contract addresses per chain
// ============================================

export interface ChainAddresses {
  aquaRouter: `0x${string}`;
  accountFactory: `0x${string}`;
  rebalancer: `0x${string}`;
  stargateAdapter: `0x${string}`;
  composer: `0x${string}`;
  bridgeRegistry: `0x${string}`;
  cctpAdapter: `0x${string}`;
  cctpComposer: `0x${string}`;
  layerZeroEndpoint: `0x${string}`;
  stargateEth: `0x${string}`;
  swapVMRouter: `0x${string}`;
}

// ============================================
// KNOWN EXTERNAL ADDRESSES (same across chains)
// ============================================

export const EXTERNAL_ADDRESSES = {
  /** 1inch Aqua Router — same on Base + Unichain */
  aquaRouter: "0x499943E74FB0cE105688beeE8Ef2ABec5D936d31" as const,
  /** LayerZero V2 Endpoint — same on all EVM chains */
  layerZeroEndpoint: "0x1a44076050125825900e736c501f859c50fE728c" as const,
  /** CreateX factory — same on 150+ chains */
  createX: "0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed" as const,
  /** SwapVM Router — same on Base + Unichain (CREATE2) */
  swapVMRouter: "0x8fDD04Dbf6111437B44bbca99C28882434e0958f" as const,
  /** CCTP MessageTransmitterV2 — same on Base + Unichain */
  messageTransmitterV2: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as const,
  /** CCTP TokenMessengerV2 — same on Base + Unichain */
  tokenMessengerV2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as const,
} as const;

// ============================================
// CHAIN-SPECIFIC ADDRESSES
// ============================================

export const CHAIN_ADDRESSES: Record<string, Partial<ChainAddresses>> = {
  base: {
    aquaRouter: EXTERNAL_ADDRESSES.aquaRouter,
    accountFactory: "0xC0A67bbCf454a5814FAE737d06E0685D7ff56a5c",
    rebalancer: "0xAd04477b98f3b3fb76cd283544dd31ECEa717587",
    stargateAdapter: "0xB25eA9b29C911a20A378334f70d8b6FF2bbD40B1",
    composer: "0x5201DFE7CEc811ad7712136a3AA443cc597265e9",
    bridgeRegistry: "0x2bc2aD4232fE1693d8b545BfFd59a77d58cEfF49",
    cctpAdapter: "0x2E2594fF7320D75509f84C7C7a9c71D64b93D06E",
    cctpComposer: "0x5AA3add57b677a8F113F9F957e382DA99cb035Bc",
    layerZeroEndpoint: EXTERNAL_ADDRESSES.layerZeroEndpoint,
    stargateEth: "0xdc181Bd607330aeeBEF6ea62e03e5e1Fb4B6F7C7",
    swapVMRouter: EXTERNAL_ADDRESSES.swapVMRouter,
  },
  unichain: {
    aquaRouter: EXTERNAL_ADDRESSES.aquaRouter,
    accountFactory: "0xC0A67bbCf454a5814FAE737d06E0685D7ff56a5c",
    rebalancer: "0x057B324AE00cf63D56F768810633890a6E5b881b",
    stargateAdapter: "0x12aFF61C83f68416e9bC8D6bCef77A03311e0A2a",
    composer: "0x2bc2aD4232fE1693d8b545BfFd59a77d58cEfF49",
    bridgeRegistry: "0x2694b4a7dc51eFc2c5F746e903260b43D33B6248",
    cctpAdapter: "0x32497DEF5d66bCe6D1267f271C425D3BB09B1776",
    cctpComposer: "0x4aA905A4eAbD249b0Fbb00251dDBc4dCd27Bbe2c",
    layerZeroEndpoint: "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B",
    stargateEth: "0xe9aBA835f813ca05E50A6C0ce65D0D74390F7dE7",
    swapVMRouter: EXTERNAL_ADDRESSES.swapVMRouter,
  },

  /**
   * Base Sepolia testnet (chainId: 84532)
   * Deployed by: 0xc929959b439b6FC2Eb53e7CeB602297fF3147146
   * Infra contracts: contracts/broadcast/DeployTestnet.s.sol/84532/run-latest.json
   * Aqua + SwapVM:   temp/aqua + temp/swap-vm broadcast/84532/run-latest.json
   * TODO: stargateEth, bridgeRegistry, cctpAdapter, cctpComposer — not yet on Base Sepolia
   */
  "base-sepolia": {
    aquaRouter: "0x8D341ff509B00fD894A39Dc0f25E0A20b8d7049F",
    accountFactory: "0xccd27f7f1c53a47aa86b18580bbb50182ffc0e81",
    rebalancer: "0x844f0a24c39253e201285c8d731ce14405a3b6ce",
    stargateAdapter: "0x2928ccd39be67ff21cfccf475a41d2cbfc2239e4",
    composer: "0x42484731fd3db1da859ef98bf7527aa914d0257a",
    layerZeroEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    swapVMRouter: "0x48feDe1F1968CB2C2F1B7525f7023f13F47f4D87",
  },

  /**
   * Unichain Sepolia testnet (chainId: 1301)
   * Deployed by: 0xc929959b439b6FC2Eb53e7CeB602297fF3147146
   * Infra contracts: contracts/broadcast/DeployTestnet.s.sol/1301/run-latest.json
   * Aqua + SwapVM:   temp/aqua + temp/swap-vm broadcast/1301/run-latest.json
   * TODO: stargateEth, bridgeRegistry, cctpAdapter, cctpComposer — not yet on Unichain Sepolia
   */
  "unichain-sepolia": {
    aquaRouter: "0x42484731fd3DB1DA859ef98bF7527Aa914d0257A",
    accountFactory: "0x38f7920b02bc0851a77ec0a010c82246568aefba",
    rebalancer: "0xccd27f7f1c53a47aa86b18580bbb50182ffc0e81",
    stargateAdapter: "0x8eafac15982b7c76fdc630679352867099561621",
    composer: "0x844f0a24c39253e201285c8d731ce14405a3b6ce",
    layerZeroEndpoint: "0xb8815f3f882614048CbE201a67eF9c6F10fe5035",
    swapVMRouter: "0x0C1fa25C8A5177A4b4B09478D2Bd69ebd62160aF",
  },
} as const;
