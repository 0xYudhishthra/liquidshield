#!/usr/bin/env bun
// ============================================
// E2E Stargate Bridge Script
// Creates LP account on both chains, funds it, ships a strategy,
// bridges WETH via Stargate using LayerZero V2, and polls for
// delivery confirmation on the destination chain.
//
// Usage:
//   PRIVATE_KEY=0x... bun run scripts/e2e-stargate-bridge.ts [step]
//
// Steps (run in order, or omit to run all):
//   create-account   - Create LP account on both chains
//   setup            - Authorize rebalancer, approve Aqua, fund WETH
//   ship             - Ship a WETH strategy into Aqua
//   bridge           - Dock strategy + bridge WETH via Stargate
//   poll             - Poll for WETH arrival on destination
//   status           - Check account balances and strategy state
//
// Environment:
//   PRIVATE_KEY       - Wallet private key (required)
//   RPC_URL_BASE      - Base RPC (backend .env convention)
//   RPC_URL_UNICHAIN  - Unichain RPC (backend .env convention)
//   BASE_RPC_URL      - Base RPC (fallback, contracts convention)
//   UNICHAIN_RPC_URL  - Unichain RPC (fallback, contracts convention)
//   WETH_AMOUNT       - Amount of WETH to use in human units (default: 0.01)
//   ACCOUNT_ADDRESS   - Skip account creation, use existing account
//   STRATEGY_HASH     - Resume from existing shipped strategy (skip ship step)
//   BRIDGE_TX_HASH    - Bridge tx hash on source chain (for standalone poll step)
//   DIRECTION         - base-to-unichain (default) or unichain-to-base
// ============================================

import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
  encodePacked,
  concat,
  parseEther,
  formatEther,
  formatUnits,
  decodeEventLog,
  type Address,
  type Hex,
  type TransactionReceipt,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, unichain } from "viem/chains";

import {
  AccountFactoryAbi,
  AccountAbi,
  StargateAdapterAbi,
  ERC20Abi,
  CHAIN_ADDRESSES,
  CHAIN_ID_TO_LZ_EID,
} from "@aqua0/shared";

// ============================================
// CONSTANTS
// ============================================

// LayerZero scan API for tracking message delivery
const LAYERZERO_SCAN_API = "https://scan.layerzero-api.com";

// Gas limits for LayerZero compose (from contract tests)
const LZ_RECEIVE_GAS = 128_000n;
const LZ_COMPOSE_GAS = 200_000n;

// WETH ABI (deposit/withdraw for wrapping ETH)
const WETHAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ============================================
// DIRECTION & CHAIN CONFIG
// ============================================

type Direction = "base-to-unichain" | "unichain-to-base";
const DIRECTION = (process.env.DIRECTION || "base-to-unichain") as Direction;

interface ChainConfig {
  name: string;
  chain: Chain;
  rpc: string;
  addresses: (typeof CHAIN_ADDRESSES)["base"];
  weth: Address;
  lzEid: number;
  chainId: number;
}

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  base: {
    name: "Base",
    chain: base,
    rpc: process.env.RPC_URL_BASE || process.env.BASE_RPC_URL || "https://mainnet.base.org",
    addresses: CHAIN_ADDRESSES.base,
    weth: "0x4200000000000000000000000000000000000006" as Address,
    lzEid: CHAIN_ID_TO_LZ_EID[8453], // 30184
    chainId: 8453,
  },
  unichain: {
    name: "Unichain",
    chain: unichain,
    rpc: process.env.RPC_URL_UNICHAIN || process.env.UNICHAIN_RPC_URL || "https://mainnet.unichain.org",
    addresses: CHAIN_ADDRESSES.unichain,
    weth: "0x4200000000000000000000000000000000000006" as Address,
    lzEid: CHAIN_ID_TO_LZ_EID[130], // 30320
    chainId: 130,
  },
};

const [srcChainKey, dstChainKey] = DIRECTION === "base-to-unichain"
  ? ["base", "unichain"] as const
  : ["unichain", "base"] as const;
const srcConfig = CHAIN_CONFIGS[srcChainKey];
const dstConfig = CHAIN_CONFIGS[dstChainKey];

// ============================================
// STRATEGY BUILDER (inline — minimal SwapVM encoding)
// ============================================

const USE_AQUA_BIT = 1n << 254n;

const OP_DYNAMIC_BALANCES = 18;
const OP_XYC_SWAP = 22;
const OP_SALT = 37;
const OP_FLAT_FEE_IN = 38;

function encodeInstruction(opcode: number, args: Hex = "0x"): Hex {
  const argsBytes = args === "0x" ? 0 : (args.length - 2) / 2;
  const header = encodePacked(["uint8", "uint8"], [opcode, argsBytes]);
  if (argsBytes === 0) return header;
  return concat([header, args]);
}

