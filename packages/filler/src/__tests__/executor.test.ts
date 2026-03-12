import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DefenseIntent } from "../watcher";

// Mock the strategy modules before importing executor
vi.mock("../strategies/collateral-topup", () => ({
  executeCollateralTopup: vi.fn(),
}));

vi.mock("../strategies/debt-repay", () => ({
  executeBatchedUnwind: vi.fn(),
}));

import { createExecutor } from "../executor";
import { executeCollateralTopup } from "../strategies/collateral-topup";
import { executeBatchedUnwind } from "../strategies/debt-repay";

const mockCollateralTopup = vi.mocked(executeCollateralTopup);
const mockBatchedUnwind = vi.mocked(executeBatchedUnwind);

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

describe("createExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with a fill() method", () => {
    const executor = createExecutor();
    expect(executor).toHaveProperty("fill");
    expect(typeof executor.fill).toBe("function");
  });

  describe("fill()", () => {
    it("dispatches to executeCollateralTopup when strategy=0", async () => {
      const txHash = "0xaaaa000000000000000000000000000000000000000000000000000000000000";
      mockCollateralTopup.mockResolvedValueOnce(txHash);

      const executor = createExecutor();
      const intent = makeIntent({ strategy: 0 });
      const result = await executor.fill(intent);

      expect(result).toBe(txHash);
      expect(mockCollateralTopup).toHaveBeenCalledTimes(1);
      expect(mockCollateralTopup).toHaveBeenCalledWith(intent);
      expect(mockBatchedUnwind).not.toHaveBeenCalled();
    });

    it("dispatches to executeBatchedUnwind when strategy=1", async () => {
      const txHash = "0xbbbb000000000000000000000000000000000000000000000000000000000000";
      mockBatchedUnwind.mockResolvedValueOnce(txHash);

      const executor = createExecutor();
      const intent = makeIntent({ strategy: 1 });
      const result = await executor.fill(intent);

      expect(result).toBe(txHash);
      expect(mockBatchedUnwind).toHaveBeenCalledTimes(1);
      expect(mockBatchedUnwind).toHaveBeenCalledWith(intent);
      expect(mockCollateralTopup).not.toHaveBeenCalled();
    });

    it("throws for unknown strategy", async () => {
      const executor = createExecutor();
      const intent = makeIntent({ strategy: 99 });

      await expect(executor.fill(intent)).rejects.toThrow("Unknown defense strategy: 99");
      expect(mockCollateralTopup).not.toHaveBeenCalled();
      expect(mockBatchedUnwind).not.toHaveBeenCalled();
    });

    it("throws for strategy=2 (unsupported)", async () => {
      const executor = createExecutor();
      const intent = makeIntent({ strategy: 2 });

      await expect(executor.fill(intent)).rejects.toThrow("Unknown defense strategy: 2");
    });

    it("propagates errors from collateral topup strategy", async () => {
      mockCollateralTopup.mockRejectedValueOnce(new Error("topup failed"));

      const executor = createExecutor();
      const intent = makeIntent({ strategy: 0 });

      await expect(executor.fill(intent)).rejects.toThrow("topup failed");
    });

    it("propagates errors from batched unwind strategy", async () => {
      mockBatchedUnwind.mockRejectedValueOnce(new Error("unwind failed"));

      const executor = createExecutor();
      const intent = makeIntent({ strategy: 1 });

      await expect(executor.fill(intent)).rejects.toThrow("unwind failed");
    });
  });
});
