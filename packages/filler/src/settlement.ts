import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_CONFIG } from "./config/chains";

const ABI = parseAbi(["function settle(bytes32,address) external"]);

export function createSettlement() {
  const account = privateKeyToAccount(
    (process.env.FILLER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001") as `0x${string}`
  );

  const walletClient = createWalletClient({
    account,
    transport: http(CHAIN_CONFIG.unichain.rpcUrl),
  });

  const publicClient = createPublicClient({
    transport: http(CHAIN_CONFIG.unichain.rpcUrl),
  });

  async function settle(orderId: string, _fillTxHash: string): Promise<string> {
    console.log(`Settling order ${orderId} on Unichain`);

    const hash = await walletClient.writeContract({
      chain: null,
      address: CHAIN_CONFIG.unichain.settlerAddress as `0x${string}`,
      abi: ABI,
      functionName: "settle",
      args: [orderId as `0x${string}`, account.address],
    });

    console.log(`Settlement tx submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") {
      throw new Error(`Settlement tx reverted: ${hash}`);
    }

    console.log(`Settlement confirmed in block ${receipt.blockNumber}`);
    return hash;
  }

  return { settle };
}