function dynamicBalances(tokens: Address[], balances: bigint[]): Hex {
  const types: string[] = ["uint16"];
  const values: unknown[] = [tokens.length];
  for (const token of tokens) { types.push("address"); values.push(token); }
  for (const balance of balances) { types.push("uint256"); values.push(balance); }
  return encodeInstruction(OP_DYNAMIC_BALANCES, encodePacked(types, values));
}

function flatFeeAmountIn(feeBps: number): Hex {
  return encodeInstruction(OP_FLAT_FEE_IN, encodePacked(["uint32"], [feeBps]));
}

function saltInstr(value: bigint): Hex {
  return encodeInstruction(OP_SALT, encodePacked(["uint64"], [value]));
}

function xycSwap(): Hex {
  return encodeInstruction(OP_XYC_SWAP);
}

function buildProgram(instructions: Hex[]): Hex {
  return concat(instructions);
}

function encodeStrategy(maker: Address, traits: bigint, data: Hex): Hex {
  return encodeAbiParameters(
    [{
      type: "tuple",
      components: [
        { name: "maker", type: "address" },
        { name: "traits", type: "uint256" },
        { name: "data", type: "bytes" },
      ],
    }],
    [{ maker, traits, data }],
  );
}

function computeStrategyHash(strategyBytes: Hex): Hex {
  return keccak256(strategyBytes);
}

function buildStrategyBytes(
  maker: Address,
  tokens: Address[],
  amounts: bigint[],
): { strategyBytes: Hex; strategyHash: Hex } {
  const program = buildProgram([
    dynamicBalances(tokens, amounts),
    flatFeeAmountIn(30), // 0.3% fee
    saltInstr(BigInt(Date.now())), // unique salt
    xycSwap(),
  ]);
  const strategyBytes = encodeStrategy(maker, USE_AQUA_BIT, program);
  const strategyHash = computeStrategyHash(strategyBytes);
  return { strategyBytes, strategyHash };
}

// ============================================
// SETUP
// ============================================

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("Error: PRIVATE_KEY environment variable is required");
  process.exit(1);
}

const signer = privateKeyToAccount(PRIVATE_KEY as Hex);
const WETH_AMOUNT = parseEther(process.env.WETH_AMOUNT || "0.01");

// Source chain clients
const srcWallet = createWalletClient({
  account: signer,
  chain: srcConfig.chain,
  transport: http(srcConfig.rpc),
});
const srcPublic = createPublicClient({
  chain: srcConfig.chain,
  transport: http(srcConfig.rpc),
});

// Destination chain clients
const dstWallet = createWalletClient({
  account: signer,
  chain: dstConfig.chain,
  transport: http(dstConfig.rpc),
});
const dstPublic = createPublicClient({
  chain: dstConfig.chain,
  transport: http(dstConfig.rpc),
});

// ============================================
// HELPERS
// ============================================

function log(step: string, msg: string) {
  console.log(`[${step}] ${msg}`);
}

// Track nonces locally per chain to avoid stale RPC getTransactionCount
const chainNonces: Record<string, number> = {};

