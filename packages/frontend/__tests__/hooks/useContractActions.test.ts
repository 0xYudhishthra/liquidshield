import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWriteContract = vi.fn();
const mockUseWriteContract = vi.fn(() => ({
  writeContract: mockWriteContract,
  data: undefined as `0x${string}` | undefined,
  isPending: false,
  error: null,
}));
const mockUseWaitForTransactionReceipt = vi.fn(() => ({
  isLoading: false,
  isSuccess: false,
}));

vi.mock("wagmi", () => ({
  useWriteContract: (...args: unknown[]) => mockUseWriteContract(...args),
  useWaitForTransactionReceipt: (...args: unknown[]) =>
    mockUseWaitForTransactionReceipt(...args),
}));

vi.mock("@/lib/contracts", () => ({
  CONTRACTS: {
    router: { address: "0xRouterAddress", chainId: 1301 },
    hook: { address: "0xHookAddress", chainId: 1301 },
    settler: { address: "0xSettlerAddress", chainId: 1301 },
  },
  ROUTER_ABI: [{ type: "function", name: "stub" }],
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import {
  useRegisterPosition,
  useUnregisterPosition,
  useTopUpPremium,
} from "@/hooks/useContractActions";
import { CONTRACTS, ROUTER_ABI } from "@/lib/contracts";

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseWriteContract.mockReturnValue({
    writeContract: mockWriteContract,
    data: undefined,
    isPending: false,
    error: null,
  });
  mockUseWaitForTransactionReceipt.mockReturnValue({
    isLoading: false,
    isSuccess: false,
  });
});

describe("useRegisterPosition", () => {
  it("returns the expected shape", () => {
    const { result } = renderHook(() => useRegisterPosition());

    expect(result.current).toHaveProperty("register");
    expect(result.current).toHaveProperty("hash");
    expect(result.current).toHaveProperty("isPending");
    expect(result.current).toHaveProperty("isConfirming");
    expect(result.current).toHaveProperty("isSuccess");
    expect(result.current).toHaveProperty("error");
    expect(typeof result.current.register).toBe("function");
  });

  it("calls writeContract with correct ABI, address, functionName, and args", () => {
    const { result } = renderHook(() => useRegisterPosition());

    act(() => {
      result.current.register({
        positionId: "0xabc123" as `0x${string}`,
        collateralAsset: "0xCOLLATERAL" as `0x${string}`,
        debtAsset: "0xDEBT" as `0x${string}`,
        positionSize: 1000n,
        sourceChainId: 421614n,
        strategy: "COLLATERAL_TOPUP",
        healthThreshold: 1300000000000000000n,
        lendingAdapter: "0xADAPTER" as `0x${string}`,
        premiumMonths: 3n,
        premiumToken: "0xUSDC" as `0x${string}`,
        premiumAmount: 30000000n,
      });
    });

    expect(mockWriteContract).toHaveBeenCalledOnce();
    const call = mockWriteContract.mock.calls[0][0];
    expect(call.address).toBe(CONTRACTS.router.address);
    expect(call.abi).toBe(ROUTER_ABI);
    expect(call.functionName).toBe("registerAndPayPremium");
    expect(call.chainId).toBe(CONTRACTS.router.chainId);
    expect(call.args).toEqual([
      "0xabc123",
      "0xCOLLATERAL",
      "0xDEBT",
      1000n,
      421614n,
      0, // COLLATERAL_TOPUP maps to 0
      1300000000000000000n,
      "0xADAPTER",
      3n,
      "0xUSDC",
      30000000n,
    ]);
  });

  it("maps BATCHED_UNWIND strategy to 1", () => {
    const { result } = renderHook(() => useRegisterPosition());

    act(() => {
      result.current.register({
        positionId: "0x01" as `0x${string}`,
        collateralAsset: "0x02" as `0x${string}`,
        debtAsset: "0x03" as `0x${string}`,
        positionSize: 500n,
        sourceChainId: 11155111n,
        strategy: "BATCHED_UNWIND",
        healthThreshold: 1500000000000000000n,
        lendingAdapter: "0x04" as `0x${string}`,
        premiumMonths: 6n,
        premiumToken: "0x05" as `0x${string}`,
        premiumAmount: 60000000n,
      });
    });

    const call = mockWriteContract.mock.calls[0][0];
    expect(call.args[5]).toBe(1); // BATCHED_UNWIND maps to 1
  });

  it("reflects isPending from useWriteContract", () => {
    mockUseWriteContract.mockReturnValue({
      writeContract: mockWriteContract,
      data: undefined,
      isPending: true,
      error: null,
    });

    const { result } = renderHook(() => useRegisterPosition());
    expect(result.current.isPending).toBe(true);
  });

  it("reflects isConfirming from useWaitForTransactionReceipt", () => {
    mockUseWaitForTransactionReceipt.mockReturnValue({
      isLoading: true,
      isSuccess: false,
    });

    const { result } = renderHook(() => useRegisterPosition());
    expect(result.current.isConfirming).toBe(true);
  });

  it("reflects isSuccess from useWaitForTransactionReceipt", () => {
    mockUseWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: true,
    });

    const { result } = renderHook(() => useRegisterPosition());
    expect(result.current.isSuccess).toBe(true);
  });

  it("reflects error from useWriteContract", () => {
    const err = new Error("user rejected");
    mockUseWriteContract.mockReturnValue({
      writeContract: mockWriteContract,
      data: undefined,
      isPending: false,
      error: err,
    });

    const { result } = renderHook(() => useRegisterPosition());
    expect(result.current.error).toBe(err);
  });

  it("passes hash to useWaitForTransactionReceipt", () => {
    const hash = "0xdeadbeef" as `0x${string}`;
    mockUseWriteContract.mockReturnValue({
      writeContract: mockWriteContract,
      data: hash,
      isPending: false,
      error: null,
    });

    renderHook(() => useRegisterPosition());

    expect(mockUseWaitForTransactionReceipt).toHaveBeenCalledWith({ hash });
  });
});

