// ============================================
// V4 Pools Routes — Registry of Aqua0-enabled pools
// For MVP: pools are defined in a static config + on-chain slot0 is fetched live
// ============================================

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../index";
import {
    getV4Client, getV4Addresses, readPoolSlot0, computePoolId, readAggregatedPositions,
    readPoolLiquidity, quoteExactInput,
} from "../contracts/v4-client";
import { PoolManagerAbi } from "../contracts/v4-abis";

// ─── Static pool registry ──────────────────────────────────────────────────────
// Pools that have the Aqua0 hook registered. Add new pools here when deployed.
// token0 < token1 alphabetically (V4 requirement).

export interface PoolRegistryEntry {
    poolKey: {
        currency0: `0x${string}`;
        currency1: `0x${string}`;
        fee: number;
        tickSpacing: number;
        hooks: `0x${string}`; // will be replaced by deployed hook address
    };
    token0Symbol: string;
    token1Symbol: string;
    token0Decimals: number;
    token1Decimals: number;
    label: string;
}

// For local anvil dev, hook address is filled in at runtime from deployment JSON.
// For testnets, these are the known deployed hooks.
const ZERO = "0x0000000000000000000000000000000000000000" as const;

const POOL_REGISTRY: Record<number, PoolRegistryEntry[]> = {
    // Base Sepolia — testnet WETH/USDC pool with Aqua0 hook
    84532: [
        {
            poolKey: {
                currency0: "0x4200000000000000000000000000000000000006", // WETH
                currency1: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC
                fee: 3000,
                tickSpacing: 60,
                hooks: ZERO, // set at runtime from deployment JSON
            },
            token0Symbol: "WETH",
            token1Symbol: "USDC",
            token0Decimals: 18,
            token1Decimals: 6,
            label: "WETH / USDC (0.3%)",
        },
    ],
    // Unichain Sepolia — LiquidShield pools only
    1301: [
        {
            poolKey: {
                // token0 < token1 by address: mWETH 0xD9cA < mUSDC 0xFBC4
                currency0: "0xD9cA9700DecEB91b61dAF48C8De7879C9Bfe9fe9", // mWETH
                currency1: "0xFBC4BAD95C0E44F70631E6Df2ae6eDC97e7950C4", // mUSDC
                fee: 8388608, // DYNAMIC_FEE_FLAG (0x800000)
                tickSpacing: 60,
                hooks: "0x0AA6345204931FE6E5748BdB0A17C8DfeD25d5c0", // LiquidShield hook
            },
            token0Symbol: "WETH",
            token1Symbol: "USDC",
            token0Decimals: 18,
            token1Decimals: 18,
            label: "WETH / USDC (Dynamic Fee) — LiquidShield",
        },
    ],
    // Local Aqua0 devnet (chain 696969) — pools built at runtime from deployment JSON.
    // Token addresses are written by InitializePools.s.sol and merged into the JSON by start-local.sh.
    696969: [], // placeholder — populated below in the route handler
};

const chainIdQ = z.object({ chainId: z.coerce.number().int().positive() });

export const v4PoolsRoutes = new Hono<AppEnv>();

// ─── GET /v4/pools ────────────────────────────────────────────────────────────
// List all Aqua0-enabled pools on a chain with live price/tick from PoolManager

