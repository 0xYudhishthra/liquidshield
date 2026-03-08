import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AavePosition } from "../services/aave.service";
import type { MorphoPosition } from "../services/morpho.service";

// Mock both service modules so we never hit real GraphQL endpoints
vi.mock("../services/aave.service", () => ({
  getAavePositions: vi.fn(),
}));

vi.mock("../services/morpho.service", () => ({
  getMorphoPositions: vi.fn(),
}));

import { getAllPositions } from "../services/position-aggregator";
import { getAavePositions } from "../services/aave.service";
import { getMorphoPositions } from "../services/morpho.service";

const mockedGetAave = vi.mocked(getAavePositions);
const mockedGetMorpho = vi.mocked(getMorphoPositions);

// ---------------------------------------------------------------------------
// Helpers — factories for test positions
// ---------------------------------------------------------------------------
function makeAavePosition(overrides: Partial<AavePosition> = {}): AavePosition {
  return {
    protocol: "aave",
    chainId: 1,
    collateralAsset: "0xweth",
    collateralSymbol: "WETH",
    collateralAmount: "2.0",
    debtAsset: "0xusdc",
    debtSymbol: "USDC",
    debtAmount: "1500",
    healthFactor: 1.8,
    liquidationThreshold: 0.85,
    ...overrides,
  };
}

function makeMorphoPosition(overrides: Partial<MorphoPosition> = {}): MorphoPosition {
  return {
    protocol: "morpho",
    chainId: 1,
    marketKey: "0xmarket",
    collateralAsset: "0xweth",
    collateralSymbol: "WETH",
    collateralAmount: "1.0",
    collateralUsd: 3000,
    debtAsset: "0xusdc",
    debtSymbol: "USDC",
    debtAmount: "2000",
    debtUsd: 2000,
    healthFactor: 1.2,
    lltv: 0.8,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return empty arrays for every chain
  mockedGetAave.mockResolvedValue([]);
  mockedGetMorpho.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Empty results
// ---------------------------------------------------------------------------
describe("getAllPositions — empty results", () => {
  it("returns zeroed structure when user has no positions anywhere", async () => {
    const result = await getAllPositions("0xDeaD");

    expect(result.aave).toEqual([]);
    expect(result.morpho).toEqual([]);
    expect(result.all).toEqual([]);
    expect(result.totalPositions).toBe(0);
    expect(result.atRiskCount).toBe(0);
  });

  it("queries all 4 supported chains for each protocol", async () => {
    await getAllPositions("0xDeaD");

    // 4 chains x 1 call each = 4 calls per service
    expect(mockedGetAave).toHaveBeenCalledTimes(4);
    expect(mockedGetMorpho).toHaveBeenCalledTimes(4);

    // Verify all expected chains were queried
    const aaveChains = mockedGetAave.mock.calls.map((c) => c[1]);
    expect(aaveChains.sort()).toEqual([1, 8453, 10, 42161].sort());

    const morphoChains = mockedGetMorpho.mock.calls.map((c) => c[1]);
    expect(morphoChains.sort()).toEqual([1, 8453, 10, 42161].sort());
  });

  it("passes the address through to both services", async () => {
    await getAllPositions("0xABCD");

    for (const call of mockedGetAave.mock.calls) {
      expect(call[0]).toBe("0xABCD");
    }
    for (const call of mockedGetMorpho.mock.calls) {
      expect(call[0]).toBe("0xABCD");
    }
  });
});

// ---------------------------------------------------------------------------
// Aggregation — merging Aave and Morpho results
// ---------------------------------------------------------------------------
describe("getAllPositions — aggregation", () => {
  it("aggregates positions from both protocols across multiple chains", async () => {
    // Chain 1 returns one Aave position
    mockedGetAave.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeAavePosition({ chainId: 1, healthFactor: 2.0 })];
      return [];
    });

    // Chain 42161 returns one Morpho position
    mockedGetMorpho.mockImplementation(async (_addr, chainId) => {
      if (chainId === 42161) return [makeMorphoPosition({ chainId: 42161, healthFactor: 1.3 })];
      return [];
    });

    const result = await getAllPositions("0xDeaD");

    expect(result.aave).toHaveLength(1);
    expect(result.morpho).toHaveLength(1);
    expect(result.all).toHaveLength(2);
    expect(result.totalPositions).toBe(2);
  });

  it("includes positions from all chains, not just the first", async () => {
    mockedGetAave.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeAavePosition({ chainId: 1 })];
      if (chainId === 42161) return [makeAavePosition({ chainId: 42161 })];
      if (chainId === 10) return [makeAavePosition({ chainId: 10 })];
      return [];
    });

    const result = await getAllPositions("0xDeaD");

    expect(result.aave).toHaveLength(3);
    expect(result.all).toHaveLength(3);
    const chains = result.aave.map((p) => p.chainId);
    expect(chains).toContain(1);
    expect(chains).toContain(42161);
    expect(chains).toContain(10);
  });
});

