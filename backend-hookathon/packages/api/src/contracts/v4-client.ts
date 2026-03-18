// ============================================
// V4 Hookathon Contract Client
// Viem public clients for SharedLiquidityPool + PoolManager
// Supports: base-sepolia (84532), unichain-sepolia (1301), local anvil (696969)
// ============================================

import {
    createPublicClient,
    http,
    encodeFunctionData,
    keccak256,
    encodePacked,
    encodeAbiParameters,
    parseAbiParameters,
    type PublicClient,
    type Chain,
    type Address,
    type Hex,
} from "viem";
import { baseSepolia, unichainSepolia } from "viem/chains";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
    SharedLiquidityPoolAbi,
    ERC20Abi,
    PoolManagerAbi,
    Aqua0QuoteHelperAbi
} from "./v4-abis";

// Custom local chain definition (696969 — avoids GoChain/Anvil default 31337 clash)
const localAqua0Chain: Chain = {
    id: 696969,
    name: "Aqua0 Local Devnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://localhost:8545"] } },
};

// ─── Chain config ──────────────────────────────────────────────────────────────

const CHAIN_CONFIG: Record<
    number,
    { chain: Chain; rpcEnv: string; defaultRpc: string }
> = {
    84532: {
        chain: baseSepolia,
        rpcEnv: "RPC_URL_BASE_SEPOLIA",
        defaultRpc: "https://sepolia.base.org",
    },
    1301: {
        chain: unichainSepolia,
        rpcEnv: "RPC_URL_UNICHAIN_SEPOLIA",
        defaultRpc: "https://unichain-sepolia-rpc.publicnode.com",
    },
    696969: {
        chain: localAqua0Chain,
        rpcEnv: "RPC_URL_ANVIL",
        defaultRpc: "http://localhost:8545",
    },
};

// Known V4 PoolManager addesses
export const POOL_MANAGER_ADDRESSES: Record<number, Address> = {
    84532: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408", // base-sepolia
    1301: "0x00B036B58a818B1BC34d502D3fE730Db729e62AC", // unichain-sepolia
    696969: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408", // local (base-sepolia fork)
};

// ─── Client cache ──────────────────────────────────────────────────────────────

const clientCache = new Map<number, PublicClient>();

export function getV4Client(chainId: number): PublicClient {
    const cached = clientCache.get(chainId);
    if (cached) return cached;

    const chainCfg = CHAIN_CONFIG[chainId];
    if (!chainCfg) throw new Error(`Unsupported chainId ${chainId}`);

    const rpcUrl = process.env[chainCfg.rpcEnv] ?? chainCfg.defaultRpc;
    const client = createPublicClient({
        chain: chainCfg.chain,
        transport: http(rpcUrl),
    });

    clientCache.set(chainId, client);
    return client;
}

// ─── Deployment address loader ─────────────────────────────────────────────────

export interface V4DeploymentAddresses {
    sharedLiquidityPool: Address;
    aqua0Hook: Address;
    poolManager: Address;
    // Populated after InitializePools.s.sol runs (local dev only)
    mockUsdc?: Address;
    mockWbtc?: Address;
    pool1Currency0?: Address;
    pool1Currency1?: Address;
    pool2Currency0?: Address;
    pool2Currency1?: Address;
    poolSwapTest?: Address;
    aqua0QuoteHelper?: Address;
}

let localDevAddresses: V4DeploymentAddresses | null = null;

// Relative to root of backend-hookathon monorepo
const V4_DEPLOYMENT_PATHS: Record<number, string> = {
    84532: "../../contracts-hookathon/deployments/v4-hookathon-base-sepolia.json",
    1301: "../../contracts-hookathon/deployments/v4-hookathon-unichain-sepolia.json",
    696969: "../../contracts-hookathon/deployments/v4-hookathon-local.json",
};

// ─── LiquidShield deployment address loader ──────────────────────────────────