v4PoolsRoutes.get("/", zValidator("query", chainIdQ), async (c) => {
    const { chainId } = c.req.valid("query");

    let registryEntries = POOL_REGISTRY[chainId] ?? [];

    // Try to get deployed hook address to fill in 'hooks' field
    let hookAddress: `0x${string}` = ZERO;
    let poolSwapTestAddress: `0x${string}` | undefined;
    try {
        const addrs = getV4Addresses(chainId);
        hookAddress = addrs.aqua0Hook;
        poolSwapTestAddress = addrs.poolSwapTest;

        // For local devnet: build pool registry dynamically from deployment JSON
        // (token addresses are filled in by InitializePools.s.sol via start-local.sh)
        if (chainId === 696969 && addrs.mockUsdc && addrs.mockWbtc) {
            const usdc = addrs.mockUsdc;
            const wbtc = addrs.mockWbtc;
            const [t0p2, t1p2] = usdc.toLowerCase() < wbtc.toLowerCase()
                ? [usdc, wbtc] : [wbtc, usdc];

            registryEntries = [
                {
                    poolKey: {
                        currency0: "0x0000000000000000000000000000000000000000" as `0x${string}`,
                        currency1: usdc,
                        fee: 3000,
                        tickSpacing: 60,
                        hooks: ZERO,
                    },
                    token0Symbol: "ETH",
                    token1Symbol: "mUSDC",
                    token0Decimals: 18,
                    token1Decimals: 18,
                    label: "ETH / mUSDC (0.3%)",
                },
                {
                    poolKey: {
                        currency0: t0p2,
                        currency1: t1p2,
                        fee: 3000,
                        tickSpacing: 60,
                        hooks: ZERO,
                    },
                    token0Symbol: t0p2 === usdc ? "mUSDC" : "mWBTC",
                    token1Symbol: t1p2 === wbtc ? "mWBTC" : "mUSDC",
                    token0Decimals: 18,
                    token1Decimals: 18,
                    label: "mUSDC / mWBTC (0.3%)",
                },
            ];
        }
    } catch {
        // Not yet deployed — return pools with placeholder hook
    }

    const pools = await Promise.all(
        registryEntries.map(async (entry) => {
            const poolKey = {
                ...entry.poolKey,
                // If pool specifies its own hook, keep it; otherwise use default from deployment JSON
                hooks: entry.poolKey.hooks !== ZERO ? entry.poolKey.hooks : (hookAddress !== ZERO ? hookAddress : entry.poolKey.hooks),
            };
            const poolId = computePoolId(poolKey);

            // Try reading live on-chain state
            let tick = 0;
            let sqrtPriceX96 = "0";
            let lpFee = poolKey.fee;
            let realLiquidity = "0";
            let aggregatedRanges: { tickLower: number; tickUpper: number; totalLiquidity: string }[] = [];

            try {
                const [slot0, liquidity, ranges] = await Promise.all([
                    readPoolSlot0(chainId, poolId),
                    readPoolLiquidity(chainId, poolId),
                    readAggregatedPositions(chainId, poolId)
                ]);
                tick = slot0.tick;
                sqrtPriceX96 = slot0.sqrtPriceX96.toString();
                lpFee = slot0.lpFee || poolKey.fee;
                realLiquidity = liquidity.toString();
                aggregatedRanges = ranges.map(r => ({
                    tickLower: r.tickLower,
                    tickUpper: r.tickUpper,
                    totalLiquidity: r.totalLiquidity.toString()
                }));
            } catch (err) {
                console.error(`Failed to read pool ${poolId}:`, err);
                // Pool not initialized yet — return static metadata only
            }

            // Compute human-readable price from sqrtPriceX96
            // price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
            let price = 0;
            if (sqrtPriceX96 !== "0") {
                const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
                const rawPrice = sqrtPrice * sqrtPrice;
                const decimalAdjust = Math.pow(10, entry.token0Decimals - entry.token1Decimals);
                price = rawPrice * decimalAdjust;
            }

            return {
                poolId,
                poolKey,
                label: entry.label,
                token0: {
                    address: poolKey.currency0,
                    symbol: entry.token0Symbol,
                    decimals: entry.token0Decimals,
                },
                token1: {
                    address: poolKey.currency1,
                    symbol: entry.token1Symbol,
                    decimals: entry.token1Decimals,
                },
                currentTick: tick,
                currentPrice: price,
                sqrtPriceX96,
                fee: lpFee,
                tickSpacing: poolKey.tickSpacing,
                realLiquidity,
                aggregatedRanges,
            };
        })
    );

    return c.json({ chainId, pools, poolSwapTest: poolSwapTestAddress });
});

// ─── GET /v4/pools/:poolId ────────────────────────────────────────────────────
// Get live data for a specific pool by poolId

const poolIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid poolId (bytes32 hex)");

v4PoolsRoutes.get("/:poolId", zValidator("query", chainIdQ), async (c) => {
    const { chainId } = c.req.valid("query");
    const poolId = c.req.param("poolId");

    if (!poolIdSchema.safeParse(poolId).success) {
        return c.json({ error: "Invalid poolId" }, 400);
    }

    try {
        const slot0 = await readPoolSlot0(chainId, poolId as `0x${string}`);
        return c.json({
            poolId,
            chainId,
            tick: slot0.tick,
            sqrtPriceX96: slot0.sqrtPriceX96.toString(),
            protocolFee: slot0.protocolFee,
            lpFee: slot0.lpFee,
        });
    } catch (err) {
        return c.json({ error: "Pool not found or not initialized", poolId }, 404);
    }
});