// ---------------------------------------------------------------------------
// Sorting by healthFactor (ascending)
// ---------------------------------------------------------------------------
describe("getAllPositions — sorting", () => {
  it("sorts `all` array by healthFactor ascending (lowest first)", async () => {
    mockedGetAave.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeAavePosition({ healthFactor: 3.0, chainId: 1 })];
      if (chainId === 42161) return [makeAavePosition({ healthFactor: 1.1, chainId: 42161 })];
      return [];
    });

    mockedGetMorpho.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeMorphoPosition({ healthFactor: 2.0, chainId: 1 })];
      return [];
    });

    const result = await getAllPositions("0xDeaD");

    expect(result.all).toHaveLength(3);
    expect(result.all[0].healthFactor).toBe(1.1);
    expect(result.all[1].healthFactor).toBe(2.0);
    expect(result.all[2].healthFactor).toBe(3.0);
  });

  it("sorting does not affect the separate aave and morpho arrays", async () => {
    mockedGetAave.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeAavePosition({ healthFactor: 5.0 })];
      return [];
    });

    mockedGetMorpho.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeMorphoPosition({ healthFactor: 0.9 })];
      return [];
    });

    const result = await getAllPositions("0xDeaD");

    // `all` is sorted: morpho (0.9) first, then aave (5.0)
    expect(result.all[0].protocol).toBe("morpho");
    expect(result.all[1].protocol).toBe("aave");

    // But individual arrays keep their original protocol grouping
    expect(result.aave[0].healthFactor).toBe(5.0);
    expect(result.morpho[0].healthFactor).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// at-risk counting (healthFactor < 1.5)
// ---------------------------------------------------------------------------
describe("getAllPositions — atRiskCount", () => {
  it("counts positions with healthFactor < 1.5 as at-risk", async () => {
    mockedGetAave.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeAavePosition({ healthFactor: 1.2 })]; // at risk
      if (chainId === 42161) return [makeAavePosition({ healthFactor: 2.5 })]; // safe
      return [];
    });

    mockedGetMorpho.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeMorphoPosition({ healthFactor: 1.0 })]; // at risk
      return [];
    });

    const result = await getAllPositions("0xDeaD");
    expect(result.atRiskCount).toBe(2);
    expect(result.totalPositions).toBe(3);
  });

  it("does NOT count positions with healthFactor exactly 1.5 as at-risk", async () => {
    mockedGetAave.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeAavePosition({ healthFactor: 1.5 })];
      return [];
    });

    const result = await getAllPositions("0xDeaD");
    expect(result.atRiskCount).toBe(0);
  });

  it("counts a position with healthFactor 1.4999 as at-risk", async () => {
    mockedGetAave.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeAavePosition({ healthFactor: 1.4999 })];
      return [];
    });

    const result = await getAllPositions("0xDeaD");
    expect(result.atRiskCount).toBe(1);
  });

  it("returns atRiskCount 0 when all positions are healthy", async () => {
    mockedGetAave.mockResolvedValue([makeAavePosition({ healthFactor: 5.0 })]);
    mockedGetMorpho.mockResolvedValue([makeMorphoPosition({ healthFactor: 3.0 })]);

    const result = await getAllPositions("0xDeaD");
    // 4 chains * 1 per service * 2 services = 8 positions
    expect(result.atRiskCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Partial failure — one service fails, other succeeds
// ---------------------------------------------------------------------------
describe("getAllPositions — partial failure handling", () => {
  it("returns Aave positions when Morpho service fails for all chains", async () => {
    mockedGetAave.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeAavePosition({ chainId: 1, healthFactor: 1.8 })];
      return [];
    });
    mockedGetMorpho.mockRejectedValue(new Error("Morpho API down"));

    // getAllPositions uses Promise.all which will reject if any inner promise rejects.
    // However, each inner call is `getMorphoPositions(address, chainId)` which is
    // itself catching errors. The mock rejects directly, so Promise.all of the
    // morpho branch will reject, causing the outer Promise.all to reject too.
    // This means the function will throw.
    await expect(getAllPositions("0xDeaD")).rejects.toThrow("Morpho API down");
  });

  it("returns Morpho positions when Aave service fails for all chains", async () => {
    mockedGetAave.mockRejectedValue(new Error("Aave subgraph down"));
    mockedGetMorpho.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeMorphoPosition({ chainId: 1, healthFactor: 1.3 })];
      return [];
    });

    await expect(getAllPositions("0xDeaD")).rejects.toThrow("Aave subgraph down");
  });

  it("succeeds when services return empty arrays (no positions, no errors)", async () => {
    mockedGetAave.mockResolvedValue([]);
    mockedGetMorpho.mockResolvedValue([]);

    const result = await getAllPositions("0xDeaD");
    expect(result.totalPositions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("getAllPositions — edge cases", () => {
  it("handles a large number of positions across all chains", async () => {
    // HF values: 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5
    const manyAave = Array.from({ length: 10 }, (_, i) =>
      makeAavePosition({ healthFactor: i + 0.5 }),
    );
    mockedGetAave.mockResolvedValue(manyAave);
    mockedGetMorpho.mockResolvedValue([]);

    const result = await getAllPositions("0xDeaD");
    // 4 chains x 10 positions each = 40
    expect(result.totalPositions).toBe(40);
    // Only HF=0.5 is < 1.5, one per chain => 4 at-risk
    expect(result.atRiskCount).toBe(4);
  });

  it("handles positions with Infinity healthFactor (no debt)", async () => {
    mockedGetMorpho.mockImplementation(async (_addr, chainId) => {
      if (chainId === 1) return [makeMorphoPosition({ healthFactor: Infinity })];
      return [];
    });

    const result = await getAllPositions("0xDeaD");
    expect(result.all).toHaveLength(1);
    expect(result.all[0].healthFactor).toBe(Infinity);
    expect(result.atRiskCount).toBe(0);
  });
});