export interface LiquidShieldDeploymentAddresses {
    chainId: number;
    deployer: Address;
    poolManager: Address;
    sharedLiquidityPool: Address;
    hook: Address;
    settler: Address;
    router: Address;
    defenseCallback: Address;
    tokens: Record<string, Address>;
    positionId?: Hex;
}

// Relative to root of backend-hookathon monorepo
const LIQUIDSHIELD_DEPLOYMENT_PATHS: Record<number, string> = {
    1301: "../../../packages/contracts/deployments/unichain-sepolia.json",
};

const liquidShieldCache = new Map<number, LiquidShieldDeploymentAddresses>();

export function getLiquidShieldAddresses(chainId: number): LiquidShieldDeploymentAddresses | null {
    const cached = liquidShieldCache.get(chainId);
    if (cached) return cached;

    const relativePath = LIQUIDSHIELD_DEPLOYMENT_PATHS[chainId];
    if (!relativePath) return null;

    const absPath = resolve(process.cwd(), relativePath);
    if (!existsSync(absPath)) return null;

    try {
        const raw = readFileSync(absPath, "utf-8");
        const json = JSON.parse(raw) as LiquidShieldDeploymentAddresses;
        liquidShieldCache.set(chainId, json);
        return json;
    } catch {
        return null;
    }
}