// ─── POST /v4/pools/quote ─────────────────────────────────────────────────────
// Simulate an exact-input swap using Aqua0QuoteHelper to get accurate output
// and breakdown of real vs virtual liquidity contributions

const quoteBodySchema = z.object({
    chainId: z.number(),
    poolId: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid poolId"),
    zeroForOne: z.boolean(),
    amountIn: z.string(), // BigInt as string
});

v4PoolsRoutes.post("/quote", async (c) => {
    let body: z.infer<typeof quoteBodySchema>;
    try {
        body = quoteBodySchema.parse(await c.req.json());
    } catch (e: any) {
        return c.json({ error: "Invalid request body", details: String(e) }, 400);
    }

    const { chainId, poolId, zeroForOne, amountIn } = body;

    let addresses: Awaited<ReturnType<typeof getV4Addresses>>;
    try {
        addresses = getV4Addresses(chainId);
    } catch {
        return c.json({ error: "Deployment addresses not found for this chain" }, 501);
    }

    if (!addresses.aqua0QuoteHelper) {
        return c.json({ error: "aqua0QuoteHelper not deployed. Redeploy contracts (DeployV4Hookathon.s.sol) to get a quote helper." }, 501);
    }

    // Rebuild registry entries (same logic as GET /pools) to find the matching poolKey
    let registryEntries = POOL_REGISTRY[chainId] ?? [];
    if (chainId === 696969 && addresses.mockUsdc && addresses.mockWbtc) {
        const usdc = addresses.mockUsdc;
        const wbtc = addresses.mockWbtc;
        const [t0p2, t1p2] = usdc.toLowerCase() < wbtc.toLowerCase() ? [usdc, wbtc] : [wbtc, usdc];
        registryEntries = [
            {
                poolKey: {
                    currency0: "0x0000000000000000000000000000000000000000" as `0x${string}`,
                    currency1: usdc,
                    fee: 3000,
                    tickSpacing: 60,
                    hooks: ZERO,
                },
                token0Symbol: "ETH",
                token1Symbol: "mUSDC",
                token0Decimals: 18,
                token1Decimals: 18,
                label: "ETH / mUSDC (0.3%)",
            },
            {
                poolKey: {
                    currency0: t0p2,
                    currency1: t1p2,
                    fee: 3000,
                    tickSpacing: 60,
                    hooks: ZERO,
                },
                token0Symbol: t0p2 === usdc ? "mUSDC" : "mWBTC",
                token1Symbol: t1p2 === wbtc ? "mWBTC" : "mUSDC",
                token0Decimals: 18,
                token1Decimals: 18,
                label: "mUSDC / mWBTC (0.3%)",
            },
        ];
    }

    // Find the matching pool key
    const hookAddress = addresses.aqua0Hook;
    const entry = registryEntries.find(e => {
        // If pool specifies its own hook, keep it; otherwise use default Aqua0 hook
        const resolvedHook = e.poolKey.hooks !== ZERO ? e.poolKey.hooks : hookAddress;
        const pk = { ...e.poolKey, hooks: resolvedHook };
        return computePoolId(pk) === poolId;
    });

    if (!entry) {
        return c.json({ error: "Pool not found in registry", poolId }, 404);
    }

    const poolKey = {
        ...entry.poolKey,
        hooks: entry.poolKey.hooks !== ZERO ? entry.poolKey.hooks : hookAddress,
    };

    try {
        const result = await quoteExactInput(
            chainId,
            poolId as `0x${string}`,
            poolKey,
            zeroForOne,
            BigInt(amountIn)
        );
        return c.json({
            poolId,
            zeroForOne,
            amountIn,
            // positive = tokens out of pool
            totalAmountOut: result.totalAmountOut.toString(),
            // negative = SharedLiquidityPool paid tokens, positive = received tokens
            virtualDelta0: result.virtualDelta0.toString(),
            virtualDelta1: result.virtualDelta1.toString(),
        });
    } catch (err: any) {
        console.error("Quote simulation failed:", err?.message ?? err);
        return c.json({ error: "Quote simulation failed", detail: err?.shortMessage ?? err?.message ?? String(err) }, 500);
    }
});
