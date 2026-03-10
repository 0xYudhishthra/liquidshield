import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared mock request fn — must be declared before vi.mock
const mockRequest = vi.fn();

// Mock graphql-request with a real class so `new GraphQLClient(...)` works in vitest v4
vi.mock("graphql-request", () => {
  class MockGraphQLClient {
    constructor(_endpoint: string) {}
    request = mockRequest;
  }
  return {
    GraphQLClient: MockGraphQLClient,
    gql: (strings: TemplateStringsArray, ...values: any[]) =>
      strings.reduce((result, str, i) => result + str + (values[i] || ""), ""),
  };
});

import { getAavePositions } from "../services/aave.service";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Unsupported chains
// ---------------------------------------------------------------------------
describe("getAavePositions — unsupported chain", () => {
  it("returns empty array for unsupported chainId", async () => {
    const result = await getAavePositions("0xDeaD", 999);
    expect(result).toEqual([]);
    // Should not have attempted any GraphQL call
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("returns empty array for chain 137 (Polygon — not in AAVE_SUBGRAPHS)", async () => {
    const result = await getAavePositions("0xDeaD", 137);
    expect(result).toEqual([]);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Supported chains
// ---------------------------------------------------------------------------
describe("getAavePositions — supported chains", () => {
  it("creates a GraphQLClient for chain 1 (Ethereum mainnet)", async () => {
    mockRequest.mockResolvedValue({ userReserves: [] });
    await getAavePositions("0xDeaD", 1);
    expect(mockRequest).toHaveBeenCalled();
  });

  it("creates a GraphQLClient for chain 42161 (Arbitrum)", async () => {
    mockRequest.mockResolvedValue({ userReserves: [] });
    await getAavePositions("0xDeaD", 42161);
    expect(mockRequest).toHaveBeenCalled();
  });

  it("creates a GraphQLClient for chain 10 (Optimism)", async () => {
    mockRequest.mockResolvedValue({ userReserves: [] });
    await getAavePositions("0xDeaD", 10);
    expect(mockRequest).toHaveBeenCalled();
  });

  it("creates a GraphQLClient for chain 8453 (Base)", async () => {
    mockRequest.mockResolvedValue({ userReserves: [] });
    await getAavePositions("0xDeaD", 8453);
    expect(mockRequest).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Address lowercasing
// ---------------------------------------------------------------------------
describe("getAavePositions — address handling", () => {
  it("lowercases the address before querying", async () => {
    mockRequest.mockResolvedValue({ userReserves: [] });
    await getAavePositions("0xAbCdEf", 1);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userAddress: "0xabcdef" }),
    );
  });

  it("already-lowercase address is passed through unchanged", async () => {
    mockRequest.mockResolvedValue({ userReserves: [] });
    await getAavePositions("0xdeadbeef", 1);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userAddress: "0xdeadbeef" }),
    );
  });
});

// ---------------------------------------------------------------------------
// GraphQL error handling
// ---------------------------------------------------------------------------
describe("getAavePositions — error handling", () => {
  it("returns empty array when GraphQL request throws", async () => {
    mockRequest.mockRejectedValue(new Error("Network error"));
    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toEqual([]);
  });

  it("returns empty array when GraphQL returns null userReserves", async () => {
    mockRequest.mockResolvedValue({ userReserves: null });
    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toEqual([]);
  });

  it("returns empty array when GraphQL returns empty userReserves", async () => {
    mockRequest.mockResolvedValue({ userReserves: [] });
    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Position parsing
// ---------------------------------------------------------------------------
describe("getAavePositions — parsing positions", () => {
  const makeReserve = (overrides: Record<string, any> = {}) => ({
    id: "reserve-1",
    currentATokenBalance: "5000000000000000000",
    currentVariableDebt: "2000000000",
    currentStableDebt: "0",
    reserve: {
      symbol: "USDC",
      decimals: 6,
      underlyingAsset: "0xusdc",
      liquidityRate: "0.02",
      variableBorrowRate: "0.05",
      baseLTVasCollateral: "0.8",
      reserveLiquidationThreshold: "0.85",
      price: { priceInEth: "0.0005" },
    },
    usageAsCollateralEnabledOnUser: true,
    ...overrides,
  });

  it("correctly maps a GraphQL reserve to an AavePosition", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [makeReserve()],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toHaveLength(1);

    const position = result[0];
    expect(position.protocol).toBe("aave");
    expect(position.chainId).toBe(1);
    expect(position.collateralAsset).toBe("0xusdc");
    expect(position.collateralSymbol).toBe("USDC");
    expect(position.collateralAmount).toBe("5000000000000000000");
    expect(position.debtAmount).toBe("2000000000");
    // liquidationThreshold is now normalized (raw value / 10000)
    expect(position.liquidationThreshold).toBe(parseFloat("0.85") / 10000);
  });

  it("uses currentVariableDebt as debtAmount when it is nonzero", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [makeReserve({ currentVariableDebt: "1500", currentStableDebt: "0" })],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result[0].debtAmount).toBe("1500");
  });

  it("sums variable and stable debt for debtAmount", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [
        makeReserve({
          currentVariableDebt: "0",
          currentStableDebt: "800",
        }),
      ],
    });

    const result = await getAavePositions("0xDeaD", 1);
    // debtAmount is now the sum of variable + stable debt
    expect(result[0].debtAmount).toBe("800");
  });

  it("falls back to currentStableDebt when currentVariableDebt is empty string", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [
        makeReserve({
          currentVariableDebt: "",
          currentStableDebt: "800",
        }),
      ],
    });

    const result = await getAavePositions("0xDeaD", 1);
    // Empty string is falsy => falls through to stableDebt
    expect(result[0].debtAmount).toBe("800");
  });

  it("preserves chainId in the output", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [makeReserve()],
    });

    const result = await getAavePositions("0xDeaD", 42161);
    expect(result[0].chainId).toBe(42161);
  });

  it("maps multiple reserves into multiple positions", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [
        makeReserve({ currentVariableDebt: "100" }),
        makeReserve({ currentVariableDebt: "200" }),
        makeReserve({ currentVariableDebt: "300" }),
      ],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Debt filtering
// ---------------------------------------------------------------------------
describe("getAavePositions — debt filtering", () => {
  const makeReserve = (variableDebt: string, stableDebt: string) => ({
    id: "reserve-1",
    currentATokenBalance: "1000",
    currentVariableDebt: variableDebt,
    currentStableDebt: stableDebt,
    reserve: {
      symbol: "WETH",
      decimals: 18,
      underlyingAsset: "0xweth",
      liquidityRate: "0.01",
      variableBorrowRate: "0.03",
      baseLTVasCollateral: "0.75",
      reserveLiquidationThreshold: "0.82",
      price: { priceInEth: "1.0" },
    },
    usageAsCollateralEnabledOnUser: true,
  });

  it("filters out reserves with zero variable AND zero stable debt", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [makeReserve("0", "0")],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toEqual([]);
  });

  it("includes reserves with nonzero variable debt", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [makeReserve("1000", "0")],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toHaveLength(1);
  });

  it("includes reserves with nonzero stable debt", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [makeReserve("0", "500")],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toHaveLength(1);
  });

  it("includes reserves where both variable and stable debt are nonzero", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [makeReserve("1000", "500")],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toHaveLength(1);
  });

  it("filters a mix of positions with and without debt", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [
        makeReserve("0", "0"),       // no debt — filtered out
        makeReserve("100", "0"),     // has debt — kept
        makeReserve("0", "0"),       // no debt — filtered out
        makeReserve("0", "200"),     // has debt — kept
      ],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// healthFactor — set to 0 in implementation
// ---------------------------------------------------------------------------
describe("getAavePositions — healthFactor computation", () => {
  it("computes account-level health factor from reserve data", async () => {
    // Use realistic Aave subgraph values:
    // 1 ETH collateral at 1 ETH price, LT = 8250 bps (82.5%), 0.5 ETH debt
    // HF = (1 * 1 * 0.825) / (0.5 * 1) = 1.65
    mockRequest.mockResolvedValue({
      userReserves: [
        {
          id: "r-1",
          currentATokenBalance: "1000000000000000000",       // 1e18 = 1 ETH
          currentVariableDebt: "500000000000000000",          // 5e17 = 0.5 ETH
          currentStableDebt: "0",
          reserve: {
            symbol: "WETH",
            decimals: 18,
            underlyingAsset: "0xweth",
            liquidityRate: "0",
            variableBorrowRate: "0",
            baseLTVasCollateral: "7500",
            reserveLiquidationThreshold: "8250",
            price: { priceInEth: "1000000000000000000" },     // 1e18 = 1 ETH
          },
          usageAsCollateralEnabledOnUser: true,
        },
      ],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result[0].healthFactor).toBeCloseTo(1.65, 2);
  });

  it("returns Infinity health factor when there is no debt", async () => {
    mockRequest.mockResolvedValue({
      userReserves: [
        {
          id: "r-1",
          currentATokenBalance: "1000000000000000000",
          currentVariableDebt: "100",   // small debt, but filter passes
          currentStableDebt: "0",
          reserve: {
            symbol: "WETH",
            decimals: 18,
            underlyingAsset: "0xweth",
            liquidityRate: "0",
            variableBorrowRate: "0",
            baseLTVasCollateral: "7500",
            reserveLiquidationThreshold: "8250",
            price: { priceInEth: "0" },  // zero price => zero debt value
          },
          usageAsCollateralEnabledOnUser: true,
        },
      ],
    });

    const result = await getAavePositions("0xDeaD", 1);
    expect(result[0].healthFactor).toBe(Infinity);
  });
});
