import { createPublicClient, http, parseAbiItem, parseAbi } from "viem";
import { CHAIN_CONFIG } from "./config/chains";
import { EventEmitter } from "events";

// Hook ABI for reading position data
const hookAbi = parseAbi([
  "function getPosition(bytes32) view returns (address owner, address collateralAsset, address debtAsset, address lendingAdapter, uint256 positionSize, uint256 healthThreshold, uint256 sourceChainId, uint256 premiumPaidUntil, uint8 strategy, uint8 status)",
]);

// DefenseTriggered event from the hook — carries the actual intent data
const defenseTriggeredAbi = parseAbi([
  "event DefenseTriggered(bytes32 indexed positionId, uint8 strategy, uint256 defenseAmount)",
]);

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

    // Start from a few blocks back to catch recent events (configurable via env)
    const currentBlock = await client.getBlockNumber();
    const lookback = BigInt(process.env.FILLER_LOOKBACK_BLOCKS || "0");
    lastProcessedBlock = currentBlock - lookback;
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
            const userAddr = log.topics[2];
            if (!orderId || !log.transactionHash) {
              console.warn("Skipping log with missing orderId or txHash");
              continue;
            }

            // Get the DefenseTriggered event from the same tx to find positionId + amount
            const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
            const defenseTriggerTopic = "0xeb2ba87705996bff367bfa3aef22af25c28b1208d88bf96c23ceec8261c4a13f"; // DefenseTriggered
            const defenseLog = receipt.logs.find((l: any) => l.topics[0] === defenseTriggerTopic);

            if (!defenseLog) {
              console.warn(`No DefenseTriggered event found in tx ${log.transactionHash}`);
              continue;
            }

            const positionId = defenseLog.topics[1] as string;

            // Read position data from the hook contract
            const hookAddress = CHAIN_CONFIG.unichain.hookAddress as `0x${string}`;
            const posData = await client.readContract({
              address: hookAddress,
              abi: hookAbi,
              functionName: "getPosition",
              args: [positionId as `0x${string}`],
            });

            const [owner, collateralAsset, , lendingAdapter, positionSize, , sourceChainId, , strategy] = posData;

            // Decode defenseAmount from DefenseTriggered event data
            // DefenseTriggered(bytes32 indexed positionId, uint8 strategy, uint256 defenseAmount)
            // data = abi.encode(uint8 strategy, uint256 defenseAmount)
            // strategy is at bytes 0-31, defenseAmount at bytes 32-63
            const defenseAmount = BigInt("0x" + defenseLog.data.slice(66, 130));

            const intent: DefenseIntent = {
              orderId,
              positionId,
              collateralAsset,
              amount: defenseAmount,
              sourceChainId: Number(sourceChainId),
              lendingAdapter,
              strategy: Number(strategy),
              user: owner,
              timestamp: Date.now(),
            };

            console.log(
              `Decoded intent: orderId=${orderId}, position=${positionId.slice(0, 16)}..., chain=${intent.sourceChainId}, amount=${defenseAmount}, strategy=${intent.strategy}`
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