export function getV4Addresses(chainId: number): V4DeploymentAddresses {
    // Override via explicit env var (CI / Docker)
    const jsonPath = process.env.V4_DEPLOYMENT_JSON_PATH;
    if (jsonPath) {
        if (localDevAddresses) return localDevAddresses;
        const raw = readFileSync(resolve(process.cwd(), jsonPath), "utf-8");
        localDevAddresses = JSON.parse(raw) as V4DeploymentAddresses;
        return localDevAddresses;
    }

    // Load from contracts-hookathon deployments folder
    const relativePath = V4_DEPLOYMENT_PATHS[chainId];
    if (relativePath) {
        const absPath = resolve(process.cwd(), relativePath);
        if (existsSync(absPath)) {
            const raw = readFileSync(absPath, "utf-8");
            const json = JSON.parse(raw);
            return {
                sharedLiquidityPool: json.sharedLiquidityPool as Address,
                aqua0Hook: json.aqua0Hook as Address,
                poolManager: (json.poolManager ?? POOL_MANAGER_ADDRESSES[chainId]) as Address,
                // Optional: populated by InitializePools.s.sol on local chain
                mockUsdc: json.mockUsdc as Address | undefined,
                mockWbtc: json.mockWbtc as Address | undefined,
                pool1Currency0: json.pool1Currency0 as Address | undefined,
                pool1Currency1: json.pool1Currency1 as Address | undefined,
                pool2Currency0: json.pool2Currency0 as Address | undefined,
                pool2Currency1: json.pool2Currency1 as Address | undefined,
                poolSwapTest: json.poolSwapTest as Address | undefined,
                aqua0QuoteHelper: json.aqua0QuoteHelper as Address | undefined,
            };
        }
    }

    throw new Error(
        `V4 deployment addresses not found for chainId ${chainId}. ` +
        `Deploy contracts first or set V4_DEPLOYMENT_JSON_PATH.`
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve PoolManager address: try deployment JSON first, fall back to known addresses */
function getPoolManagerAddress(chainId: number): Address {
    try {
        return getV4Addresses(chainId).poolManager;
    } catch {
        // Try LiquidShield deployment
        const ls = getLiquidShieldAddresses(chainId);
        if (ls?.poolManager) return ls.poolManager;
        const addr = POOL_MANAGER_ADDRESSES[chainId];
        if (!addr) throw new Error(`No PoolManager address for chainId ${chainId}`);
        return addr;
    }
}

/** Resolve SharedLiquidityPool address from either Aqua0 or LiquidShield deployments */
function getSharedLiquidityPoolAddress(chainId: number): Address {
    try {
        return getV4Addresses(chainId).sharedLiquidityPool;
    } catch {
        const ls = getLiquidShieldAddresses(chainId);
        if (ls?.sharedLiquidityPool) return ls.sharedLiquidityPool;
        throw new Error(`No SharedLiquidityPool address for chainId ${chainId}`);
    }
}

// ─── On-chain reads ────────────────────────────────────────────────────────────

export async function readFreeBalance(
    chainId: number,
    user: Address,
    token: Address
): Promise<bigint> {
    const client = getV4Client(chainId);
    const sharedLiquidityPool = getSharedLiquidityPoolAddress(chainId);
    return client.readContract({
        address: sharedLiquidityPool,
        abi: SharedLiquidityPoolAbi,
        functionName: "freeBalance",
        args: [user, token],
    });
}

export async function readUserPositionIds(
    chainId: number,
    user: Address
): Promise<Hex[]> {
    const client = getV4Client(chainId);
    const sharedLiquidityPool = getSharedLiquidityPoolAddress(chainId);
    return client.readContract({
        address: sharedLiquidityPool,
        abi: SharedLiquidityPoolAbi,
        functionName: "getUserPositionIds",
        args: [user],
    }) as Promise<Hex[]>;
}

export async function readUserPosition(
    chainId: number,
    user: Address,
    positionId: Hex
): Promise<{
    poolId: Hex;
    tickLower: number;
    tickUpper: number;
    liquidityShares: bigint;
    token0Initial: bigint;
    token1Initial: bigint;
    active: boolean;
}> {
    const client = getV4Client(chainId);
    const sharedLiquidityPool = getSharedLiquidityPoolAddress(chainId);
    const [poolId, tickLower, tickUpper, liquidityShares, token0Initial, token1Initial, active] =
        (await client.readContract({
            address: sharedLiquidityPool,
            abi: SharedLiquidityPoolAbi,
            functionName: "userPositions",
            args: [user, positionId],
        })) as [Hex, number, number, bigint, bigint, bigint, boolean];
    return { poolId, tickLower, tickUpper, liquidityShares, token0Initial, token1Initial, active };
}

export async function readPoolSlot0(
    chainId: number,
    poolId: Hex
): Promise<{
    sqrtPriceX96: bigint;
    tick: number;
    protocolFee: number;
    lpFee: number;
}> {
    const client = getV4Client(chainId);
    const poolManager = getPoolManagerAddress(chainId);

    // Slot 6 is the mapping(PoolId => Pool.State) pools
    const slot = keccak256(encodePacked(['bytes32', 'uint256'], [poolId, 6n]));

    const dataHex = (await client.readContract({
        address: poolManager,
        abi: [{
            name: "extsload",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "slot", type: "bytes32" }],
            outputs: [{ name: "value", type: "bytes32" }],
        }],
        functionName: "extsload",
        args: [slot],
    })) as Hex;

    const data = BigInt(dataHex);
    // 0x000000   |000bb8|000000      |ffff75 |0000000000000000fe3aa841ba359daa0ea9eff7
    // ---------- | fee  |protocolfee | tick  | sqrtPriceX96
    const sqrtPriceX96 = data & ((1n << 160n) - 1n);
    const tickRaw = Number((data >> 160n) & ((1n << 24n) - 1n));
    // Sign-extend 24-bit tick
    const tick = tickRaw >= 0x800000 ? tickRaw - 0x1000000 : tickRaw;
    const protocolFee = Number((data >> 184n) & 0xffffffn);
    const lpFee = Number((data >> 208n) & 0xffffffn);

    return { sqrtPriceX96, tick, protocolFee, lpFee };
}

import { decodeErrorResult } from "viem";

