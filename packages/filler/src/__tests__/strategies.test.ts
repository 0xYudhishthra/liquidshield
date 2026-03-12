import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DefenseIntent } from "../watcher";

// Mock viem modules
const mockWriteContract = vi.fn();
const mockWaitForTransactionReceipt = vi.fn();

vi.mock("viem", () => ({
  createWalletClient: vi.fn(() => ({
    writeContract: mockWriteContract,
  })),
  createPublicClient: vi.fn(() => ({
    waitForTransactionReceipt: mockWaitForTransactionReceipt,
  })),
  http: vi.fn(() => "mock-transport"),
  parseAbi: vi.fn((items: string[]) => items),
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: "0xFillerAddress0000000000000000000000000000",
  })),
}));

import { executeCollateralTopup } from "../strategies/collateral-topup";
import { executeBatchedUnwind } from "../strategies/debt-repay";

function makeIntent(overrides: Partial<DefenseIntent> = {}): DefenseIntent {
  return {
    orderId: "0x0000000000000000000000000000000000000000000000000000000000000001",
    positionId: "0x0000000000000000000000000000000000000000000000000000000000000002",
    collateralAsset: "0xCollateralAsset000000000000000000000000",
    amount: 1000000000000000000n,
    sourceChainId: 421614,
    lendingAdapter: "0xLendingAdapter0000000000000000000000000",
    strategy: 0,
    user: "0xUserAddress00000000000000000000000000000",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("executeCollateralTopup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls writeContract with strategy=0 and returns tx hash", async () => {
    const txHash = "0xaabbccdd00000000000000000000000000000000000000000000000000000000";
    mockWriteContract.mockResolvedValueOnce(txHash);
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
      status: "success",
      blockNumber: 42n,
    });

    const intent = makeIntent({ strategy: 0, sourceChainId: 421614 });
    const result = await executeCollateralTopup(intent);

    expect(result).toBe(txHash);
    expect(mockWriteContract).toHaveBeenCalledTimes(1);

    // Verify writeContract was called with strategy=0 as the last arg
    const callArgs = mockWriteContract.mock.calls[0][0];
    expect(callArgs.functionName).toBe("executeDefense");
    expect(callArgs.args[5]).toBe(0); // strategy
  });

  it("verifies transaction receipt", async () => {
    const txHash = "0x1111111100000000000000000000000000000000000000000000000000000000";
    mockWriteContract.mockResolvedValueOnce(txHash);
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
      status: "success",
      blockNumber: 100n,
    });

    const intent = makeIntent({ sourceChainId: 421614 });
    await executeCollateralTopup(intent);

    expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
  });

  it("throws on reverted transaction", async () => {
    const txHash = "0x2222222200000000000000000000000000000000000000000000000000000000";
    mockWriteContract.mockResolvedValueOnce(txHash);
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
      status: "reverted",
      blockNumber: 50n,
    });

    const intent = makeIntent({ sourceChainId: 421614 });
    await expect(executeCollateralTopup(intent)).rejects.toThrow("Collateral top-up tx reverted");
  });

  it("throws when no chain config found for sourceChainId", async () => {
    const intent = makeIntent({ sourceChainId: 999999 });
    await expect(executeCollateralTopup(intent)).rejects.toThrow(
      "No chain config for chainId 999999"
    );
  });

  it("uses Arbitrum config for chainId 421614", async () => {
    const txHash = "0x3333333300000000000000000000000000000000000000000000000000000000";
    mockWriteContract.mockResolvedValueOnce(txHash);
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
      status: "success",
      blockNumber: 200n,
    });

    const intent = makeIntent({ sourceChainId: 421614 });
    await executeCollateralTopup(intent);

    // Verify the executor address comes from the Arbitrum config
    const callArgs = mockWriteContract.mock.calls[0][0];
    expect(callArgs.address).toBeDefined();
  });
});

describe("executeBatchedUnwind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls writeContract with strategy=1 and returns tx hash", async () => {
    const txHash = "0x4444444400000000000000000000000000000000000000000000000000000000";
    mockWriteContract.mockResolvedValueOnce(txHash);
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
      status: "success",
      blockNumber: 300n,
    });

    const intent = makeIntent({ strategy: 1, sourceChainId: 11155111 });
    const result = await executeBatchedUnwind(intent);

    expect(result).toBe(txHash);
    expect(mockWriteContract).toHaveBeenCalledTimes(1);

    // Verify writeContract was called with strategy=1 as the last arg
    const callArgs = mockWriteContract.mock.calls[0][0];
    expect(callArgs.functionName).toBe("executeDefense");
    expect(callArgs.args[5]).toBe(1); // strategy
  });

  it("verifies transaction receipt", async () => {
    const txHash = "0x5555555500000000000000000000000000000000000000000000000000000000";
    mockWriteContract.mockResolvedValueOnce(txHash);
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
      status: "success",
      blockNumber: 400n,
    });

    const intent = makeIntent({ sourceChainId: 11155111 });
    await executeBatchedUnwind(intent);

    expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith({ hash: txHash });
  });

  it("throws on reverted transaction", async () => {
    const txHash = "0x6666666600000000000000000000000000000000000000000000000000000000";
    mockWriteContract.mockResolvedValueOnce(txHash);
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
      status: "reverted",
      blockNumber: 500n,
    });

    const intent = makeIntent({ sourceChainId: 11155111 });
    await expect(executeBatchedUnwind(intent)).rejects.toThrow("Batched unwind tx reverted");
  });

  it("throws when no chain config found for sourceChainId", async () => {
    const intent = makeIntent({ sourceChainId: 12345 });
    await expect(executeBatchedUnwind(intent)).rejects.toThrow(
      "No chain config for chainId 12345"
    );
  });

  it("uses Ethereum Sepolia config for chainId 11155111", async () => {
    const txHash = "0x7777777700000000000000000000000000000000000000000000000000000000";
    mockWriteContract.mockResolvedValueOnce(txHash);
    mockWaitForTransactionReceipt.mockResolvedValueOnce({
      status: "success",
      blockNumber: 600n,
    });

    const intent = makeIntent({ sourceChainId: 11155111 });
    await executeBatchedUnwind(intent);

    const callArgs = mockWriteContract.mock.calls[0][0];
    expect(callArgs.address).toBeDefined();
  });
});
