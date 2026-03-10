import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUseReadContract = vi.fn(() => ({
  data: undefined,
  isLoading: false,
  error: null,
}));

vi.mock("wagmi", () => ({
  useReadContract: (...args: unknown[]) => mockUseReadContract(...args),
}));

const MOCK_HOOK_ABI = [{ type: "function", name: "hookStub" }];

vi.mock("@/lib/contracts", () => ({
  CONTRACTS: {
    hook: { address: "0xHookAddress", chainId: 1301 },
    router: { address: "0xRouterAddress", chainId: 1301 },
    settler: { address: "0xSettlerAddress", chainId: 1301 },
  },
  HOOK_ABI: [{ type: "function", name: "hookStub" }],
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import {
  useReserveBalances,
  useAccumulatedPremiums,
  useProtectedPosition,
} from "@/hooks/useContractReads";
import { CONTRACTS, HOOK_ABI } from "@/lib/contracts";

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseReadContract.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  });
});

describe("useReserveBalances", () => {
  it("calls useReadContract with hook address and getReserveBalances", () => {
    renderHook(() => useReserveBalances());

    expect(mockUseReadContract).toHaveBeenCalledOnce();
    const config = mockUseReadContract.mock.calls[0][0] as Record<string, unknown>;
    expect(config.address).toBe(CONTRACTS.hook.address);
    expect(config.abi).toBe(HOOK_ABI);
    expect(config.functionName).toBe("getReserveBalances");
    expect(config.chainId).toBe(CONTRACTS.hook.chainId);
  });

  it("sets refetchInterval to 30 seconds", () => {
    renderHook(() => useReserveBalances());

    const config = mockUseReadContract.mock.calls[0][0] as Record<string, unknown>;
    const query = config.query as Record<string, unknown>;
    expect(query.refetchInterval).toBe(30_000);
  });

  it("returns data from useReadContract", () => {
    const balances = [100n, 200n];
    mockUseReadContract.mockReturnValue({
      data: balances,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useReserveBalances());
    expect(result.current.data).toEqual(balances);
  });

  it("returns loading state", () => {
    mockUseReadContract.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const { result } = renderHook(() => useReserveBalances());
    expect(result.current.isLoading).toBe(true);
  });

  it("returns error state", () => {
    const err = new Error("rpc error");
    mockUseReadContract.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: err,
    });

    const { result } = renderHook(() => useReserveBalances());
    expect(result.current.error).toBe(err);
  });
});

describe("useAccumulatedPremiums", () => {
  it("calls useReadContract with hook address and getAccumulatedPremiums", () => {
    renderHook(() => useAccumulatedPremiums());

    expect(mockUseReadContract).toHaveBeenCalledOnce();
    const config = mockUseReadContract.mock.calls[0][0] as Record<string, unknown>;
    expect(config.address).toBe(CONTRACTS.hook.address);
    expect(config.abi).toBe(HOOK_ABI);
    expect(config.functionName).toBe("getAccumulatedPremiums");
    expect(config.chainId).toBe(CONTRACTS.hook.chainId);
  });

  it("sets refetchInterval to 30 seconds", () => {
    renderHook(() => useAccumulatedPremiums());

    const config = mockUseReadContract.mock.calls[0][0] as Record<string, unknown>;
    const query = config.query as Record<string, unknown>;
    expect(query.refetchInterval).toBe(30_000);
  });

  it("returns data from useReadContract", () => {
    const premiums = 500000n;
    mockUseReadContract.mockReturnValue({
      data: premiums,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() => useAccumulatedPremiums());
    expect(result.current.data).toBe(premiums);
  });
});

describe("useProtectedPosition", () => {
  it("calls useReadContract with getPosition and positionId arg", () => {
    const positionId = "0xabc123" as `0x${string}`;
    renderHook(() => useProtectedPosition(positionId));

    expect(mockUseReadContract).toHaveBeenCalledOnce();
    const config = mockUseReadContract.mock.calls[0][0] as Record<string, unknown>;
    expect(config.address).toBe(CONTRACTS.hook.address);
    expect(config.abi).toBe(HOOK_ABI);
    expect(config.functionName).toBe("getPosition");
    expect(config.args).toEqual([positionId]);
    expect(config.chainId).toBe(CONTRACTS.hook.chainId);
  });

  it("is enabled when positionId is provided", () => {
    const positionId = "0xdef456" as `0x${string}`;
    renderHook(() => useProtectedPosition(positionId));

    const config = mockUseReadContract.mock.calls[0][0] as Record<string, unknown>;
    const query = config.query as Record<string, unknown>;
    expect(query.enabled).toBe(true);
  });

  it("is disabled when positionId is undefined", () => {
    renderHook(() => useProtectedPosition(undefined));

    expect(mockUseReadContract).toHaveBeenCalledOnce();
    const config = mockUseReadContract.mock.calls[0][0] as Record<string, unknown>;
    const query = config.query as Record<string, unknown>;
    expect(query.enabled).toBe(false);
  });

  it("passes undefined args when positionId is undefined", () => {
    renderHook(() => useProtectedPosition(undefined));

    const config = mockUseReadContract.mock.calls[0][0] as Record<string, unknown>;
    expect(config.args).toBeUndefined();
  });

  it("sets refetchInterval to 15 seconds", () => {
    const positionId = "0x01" as `0x${string}`;
    renderHook(() => useProtectedPosition(positionId));

    const config = mockUseReadContract.mock.calls[0][0] as Record<string, unknown>;
    const query = config.query as Record<string, unknown>;
    expect(query.refetchInterval).toBe(15_000);
  });

  it("returns position data from useReadContract", () => {
    const positionData = {
      owner: "0xOwner",
      strategy: 0,
      healthThreshold: 1300000000000000000n,
    };
    mockUseReadContract.mockReturnValue({
      data: positionData,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() =>
      useProtectedPosition("0xabc" as `0x${string}`)
    );
    expect(result.current.data).toEqual(positionData);
  });
});
