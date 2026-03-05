import HookABI from "../../../shared/src/abis/LiquidShieldHook.json";
import RouterABI from "../../../shared/src/abis/LiquidShieldRouter.json";
import SettlerABI from "../../../shared/src/abis/LiquidShieldSettler.json";

export const CONTRACTS = {
  hook: {
    address: (process.env.NEXT_PUBLIC_HOOK_ADDRESS || "0x") as `0x${string}`,
    chainId: 1301,
  },
  router: {
    address: (process.env.NEXT_PUBLIC_ROUTER_ADDRESS || "0x") as `0x${string}`,
    chainId: 1301,
  },
  settler: {
    address: (process.env.NEXT_PUBLIC_SETTLER_ADDRESS || "0x") as `0x${string}`,
    chainId: 1301,
  },
} as const;

export const HOOK_ABI = HookABI;
export const ROUTER_ABI = RouterABI;
export const SETTLER_ABI = SettlerABI;
