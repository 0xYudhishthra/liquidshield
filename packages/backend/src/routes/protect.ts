import { Hono } from "hono";
import { createWalletClient, createPublicClient, http, encodeFunctionData, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const UNICHAIN_RPC = process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org";
const ROUTER_ADDRESS = process.env.LIQUIDSHIELD_ROUTER_ADDRESS || "0xa81344a8A6320Fc75095aF160CaCe5B47530E444";
const HOOK_ADDRESS = process.env.LIQUIDSHIELD_HOOK_ADDRESS || "0x0AA6345204931FE6E5748BdB0A17C8DfeD25d5c0";
// Note: update this if hook is redeployed

// Mock token addresses on Unichain Sepolia (for premium payment)
const MWETH = "0xD9cA9700DecEB91b61dAF48C8De7879C9Bfe9fe9";
const MUSDC = "0xFBC4BAD95C0E44F70631E6Df2ae6eDC97e7950C4";

// AaveV3Adapter on Base Sepolia
const AAVE_ADAPTER = "0x560010aEA084A62B3e666f7e48A190A299049129";

const ROUTER_ABI = [
  {
    name: "registerAndPayPremium",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { type: "bytes32", name: "positionId" },
      { type: "address", name: "collateralAsset" },
      { type: "address", name: "debtAsset" },
      { type: "uint256", name: "positionSize" },
      { type: "uint256", name: "healthThreshold" },
      { type: "uint8", name: "strategy" },
      { type: "uint256", name: "sourceChainId" },
      { type: "address", name: "lendingAdapter" },
      { type: "uint256", name: "premiumMonths" },
      { type: "address", name: "premiumToken" },
      { type: "uint256", name: "premiumAmount" },
    ],
    outputs: [],
  },
] as const;

const HOOK_ABI = [
  {
    name: "registerPosition",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { type: "bytes32", name: "positionId" },
      { type: "address", name: "onBehalfOf" },
      { type: "address", name: "collateralAsset" },
      { type: "address", name: "debtAsset" },
      { type: "uint256", name: "positionSize" },
      { type: "uint256", name: "healthThreshold" },
      { type: "uint8", name: "strategy" },
      { type: "uint256", name: "sourceChainId" },
      { type: "address", name: "lendingAdapter" },
      { type: "uint256", name: "premiumMonths" },
    ],
    outputs: [],
  },
] as const;

export const protectRoutes = new Hono();

protectRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { userAddress, signature, sourceChainId, strategy, healthThreshold } = body;

    if (!userAddress || !signature) {
      return c.json({ error: "Missing userAddress or signature" }, 400);
    }

    // Use deployer key to broadcast on Unichain (fronting gas for user)
    const pk = process.env.PRIVATE_KEY || process.env.FILLER_PRIVATE_KEY;
    if (!pk) {
      return c.json({ error: "Server not configured with broadcasting key" }, 500);
    }

    const account = privateKeyToAccount(pk as `0x${string}`);

    const walletClient = createWalletClient({
      account,
      chain: undefined,
      transport: http(UNICHAIN_RPC),
    });

    const publicClient = createPublicClient({
      transport: http(UNICHAIN_RPC),
    });

    // Generate unique position ID from user address + timestamp
    const positionId = keccak256(toBytes(`liquidshield:${userAddress}:${Date.now()}`));

    // Register position on the hook directly (using deployer as msg.sender)
    // The hook's registerPosition sets owner to msg.sender (our deployer)
    // For the demo, this is fine — in production, use the router with onBehalfOf delegation
    const hash = await walletClient.writeContract({
      chain: undefined,
      address: HOOK_ADDRESS as `0x${string}`,
      abi: HOOK_ABI,
      functionName: "registerPosition",
      args: [
        positionId as `0x${string}`,
        userAddress as `0x${string}`,
        MWETH as `0x${string}`,
        MUSDC as `0x${string}`,
        BigInt("200000000000000000"), // 0.2 ETH position size
        BigInt(healthThreshold || "1500000000000000000"),
        strategy || 1, // BATCHED_UNWIND
        BigInt(sourceChainId || 84532),
        AAVE_ADAPTER as `0x${string}`,
        BigInt(6), // 6 months
      ],
    });

    console.log(`Protection registered on Unichain for ${userAddress}: ${hash}`);

    // Wait for Unichain confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Also add to HealthChecker on Base Sepolia
    const BASE_RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com";
    const HEALTH_CHECKER = process.env.HEALTH_CHECKER_ADDRESS || "0x7D3692dd5B58f9B35fF5EcaAEc33b80CBB490038";

    try {
      const baseWalletClient = createWalletClient({
        account,
        chain: undefined,
        transport: http(BASE_RPC),
      });

      const hcHash = await baseWalletClient.writeContract({
        chain: undefined,
        address: HEALTH_CHECKER as `0x${string}`,
        abi: [{ name: "addPosition", type: "function", stateMutability: "nonpayable",
          inputs: [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }], outputs: [] }],
        functionName: "addPosition",
        args: [positionId as `0x${string}`, userAddress as `0x${string}`, BigInt(healthThreshold || "1500000000000000000")],
      });
      console.log(`Position added to HealthChecker on Base Sepolia: ${hcHash}`);
    } catch (hcError: any) {
      console.error("Failed to add to HealthChecker (non-fatal):", hcError.message);
    }

    return c.json({
      txHash: hash,
      positionId,
      status: receipt.status === "success" ? "protected" : "failed",
      chain: "Unichain Sepolia",
    });
  } catch (error: any) {
    console.error("Protection error:", error);
    return c.json({ error: error.message || "Failed to register protection" }, 500);
  }
});