export async function quoteExactInput(
    chainId: number,
    poolId: Hex,
    poolKey: any,
    zeroForOne: boolean,
    amountIn: bigint
): Promise<{
    totalAmountOut: bigint;
    virtualDelta0: bigint;
    virtualDelta1: bigint;
}> {
    const client = getV4Client(chainId);
    const { aqua0QuoteHelper } = getV4Addresses(chainId);

    if (!aqua0QuoteHelper) {
        throw new Error("aqua0QuoteHelper not deployed. Run DeployV4Hookathon again.");
    }

    try {
        await client.readContract({
            address: aqua0QuoteHelper,
            abi: Aqua0QuoteHelperAbi,
            functionName: "quoteExactInput",
            args: [poolKey, zeroForOne, amountIn],
        });
        throw new Error("Expected QuoteHelper to revert with QuoteExactInputResult, but it succeeded.");
    } catch (err: any) {
        // Viem pre-decodes ContractFunctionRevertedError for us.
        // Check several paths where the decoded error might live.
        const extractResult = (e: any): { totalAmountOut: bigint; virtualDelta0: bigint; virtualDelta1: bigint } | null => {
            // Path 1: viem already decoded — err.cause.data = { errorName, args }
            if (e?.data?.errorName === "QuoteExactInputResult" && Array.isArray(e.data.args)) {
                const [a, b, c] = e.data.args as [bigint, bigint, bigint];
                return { totalAmountOut: a, virtualDelta0: b, virtualDelta1: c };
            }
            // Path 2: raw hex in err.cause?.data?.data
            try {
                const rawHex: string | undefined =
                    e?.cause?.data?.data ||
                    e?.data?.data ||
                    e?.cause?.data ||
                    e?.data;
                if (typeof rawHex === "string" && rawHex.startsWith("0x")) {
                    const decoded = decodeErrorResult({
                        abi: Aqua0QuoteHelperAbi,
                        data: rawHex as Hex,
                    });
                    if (decoded.errorName === "QuoteExactInputResult") {
                        const [a, b, c] = decoded.args as [bigint, bigint, bigint];
                        return { totalAmountOut: a, virtualDelta0: b, virtualDelta1: c };
                    }
                }
            } catch (_) { /* ignore */ }
            return null;
        };

        // Walk the error chain (err → err.cause → err.cause.cause)
        let node: any = err;
        while (node) {
            const result = extractResult(node);
            if (result) return result;
            node = node.cause;
        }

        throw err;
    }
}

export async function readPoolLiquidity(
    chainId: number,
    poolId: Hex
): Promise<bigint> {
    const client = getV4Client(chainId);
    const poolManager = getPoolManagerAddress(chainId);

    // Slot 6 is the mapping(PoolId => Pool.State) pools
    const baseSlot = BigInt(keccak256(encodePacked(['bytes32', 'uint256'], [poolId, 6n])));
    const liquiditySlot = "0x" + (baseSlot + 3n).toString(16) as Hex;

    const dataHex = (await client.readContract({
        address: poolManager,
        abi: [{
            name: "extsload",
            type: "function",
            stateMutability: "view",
            inputs: [{ name: "slot", type: "bytes32" }],
            outputs: [{ name: "value", type: "bytes32" }],
        }],
        functionName: "extsload",
        args: [liquiditySlot],
    })) as Hex;

    return BigInt(dataHex) & ((1n << 128n) - 1n);
}

export async function readErc20Balance(
    chainId: number,
    token: Address,
    owner: Address
): Promise<bigint> {
    const client = getV4Client(chainId);
    return client.readContract({
        address: token,
        abi: ERC20Abi,
        functionName: "balanceOf",
        args: [owner],
    });
}

