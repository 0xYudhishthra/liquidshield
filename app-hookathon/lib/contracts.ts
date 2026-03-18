import type { Address } from 'viem'

// SwapVMRouter / V4 PoolSwapTest Router
export const SWAP_VM_ROUTER: Address = '0xB9818483D01ca0e721849703C58148CFb81328fC'

// USE_AQUA_BIT flag (1 << 254) — required in order.traits for the router
// Pre-computed: (1n << 254n).toString()
export const USE_AQUA_BIT = '28948022309329048855892746252171976963317496166410141009864396001978282409984'

// Backend chain ID mapping (matches API query param expectations)
export const BACKEND_CHAIN_IDS: Record<string | number, number> = {
  base: 8453,
  unichain: 1301,
  local: 696969,
  84532: 84532,
  1301: 1301,
  696969: 696969,
}

/**
 * Build takerData for swap orders.
 * Replicates backend's buildAquaTakerData():
 *   encodePacked(["uint160", "uint16"], [threshold, 0x0041])
 * Result: 22 bytes (20 for threshold + 2 for flags)
 */
export function buildTakerData(threshold: bigint = BigInt(0)): `0x${string}` {
  const thresholdHex = threshold.toString(16).padStart(40, '0')
  const flagsHex = '0041'
  return `0x${thresholdHex}${flagsHex}`
}

// Minimal ERC20 ABI for approve + allowance + transfer
export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

// LP Account Factory — same address on all supported chains (deployed via CreateX)
export const ACCOUNT_FACTORY: Address = '0xfA4FCDF96866bD1ACCB6e70Aa426644E953E76b0'

// Minimal AccountFactory ABI for checking/creating LP Accounts
export const ACCOUNT_FACTORY_ABI = [
  {
    name: 'getAccount',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'isAccount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
] as const

export const V4_ROUTER_ABI = [
  {
    "type": "function",
    "name": "swap",
    "inputs": [
      {
        "name": "key",
        "type": "tuple",
        "components": [
          { "name": "currency0", "type": "address" },
          { "name": "currency1", "type": "address" },
          { "name": "fee", "type": "uint24" },
          { "name": "tickSpacing", "type": "int24" },
          { "name": "hooks", "type": "address" }
        ]
      },
      {
        "name": "params",
        "type": "tuple",
        "components": [
          { "name": "zeroForOne", "type": "bool" },
          { "name": "amountSpecified", "type": "int256" },
          { "name": "sqrtPriceLimitX96", "type": "uint160" }
        ]
      },
      {
        "name": "testSettings",
        "type": "tuple",
        "components": [
          { "name": "takeClaims", "type": "bool" },
          { "name": "settleUsingBurn", "type": "bool" }
        ]
      },
      { "name": "hookData", "type": "bytes" }
    ],
    "outputs": [{ "name": "delta", "type": "int256" }],
    "stateMutability": "payable"
  }
] as const
