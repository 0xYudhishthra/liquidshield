import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig } from "../config/chains";
import type { DefenseIntent } from "../watcher";

const EXECUTOR_ABI = parseAbi([
  "function executeDefense(bytes32 positionId, address lendingAdapter, address user, address collateralAsset, uint256 collateralAmount, uint8 strategy) external",
]);

/**
 * Executes a collateral top-up defense (strategy=0) on the source chain.
 * Calls DefenseExecutor.executeDefense() with strategy 0.
 */
export async function executeCollateralTopup(intent: DefenseIntent): Promise<string> {
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

  console.log(
    `Executing collateral top-up: position=${intent.positionId}, adapter=${intent.lendingAdapter}, user=${intent.user}, asset=${intent.collateralAsset}, amount=${intent.amount}, chain=${config.name}`
  );

  const hash = await walletClient.writeContract({
    chain: null,
    address: config.executorAddress as `0x${string}`,
    abi: EXECUTOR_ABI,
    functionName: "executeDefense",
    args: [
      intent.positionId as `0x${string}`,
      intent.lendingAdapter as `0x${string}`,
      intent.user as `0x${string}`,
      intent.collateralAsset as `0x${string}`,
      intent.amount,
      0, // strategy: COLLATERAL_TOPUP
    ],
  });

  console.log(`Collateral top-up tx submitted: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    throw new Error(`Collateral top-up tx reverted: ${hash}`);
  }

  console.log(`Collateral top-up confirmed in block ${receipt.blockNumber}`);
  return hash;
}