export async function readAggregatedPositions(
    chainId: number,
    poolId: Hex
): Promise<{ tickLower: number; tickUpper: number; totalLiquidity: bigint }[]> {
    const client = getV4Client(chainId);
    const sharedLiquidityPool = getSharedLiquidityPoolAddress(chainId);

    const rangeKeys = (await client.readContract({
        address: sharedLiquidityPool,
        abi: SharedLiquidityPoolAbi,
        functionName: "getPoolRangeKeys",
        args: [poolId],
    })) as Hex[];

    if (!rangeKeys || rangeKeys.length === 0) return [];

    const calls = rangeKeys.map(key => client.readContract({
        address: sharedLiquidityPool,
        abi: SharedLiquidityPoolAbi,
        functionName: "aggregatedRanges",
        args: [poolId, key],
    }));

    const results = await Promise.allSettled(calls);

    return results
        .filter(r => r.status === "fulfilled")
        .map((r: any) => {
            const [tickLower, tickUpper, totalLiquidity] = r.value as [number, number, bigint];
            return { tickLower, tickUpper, totalLiquidity };
        })
        .filter(r => r.totalLiquidity > 0n);
}

export async function readErc20Allowance(
    chainId: number,
    token: Address,
    owner: Address,
    spender: Address
): Promise<bigint> {
    const client = getV4Client(chainId);
    return client.readContract({
        address: token,
        abi: ERC20Abi,
        functionName: "allowance",
        args: [owner, spender],
    });
}

// ─── Calldata builders ─────────────────────────────────────────────────────────

export interface PoolKeyInput {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
}

export interface TxCalldata {
    to: Address;
    data: Hex;
    value?: string;
}

export function buildDepositCalldata(
    sharedPool: Address,
    token: Address,
    amount: bigint
): TxCalldata {
    if (token === "0x0000000000000000000000000000000000000000") {
        return {
            to: sharedPool,
            data: encodeFunctionData({
                abi: SharedLiquidityPoolAbi,
                functionName: "depositNative",
            }),
            value: amount.toString(),
        };
    }

    return {
        to: sharedPool,
        data: encodeFunctionData({
            abi: SharedLiquidityPoolAbi,
            functionName: "deposit",
            args: [token, amount],
        }),
    };
}

export function buildWithdrawCalldata(
    sharedPool: Address,
    token: Address,
    amount: bigint
): TxCalldata {
    return {
        to: sharedPool,
        data: encodeFunctionData({
            abi: SharedLiquidityPoolAbi,
            functionName: "withdraw",
            args: [token, amount],
        }),
    };
}

export function buildAddPositionCalldata(
    sharedPool: Address,
    key: PoolKeyInput,
    tickLower: number,
    tickUpper: number,
    liquidity: bigint,
    token0Amount: bigint,
    token1Amount: bigint
): TxCalldata {
    return {
        to: sharedPool,
        data: encodeFunctionData({
            abi: SharedLiquidityPoolAbi,
            functionName: "addPosition",
            args: [key, tickLower, tickUpper, liquidity, token0Amount, token1Amount],
        }),
    };
}

export function buildRemovePositionCalldata(
    sharedPool: Address,
    key: PoolKeyInput,
    tickLower: number,
    tickUpper: number,
    token0Return: bigint,
    token1Return: bigint
): TxCalldata {
    return {
        to: sharedPool,
        data: encodeFunctionData({
            abi: SharedLiquidityPoolAbi,
            functionName: "removePosition",
            args: [key, tickLower, tickUpper, token0Return, token1Return],
        }),
    };
}

export function buildApproveCalldata(
    token: Address,
    spender: Address,
    amount: bigint
): TxCalldata {
    return {
        to: token,
        data: encodeFunctionData({
            abi: ERC20Abi,
            functionName: "approve",
            args: [spender, amount],
        }),
    };
}

// ─── Pool ID computation ───────────────────────────────────────────────────────

/** Compute V4 PoolId = keccak256(abi.encode(PoolKey)) */
export function computePoolId(key: PoolKeyInput): Hex {
    return keccak256(
        encodeAbiParameters(
            parseAbiParameters("address, address, uint24, int24, address"),
            [
                key.currency0,
                key.currency1,
                key.fee,
                key.tickSpacing,
                key.hooks,
            ]
        )
    );
}

export function resetV4Clients(): void {
    clientCache.clear();
    localDevAddresses = null;
}
