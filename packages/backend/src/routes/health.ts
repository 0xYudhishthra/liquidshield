import { Hono } from "hono";
import { createPublicClient, http, type Address } from "viem";
import HookABI from "../../../shared/src/abis/LiquidShieldHook.json";
import { getAavePositions } from "../services/aave.service";
import { getMorphoPositions } from "../services/morpho.service";
import { CHAINS, CRITICAL_THRESHOLD, WARNING_THRESHOLD } from "../../../shared/src/constants";

export const healthRoutes = new Hono();

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

/** Map on-chain strategy enum to string. */
function mapStrategy(strategyNum: number): string {
  return strategyNum === 0 ? "COLLATERAL_TOPUP" : "BATCHED_UNWIND";
}

/** Map on-chain status enum to string. */
function mapStatus(statusNum: number): string {
  const statuses = ["ACTIVE", "DEFENDING", "UNWINDING", "CLOSED"];
  return statuses[statusNum] || "ACTIVE";
}

/** Determine protocol from chain ID. */
function protocolForChain(chainId: number): "aave" | "morpho" {
  // Arbitrum Sepolia => Aave V3, Ethereum Sepolia => Morpho Blue
  if (chainId === CHAINS.ARBITRUM_SEPOLIA) return "aave";
  if (chainId === CHAINS.ETHEREUM_SEPOLIA) return "morpho";
  // Default assumption: Aave
  return "aave";
}

/**
 * GET /:positionId
 * Read position from the hook contract, determine protocol/chain, call the
 * appropriate lending service to get the current health factor.
 */
healthRoutes.get("/:positionId", async (c) => {
  const positionId = c.req.param("positionId") as `0x${string}`;

  try {
    // If hook address is unconfigured, return a placeholder
    if (HOOK_ADDRESS === "0x0000000000000000000000000000000000000000") {
      return c.json({
        positionId,
        healthFactor: 0,
        status: "UNKNOWN",
        warning: "Hook contract address not configured",
        timestamp: Date.now(),
      });
    }

    const client = getClient();

    // Read position from hook contract
    const positionData = await client.readContract({
      address: HOOK_ADDRESS,
      abi: HookABI as any,
      functionName: "getPosition",
      args: [positionId],
    }) as any;

    const owner = positionData.owner as Address;
    const sourceChainId = Number(positionData.sourceChainId);
    const healthThreshold = Number(positionData.healthThreshold) / 1e18; // stored as 18-decimal fixed point
    const premiumPaidUntil = Number(positionData.premiumPaidUntil);
    const strategy = Number(positionData.strategy);
    const status = Number(positionData.status);

    // Check if position exists (owner != zero address)
    if (owner === "0x0000000000000000000000000000000000000000") {
      return c.json({ error: "Position not found" }, 404);
    }

    // Determine the protocol and fetch current health factor
    const protocol = protocolForChain(sourceChainId);
    let healthFactor = 0;

    if (protocol === "aave") {
      const positions = await getAavePositions(owner, sourceChainId);
      if (positions.length > 0) {
        // Account-level HF is the same across all positions from the Aave service
        healthFactor = positions[0].healthFactor;
      }
    } else {
      const positions = await getMorphoPositions(owner, sourceChainId);
      if (positions.length > 0) {
        // For Morpho, take the minimum HF across all positions as the most at-risk
        healthFactor = Math.min(...positions.map((p) => p.healthFactor));
      }
    }

    // Determine risk level
    let riskLevel: "SAFE" | "WARNING" | "CRITICAL" | "LIQUIDATABLE" = "SAFE";
    if (healthFactor <= 1.0) {
      riskLevel = "LIQUIDATABLE";
    } else if (healthFactor <= CRITICAL_THRESHOLD) {
      riskLevel = "CRITICAL";
    } else if (healthFactor <= WARNING_THRESHOLD) {
      riskLevel = "WARNING";
    }

    const isPremiumActive = premiumPaidUntil > Math.floor(Date.now() / 1000);

    return c.json({
      positionId,
      owner,
      protocol,
      sourceChainId,
      healthFactor: healthFactor === Infinity ? 999 : healthFactor,
      healthThreshold,
      riskLevel,
      strategy: mapStrategy(strategy),
      status: mapStatus(status),
      premiumPaidUntil,
      isPremiumActive,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error fetching position health:", error);
    return c.json({ error: "Failed to fetch position health" }, 500);
  }
});

/**
 * GET /check/:address
 * Quick health check across all positions for a given user address.
 * Aggregates from Aave and Morpho across all supported chains.
 */
healthRoutes.get("/check/:address", async (c) => {
  const address = c.req.param("address");

  try {
    const [aaveArbitrum, morphoEthereum] = await Promise.all([
      getAavePositions(address, CHAINS.ARBITRUM_SEPOLIA),
      getMorphoPositions(address, CHAINS.ETHEREUM_SEPOLIA),
    ]);

    const allPositions: any[] = [...aaveArbitrum, ...morphoEthereum];
    const lowestHF = allPositions.length > 0
      ? Math.min(...allPositions.map((p: any) => p.healthFactor === Infinity ? 999 : p.healthFactor))
      : 0;

    let overallRisk: "SAFE" | "WARNING" | "CRITICAL" | "LIQUIDATABLE" | "NO_POSITIONS" = "NO_POSITIONS";
    if (allPositions.length > 0) {
      if (lowestHF <= 1.0) overallRisk = "LIQUIDATABLE";
      else if (lowestHF <= CRITICAL_THRESHOLD) overallRisk = "CRITICAL";
      else if (lowestHF <= WARNING_THRESHOLD) overallRisk = "WARNING";
      else overallRisk = "SAFE";
    }

    return c.json({
      address,
      totalPositions: allPositions.length,
      lowestHealthFactor: lowestHF,
      overallRisk,
      positions: allPositions.map((p: any) => ({
        protocol: p.protocol,
        chainId: p.chainId,
        healthFactor: p.healthFactor === Infinity ? 999 : p.healthFactor,
        collateralSymbol: p.collateralSymbol,
        debtSymbol: p.debtSymbol || p.collateralSymbol,
      })),
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error checking health:", error);
    return c.json({ error: "Failed to check health" }, 500);
  }
});
