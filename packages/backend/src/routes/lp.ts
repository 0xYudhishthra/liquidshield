import { Hono } from "hono";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import type { LPEarnings } from "../../../shared/src/types";
import HookABI from "../../../shared/src/abis/LiquidShieldHook.json";

export const lpRoutes = new Hono();

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

/**
 * Read reserve balances and accumulated premiums from the hook contract.
 * Compute yield metrics for LP earnings.
 */
async function getHookMetrics(): Promise<{
  reserve0: bigint;
  reserve1: bigint;
  premiums0: bigint;
  premiums1: bigint;
  totalProtectedValue: bigint;
}> {
  const client = getClient();

  const [reserveResult, premiumsResult, totalProtectedResult] = await Promise.all([
    client.readContract({
      address: HOOK_ADDRESS,
      abi: HookABI as any,
      functionName: "getReserveBalances",
    }),
    client.readContract({
      address: HOOK_ADDRESS,
      abi: HookABI as any,
      functionName: "getAccumulatedPremiums",
    }),
    client.readContract({
      address: HOOK_ADDRESS,
      abi: HookABI as any,
      functionName: "totalProtectedValue",
    }),
  ]);

  const [reserve0, reserve1] = reserveResult as [bigint, bigint];
  const [premiums0, premiums1] = premiumsResult as [bigint, bigint];
  const totalProtectedValue = totalProtectedResult as bigint;

  return { reserve0, reserve1, premiums0, premiums1, totalProtectedValue };
}

/**
 * Read LP shares for a specific address from the hook contract.
 */
async function getLpShares(address: Address): Promise<bigint> {
  const client = getClient();
  const result = await client.readContract({
    address: HOOK_ADDRESS,
    abi: HookABI as any,
    functionName: "lpShares",
    args: [address],
  });
  return result as bigint;
}

/**
 * Fetch PremiumsDonated events to compute historical LP yield from defense fees.
 */
async function getHistoricalDonations(): Promise<{ totalDonated0: bigint; totalDonated1: bigint }> {
  const client = getClient();
  let totalDonated0 = 0n;
  let totalDonated1 = 0n;

  try {
    const premiumsDonatedEvent = (HookABI as any[]).find(
      (item: any) => item.type === "event" && item.name === "PremiumsDonated"
    );
    if (!premiumsDonatedEvent) return { totalDonated0, totalDonated1 };

    const currentBlock = await client.getBlockNumber();
    const lookbackBlocks = BigInt(process.env.LP_LOOKBACK_BLOCKS || "50000");
    const fromBlock = currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;

    const logs = await client.getLogs({
      address: HOOK_ADDRESS,
      event: {
        type: "event",
        name: "PremiumsDonated",
        inputs: premiumsDonatedEvent.inputs,
      } as any,
      fromBlock,
      toBlock: "latest",
    });

    for (const log of logs) {
      const args = log.args as any;
      totalDonated0 += args.amount0 || 0n;
      totalDonated1 += args.amount1 || 0n;
    }
  } catch (error) {
    console.error("Error fetching PremiumsDonated events:", error);
  }

  return { totalDonated0, totalDonated1 };
}

/**
 * Fetch DefenseSettled events to compute defense fee yield distributed to LPs.
 */
async function getHistoricalDefenseFees(): Promise<bigint> {
  const client = getClient();
  let totalFees = 0n;

  try {
    const defenseSettledEvent = (HookABI as any[]).find(
      (item: any) => item.type === "event" && item.name === "DefenseSettled"
    );
    if (!defenseSettledEvent) return totalFees;

    const currentBlock = await client.getBlockNumber();
    const lookbackBlocks = BigInt(process.env.LP_LOOKBACK_BLOCKS || "50000");
    const fromBlock = currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;

    const logs = await client.getLogs({
      address: HOOK_ADDRESS,
      event: {
        type: "event",
        name: "DefenseSettled",
        inputs: defenseSettledEvent.inputs,
      } as any,
      fromBlock,
      toBlock: "latest",
    });

    for (const log of logs) {
      const args = log.args as any;
      totalFees += args.feeCharged || 0n;
    }
  } catch (error) {
    console.error("Error fetching DefenseSettled events:", error);
  }

  return totalFees;
}

