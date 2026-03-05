import { createPublicClient, http, parseAbiItem, decodeFunctionData } from "viem";
import { CHAIN_CONFIG } from "./config/chains";
import { EventEmitter } from "events";

// Settler ABI for decoding the open() function call
const settlerAbi = [
  {
    type: "function",
    name: "open",
    inputs: [
      { name: "positionId", type: "bytes32" },
      { name: "collateralAsset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "sourceChainId", type: "uint256" },
      { name: "lendingAdapter", type: "address" },
      { name: "strategy", type: "uint8" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "orderId", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
] as const;

export interface DefenseIntent {
  orderId: string;
  positionId: string;
  collateralAsset: string;
  amount: bigint;
  sourceChainId: number;
  lendingAdapter: string;
  strategy: number;
  user: string;
  timestamp: number;
}

export function createWatcher() {
  const emitter = new EventEmitter();
  const client = createPublicClient({ transport: http(CHAIN_CONFIG.unichain.rpcUrl) });
  let lastProcessedBlock = 0n;

  async function start() {
    console.log(`Watching for intents on Unichain at ${CHAIN_CONFIG.unichain.settlerAddress}`);

    // Initialize lastProcessedBlock to current block to avoid replaying old events
    const currentBlock = await client.getBlockNumber();
    lastProcessedBlock = currentBlock;
    console.log(`Starting from block ${lastProcessedBlock}`);

    setInterval(async () => {
      try {
        const latestBlock = await client.getBlockNumber();
        if (latestBlock <= lastProcessedBlock) return;

        const logs = await client.getLogs({
          address: CHAIN_CONFIG.unichain.settlerAddress as `0x${string}`,
          event: parseAbiItem(
            "event OrderOpened(bytes32 indexed orderId, address indexed swapper, uint256 nonce)"
          ),
          fromBlock: lastProcessedBlock + 1n,
          toBlock: latestBlock,
        });

        for (const log of logs) {
          try {
            const orderId = log.topics[1];
            if (!orderId || !log.transactionHash) {
              console.warn("Skipping log with missing orderId or txHash");
              continue;
            }

            // Fetch the transaction to decode the open() call parameters
            const tx = await client.getTransaction({ hash: log.transactionHash });
            const { args } = decodeFunctionData({
              abi: settlerAbi,
              data: tx.input,
            });

            const [positionId, collateralAsset, amount, sourceChainId, lendingAdapter, strategy, user] = args;

            const intent: DefenseIntent = {
              orderId,
              positionId,
              collateralAsset,
              amount,
              sourceChainId: Number(sourceChainId),
              lendingAdapter,
              strategy,
              user,
              timestamp: Date.now(),
            };

            console.log(
              `Decoded intent: orderId=${orderId}, position=${positionId}, chain=${intent.sourceChainId}, amount=${amount}, strategy=${strategy}`
            );
            emitter.emit("newIntent", intent);
          } catch (decodeError) {
            console.error(`Failed to decode intent from tx ${log.transactionHash}:`, decodeError);
          }
        }

        lastProcessedBlock = latestBlock;
      } catch (error) {
        console.error("Watcher poll error:", error);
      }
    }, 2000);
  }

  return { start, on: emitter.on.bind(emitter) };
}
