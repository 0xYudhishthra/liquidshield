#!/usr/bin/env bun
// ============================================
// E2E CCTP Bridge Script
// Creates LP account on both chains, funds it, ships a strategy,
// bridges USDC via CCTP, polls for Circle attestation, and relays
// the composed message on the destination chain.
//
// Usage:
//   PRIVATE_KEY=0x... bun run scripts/e2e-cctp-bridge.ts [step]
//
// Steps (run in order, or omit to run all):
//   create-account   - Create LP account on both chains
//   setup            - Authorize rebalancer, approve Aqua, fund USDC
//   ship             - Ship a USDC strategy into Aqua
//   bridge           - Dock strategy + bridge USDC via CCTP
//   relay            - Poll for attestation + relay on destination
//   status           - Check account balances and strategy state
//
// Environment:
//   PRIVATE_KEY       - Wallet private key (required)
//   RPC_URL_BASE      - Base RPC (backend .env convention)
//   RPC_URL_UNICHAIN  - Unichain RPC (backend .env convention)
//   BASE_RPC_URL      - Base RPC (fallback, contracts convention)
//   UNICHAIN_RPC_URL  - Unichain RPC (fallback, contracts convention)
//   USDC_AMOUNT       - Amount of USDC to use in human units (default: 10)
//   ACCOUNT_ADDRESS   - Skip account creation, use existing account
//   BRIDGE_TX_HASH    - Bridge tx hash on source chain (for standalone relay step)
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
  parseUnits,
  formatUnits,
  decodeAbiParameters,
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
  CCTPComposerAbi,
  ERC20Abi,
  CHAIN_ADDRESSES,
} from "@aqua0/shared";

// ============================================
// CONSTANTS
// ============================================

const WETH = "0x4200000000000000000000000000000000000006" as Address;

// Circle attestation API
const CIRCLE_API = "https://iris-api.circle.com";

// MessageSent(bytes) event topic — emitted by MessageTransmitterV2
const MESSAGE_SENT_TOPIC = keccak256(
  encodePacked(["string"], ["MessageSent(bytes)"]),
);

