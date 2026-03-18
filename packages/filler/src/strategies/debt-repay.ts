import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "../config/chains";
import type { DefenseIntent } from "../watcher";

const EXECUTOR_ABI = parseAbi([
  "function executeDefense(bytes32 positionId, address lendingAdapter, address user, address collateralAsset, uint256 collateralAmount, uint8 strategy) external",
]);

// Map Unichain mock tokens to real Base Sepolia tokens
const TOKEN_MAP: Record<string, string> = {
  "0xd9ca9700deceb91b61daf48c8de7879c9bfe9fe9": "0x4200000000000000000000000000000000000006", // mWETH → WETH
  "0xfbc4bad95c0e44f70631e6df2ae6edc97e7950c4": "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f", // mUSDC → USDC
};

function mapToken(unichainToken: string): string {
  return TOKEN_MAP[unichainToken.toLowerCase()] || unichainToken;
}

/**
 * Executes a batched unwind defense (strategy=1) on the source chain.
 * Maps Unichain mock tokens to real Base Sepolia tokens.
 * Calls DefenseExecutor.executeDefense() with strategy 1.
 */
export async function executeBatchedUnwind(intent: DefenseIntent): Promise<string> {
  const config = getChainConfig(intent.sourceChainId);
  if (!config) {
    throw new Error(`No chain config for chainId ${intent.sourceChainId}`);
  }

  const account = privateKeyToAccount(
    (process.env.FILLER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001") as `0x${string}`
  );

  const walletClient = createWalletClient({
    account,
    transport: http(config.rpcUrl),
  });

  const publicClient = createPublicClient({
    transport: http(config.rpcUrl),
  });

  // Map Unichain mock token to real Base Sepolia token
  const realAsset = mapToken(intent.collateralAsset);

  console.log(
    `Executing batched unwind: position=${intent.positionId}, adapter=${intent.lendingAdapter}, user=${intent.user}, asset=${realAsset} (mapped from ${intent.collateralAsset}), amount=${intent.amount}, chain=${config.name}`
  );

  // Approve executor to pull filler's tokens
  const ERC20_ABI = parseAbi(["function approve(address spender, uint256 amount) external returns (bool)"]);
  await walletClient.writeContract({
    chain: null,
    address: realAsset as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [config.executorAddress as `0x${string}`, intent.amount],
  });

  // Execute via DefenseExecutor with COLLATERAL_TOPUP (strategy 0)
  // The executor does: transferFrom(filler) → approve(adapter) → adapter.depositCollateral(user)
  // This supplies the filler's WETH to Aave, improving the user's health factor
  const hash = await walletClient.writeContract({
    chain: null,
    address: config.executorAddress as `0x${string}`,
    abi: EXECUTOR_ABI,
    functionName: "executeDefense",
    args: [
      intent.positionId as `0x${string}`,
      intent.lendingAdapter as `0x${string}`,
      intent.user as `0x${string}`,
      realAsset as `0x${string}`,
      intent.amount,
      0, // COLLATERAL_TOPUP — deposit filler's WETH to improve user's HF
    ],
  });

  console.log(`Batched unwind tx submitted: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    throw new Error(`Batched unwind tx reverted: ${hash}`);
  }

  console.log(`Batched unwind confirmed in block ${receipt.blockNumber}`);
  return hash;
}