lpRoutes.get("/:address/earnings", async (c) => {
  const address = c.req.param("address") as Address;

  try {
    // If hook address is zero/unconfigured, return zeroes
    if (HOOK_ADDRESS === "0x0000000000000000000000000000000000000000") {
      return c.json({
        address,
        swapFees: "0",
        premiumYield: "0",
        defenseFeeYield: "0",
        totalYield: "0",
        apy: 0,
      } satisfies LPEarnings & { address: string });
    }

    const [metrics, lpShares, donations, defenseFees] = await Promise.all([
      getHookMetrics(),
      getLpShares(address),
      getHistoricalDonations(),
      getHistoricalDefenseFees(),
    ]);

    // Calculate the user's share proportion
    // Total reserve = reserve0 + reserve1 (simplified; in production would need price oracle)
    const totalReserve = metrics.reserve0 + metrics.reserve1;
    const userShareProportion = totalReserve > 0n && lpShares > 0n
      ? Number(lpShares) / Number(totalReserve)
      : 0;

    // Premium yield: user's share of accumulated premiums waiting to be donated
    const premiumYieldRaw = metrics.premiums0 + metrics.premiums1;
    const userPremiumYield = BigInt(Math.floor(Number(premiumYieldRaw) * userShareProportion));

    // Defense fee yield: user's share of historical defense fees (1.5% of defense amounts)
    const userDefenseFeeYield = BigInt(Math.floor(Number(defenseFees) * userShareProportion));

    // Swap fees are not directly tracked in the hook (they go through v4 pool natively)
    // We approximate from donated amounts minus premium-sourced donations
    const historicalDonationsTotal = donations.totalDonated0 + donations.totalDonated1;
    const userSwapFees = BigInt(Math.floor(Number(historicalDonationsTotal) * userShareProportion));

    // Total yield
    const totalYield = userSwapFees + userPremiumYield + userDefenseFeeYield;

    // APY calculation (annualized)
    // Simplified: (totalYield / userStake) * (365 / daysSinceLaunch)
    // For now we use a 30-day window estimate
    const userStake = lpShares;
    let apy = 0;
    if (userStake > 0n) {
      const yieldRatio = Number(totalYield) / Number(userStake);
      // Assume the lookback period covers ~30 days
      apy = yieldRatio * (365 / 30) * 100; // percentage
    }

    return c.json({
      address,
      swapFees: formatUnits(userSwapFees, 18),
      premiumYield: formatUnits(userPremiumYield, 18),
      defenseFeeYield: formatUnits(userDefenseFeeYield, 18),
      totalYield: formatUnits(totalYield, 18),
      apy,
    } satisfies LPEarnings & { address: string });
  } catch (error) {
    console.error("Error fetching LP earnings:", error);
    return c.json({ error: "Failed to fetch LP earnings" }, 500);
  }
});

lpRoutes.get("/stats", async (c) => {
  try {
    if (HOOK_ADDRESS === "0x0000000000000000000000000000000000000000") {
      return c.json({
        reserve0: "0",
        reserve1: "0",
        premiums0: "0",
        premiums1: "0",
        totalProtectedValue: "0",
      });
    }

    const metrics = await getHookMetrics();
    return c.json({
      reserve0: formatUnits(metrics.reserve0, 18),
      reserve1: formatUnits(metrics.reserve1, 18),
      premiums0: formatUnits(metrics.premiums0, 18),
      premiums1: formatUnits(metrics.premiums1, 18),
      totalProtectedValue: formatUnits(metrics.totalProtectedValue, 18),
    });
  } catch (error) {
    console.error("Error fetching LP stats:", error);
    return c.json({ error: "Failed to fetch LP stats" }, 500);
  }
});
