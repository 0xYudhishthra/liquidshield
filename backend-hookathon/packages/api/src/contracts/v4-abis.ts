// ============================================
// V4 Hookathon ABIs
// SharedLiquidityPool + Aqua0Hook
// ============================================

export const Aqua0QuoteHelperAbi = [
    {
        name: "quoteExactInput",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "key",
                type: "tuple",
                components: [
                    { name: "currency0", type: "address" },
                    { name: "currency1", type: "address" },
                    { name: "fee", type: "uint24" },
                    { name: "tickSpacing", type: "int24" },
                    { name: "hooks", type: "address" },
                ],
            },
            { name: "zeroForOne", type: "bool" },
            { name: "amountIn", type: "uint256" },
        ],
        outputs: [
            { name: "out1", type: "int256" },
            { name: "out2", type: "int256" },
            { name: "out3", type: "int256" },
        ],
    },
    {
        name: "QuoteExactInputResult",
        type: "error",
        inputs: [
            { name: "totalAmountOut", type: "int256" },
            { name: "virtualDelta0", type: "int256" },
            { name: "virtualDelta1", type: "int256" },
        ],
    },
];

export const SharedLiquidityPoolAbi = [
    // Deposit / Withdraw
    {
        name: "deposit",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [],
    },
    {
        name: "depositNative",
        type: "function",
        stateMutability: "payable",
        inputs: [],
        outputs: [],
    },
    {
        name: "withdraw",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [],
    },
    // Positions
    {
        name: "addPosition",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "key",
                type: "tuple",
                components: [
                    { name: "currency0", type: "address" },
                    { name: "currency1", type: "address" },
                    { name: "fee", type: "uint24" },
                    { name: "tickSpacing", type: "int24" },
                    { name: "hooks", type: "address" },
                ],
            },
            { name: "tickLower", type: "int24" },
            { name: "tickUpper", type: "int24" },
            { name: "liquidity", type: "uint128" },
            { name: "token0Amount", type: "uint256" },
            { name: "token1Amount", type: "uint256" },
        ],
        outputs: [{ name: "positionId", type: "bytes32" }],
    },
    {
        name: "removePosition",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "key",
                type: "tuple",
                components: [
                    { name: "currency0", type: "address" },
                    { name: "currency1", type: "address" },
                    { name: "fee", type: "uint24" },
                    { name: "tickSpacing", type: "int24" },
                    { name: "hooks", type: "address" },
                ],
            },
            { name: "tickLower", type: "int24" },
            { name: "tickUpper", type: "int24" },
            { name: "token0Return", type: "uint256" },
            { name: "token1Return", type: "uint256" },
        ],
        outputs: [],
    },
    // Admin
    {
        name: "setHook",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "_hook", type: "address" }],
        outputs: [],
    },
    // Views
    {
        name: "freeBalance",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "user", type: "address" },
            { name: "token", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "userPositions",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "user", type: "address" },
            { name: "positionId", type: "bytes32" },
        ],
        outputs: [
            { name: "poolId", type: "bytes32" },
            { name: "tickLower", type: "int24" },
            { name: "tickUpper", type: "int24" },
            { name: "liquidityShares", type: "uint128" },
            { name: "token0Initial", type: "uint256" },
            { name: "token1Initial", type: "uint256" },
            { name: "active", type: "bool" },
        ],
    },
    {
        name: "getUserPositionIds",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "user", type: "address" }],
        outputs: [{ name: "", type: "bytes32[]" }],
    },
    {
        name: "getPoolRangeKeys",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "poolId", type: "bytes32" }],
        outputs: [{ name: "", type: "bytes32[]" }],
    },
    {
        name: "aggregatedRanges",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "poolId", type: "bytes32" },
            { name: "rangeKey", type: "bytes32" }
        ],
        outputs: [
            { name: "tickLower", type: "int24" },
            { name: "tickUpper", type: "int24" },
            { name: "totalLiquidity", type: "uint128" },
        ],
    },
    {
        name: "hook",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "address" }],
    },
] as const;

export const ERC20Abi = [
    {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
    },
    {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "allowance",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "decimals",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint8" }],
    },
    {
        name: "symbol",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
    },
    {
        name: "name",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
    },
] as const;

// V4 PoolManager ABI (minimal — only what we read)
export const PoolManagerAbi = [
    {
        name: "getSlot0",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "id", type: "bytes32" }],
        outputs: [
            { name: "sqrtPriceX96", type: "uint160" },
            { name: "tick", type: "int24" },
            { name: "protocolFee", type: "uint24" },
            { name: "lpFee", type: "uint24" },
        ],
    },
    {
        name: "getLiquidity",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "id", type: "bytes32" }],
        outputs: [{ name: "", type: "uint128" }],
    },
] as const;
