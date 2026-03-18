// ============================================
// Calldata Builder Unit Tests
// Verifies ABI encoding produces valid calldata
// ============================================

import { describe, it, expect, mock } from "bun:test";
import {
  decodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import {
  AccountFactoryAbi,
  AccountAbi,
  RebalancerAbi,
} from "../../contracts/abis";

// Well-known Hardhat/Anvil test accounts (EIP-55 checksummed)
const ADDR_A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const ADDR_B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const ADDR_C = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
const ADDR_D = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;
const ADDR_E = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as Address;

const MOCK_ADDRESSES = {
  accountFactory: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as Address,
  accountImpl: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as Address,
  aqua: "0x14dC79964da2C08dda4c80b5d9F26331e4B3A7A4" as Address,
  aquaAdapter: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as Address,
  beacon: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" as Address,
  composer: "0xBcd4042DE499D14e55001CcbB24a551F3b954096" as Address,
  deployer: "0x71bE63f3384f5fb98995898A86B02Fb2426c5788" as Address,
  lzEndpoint: "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a" as Address,
  rebalancer: "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec" as Address,
  rebalancerImpl: "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097" as Address,
  sampleAccount: "0xcd3B766CCDd6AE721141F452C550Ca635964ce71" as Address,
  stargateAdapter: "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as Address,
  stargateEth: ADDR_A,
  swapVMRouter: ADDR_B,
  swapper: ADDR_C,
  usdc: ADDR_D,
  weth: ADDR_E,
  wethStrategyHash: "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
};

mock.module("../../contracts/client", () => ({
  getDeploymentAddresses: (_chainId: number) => MOCK_ADDRESSES,
  getPublicClient: (_chainId: number) => ({}),
  resetClients: () => {},
  CHAIN_ID_TO_LZ_EID: { 8453: 30184, 130: 30320 },
  LZ_EID_TO_CHAIN_ID: { 30184: 8453, 30320: 130 },
}));

const {
  buildCreateAccountCalldata,
  buildWithdrawCalldata,
  buildWithdrawETHCalldata,
  buildAuthorizeRebalancerCalldata,
  buildRevokeRebalancerCalldata,
  buildTriggerRebalanceCalldata,
  buildExecuteDockCalldata,
  buildExecuteBridgeStargateCalldata,
  buildRecordBridgingCalldata,
  buildConfirmRebalanceCalldata,
  buildFailRebalanceCalldata,
  encodeComposeMsg,
} = await import("../../contracts/calldata");

// ============================================
// ACCOUNT FACTORY TESTS
// ============================================

describe("Account Factory Calldata", () => {
  it("buildCreateAccountCalldata encodes signature correctly", () => {
    const signature =
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ff" as Hex;

    const result = buildCreateAccountCalldata(
      MOCK_ADDRESSES.accountFactory,
      signature,
    );

    expect(result.to).toBe(MOCK_ADDRESSES.accountFactory);
    expect(result.data).toStartWith("0x");
    expect(result.data.length).toBeGreaterThan(10);

    const decoded = decodeFunctionData({
      abi: AccountFactoryAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("createAccount");
    expect(decoded.args[0]).toBe(signature);
  });
});

// ============================================
// ACCOUNT TESTS
// ============================================

describe("Account Calldata", () => {
  it("buildWithdrawCalldata encodes token + amount", () => {
    const result = buildWithdrawCalldata(ADDR_A, ADDR_B, 1000000n);

    expect(result.to).toBe(ADDR_A);

    const decoded = decodeFunctionData({
      abi: AccountAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("withdraw");
    expect(decoded.args[0]).toBe(ADDR_B);
    expect(decoded.args[1]).toBe(1000000n);
  });

  it("buildWithdrawETHCalldata encodes amount", () => {
    const result = buildWithdrawETHCalldata(ADDR_A, 5000000000000000000n);

    expect(result.to).toBe(ADDR_A);

    const decoded = decodeFunctionData({
      abi: AccountAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("withdrawETH");
    expect(decoded.args[0]).toBe(5000000000000000000n);
  });

  it("buildAuthorizeRebalancerCalldata encodes rebalancer address", () => {
    const result = buildAuthorizeRebalancerCalldata(ADDR_A, ADDR_C);

    expect(result.to).toBe(ADDR_A);

    const decoded = decodeFunctionData({
      abi: AccountAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("authorizeRebalancer");
    expect(decoded.args[0]).toBe(ADDR_C);
  });

  it("buildRevokeRebalancerCalldata has no args", () => {
    const result = buildRevokeRebalancerCalldata(ADDR_A);

    expect(result.to).toBe(ADDR_A);

    const decoded = decodeFunctionData({
      abi: AccountAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("revokeRebalancer");
  });

});

// ============================================
// REBALANCER TESTS
// ============================================

describe("Rebalancer Calldata", () => {
  const rebalancerAddr = MOCK_ADDRESSES.rebalancer;
  const operationId =
    "0x0000000000000000000000000000000000000000000000000000000000000042" as Hex;

  it("buildTriggerRebalanceCalldata encodes all params", () => {
    const result = buildTriggerRebalanceCalldata(
      rebalancerAddr,
      ADDR_A,
      8453,
      130,
      ADDR_B,
      1000000n,
    );

    expect(result.to).toBe(rebalancerAddr);

    const decoded = decodeFunctionData({
      abi: RebalancerAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("triggerRebalance");
    expect(decoded.args[0]).toBe(ADDR_A);
    expect(decoded.args[1]).toBe(8453);
    expect(decoded.args[2]).toBe(130);
    expect(decoded.args[3]).toBe(ADDR_B);
    expect(decoded.args[4]).toBe(1000000n);
  });

  it("buildExecuteDockCalldata encodes operationId + strategyHash", () => {
    const strategyHash =
      "0x0000000000000000000000000000000000000000000000000000000000000099" as Hex;

    const result = buildExecuteDockCalldata(
      rebalancerAddr,
      operationId,
      strategyHash,
    );

    expect(result.to).toBe(rebalancerAddr);

    const decoded = decodeFunctionData({
      abi: RebalancerAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("executeDock");
    expect(decoded.args[0]).toBe(operationId);
    expect(decoded.args[1]).toBe(strategyHash);
  });

  it("buildExecuteBridgeStargateCalldata includes value field", () => {
    const bridgeFee = 50000000000000n;

    const result = buildExecuteBridgeStargateCalldata(
      rebalancerAddr,
      operationId,
      30320,
      ADDR_A,
      "0x1234" as Hex,
      ADDR_B,
      1000000n,
      990000n,
      200000n,
      500000n,
      bridgeFee,
    );

    expect(result.to).toBe(rebalancerAddr);
    expect(result.value).toBe(bridgeFee);

    const decoded = decodeFunctionData({
      abi: RebalancerAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("executeBridgeStargate");
  });

  it("buildRecordBridgingCalldata encodes operationId + messageGuid", () => {
    const messageGuid =
      "0x0000000000000000000000000000000000000000000000000000000000000abc" as Hex;

    const result = buildRecordBridgingCalldata(
      rebalancerAddr,
      operationId,
      messageGuid,
    );

    const decoded = decodeFunctionData({
      abi: RebalancerAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("recordBridging");
    expect(decoded.args[0]).toBe(operationId);
    expect(decoded.args[1]).toBe(messageGuid);
  });

  it("buildConfirmRebalanceCalldata encodes operationId", () => {
    const result = buildConfirmRebalanceCalldata(rebalancerAddr, operationId);

    const decoded = decodeFunctionData({
      abi: RebalancerAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("confirmRebalance");
    expect(decoded.args[0]).toBe(operationId);
  });

  it("buildFailRebalanceCalldata encodes operationId + reason", () => {
    const result = buildFailRebalanceCalldata(
      rebalancerAddr,
      operationId,
      "bridge timeout",
    );

    const decoded = decodeFunctionData({
      abi: RebalancerAbi,
      data: result.data,
    });
    expect(decoded.functionName).toBe("failRebalance");
    expect(decoded.args[0]).toBe(operationId);
    expect(decoded.args[1]).toBe("bridge timeout");
  });
});

// ============================================
// COMPOSE MESSAGE ENCODING
// ============================================

describe("encodeComposeMsg", () => {
  it("produces valid ABI-encoded compose payload", () => {
    const encoded = encodeComposeMsg(
      ADDR_A,
      "0xdeadbeef" as Hex,
      [ADDR_B, ADDR_C],
      [1000000n, 2000000n],
    );

    expect(encoded).toStartWith("0x");
    // ABI-encoded (address, bytes, address[], uint256[]) has significant length
    expect(encoded.length).toBeGreaterThan(320);
  });

  it("encoding is deterministic", () => {
    const a = encodeComposeMsg(ADDR_A, "0xabcd" as Hex, [ADDR_B], [500n]);
    const b = encodeComposeMsg(ADDR_A, "0xabcd" as Hex, [ADDR_B], [500n]);

    expect(a).toBe(b);
  });
});
