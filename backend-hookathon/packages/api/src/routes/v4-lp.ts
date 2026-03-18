// ============================================
// V4 LP Routes — SharedLiquidityPool operations
// All write routes return calldata for frontend to sign
// All read routes return on-chain data
// ============================================

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Address, Hex } from "viem";
import type { AppEnv } from "../index";
import { ValidationError } from "../middleware/error-handler";
import * as v4LpService from "../services/v4-lp.service";
import { getV4Addresses } from "../contracts/v4-client";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ethAddr = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");
const bigIntStr = z.string().regex(/^\d+$/, "Must be a non-negative integer string");
const chainIdQ = z.object({ chainId: z.coerce.number().int().positive() });

const poolKeySchema = z.object({
    currency0: ethAddr,
    currency1: ethAddr,
    fee: z.number().int().nonnegative(),
    tickSpacing: z.number().int().positive(),
    hooks: ethAddr,
});

export const v4LpRoutes = new Hono<AppEnv>();

// ─── GET /v4/lp/addresses ─────────────────────────────────────────────────────
// Returns the deployed SharedLiquidityPool + hook addresses for the chain

v4LpRoutes.get("/addresses", zValidator("query", chainIdQ), (c) => {
    const { chainId } = c.req.valid("query");
    try {
        const addrs = getV4Addresses(chainId);
        return c.json({ chainId, ...addrs });
    } catch (err) {
        return c.json(
            { error: "Not deployed", message: (err as Error).message },
            404
        );
    }
});

// ─── GET /v4/lp/balances/:user ───────────────────────────────────────────────
// Returns free (unallocated) balances for given tokens

const balancesQuerySchema = chainIdQ.extend({
    tokens: z.string().transform((s) => s.split(",").filter(Boolean)),
});

v4LpRoutes.get("/balances/:user", zValidator("query", balancesQuerySchema), async (c) => {
    const { chainId, tokens } = c.req.valid("query");
    const user = c.req.param("user") as Address;

    if (!/^0x[a-fA-F0-9]{40}$/.test(user)) throw new ValidationError("Invalid user address");
    if (tokens.length === 0) throw new ValidationError("Provide at least one token address in ?tokens=");

    const balances = await Promise.all(
        tokens.map(async (token) => ({
            token,
            freeBalance: (await v4LpService.getUserFreeBalance(chainId, user, token as Address)).toString(),
            walletBalance: (await v4LpService.getUserWalletBalance(chainId, user, token as Address)).toString(),
        }))
    );

    return c.json({ user, chainId, balances });
});

// ─── GET /v4/lp/positions/:user ──────────────────────────────────────────────
// Returns all active virtual positions for a user

v4LpRoutes.get("/positions/:user", zValidator("query", chainIdQ), async (c) => {
    const { chainId } = c.req.valid("query");
    const user = c.req.param("user") as Address;

    if (!/^0x[a-fA-F0-9]{40}$/.test(user)) throw new ValidationError("Invalid user address");

    const positions = await v4LpService.getUserPositions(chainId, user);
    return c.json({ user, chainId, positions });
});

// ─── POST /v4/lp/prepare-approve ─────────────────────────────────────────────
// Returns approve() calldata for a token → SharedLiquidityPool

const approveSchema = z.object({
    token: ethAddr,
    amount: bigIntStr,
});

v4LpRoutes.post("/prepare-approve", zValidator("query", chainIdQ), zValidator("json", approveSchema), (c) => {
    const { chainId } = c.req.valid("query");
    const { token, amount } = c.req.valid("json");

    const { calldata } = v4LpService.prepareApprove(chainId, token as Address, BigInt(amount));
    return c.json({ calldata });
});

// ─── POST /v4/lp/prepare-deposit ─────────────────────────────────────────────
// Returns deposit() calldata

const depositSchema = z.object({
    token: ethAddr,
    amount: bigIntStr,
});

v4LpRoutes.post("/prepare-deposit", zValidator("query", chainIdQ), zValidator("json", depositSchema), (c) => {
    const { chainId } = c.req.valid("query");
    const { token, amount } = c.req.valid("json");

    const { calldata } = v4LpService.prepareDeposit(chainId, token as Address, BigInt(amount));
    return c.json({ calldata });
});

// ─── POST /v4/lp/prepare-withdraw ────────────────────────────────────────────
// Returns withdraw() calldata

const withdrawSchema = z.object({
    token: ethAddr,
    amount: bigIntStr,
});

v4LpRoutes.post("/prepare-withdraw", zValidator("query", chainIdQ), zValidator("json", withdrawSchema), (c) => {
    const { chainId } = c.req.valid("query");
    const { token, amount } = c.req.valid("json");

    const { calldata } = v4LpService.prepareWithdraw(chainId, token as Address, BigInt(amount));
    return c.json({ calldata });
});

// ─── POST /v4/lp/prepare-add-position ────────────────────────────────────────
// Returns addPosition() calldata

const addPositionSchema = z.object({
    poolKey: poolKeySchema,
    tickLower: z.number().int(),
    tickUpper: z.number().int(),
    liquidity: bigIntStr,
    token0Amount: bigIntStr,
    token1Amount: bigIntStr,
});

v4LpRoutes.post(
    "/prepare-add-position",
    zValidator("query", chainIdQ),
    zValidator("json", addPositionSchema),
    (c) => {
        const { chainId } = c.req.valid("query");
        const { poolKey, tickLower, tickUpper, liquidity, token0Amount, token1Amount } = c.req.valid("json");

        if (tickLower >= tickUpper) throw new ValidationError("tickLower must be less than tickUpper");

        const { calldata, poolId } = v4LpService.prepareAddPosition(
            chainId,
            poolKey as any,
            tickLower,
            tickUpper,
            BigInt(liquidity),
            BigInt(token0Amount),
            BigInt(token1Amount)
        );

        return c.json({ calldata, poolId });
    }
);

// ─── POST /v4/lp/prepare-remove-position ─────────────────────────────────────
// Returns removePosition() calldata

const removePositionSchema = z.object({
    poolKey: poolKeySchema,
    tickLower: z.number().int(),
    tickUpper: z.number().int(),
    token0Return: bigIntStr,
    token1Return: bigIntStr,
});

v4LpRoutes.post(
    "/prepare-remove-position",
    zValidator("query", chainIdQ),
    zValidator("json", removePositionSchema),
    (c) => {
        const { chainId } = c.req.valid("query");
        const { poolKey, tickLower, tickUpper, token0Return, token1Return } = c.req.valid("json");

        const { calldata } = v4LpService.prepareRemovePosition(
            chainId,
            poolKey as any,
            tickLower,
            tickUpper,
            BigInt(token0Return),
            BigInt(token1Return)
        );

        return c.json({ calldata });
    }
);

// ─── POST /v4/lp/compute-pool-id ─────────────────────────────────────────────
// Utility: compute PoolId from PoolKey

v4LpRoutes.post("/compute-pool-id", zValidator("json", z.object({ poolKey: poolKeySchema })), (c) => {
    const { poolKey } = c.req.valid("json");
    const poolId = v4LpService.computePoolId(poolKey as any);
    return c.json({ poolId });
});