async function sendTx(
  wallet: WalletClient,
  publicClient: PublicClient,
  description: string,
  to: Address,
  data: Hex,
  value?: bigint,
): Promise<TransactionReceipt> {
  const chainName = (wallet.chain as Chain).name;
  log("tx", `Sending on ${chainName}: ${description}`);

  if (chainNonces[chainName] === undefined) {
    chainNonces[chainName] = await publicClient.getTransactionCount({
      address: signer.address,
    });
  }
  const nonce = chainNonces[chainName];

  const hash = await wallet.sendTransaction({ to, data, value, nonce });
  chainNonces[chainName]++;
  log("tx", `  Hash: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction failed: ${description} (hash: ${hash})`);
  }
  log("tx", `  Confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compute the factory salt for a given factory address. */
async function computeFactorySalt(factoryAddr: Address): Promise<Hex> {
  const messageHash = keccak256(
    encodePacked(["string", "address"], ["aqua0.create-account:", factoryAddr]),
  );
  const signature = await signer.signMessage({ message: { raw: messageHash } });
  return keccak256(signature as Hex);
}

// ============================================
// STEP 1: CREATE ACCOUNT (both chains)
// ============================================

async function createAccountOnChain(
  chainName: string,
  factoryAddr: Address,
  wallet: WalletClient,
  publicClient: PublicClient,
): Promise<Address> {
  const messageHash = keccak256(
    encodePacked(["string", "address"], ["aqua0.create-account:", factoryAddr]),
  );
  const signature = await signer.signMessage({ message: { raw: messageHash } });
  const salt = keccak256(signature as Hex);

  const existingAccount = await publicClient.readContract({
    address: factoryAddr,
    abi: AccountFactoryAbi,
    functionName: "getAccount",
    args: [signer.address, salt],
  });

  if (existingAccount !== "0x0000000000000000000000000000000000000000") {
    const code = await publicClient.getCode({ address: existingAccount });
    if (code && code !== "0x") {
      log("create", `[${chainName}] Account already exists: ${existingAccount}`);
      return existingAccount;
    }
  }

  const data = encodeFunctionData({
    abi: AccountFactoryAbi,
    functionName: "createAccount",
    args: [signature],
  });

  const receipt = await sendTx(wallet, publicClient, "createAccount", factoryAddr, data);

  const accountCreatedTopic = keccak256(
    encodePacked(["string"], ["AccountCreated(address,address,bytes32)"]),
  );
  const createLog = receipt.logs.find(
    (l) => l.topics[0] === accountCreatedTopic,
  );
  if (!createLog?.topics[1]) {
    throw new Error(`AccountCreated event not found in receipt on ${chainName}`);
  }

  const lpAccountAddr = ("0x" + createLog.topics[1].slice(26)) as Address;
  log("create", `[${chainName}] LP Account created: ${lpAccountAddr}`);
  return lpAccountAddr;
}

async function createAccounts(): Promise<Address> {
  if (process.env.ACCOUNT_ADDRESS) {
    const addr = process.env.ACCOUNT_ADDRESS as Address;
    log("create", `Using existing account: ${addr}`);

    const code = await dstPublic.getCode({ address: addr });
    if (!code || code === "0x") {
      log("create", `Account not found on ${dstConfig.name} — creating it...`);
      const dstFactory = dstConfig.addresses.accountFactory! as Address;
      await createAccountOnChain(dstConfig.name, dstFactory, dstWallet, dstPublic);
    } else {
      log("create", `Account exists on ${dstConfig.name}`);
    }

    return addr;
  }

  const srcFactory = srcConfig.addresses.accountFactory! as Address;
  const lpAccountAddr = await createAccountOnChain(srcConfig.name, srcFactory, srcWallet, srcPublic);

  const dstFactory = dstConfig.addresses.accountFactory! as Address;
  const dstAccountAddr = await createAccountOnChain(dstConfig.name, dstFactory, dstWallet, dstPublic);

  if (lpAccountAddr.toLowerCase() !== dstAccountAddr.toLowerCase()) {
    log("create", "WARNING: Account addresses differ!");
    log("create", `  ${srcConfig.name}: ${lpAccountAddr}`);
    log("create", `  ${dstConfig.name}: ${dstAccountAddr}`);
  }

  return lpAccountAddr;
}

// ============================================
// STEP 2: SETUP (authorize rebalancer, approve, fund WETH)
// ============================================

async function setup(lpAccountAddr: Address) {
  const rebalancerAddr = srcConfig.addresses.rebalancer! as Address;

  // Authorize rebalancer
  const isAuthorized = await srcPublic.readContract({
    address: lpAccountAddr,
    abi: AccountAbi,
    functionName: "rebalancerAuthorized",
  });

  if (!isAuthorized) {
    await sendTx(
      srcWallet, srcPublic,
      "authorizeRebalancer",
      lpAccountAddr,
      encodeFunctionData({
        abi: AccountAbi,
        functionName: "authorizeRebalancer",
        args: [rebalancerAddr],
      }),
    );
  } else {
    log("setup", "Rebalancer already authorized");
  }

  // Approve Aqua for WETH
  const aquaAddr = srcConfig.addresses.aquaRouter! as Address;
  const currentAllowance = await srcPublic.readContract({
    address: srcConfig.weth,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [lpAccountAddr, aquaAddr],
  });
  if (currentAllowance < WETH_AMOUNT) {
    await sendTx(
      srcWallet, srcPublic,
      "approveAqua(WETH)",
      lpAccountAddr,
      encodeFunctionData({
        abi: AccountAbi,
        functionName: "approveAqua",
        args: [srcConfig.weth, 2n ** 256n - 1n],
      }),
    );
  } else {
    log("setup", "Aqua WETH allowance already sufficient");
  }

  // Check WETH balance
  const wethBalance = await srcPublic.readContract({
    address: srcConfig.weth,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [lpAccountAddr],
  });
  log("setup", `LP Account WETH balance: ${formatEther(wethBalance)} WETH`);

  if (wethBalance < WETH_AMOUNT) {
    const wethNeeded = WETH_AMOUNT - wethBalance;

    // Quote the Stargate bridge fee upfront so we know total ETH required
    log("setup", "Quoting Stargate bridge fee to calculate total ETH needed...");
    const stargateAdapterAddr = srcConfig.addresses.stargateAdapter! as Address;
    const dstComposer = dstConfig.addresses.composer! as Address;
    const minAmount = (WETH_AMOUNT * 95n) / 100n;

    // Build a temporary composeMsg for fee quoting
    const { strategyBytes: tmpDstStrategy } = buildStrategyBytes(
      lpAccountAddr,
      [dstConfig.weth],
      [WETH_AMOUNT],
    );
    const tmpComposeMsg = encodeAbiParameters(
      [
        { type: "address" },
        { type: "bytes" },
        { type: "address[]" },
        { type: "uint256[]" },
      ],
      [lpAccountAddr, tmpDstStrategy, [dstConfig.weth], [WETH_AMOUNT]],
    );

    const bridgeFee = await srcPublic.readContract({
      address: stargateAdapterAddr,
      abi: StargateAdapterAbi,
      functionName: "quoteBridgeWithComposeFee",
      args: [
        srcConfig.weth,
        dstConfig.lzEid,
        dstComposer,
        tmpComposeMsg,
        WETH_AMOUNT,
        minAmount,
        LZ_RECEIVE_GAS,
        LZ_COMPOSE_GAS,
      ],
    }) as bigint;

    // For native ETH Stargate pools, msg.value = amount + fee. So the wallet needs:
    //   - WETH (to fund the account, which the adapter pulls via transferFrom)
    //   - Native ETH = amount + fee (for the bridge msg.value)
    // The bridge amount is paid in BOTH forms: WETH to the account + native ETH as msg.value
    const bridgeMsgValue = wethNeeded + bridgeFee;

    log("setup", `  Bridge fee:       ${formatEther(bridgeFee)} ETH`);
    log("setup", `  WETH to fund:     ${formatEther(wethNeeded)} WETH`);
    log("setup", `  Bridge msg.value: ${formatEther(bridgeMsgValue)} ETH (amount + fee)`);

    // Check if wallet has enough WETH to transfer directly
    const walletWethBalance = await srcPublic.readContract({
      address: srcConfig.weth,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [signer.address],
    });

    if (walletWethBalance >= wethNeeded) {
      // Transfer WETH from wallet to account
      log("setup", `Transferring ${formatEther(wethNeeded)} WETH to LP Account...`);
      await sendTx(
        srcWallet, srcPublic,
        `transfer ${formatEther(wethNeeded)} WETH`,
        srcConfig.weth,
        encodeFunctionData({
          abi: ERC20Abi,
          functionName: "transfer",
          args: [lpAccountAddr, wethNeeded],
        }),
      );

      // Wallet still needs native ETH for bridge msg.value (amount + fee) + gas
      const remainingEth = await srcPublic.getBalance({ address: signer.address });
      log("setup", `  Remaining wallet ETH: ${formatEther(remainingEth)} (need ~${formatEther(bridgeMsgValue)} for bridge)`);
      if (remainingEth < bridgeMsgValue) {
        console.error(
          `\nInsufficient ETH for bridge. Need ${formatEther(bridgeMsgValue)} ETH (amount + fee) but wallet has ${formatEther(remainingEth)} ETH.` +
            `\nFund your wallet (${signer.address}) with more ETH on ${srcConfig.name}.`,
        );
        process.exit(1);
      }
    } else {
      // Need to wrap ETH → WETH for the account, plus keep ETH for bridge msg.value
      const walletEthBalance = await srcPublic.getBalance({ address: signer.address });
      // Total ETH = WETH to wrap (for account) + bridge msg.value (amount + fee for Stargate)
      const totalEthNeeded = wethNeeded + bridgeMsgValue;

      log("setup", `  Total ETH needed: ${formatEther(totalEthNeeded)} (${formatEther(wethNeeded)} wrap + ${formatEther(bridgeMsgValue)} bridge value)`);
      log("setup", `  Wallet ETH balance: ${formatEther(walletEthBalance)}`);

      if (walletEthBalance < totalEthNeeded) {
        console.error(
          `\nInsufficient ETH. Breakdown:` +
            `\n  WETH to wrap:        ${formatEther(wethNeeded)}` +
            `\n  Bridge msg.value:    ${formatEther(bridgeMsgValue)} (amount + LZ fee)` +
            `\n  Total needed:        ${formatEther(totalEthNeeded)} ETH (+ gas)` +
            `\n  Wallet ETH:          ${formatEther(walletEthBalance)}` +
            `\n  Wallet WETH:         ${formatEther(walletWethBalance)}` +
            `\nFund your wallet (${signer.address}) with ETH on ${srcConfig.name} first.`,
        );
        process.exit(1);
      }

      // Wrap ETH → WETH
      log("setup", `Wrapping ${formatEther(wethNeeded)} ETH → WETH...`);
      await sendTx(
        srcWallet, srcPublic,
        `deposit ${formatEther(wethNeeded)} ETH → WETH`,
        srcConfig.weth,
        encodeFunctionData({
          abi: WETHAbi,
          functionName: "deposit",
        }),
        wethNeeded,
      );

      // Wait for RPC state to catch up after wrap before transferring
      await sleep(2_000);

      // Transfer WETH to account
      log("setup", `Transferring ${formatEther(wethNeeded)} WETH to LP Account...`);
      await sendTx(
        srcWallet, srcPublic,
        `transfer ${formatEther(wethNeeded)} WETH`,
        srcConfig.weth,
        encodeFunctionData({
          abi: ERC20Abi,
          functionName: "transfer",
          args: [lpAccountAddr, wethNeeded],
        }),
      );
    }
  } else {
    log("setup", "LP Account already has sufficient WETH");
  }
}

// ============================================
// STEP 3: SHIP WETH STRATEGY
// ============================================

async function shipStrategy(
  lpAccountAddr: Address,
): Promise<{ strategyHash: Hex; strategyBytes: Hex }> {
  // Check for existing strategy via STRATEGY_HASH env var (resume from failed run)
  const existingHash = process.env.STRATEGY_HASH as Hex | undefined;
  if (existingHash) {
    log("ship", `Checking existing strategy: ${existingHash}`);
    const rawBalance = await srcPublic.readContract({
      address: lpAccountAddr,
      abi: AccountAbi,
      functionName: "getRawBalance",
      args: [existingHash, srcConfig.weth],
    }) as [bigint, number];

    if (rawBalance[0] > 0n) {
      log("ship", `Strategy already shipped with ${formatEther(rawBalance[0])} WETH — skipping ship`);
      // We don't have the original strategyBytes, but we don't need them for dock/bridge
      return { strategyHash: existingHash, strategyBytes: "0x" as Hex };
    }

    // Strategy has zero balance — might already be docked. Check if account holds WETH
    const wethBalance = await srcPublic.readContract({
      address: srcConfig.weth,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [lpAccountAddr],
    });
    if ((wethBalance as bigint) > 0n) {
      log("ship", `Strategy already docked (account holds ${formatEther(wethBalance as bigint)} WETH) — skipping ship`);
      return { strategyHash: existingHash, strategyBytes: "0x" as Hex };
    }

    log("ship", "Existing strategy has zero balance and account has no WETH — shipping fresh");
  }

  const { strategyBytes, strategyHash } = buildStrategyBytes(
    lpAccountAddr,
    [srcConfig.weth],
    [WETH_AMOUNT],
  );

  log("ship", `Strategy hash: ${strategyHash}`);
  log("ship", `Shipping ${formatEther(WETH_AMOUNT)} WETH...`);

  await sendTx(
    srcWallet, srcPublic,
    "ship(WETH strategy)",
    lpAccountAddr,
    encodeFunctionData({
      abi: AccountAbi,
      functionName: "ship",
      args: [strategyBytes, [srcConfig.weth], [WETH_AMOUNT]],
    }),
  );

  // Wait for RPC state to catch up after ship before dock
  await sleep(2_000);

  log("ship", "Strategy shipped successfully");
  return { strategyHash, strategyBytes };
}

// ============================================
// STEP 4: BRIDGE VIA STARGATE
// ============================================

function buildComposeMsg(lpAccountAddr: Address): Hex {
  const { strategyBytes: dstStrategyBytes } = buildStrategyBytes(
    lpAccountAddr,
    [dstConfig.weth],
    [WETH_AMOUNT],
  );

  return encodeAbiParameters(
    [
      { type: "address" },
      { type: "bytes" },
      { type: "address[]" },
      { type: "uint256[]" },
    ],
    [lpAccountAddr, dstStrategyBytes, [dstConfig.weth], [WETH_AMOUNT]],
  );
}

async function bridgeStargate(
  lpAccountAddr: Address,
  strategyHash: Hex,
): Promise<{ bridgeTxHash: Hex; composeMsg: Hex }> {
  // 4a: Check if strategy is still shipped or already docked
  const rawBalance = await srcPublic.readContract({
    address: lpAccountAddr,
    abi: AccountAbi,
    functionName: "getRawBalance",
    args: [strategyHash, srcConfig.weth],
  }) as [bigint, number];

  if (rawBalance[0] > 0n) {
    log("bridge", `Strategy Aqua balance: ${formatEther(rawBalance[0])} WETH (tokensCount=${rawBalance[1]})`);

    // 4b: Dock the strategy (free tokens from Aqua)
    log("bridge", "Docking strategy to free WETH from Aqua...");
    await sendTx(
      srcWallet, srcPublic,
      "dock(strategy)",
      lpAccountAddr,
      encodeFunctionData({
        abi: AccountAbi,
        functionName: "dock",
        args: [strategyHash],
      }),
    );

    // Wait for RPC state to catch up after dock
    await sleep(2_000);
  } else {
    log("bridge", "Strategy already docked — skipping dock step");
  }

  const wethBalance = await srcPublic.readContract({
    address: srcConfig.weth,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [lpAccountAddr],
  });
  log("bridge", `WETH balance after dock: ${formatEther(wethBalance)}`);

  // 4c: Verify destination account is ready
  const dstCode = await dstPublic.getCode({ address: lpAccountAddr });
  if (!dstCode || dstCode === "0x") {
    throw new Error(
      `Account ${lpAccountAddr} not deployed on ${dstConfig.name}. ` +
      `Run 'create-account' step first.`,
    );
  }
  log("bridge", `${dstConfig.name} account verified`);

  // 4c: Build composeMsg for destination
  const composeMsg = buildComposeMsg(lpAccountAddr);
  const dstComposer = dstConfig.addresses.composer! as Address;

  // 4d: Quote the bridge fee
  const stargateAdapterAddr = srcConfig.addresses.stargateAdapter! as Address;
  const minAmount = (WETH_AMOUNT * 95n) / 100n; // 5% slippage

  log("bridge", "Quoting Stargate bridge fee...");
  const bridgeFee = await srcPublic.readContract({
    address: stargateAdapterAddr,
    abi: StargateAdapterAbi,
    functionName: "quoteBridgeWithComposeFee",
    args: [
      srcConfig.weth,
      dstConfig.lzEid,
      dstComposer,
      composeMsg,
      WETH_AMOUNT,
      minAmount,
      LZ_RECEIVE_GAS,
      LZ_COMPOSE_GAS,
    ],
  }) as bigint;

  log("bridge", `  Bridge fee: ${formatEther(bridgeFee)} ETH`);

  // 4e: Bridge WETH via Stargate
  // For native ETH Stargate pools (token() = address(0)), msg.value must include
  // both the bridge amount AND the LZ fee. The pool takes the bridged amount from
  // msg.value directly (not via ERC20 transferFrom).
  const totalBridgeValue = WETH_AMOUNT + bridgeFee;

  log("bridge", `Bridging ${formatEther(WETH_AMOUNT)} WETH ${srcConfig.name} -> ${dstConfig.name} via Stargate...`);
  log("bridge", `  Destination composer: ${dstComposer}`);
  log("bridge", `  Destination EID: ${dstConfig.lzEid}`);
  log("bridge", `  Min amount: ${formatEther(minAmount)} WETH (5% slippage)`);
  log("bridge", `  lzReceiveGas: ${LZ_RECEIVE_GAS}`);
  log("bridge", `  lzComposeGas: ${LZ_COMPOSE_GAS}`);
  log("bridge", `  Total value: ${formatEther(totalBridgeValue)} ETH (${formatEther(WETH_AMOUNT)} amount + ${formatEther(bridgeFee)} fee)`);

  const bridgeReceipt = await sendTx(
    srcWallet, srcPublic,
    `bridgeStargate(${srcConfig.name} -> ${dstConfig.name})`,
    lpAccountAddr,
    encodeFunctionData({
      abi: AccountAbi,
      functionName: "bridgeStargate",
      args: [
        dstConfig.lzEid,
        dstComposer,
        composeMsg,
        srcConfig.weth,
        WETH_AMOUNT,
        minAmount,
        LZ_RECEIVE_GAS,
        LZ_COMPOSE_GAS,
      ],
    }),
    totalBridgeValue, // amount + fee for native ETH Stargate pool
  );

  // Extract GUID from TokensBridged event
  const tokensBridgedTopic = keccak256(
    encodePacked(["string"], ["TokensBridged(uint32,address,uint256,uint256,bytes32)"]),
  );
  const bridgeLog = bridgeReceipt.logs.find(
    (l) => l.topics[0] === tokensBridgedTopic,
  );
  if (bridgeLog) {
    const decoded = decodeEventLog({
      abi: StargateAdapterAbi,
      data: bridgeLog.data,
      topics: bridgeLog.topics,
    });
    log("bridge", `  GUID: ${(decoded.args as any).guid}`);
  }

  log("bridge", "Stargate bridge transaction confirmed!");
  log("bridge", `  Tx: ${bridgeReceipt.transactionHash}`);

  return {
    bridgeTxHash: bridgeReceipt.transactionHash,
    composeMsg,
  };
}

// ============================================
// STEP 5: POLL FOR DELIVERY ON DESTINATION
// ============================================

async function pollDelivery(
  lpAccountAddr: Address,
  bridgeTxHash: Hex,
  maxWaitMs = 15 * 60 * 1000, // 15 minutes
  pollIntervalMs = 15_000, // 15 seconds
) {
  log("poll", `Polling for WETH delivery on ${dstConfig.name}...`);
  log("poll", `  Bridge tx: ${bridgeTxHash}`);
  log("poll", `  Account: ${lpAccountAddr}`);

  const startTime = Date.now();

  // Get initial WETH balance on destination
  const initialBalance = await dstPublic.readContract({
    address: dstConfig.weth,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [lpAccountAddr],
  }) as bigint;
  log("poll", `  Initial ${dstConfig.name} WETH balance: ${formatEther(initialBalance)}`);

  // Also try LayerZero Scan API for message tracking
  log("poll", `  LayerZero Scan: ${LAYERZERO_SCAN_API}/v1/messages/tx/${bridgeTxHash}`);

  while (Date.now() - startTime < maxWaitMs) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Check WETH balance on destination
    const currentBalance = await dstPublic.readContract({
      address: dstConfig.weth,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [lpAccountAddr],
    }) as bigint;

    if (currentBalance > initialBalance) {
      const received = currentBalance - initialBalance;
      log("poll", `  WETH received on ${dstConfig.name}! +${formatEther(received)} WETH`);
      log("poll", `  Total ${dstConfig.name} WETH balance: ${formatEther(currentBalance)}`);
      log("poll", `  Delivery confirmed after ${elapsed}s`);
      return;
    }

    // Optionally check LayerZero Scan API for message status
    try {
      const url = `${LAYERZERO_SCAN_API}/v1/messages/tx/${bridgeTxHash}`;
      const res = await fetch(url);

      if (res.ok) {
        const data = await res.json() as { messages?: Array<{ status?: string; dstTxHash?: string }> };
        if (data.messages && data.messages.length > 0) {
          const msg = data.messages[0];
          log("poll", `  LZ status: ${msg.status || "unknown"} (${elapsed}s elapsed)`);
          if (msg.dstTxHash) {
            log("poll", `  Destination tx: ${msg.dstTxHash}`);
          }
          if (msg.status === "DELIVERED") {
            // Give a moment for balance to update, then re-check
            await sleep(3_000);
            const finalBalance = await dstPublic.readContract({
              address: dstConfig.weth,
              abi: ERC20Abi,
              functionName: "balanceOf",
              args: [lpAccountAddr],
            }) as bigint;
            if (finalBalance > initialBalance) {
              const received = finalBalance - initialBalance;
              log("poll", `  WETH received on ${dstConfig.name}! +${formatEther(received)} WETH`);
              log("poll", `  Total ${dstConfig.name} WETH balance: ${formatEther(finalBalance)}`);
              return;
            }
          }
        } else {
          log("poll", `  LZ: No messages found yet (${elapsed}s elapsed)...`);
        }
      }
    } catch {
      // LZ Scan API errors are non-fatal, keep polling balance
    }

    log("poll", `  Waiting... (${elapsed}s elapsed)`);
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `WETH delivery not confirmed within ${maxWaitMs / 1000}s. ` +
    `You can retry later with: BRIDGE_TX_HASH=${bridgeTxHash} ACCOUNT_ADDRESS=${lpAccountAddr} ... poll`,
  );
}

// ============================================
// STATUS: Check account state
// ============================================

async function checkStatus(lpAccountAddr: Address) {
  log("status", `LP Account: ${lpAccountAddr}`);
  log("status", `Owner: ${signer.address}`);

  const srcWethBalance = await srcPublic.readContract({
    address: srcConfig.weth,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [lpAccountAddr],
  });
  const srcEthBalance = await srcPublic.getBalance({ address: lpAccountAddr });

  log("status", `\n--- ${srcConfig.name} (source) ---`);
  log("status", `  WETH: ${formatEther(srcWethBalance as bigint)}`);
  log("status", `  ETH:  ${formatEther(srcEthBalance)}`);

  const isAuthorized = await srcPublic.readContract({
    address: lpAccountAddr,
    abi: AccountAbi,
    functionName: "rebalancerAuthorized",
  });
  log("status", `  Rebalancer authorized: ${isAuthorized}`);

  try {
    const code = await dstPublic.getCode({ address: lpAccountAddr });
    if (code && code !== "0x") {
      const dstWethBalance = await dstPublic.readContract({
        address: dstConfig.weth,
        abi: ERC20Abi,
        functionName: "balanceOf",
        args: [lpAccountAddr],
      });
      const dstEthBalance = await dstPublic.getBalance({ address: lpAccountAddr });
      log("status", `\n--- ${dstConfig.name} (destination) ---`);
      log("status", `  WETH: ${formatEther(dstWethBalance as bigint)}`);
      log("status", `  ETH:  ${formatEther(dstEthBalance)}`);
    } else {
      log("status", `\n--- ${dstConfig.name} (destination) ---`);
      log("status", `  Account not yet deployed on ${dstConfig.name}`);
    }
  } catch {
    log("status", `\n--- ${dstConfig.name} (destination) ---`);
    log("status", `  Could not read ${dstConfig.name} state (RPC may be unavailable)`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  const step = process.argv[2];

  console.log("===========================================");
  console.log("  Aqua0 E2E Stargate Bridge Script");
  console.log("===========================================");
  console.log(`Wallet:    ${signer.address}`);
  console.log(`Amount:    ${formatEther(WETH_AMOUNT)} WETH`);
  console.log(`Route:     ${srcConfig.name} -> ${dstConfig.name} (Stargate/LayerZero)`);
  console.log(`Direction: ${DIRECTION}`);
  console.log("");

  let lpAccountAddr: Address;

  // --- status ---
  if (step === "status") {
    lpAccountAddr = process.env.ACCOUNT_ADDRESS as Address;
    if (!lpAccountAddr) {
      const factoryAddr = srcConfig.addresses.accountFactory! as Address;
      const salt = await computeFactorySalt(factoryAddr);
      lpAccountAddr = (await srcPublic.readContract({
        address: factoryAddr,
        abi: AccountFactoryAbi,
        functionName: "getAccount",
        args: [signer.address, salt],
      })) as Address;
      if (lpAccountAddr === "0x0000000000000000000000000000000000000000") {
        console.error("No account found. Run 'create-account' first or set ACCOUNT_ADDRESS.");
        process.exit(1);
      }
    }
    await checkStatus(lpAccountAddr);
    return;
  }

  // --- poll (standalone) ---
  if (step === "poll") {
    const bridgeTxHash = process.env.BRIDGE_TX_HASH as Hex;
    if (!bridgeTxHash) {
      console.error("BRIDGE_TX_HASH required for standalone poll step.");
      process.exit(1);
    }
    lpAccountAddr = process.env.ACCOUNT_ADDRESS as Address;
    if (!lpAccountAddr) {
      console.error("ACCOUNT_ADDRESS required for standalone poll step.");
      process.exit(1);
    }
    await pollDelivery(lpAccountAddr, bridgeTxHash);
    return;
  }

  // --- create-account ---
  if (!step || step === "create-account") {
    lpAccountAddr = await createAccounts();
    console.log(`\nACCOUNT_ADDRESS=${lpAccountAddr}\n`);
    if (step === "create-account") return;
  } else {
    lpAccountAddr = process.env.ACCOUNT_ADDRESS as Address;
    if (!lpAccountAddr) {
      console.error(
        "ACCOUNT_ADDRESS required when running individual steps (except create-account).",
      );
      process.exit(1);
    }
  }

  // --- setup ---
  if (!step || step === "setup") {
    await setup(lpAccountAddr);
    if (step === "setup") return;
  }

  // --- ship ---
  if (!step || step === "ship") {
    const { strategyHash } = await shipStrategy(lpAccountAddr);
    console.log(`\nSTRATEGY_HASH=${strategyHash}\n`);

    if (!step) {
      // Full flow — continue to bridge + poll
      const { bridgeTxHash } = await bridgeStargate(lpAccountAddr, strategyHash);
      console.log(`\nBRIDGE_TX_HASH=${bridgeTxHash}\n`);

      // Poll for delivery on destination
      await pollDelivery(lpAccountAddr, bridgeTxHash);
    }
    if (step === "ship") return;
  }

  if (step === "bridge") {
    console.error(
      "The 'bridge' step must be run as part of the full flow (no step argument),\n" +
        "or use 'poll' step with BRIDGE_TX_HASH if bridge already completed.\n\n" +
        "Full flow:  PRIVATE_KEY=0x... bun run scripts/e2e-stargate-bridge.ts\n" +
        "Poll only:  BRIDGE_TX_HASH=0x... ACCOUNT_ADDRESS=0x... ... poll",
    );
    process.exit(1);
  }

  console.log("\n===========================================");
  console.log("  E2E Stargate Bridge Complete!");
  console.log("===========================================");
}

main().catch((err) => {
  console.error("\nFatal error:", err.message || err);
  process.exit(1);
});
