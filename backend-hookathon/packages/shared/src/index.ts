// @aqua0/shared — Single source of truth for ABIs, chain config, and addresses

// ABIs
export {
  AccountFactoryAbi,
  AccountAbi,
  RebalancerAbi,
  StargateAdapterAbi,
  ComposerAbi,
  BridgeRegistryAbi,
  CCTPAdapterAbi,
  CCTPComposerAbi,
  AquaAbi,
  SwapVMRouterAbi,
  ERC20Abi,
  AquaRouterAbi,
  LayerZeroEndpointV2Abi,
  StargatePoolAbi,
} from "./abis/index";

// Chain config
export {
  CHAIN_ID_TO_LZ_EID,
  LZ_EID_TO_CHAIN_ID,
  eidToChainId,
  chainIdToEid,
  getChainName,
  isSupportedChain,
} from "./chains";

// Addresses
export {
  EXTERNAL_ADDRESSES,
  CHAIN_ADDRESSES,
  type ChainAddresses,
} from "./addresses";
