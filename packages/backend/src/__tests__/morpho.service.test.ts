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

import { getMorphoPositions } from "../services/morpho.service";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper — build a realistic Morpho GraphQL response
// ---------------------------------------------------------------------------
function makeMorphoApiResponse(positions: any[] = []) {
  return {
    userByAddress: {
      address: "0xDeaD",
      marketPositions: positions,
    },
  };
}

function makeMarketPosition(overrides: Record<string, any> = {}) {
  return {
    market: {
      uniqueKey: "0xMarketKey",
      lltv: "0.8",
      loanAsset: {
        address: "0xusdc",
        symbol: "USDC",
        decimals: 6,
      },
      collateralAsset: {
        address: "0xweth",
        symbol: "WETH",
        decimals: 18,
      },
      state: {
        borrowAssets: "1000000",
        supplyAssets: "5000000",
      },
    },
    state: {
      supplyAssets: "5000000",
      supplyAssetsUsd: "5000",
      borrowAssets: "1000000",
      borrowAssetsUsd: "1000",
      collateral: "2000000000000000000",
      collateralUsd: "4000",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe("getMorphoPositions — error handling", () => {
  it("returns empty array when GraphQL request throws", async () => {
    mockRequest.mockRejectedValue(new Error("Morpho API timeout"));

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toEqual([]);
  });

  it("returns empty array on network errors", async () => {
    mockRequest.mockRejectedValue(new TypeError("fetch failed"));

    const result = await getMorphoPositions("0xDeaD", 42161);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// No positions
// ---------------------------------------------------------------------------
describe("getMorphoPositions — no positions", () => {
  it("returns empty array when userByAddress is null", async () => {
    mockRequest.mockResolvedValue({ userByAddress: null });

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toEqual([]);
  });

  it("returns empty array when marketPositions is empty array", async () => {
    mockRequest.mockResolvedValue({
      userByAddress: { address: "0xDeaD", marketPositions: [] },
    });

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toEqual([]);
  });

  it("returns empty array when marketPositions is null/undefined", async () => {
    mockRequest.mockResolvedValue({
      userByAddress: { address: "0xDeaD", marketPositions: null },
    });

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Health factor calculation
// ---------------------------------------------------------------------------
describe("getMorphoPositions — health factor calculation", () => {
  it("calculates healthFactor as (collateralUsd * lltv) / borrowUsd", async () => {
    // collateralUsd=4000, lltv=0.8, borrowUsd=1000 → HF = (4000*0.8)/1000 = 3.2
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([makeMarketPosition()]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toHaveLength(1);
    expect(result[0].healthFactor).toBeCloseTo(3.2, 5);
  });

  it("returns Infinity health factor when borrowUsd is 0", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition({
          state: {
            supplyAssets: "5000000",
            supplyAssetsUsd: "5000",
            borrowAssets: "100", // nonzero borrow assets so it passes the filter
            borrowAssetsUsd: "0", // but USD value is 0
            collateral: "2000000000000000000",
            collateralUsd: "4000",
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toHaveLength(1);
    expect(result[0].healthFactor).toBe(Infinity);
  });

  it("calculates health factor correctly with different lltv values", async () => {
    // collateralUsd=10000, lltv=0.5, borrowUsd=2000 → HF = (10000*0.5)/2000 = 2.5
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition({
          market: {
            uniqueKey: "0xmarket2",
            lltv: "0.5",
            loanAsset: { address: "0xdai", symbol: "DAI", decimals: 18 },
            collateralAsset: { address: "0xweth", symbol: "WETH", decimals: 18 },
            state: { borrowAssets: "2000", supplyAssets: "10000" },
          },
          state: {
            supplyAssets: "10000",
            supplyAssetsUsd: "10000",
            borrowAssets: "2000",
            borrowAssetsUsd: "2000",
            collateral: "5000000000000000000",
            collateralUsd: "10000",
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result[0].healthFactor).toBeCloseTo(2.5, 5);
  });

  it("returns a very low health factor for risky positions", async () => {
    // collateralUsd=1000, lltv=0.8, borrowUsd=900 → HF = 800/900 ≈ 0.889
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition({
          state: {
            supplyAssets: "1000",
            supplyAssetsUsd: "1000",
            borrowAssets: "900",
            borrowAssetsUsd: "900",
            collateral: "1000000000000000000",
            collateralUsd: "1000",
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result[0].healthFactor).toBeCloseTo(0.8889, 3);
  });
});

// ---------------------------------------------------------------------------
// Borrow filtering
// ---------------------------------------------------------------------------
describe("getMorphoPositions — borrow filtering", () => {
  it("filters out positions with zero borrowAssets", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition({
          state: {
            supplyAssets: "5000000",
            supplyAssetsUsd: "5000",
            borrowAssets: "0",
            borrowAssetsUsd: "0",
            collateral: "2000000000000000000",
            collateralUsd: "4000",
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toEqual([]);
  });

  it("includes positions with nonzero borrowAssets", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([makeMarketPosition()]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toHaveLength(1);
  });

  it("filters a mix of borrow and non-borrow positions", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition(), // has borrow — kept
        makeMarketPosition({
          state: {
            supplyAssets: "1000",
            supplyAssetsUsd: "1000",
            borrowAssets: "0",
            borrowAssetsUsd: "0",
            collateral: "500",
            collateralUsd: "500",
          },
        }), // no borrow — filtered
        makeMarketPosition(), // has borrow — kept
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Position field mapping
// ---------------------------------------------------------------------------
describe("getMorphoPositions — field mapping", () => {
  it("correctly maps all fields from the GraphQL response", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([makeMarketPosition()]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    const pos = result[0];

    expect(pos.protocol).toBe("morpho");
    expect(pos.chainId).toBe(1);
    expect(pos.marketKey).toBe("0xMarketKey");
    expect(pos.collateralAsset).toBe("0xweth");
    expect(pos.collateralSymbol).toBe("WETH");
    expect(pos.collateralAmount).toBe("2000000000000000000");
    expect(pos.collateralUsd).toBe(4000);
    expect(pos.debtAsset).toBe("0xusdc");
    expect(pos.debtSymbol).toBe("USDC");
    expect(pos.debtAmount).toBe("1000000");
    expect(pos.debtUsd).toBe(1000);
    expect(pos.lltv).toBe(0.8);
  });

  it("preserves chainId from the input parameter", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([makeMarketPosition()]),
    );

    const result = await getMorphoPositions("0xDeaD", 42161);
    expect(result[0].chainId).toBe(42161);
  });

  it("maps multiple market positions correctly", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition(),
        makeMarketPosition({
          market: {
            uniqueKey: "0xOtherMarket",
            lltv: "0.75",
            loanAsset: { address: "0xdai", symbol: "DAI", decimals: 18 },
            collateralAsset: { address: "0xwbtc", symbol: "WBTC", decimals: 8 },
            state: { borrowAssets: "500", supplyAssets: "2000" },
          },
          state: {
            supplyAssets: "2000",
            supplyAssetsUsd: "2000",
            borrowAssets: "500",
            borrowAssetsUsd: "500",
            collateral: "100000000",
            collateralUsd: "60000",
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result).toHaveLength(2);
    expect(result[0].marketKey).toBe("0xMarketKey");
    expect(result[1].marketKey).toBe("0xOtherMarket");
    expect(result[1].collateralSymbol).toBe("WBTC");
    expect(result[1].debtSymbol).toBe("DAI");
  });
});

// ---------------------------------------------------------------------------
// Missing / null asset data
// ---------------------------------------------------------------------------
describe("getMorphoPositions — missing asset data", () => {
  it("defaults collateralAsset to empty string when collateralAsset is null", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition({
          market: {
            uniqueKey: "0xmarket",
            lltv: "0.8",
            loanAsset: { address: "0xusdc", symbol: "USDC", decimals: 6 },
            collateralAsset: null, // missing
            state: { borrowAssets: "1000", supplyAssets: "5000" },
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result[0].collateralAsset).toBe("");
    expect(result[0].collateralSymbol).toBe("???");
  });

  it("defaults debtAsset to empty string when loanAsset is null", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition({
          market: {
            uniqueKey: "0xmarket",
            lltv: "0.8",
            loanAsset: null, // missing
            collateralAsset: { address: "0xweth", symbol: "WETH", decimals: 18 },
            state: { borrowAssets: "1000", supplyAssets: "5000" },
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result[0].debtAsset).toBe("");
    expect(result[0].debtSymbol).toBe("???");
  });

  it("defaults collateralUsd and borrowUsd to 0 when values are missing", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition({
          state: {
            supplyAssets: "0",
            supplyAssetsUsd: "0",
            borrowAssets: "100", // nonzero to pass filter
            borrowAssetsUsd: null, // missing
            collateral: "0",
            collateralUsd: null, // missing
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result[0].collateralUsd).toBe(0);
    expect(result[0].debtUsd).toBe(0);
    // borrowUsd = 0, so healthFactor = Infinity
    expect(result[0].healthFactor).toBe(Infinity);
  });

  it("defaults lltv to 0 when market lltv is missing", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition({
          market: {
            uniqueKey: "0xmarket",
            lltv: null, // missing
            loanAsset: { address: "0xusdc", symbol: "USDC", decimals: 6 },
            collateralAsset: { address: "0xweth", symbol: "WETH", decimals: 18 },
            state: { borrowAssets: "1000", supplyAssets: "5000" },
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    expect(result[0].lltv).toBe(0);
    // lltv=0, collateralUsd=4000, borrowUsd=1000 → HF = (4000*0)/1000 = 0
    expect(result[0].healthFactor).toBe(0);
  });

  it("defaults collateral amount to '0' when state.collateral is missing", async () => {
    mockRequest.mockResolvedValue(
      makeMorphoApiResponse([
        makeMarketPosition({
          state: {
            supplyAssets: "5000",
            supplyAssetsUsd: "5000",
            borrowAssets: "1000",
            borrowAssetsUsd: "1000",
            collateral: null,
            collateralUsd: "4000",
          },
        }),
      ]),
    );

    const result = await getMorphoPositions("0xDeaD", 1);
    // The code uses `p.state.collateral || "0"` — null is falsy so defaults to "0"
    expect(result[0].collateralAmount).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------
describe("getMorphoPositions — query parameters", () => {
  it("passes address and chainId to the GraphQL query", async () => {
    mockRequest.mockResolvedValue({ userByAddress: null });

    await getMorphoPositions("0xCaFeBaBe", 42161);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        address: "0xCaFeBaBe",
        chainId: 42161,
      }),
    );
  });

  it("does NOT lowercase the address (unlike Aave)", async () => {
    mockRequest.mockResolvedValue({ userByAddress: null });

    await getMorphoPositions("0xAbCdEf", 1);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ address: "0xAbCdEf" }),
    );
  });
});