// hookData starts at byte 376 in CCTP message (144 header + 232 burn body)
// BurnMessageV2 body: version[4] + burnSource[4] + burnToken[32] + mintRecipient[32]
//   + amount[32] + messageSender[32] + maxFee[32] + feeExecuted[32] + mintAmount[32] = 232
const HOOK_DATA_OFFSET = 376;

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
  usdc: Address;
  cctpDomain: number;
}

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  base: {
    name: "Base",
    chain: base,
    rpc: process.env.RPC_URL_BASE || process.env.BASE_RPC_URL || "https://mainnet.base.org",
    addresses: CHAIN_ADDRESSES.base,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    cctpDomain: 6,
  },
  unichain: {
    name: "Unichain",
    chain: unichain,
    rpc: process.env.RPC_URL_UNICHAIN || process.env.UNICHAIN_RPC_URL || "https://mainnet.unichain.org",
    addresses: CHAIN_ADDRESSES.unichain,
    usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6" as Address,
    cctpDomain: 10,
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
const USDC_AMOUNT = parseUnits(process.env.USDC_AMOUNT || "10", 6);

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

/** Compute the factory salt for a given factory address.
 *  Salt = keccak256(signature) where signature is over the create-account message. */
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
  // Sign the create-account message first so we can derive the correct salt
  // Factory stores accounts under salt = keccak256(signature)
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
// STEP 2: SETUP (authorize rebalancer, approve, fund)
// ============================================

async function setup(lpAccountAddr: Address) {
  const rebalancerAddr = srcConfig.addresses.rebalancer! as Address;

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

  // Only approve Aqua if allowance is insufficient
  const aquaAddr = srcConfig.addresses.aquaRouter! as Address;
  const currentAllowance = await srcPublic.readContract({
    address: srcConfig.usdc,
    abi: ERC20Abi,
    functionName: "allowance",
    args: [lpAccountAddr, aquaAddr],
  });
  if (currentAllowance < USDC_AMOUNT) {
    await sendTx(
      srcWallet, srcPublic,
      "approveAqua(USDC)",
      lpAccountAddr,
      encodeFunctionData({
        abi: AccountAbi,
        functionName: "approveAqua",
        args: [srcConfig.usdc, 2n ** 256n - 1n],
      }),
    );
  } else {
    log("setup", "Aqua USDC allowance already sufficient");
  }

  const usdcBalance = await srcPublic.readContract({
    address: srcConfig.usdc,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [lpAccountAddr],
  });
  log("setup", `LP Account USDC balance: ${formatUnits(usdcBalance, 6)} USDC`);

  if (usdcBalance < USDC_AMOUNT) {
    const walletBalance = await srcPublic.readContract({
      address: srcConfig.usdc,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [signer.address],
    });

    const needed = USDC_AMOUNT - usdcBalance;
    if (walletBalance < needed) {
      console.error(
        `\nInsufficient USDC. Need ${formatUnits(needed, 6)} more USDC.` +
          `\nWallet balance: ${formatUnits(walletBalance, 6)} USDC` +
          `\nFund your wallet (${signer.address}) with USDC on ${srcConfig.name} first.`,
      );
      process.exit(1);
    }

    log("setup", `Transferring ${formatUnits(needed, 6)} USDC to LP Account...`);
    await sendTx(
      srcWallet, srcPublic,
      `transfer ${formatUnits(needed, 6)} USDC`,
      srcConfig.usdc,
      encodeFunctionData({
        abi: ERC20Abi,
        functionName: "transfer",
        args: [lpAccountAddr, needed],
      }),
    );
  } else {
    log("setup", "LP Account already has sufficient USDC");
  }
}

// ============================================
// STEP 3: SHIP USDC STRATEGY
// ============================================

async function shipStrategy(
  lpAccountAddr: Address,
): Promise<{ strategyHash: Hex; strategyBytes: Hex }> {
  const { strategyBytes, strategyHash } = buildStrategyBytes(
    lpAccountAddr,
    [srcConfig.usdc],
    [USDC_AMOUNT],
  );

  log("ship", `Strategy hash: ${strategyHash}`);
  log("ship", `Shipping ${formatUnits(USDC_AMOUNT, 6)} USDC...`);

  await sendTx(
    srcWallet, srcPublic,
    "ship(USDC strategy)",
    lpAccountAddr,
    encodeFunctionData({
      abi: AccountAbi,
      functionName: "ship",
      args: [strategyBytes, [srcConfig.usdc], [USDC_AMOUNT]],
    }),
  );

  // Wait for RPC state to catch up after ship before dock
  await sleep(2_000);

  log("ship", "Strategy shipped successfully");
  return { strategyHash, strategyBytes };
}

// ============================================
// STEP 4: BRIDGE VIA CCTP
// ============================================

function buildHookData(lpAccountAddr: Address): Hex {
  const { strategyBytes: dstStrategyBytes } = buildStrategyBytes(
    lpAccountAddr,
    [dstConfig.usdc],
    [USDC_AMOUNT],
  );

  return encodeAbiParameters(
    [
      { type: "address" },
      { type: "bytes" },
      { type: "address[]" },
      { type: "uint256[]" },
    ],
    [lpAccountAddr, dstStrategyBytes, [dstConfig.usdc], [USDC_AMOUNT]],
  );
}

async function bridgeCCTP(
  lpAccountAddr: Address,
  strategyHash: Hex,
): Promise<{ bridgeTxHash: Hex; hookData: Hex }> {
  // 4a: Check if strategy is still shipped or already docked
  const rawBalance = await srcPublic.readContract({
    address: lpAccountAddr,
    abi: AccountAbi,
    functionName: "getRawBalance",
    args: [strategyHash, srcConfig.usdc],
  }) as [bigint, number];

  if (rawBalance[0] > 0n) {
    log("bridge", `Strategy Aqua balance: ${formatUnits(rawBalance[0], 6)} USDC (tokensCount=${rawBalance[1]})`);

    // 4b: Dock the strategy (free tokens from Aqua)
    log("bridge", "Docking strategy to free USDC from Aqua...");
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

  const usdcBalance = await srcPublic.readContract({
    address: srcConfig.usdc,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [lpAccountAddr],
  });
  log("bridge", `USDC balance after dock: ${formatUnits(usdcBalance, 6)}`);

  // 4c: Verify destination account is ready
  const dstCode = await dstPublic.getCode({ address: lpAccountAddr });
  if (!dstCode || dstCode === "0x") {
    throw new Error(
      `Account ${lpAccountAddr} not deployed on ${dstConfig.name}. ` +
      `Run 'create-account' step first.`,
    );
  }
  log("bridge", `${dstConfig.name} account verified`);

  // 4d: Build hookData for destination
  const hookData = buildHookData(lpAccountAddr);
  const dstComposer = dstConfig.addresses.cctpComposer! as Address;

  // 4e: Bridge USDC via CCTP
  log("bridge", `Bridging ${formatUnits(USDC_AMOUNT, 6)} USDC ${srcConfig.name} -> ${dstConfig.name} via CCTP...`);
  log("bridge", `  Destination composer: ${dstComposer}`);
  log("bridge", `  CCTP domain: ${dstConfig.cctpDomain}`);

  const bridgeReceipt = await sendTx(
    srcWallet, srcPublic,
    `bridgeCCTP(${srcConfig.name} -> ${dstConfig.name})`,
    lpAccountAddr,
    encodeFunctionData({
      abi: AccountAbi,
      functionName: "bridgeCCTP",
      args: [
        dstConfig.cctpDomain,
        dstComposer,
        hookData,
        srcConfig.usdc,
        USDC_AMOUNT,
        0n,
        1000,
      ],
    }),
  );

  log("bridge", "CCTP bridge transaction confirmed!");
  log("bridge", `  Tx: ${bridgeReceipt.transactionHash}`);

  return {
    bridgeTxHash: bridgeReceipt.transactionHash,
    hookData,
  };
}

// ============================================
// STEP 5: POLL ATTESTATION + RELAY ON DESTINATION
// ============================================

async function extractMessageFromReceipt(txHash: Hex): Promise<Hex> {
  const receipt = await srcPublic.getTransactionReceipt({ hash: txHash });

  const msgLog = receipt.logs.find(
    (l) => l.topics[0] === MESSAGE_SENT_TOPIC,
  );
  if (!msgLog) {
    throw new Error(`MessageSent event not found in tx ${txHash}`);
  }

  // MessageSent(bytes) — the message is ABI-encoded as a dynamic bytes param
  const [message] = decodeAbiParameters(
    [{ type: "bytes" }],
    msgLog.data,
  );

  return message as Hex;
}

async function pollAttestation(
  txHash: Hex,
  maxWaitMs = 30 * 60 * 1000, // 30 minutes (L1 finality takes ~15-20 min)
  pollIntervalMs = 15_000, // 15 seconds
): Promise<{ message: Hex; attestation: Hex }> {
  log("relay", `Polling Circle attestation API for tx ${txHash}...`);
  log("relay", `  Source domain: ${srcConfig.cctpDomain} (${srcConfig.name})`);

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const url = `${CIRCLE_API}/v2/messages/${srcConfig.cctpDomain}?transactionHash=${txHash}`;
      const res = await fetch(url);

      if (res.status === 429) {
        log("relay", "  Rate limited — waiting 30s...");
        await sleep(30_000);
        continue;
      }

      if (!res.ok) {
        log("relay", `  API returned ${res.status} — retrying...`);
        await sleep(pollIntervalMs);
        continue;
      }

      const data = await res.json() as {
        messages: Array<{
          message: string;
          attestation: string;
          status: string;
        }>;
      };

      if (!data.messages || data.messages.length === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        log("relay", `  No messages yet (${elapsed}s elapsed)...`);
        await sleep(pollIntervalMs);
        continue;
      }

      const msg = data.messages[0];

      if (msg.status === "complete" && msg.attestation && msg.attestation !== "PENDING") {
        log("relay", "  Attestation received!");
        return {
          message: msg.message as Hex,
          attestation: msg.attestation as Hex,
        };
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      log("relay", `  Status: ${msg.status} (${elapsed}s elapsed)...`);
    } catch (err: any) {
      log("relay", `  Fetch error: ${err.message} — retrying...`);
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Attestation not received within ${maxWaitMs / 1000}s. ` +
    `You can retry later with: BRIDGE_TX_HASH=${txHash} ... relay`,
  );
}

async function relayOnDestination(
  bridgeTxHash: Hex,
  hookData: Hex,
) {
  // Step 1: Get attestation from Circle API (attestation is signed over this message)
  const { message, attestation } = await pollAttestation(bridgeTxHash);

  // Extract hookData from the message (bytes 372 onwards)
  const messageHex = message.slice(2); // remove 0x
  const hookDataFromMsg = ("0x" + messageHex.slice(HOOK_DATA_OFFSET * 2)) as Hex;
  if (keccak256(hookDataFromMsg) !== keccak256(hookData)) {
    log("relay", "WARNING: hookData from message doesn't match locally-built hookData");
    log("relay", "  Using hookData from message (contract will verify match)");
  }

  // composePayload = hookData (CCTPComposer verifies they match)
  const composePayload = hookDataFromMsg;

  const dstComposer = dstConfig.addresses.cctpComposer! as Address;

  log("relay", `Relaying on ${dstConfig.name}...`);
  log("relay", `  Composer: ${dstComposer}`);
  log("relay", `  Message length: ${(message.length - 2) / 2} bytes`);
  log("relay", `  Attestation length: ${(attestation.length - 2) / 2} bytes`);

  const receipt = await sendTx(
    dstWallet, dstPublic,
    "relayAndCompose",
    dstComposer,
    encodeFunctionData({
      abi: CCTPComposerAbi,
      functionName: "relayAndCompose",
      args: [message, attestation, composePayload],
    }),
  );

  log("relay", "Relay successful!");
  log("relay", `  ${dstConfig.name} tx: ${receipt.transactionHash}`);

  // Verify USDC arrived on destination
  const lpAccountAddr = process.env.ACCOUNT_ADDRESS as Address;
  if (lpAccountAddr) {
    const dstUsdcBalance = await dstPublic.readContract({
      address: dstConfig.usdc,
      abi: ERC20Abi,
      functionName: "balanceOf",
      args: [lpAccountAddr],
    });
    log("relay", `  ${dstConfig.name} USDC balance: ${formatUnits(dstUsdcBalance, 6)}`);
  }

  return receipt;
}

// ============================================
// STATUS: Check account state
// ============================================

async function checkStatus(lpAccountAddr: Address) {
  log("status", `LP Account: ${lpAccountAddr}`);
  log("status", `Owner: ${signer.address}`);

  const srcUsdcBalance = await srcPublic.readContract({
    address: srcConfig.usdc,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [lpAccountAddr],
  });
  const srcWethBalance = await srcPublic.readContract({
    address: WETH,
    abi: ERC20Abi,
    functionName: "balanceOf",
    args: [lpAccountAddr],
  });

  log("status", `\n--- ${srcConfig.name} (source) ---`);
  log("status", `  USDC: ${formatUnits(srcUsdcBalance, 6)}`);
  log("status", `  WETH: ${formatUnits(srcWethBalance, 18)}`);

  const isAuthorized = await srcPublic.readContract({
    address: lpAccountAddr,
    abi: AccountAbi,
    functionName: "rebalancerAuthorized",
  });
  log("status", `  Rebalancer authorized: ${isAuthorized}`);

  try {
    const code = await dstPublic.getCode({ address: lpAccountAddr });
    if (code && code !== "0x") {
      const dstUsdcBalance = await dstPublic.readContract({
        address: dstConfig.usdc,
        abi: ERC20Abi,
        functionName: "balanceOf",
        args: [lpAccountAddr],
      });
      log("status", `\n--- ${dstConfig.name} (destination) ---`);
      log("status", `  USDC: ${formatUnits(dstUsdcBalance, 6)}`);
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
  console.log("  Aqua0 E2E CCTP Bridge Script");
  console.log("===========================================");
  console.log(`Wallet:    ${signer.address}`);
  console.log(`Amount:    ${formatUnits(USDC_AMOUNT, 6)} USDC`);
  console.log(`Route:     ${srcConfig.name} -> ${dstConfig.name} (CCTP)`);
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

  // --- relay (standalone) ---
  if (step === "relay") {
    const bridgeTxHash = process.env.BRIDGE_TX_HASH as Hex;
    if (!bridgeTxHash) {
      console.error("BRIDGE_TX_HASH required for standalone relay step.");
      process.exit(1);
    }
    lpAccountAddr = process.env.ACCOUNT_ADDRESS as Address;
    if (!lpAccountAddr) {
      console.error("ACCOUNT_ADDRESS required for standalone relay step.");
      process.exit(1);
    }
    const hookData = buildHookData(lpAccountAddr);
    await relayOnDestination(bridgeTxHash, hookData);
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
      // Full flow — continue to bridge + relay
      const { bridgeTxHash, hookData } = await bridgeCCTP(lpAccountAddr, strategyHash);
      console.log(`\nBRIDGE_TX_HASH=${bridgeTxHash}\n`);

      // Relay on destination
      await relayOnDestination(bridgeTxHash, hookData);
    }
    if (step === "ship") return;
  }

  if (step === "bridge") {
    console.error(
      "The 'bridge' step must be run as part of the full flow (no step argument),\n" +
        "or use 'relay' step with BRIDGE_TX_HASH if bridge already completed.\n\n" +
        "Full flow:  PRIVATE_KEY=0x... bun run scripts/e2e-cctp-bridge.ts\n" +
        "Relay only: BRIDGE_TX_HASH=0x... ACCOUNT_ADDRESS=0x... ... relay",
    );
    process.exit(1);
  }

  console.log("\n===========================================");
  console.log("  E2E CCTP Bridge Complete!");
  console.log("===========================================");
}

main().catch((err) => {
  console.error("\nFatal error:", err.message || err);
  process.exit(1);
});
