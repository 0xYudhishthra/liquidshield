import { Hono } from "hono";
import { createPublicClient, http, type Address } from "viem";
import type { DefenseEvent, DefenseStrategy } from "../../../shared/src/types";
import HookABI from "../../../shared/src/abis/LiquidShieldHook.json";
import { getAllDefenseEvents } from "../services/defense-store";

export const defensesRoutes = new Hono();

const HOOK_ADDRESS = (process.env.LIQUIDSHIELD_HOOK_ADDRESS || "0x0000000000000000000000000000000000000000") as Address;
const RPC_URL = process.env.UNICHAIN_SEPOLIA_RPC_URL || "https://sepolia.unichain.org";

function getClient() {
  return createPublicClient({
    chain: {
      id: 1301,
      name: "Unichain Sepolia",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: { http: [RPC_URL] },
      },
    } as any,
    transport: http(RPC_URL),
  });
}

/** Map on-chain strategy enum (uint8) to our DefenseStrategy type. */
function mapStrategy(strategyNum: number): DefenseStrategy {
  return strategyNum === 0 ? "COLLATERAL_TOPUP" : "BATCHED_UNWIND";
}

/**
 * Fetch DefenseTriggered events from the hook contract on-chain.
 * We look back a configurable number of blocks (default: 10000).
 */
async function fetchOnChainDefenseEvents(): Promise<DefenseEvent[]> {
  try {
    const client = getClient();

    // If hook address is zero, skip on-chain fetch
    if (HOOK_ADDRESS === "0x0000000000000000000000000000000000000000") {
      return [];
    }

    const currentBlock = await client.getBlockNumber();
    const lookbackBlocks = BigInt(process.env.DEFENSE_LOOKBACK_BLOCKS || "10000");
    const fromBlock = currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;

    // Find the DefenseTriggered event in the ABI
    const defenseTriggeredEvent = (HookABI as any[]).find(
      (item: any) => item.type === "event" && item.name === "DefenseTriggered"
    );

    if (!defenseTriggeredEvent) {
      console.warn("DefenseTriggered event not found in Hook ABI");
      return [];
    }

    const logs = await client.getLogs({
      address: HOOK_ADDRESS,
      event: {
        type: "event",
        name: "DefenseTriggered",
        inputs: defenseTriggeredEvent.inputs,
      } as any,
      fromBlock,
      toBlock: "latest",
    });

    // Also fetch DefenseSettled events for fee info
    const defenseSettledEvent = (HookABI as any[]).find(
      (item: any) => item.type === "event" && item.name === "DefenseSettled"
    );

    let settledMap = new Map<string, { defenseAmount: bigint; feeCharged: bigint }>();
    if (defenseSettledEvent) {
      const settledLogs = await client.getLogs({
        address: HOOK_ADDRESS,
        event: {
          type: "event",
          name: "DefenseSettled",
          inputs: defenseSettledEvent.inputs,
        } as any,
        fromBlock,
        toBlock: "latest",
      });

      for (const log of settledLogs) {
        const args = log.args as any;
        if (args.positionId) {
          settledMap.set(args.positionId.toLowerCase(), {
            defenseAmount: args.defenseAmount || 0n,
            feeCharged: args.feeCharged || 0n,
          });
        }
      }
    }

    const events: DefenseEvent[] = [];
    for (const log of logs) {
      const args = log.args as any;
      const positionId: string = args.positionId || "0x";
      const strategy = Number(args.strategy || 0);
      const amount = args.amount || 0n;

      // Look up settlement info
      const settled = settledMap.get(positionId.toLowerCase());

      // Get block timestamp
      let timestamp = Date.now();
      try {
        if (log.blockNumber) {
          const block = await client.getBlock({ blockNumber: log.blockNumber });
          timestamp = Number(block.timestamp) * 1000;
        }
      } catch {
        // Use current time as fallback
      }

      events.push({
        positionId,
        strategy: mapStrategy(strategy),
        defenseAmount: amount.toString(),
        defenseFee: settled ? settled.feeCharged.toString() : "0",
        healthBefore: 0, // Not available from on-chain event alone
        healthAfter: 0,  // Not available from on-chain event alone
        timestamp,
        txHash: log.transactionHash || "0x",
        chainId: 1301,
      });
    }

    return events;
  } catch (error) {
    console.error("Error fetching on-chain defense events:", error);
    return [];
  }
}

defensesRoutes.get("/:address", async (c) => {
  const address = c.req.param("address");
  try {
    // Combine in-memory events (from webhooks) with on-chain events
    const [inMemoryEvents, onChainEvents] = await Promise.all([
      Promise.resolve(getAllDefenseEvents()),
      fetchOnChainDefenseEvents(),
    ]);

    // Deduplicate by txHash (prefer in-memory as they have more metadata)
    const seenTxHashes = new Set<string>();
    const combined: DefenseEvent[] = [];

    // In-memory events first (they have richer data from webhooks)
    for (const event of inMemoryEvents) {
      seenTxHashes.add(event.txHash.toLowerCase());
      combined.push(event);
    }

    // On-chain events that we haven't seen via webhooks
    for (const event of onChainEvents) {
      if (!seenTxHashes.has(event.txHash.toLowerCase())) {
        combined.push(event);
      }
    }

    // Sort by timestamp descending (most recent first)
    combined.sort((a, b) => b.timestamp - a.timestamp);

    // Filter by address if the address looks like it could be part of position IDs
    // Position IDs are bytes32, so we do a case-insensitive includes check
    const filtered = combined.filter(
      (e) => e.positionId.toLowerCase().includes(address.toLowerCase())
    );

    // If no matches by positionId inclusion, return all events
    // (the address might be the owner; we return all for now and let frontend filter)
    const result = filtered.length > 0 ? filtered : combined;

    return c.json({
      address,
      defenses: result,
      total: result.length,
    });
  } catch (error) {
    console.error("Error fetching defense history:", error);
    return c.json({ error: "Failed to fetch defense history" }, 500);
  }
});
