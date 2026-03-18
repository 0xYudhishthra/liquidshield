// ============================================
// V4 LP Service — SharedLiquidityPool calldata + on-chain reads
// No DB — all operations are calldata builders or direct chain reads
// ============================================

import type { Address, Hex } from "viem";
import {
    getV4Addresses,
    readFreeBalance,
    readUserPositionIds,
    readUserPosition,
    readErc20Balance,
    readErc20Allowance,
    buildDepositCalldata,
    buildWithdrawCalldata,
    buildAddPositionCalldata,
    buildRemovePositionCalldata,
    buildApproveCalldata,
    computePoolId,
    type PoolKeyInput,
    type TxCalldata,
} from "../contracts/v4-client";

// ─── Token approval helper ─────────────────────────────────────────────────────

/** Prepare ERC-20 approval calldata for the SharedLiquidityPool to spend a token */
export function prepareApprove(
    chainId: number,
    token: Address,
    amount: bigint
): { calldata: TxCalldata } {
    const { sharedLiquidityPool } = getV4Addresses(chainId);
    return { calldata: buildApproveCalldata(token, sharedLiquidityPool, amount) };
}

// ─── Deposit ──────────────────────────────────────────────────────────────────

export function prepareDeposit(
    chainId: number,
    token: Address,
    amount: bigint
): { calldata: TxCalldata } {
    const { sharedLiquidityPool } = getV4Addresses(chainId);
    return { calldata: buildDepositCalldata(sharedLiquidityPool, token, amount) };
}

// ─── Withdraw ────────────────────────────────────────────────────────────────

export function prepareWithdraw(
    chainId: number,
    token: Address,
    amount: bigint
): { calldata: TxCalldata } {
    const { sharedLiquidityPool } = getV4Addresses(chainId);
    return { calldata: buildWithdrawCalldata(sharedLiquidityPool, token, amount) };
}

// ─── Add position ─────────────────────────────────────────────────────────────

export function prepareAddPosition(
    chainId: number,
    key: PoolKeyInput,
    tickLower: number,
    tickUpper: number,
    liquidity: bigint,
    token0Amount: bigint,
    token1Amount: bigint
): { calldata: TxCalldata; poolId: Hex } {
    const { sharedLiquidityPool } = getV4Addresses(chainId);
    const poolId = computePoolId(key);
    return {
        calldata: buildAddPositionCalldata(
            sharedLiquidityPool,
            key,
            tickLower,
            tickUpper,
            liquidity,
            token0Amount,
            token1Amount
        ),
        poolId,
    };
}

// ─── Remove position ─────────────────────────────────────────────────────────

export function prepareRemovePosition(
    chainId: number,
    key: PoolKeyInput,
    tickLower: number,
    tickUpper: number,
    token0Return: bigint,
    token1Return: bigint
): { calldata: TxCalldata } {
    const { sharedLiquidityPool } = getV4Addresses(chainId);
    return {
        calldata: buildRemovePositionCalldata(
            sharedLiquidityPool,
            key,
            tickLower,
            tickUpper,
            token0Return,
            token1Return
        ),
    };
}

// ─── Read: balances ────────────────────────────────────────────────────────────

export async function getUserFreeBalance(
    chainId: number,
    user: Address,
    token: Address
): Promise<bigint> {
    return readFreeBalance(chainId, user, token);
}

export async function getUserWalletBalance(
    chainId: number,
    user: Address,
    token: Address
): Promise<bigint> {
    if (token === "0x0000000000000000000000000000000000000000") {
        const { getV4Client } = await import("../contracts/v4-client");
        return getV4Client(chainId).getBalance({ address: user });
    }
    return readErc20Balance(chainId, token, user);
}

export async function getUserAllowance(
    chainId: number,
    user: Address,
    token: Address,
    spender: Address
): Promise<bigint> {
    return readErc20Allowance(chainId, token, user, spender);
}

// ─── Read: positions ─────────────────────────────────────────────────────────

export async function getUserPositions(
    chainId: number,
    user: Address
): Promise<
    Array<{
        positionId: Hex;
        poolId: Hex;
        tickLower: number;
        tickUpper: number;
        liquidityShares: string;
        active: boolean;
    }>
> {
    const positionIds = await readUserPositionIds(chainId, user);
    if (positionIds.length === 0) return [];

    const positions = await Promise.all(
        positionIds.map(async (positionId) => {
            const pos = await readUserPosition(chainId, user, positionId);
            return {
                positionId,
                poolId: pos.poolId,
                tickLower: pos.tickLower,
                tickUpper: pos.tickUpper,
                liquidityShares: pos.liquidityShares.toString(),
                active: pos.active,
            };
        })
    );

    return positions.filter((p) => p.active);
}

// ─── Pool ID util ────────────────────────────────────────────────────────────

export { computePoolId } from "../contracts/v4-client";