describe("useUnregisterPosition", () => {
  it("returns the expected shape", () => {
    const { result } = renderHook(() => useUnregisterPosition());

    expect(result.current).toHaveProperty("unregister");
    expect(result.current).toHaveProperty("hash");
    expect(result.current).toHaveProperty("isPending");
    expect(result.current).toHaveProperty("isConfirming");
    expect(result.current).toHaveProperty("isSuccess");
    expect(result.current).toHaveProperty("error");
    expect(typeof result.current.unregister).toBe("function");
  });

  it("calls writeContract with correct params", () => {
    const { result } = renderHook(() => useUnregisterPosition());
    const positionId = "0xabc456" as `0x${string}`;

    act(() => {
      result.current.unregister(positionId);
    });

    expect(mockWriteContract).toHaveBeenCalledOnce();
    const call = mockWriteContract.mock.calls[0][0];
    expect(call.address).toBe(CONTRACTS.router.address);
    expect(call.abi).toBe(ROUTER_ABI);
    expect(call.functionName).toBe("unregister");
    expect(call.chainId).toBe(CONTRACTS.router.chainId);
    expect(call.args).toEqual([positionId]);
  });

  it("passes hash to useWaitForTransactionReceipt", () => {
    const hash = "0x1234" as `0x${string}`;
    mockUseWriteContract.mockReturnValue({
      writeContract: mockWriteContract,
      data: hash,
      isPending: false,
      error: null,
    });

    renderHook(() => useUnregisterPosition());

    expect(mockUseWaitForTransactionReceipt).toHaveBeenCalledWith({ hash });
  });
});

describe("useTopUpPremium", () => {
  it("returns the expected shape", () => {
    const { result } = renderHook(() => useTopUpPremium());

    expect(result.current).toHaveProperty("topUp");
    expect(result.current).toHaveProperty("hash");
    expect(result.current).toHaveProperty("isPending");
    expect(result.current).toHaveProperty("isConfirming");
    expect(result.current).toHaveProperty("isSuccess");
    expect(result.current).toHaveProperty("error");
    expect(typeof result.current.topUp).toBe("function");
  });

  it("calls writeContract with correct params", () => {
    const { result } = renderHook(() => useTopUpPremium());

    act(() => {
      result.current.topUp({
        positionId: "0xPOS" as `0x${string}`,
        token: "0xTOKEN" as `0x${string}`,
        amount: 50000000n,
        months: 6n,
      });
    });

    expect(mockWriteContract).toHaveBeenCalledOnce();
    const call = mockWriteContract.mock.calls[0][0];
    expect(call.address).toBe(CONTRACTS.router.address);
    expect(call.abi).toBe(ROUTER_ABI);
    expect(call.functionName).toBe("topUpPremium");
    expect(call.chainId).toBe(CONTRACTS.router.chainId);
    expect(call.args).toEqual(["0xPOS", "0xTOKEN", 50000000n, 6n]);
  });

  it("passes hash to useWaitForTransactionReceipt", () => {
    const hash = "0xfeed" as `0x${string}`;
    mockUseWriteContract.mockReturnValue({
      writeContract: mockWriteContract,
      data: hash,
      isPending: false,
      error: null,
    });

    renderHook(() => useTopUpPremium());

    expect(mockUseWaitForTransactionReceipt).toHaveBeenCalledWith({ hash });
  });
});
