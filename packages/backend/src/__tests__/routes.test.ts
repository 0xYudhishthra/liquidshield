import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @hono/node-server to prevent the real HTTP server from starting on import
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(),
}));

// Mock the position-aggregator so route handlers never hit real GraphQL endpoints
vi.mock("../services/position-aggregator", () => ({
  getAllPositions: vi.fn(),
}));

import app from "../index";
import { getAllPositions } from "../services/position-aggregator";

const mockedGetAllPositions = vi.mocked(getAllPositions);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET / — Health check
// ---------------------------------------------------------------------------
describe("GET / (health check)", () => {
  it("returns 200 with ok status and service name", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", service: "liquidshield-api" });
  });
});

// ---------------------------------------------------------------------------
// GET /positions/:address
// ---------------------------------------------------------------------------
describe("GET /positions/:address", () => {
  it("returns aggregated positions on success", async () => {
    const mockResult = {
      aave: [
        {
          protocol: "aave" as const,
          chainId: 1,
          collateralAsset: "0xaaa",
          collateralSymbol: "WETH",
          collateralAmount: "1.5",
          debtAsset: "0xbbb",
          debtSymbol: "USDC",
          debtAmount: "1000",
          healthFactor: 1.8,
          liquidationThreshold: 0.85,
        },
      ],
      morpho: [],
      all: [
        {
          protocol: "aave" as const,
          chainId: 1,
          collateralAsset: "0xaaa",
          collateralSymbol: "WETH",
          collateralAmount: "1.5",
          debtAsset: "0xbbb",
          debtSymbol: "USDC",
          debtAmount: "1000",
          healthFactor: 1.8,
          liquidationThreshold: 0.85,
        },
      ],
      totalPositions: 1,
      atRiskCount: 0,
    };

    mockedGetAllPositions.mockResolvedValue(mockResult);

    const res = await app.request("/positions/0xDeaD");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockResult);
    expect(mockedGetAllPositions).toHaveBeenCalledWith("0xDeaD");
  });

  it("returns 500 when getAllPositions throws", async () => {
    mockedGetAllPositions.mockRejectedValue(new Error("GraphQL timeout"));

    const res = await app.request("/positions/0xDeaD");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to fetch positions" });
  });

  it("passes the exact address parameter to getAllPositions", async () => {
    mockedGetAllPositions.mockResolvedValue({
      aave: [],
      morpho: [],
      all: [],
      totalPositions: 0,
      atRiskCount: 0,
    });

    await app.request("/positions/0xAbCdEf1234567890abcdef1234567890AbCdEf12");
    expect(mockedGetAllPositions).toHaveBeenCalledWith(
      "0xAbCdEf1234567890abcdef1234567890AbCdEf12",
    );
  });
});

// ---------------------------------------------------------------------------
// GET /health/:positionId
// ---------------------------------------------------------------------------
describe("GET /health/:positionId", () => {
  it("returns stub health data with the given positionId", async () => {
    const res = await app.request("/health/pos-abc-123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.positionId).toBe("pos-abc-123");
    expect(body.healthFactor).toBe(1.5);
    expect(typeof body.timestamp).toBe("number");
  });

  it("returns a numeric timestamp close to now", async () => {
    const before = Date.now();
    const res = await app.request("/health/any-id");
    const after = Date.now();
    const body = await res.json();
    expect(body.timestamp).toBeGreaterThanOrEqual(before);
    expect(body.timestamp).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// GET /defenses/:address
// ---------------------------------------------------------------------------
describe("GET /defenses/:address", () => {
  it("returns stub defense data with the given address", async () => {
    const res = await app.request("/defenses/0xDeaD");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ address: "0xDeaD", defenses: [], total: 0 });
  });

  it("echoes back the address from the URL", async () => {
    const res = await app.request("/defenses/0x1234");
    const body = await res.json();
    expect(body.address).toBe("0x1234");
  });
});

// ---------------------------------------------------------------------------
// GET /lp/:address/earnings
// ---------------------------------------------------------------------------
describe("GET /lp/:address/earnings", () => {
  it("returns stub LP earnings data with the given address", async () => {
    const res = await app.request("/lp/0xDeaD/earnings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      address: "0xDeaD",
      swapFees: "0",
      premiumYield: "0",
      defenseFeeYield: "0",
      totalYield: "0",
      apy: "0",
    });
  });

  it("echoes back the address from the URL", async () => {
    const res = await app.request("/lp/0xCaFe/earnings");
    const body = await res.json();
    expect(body.address).toBe("0xCaFe");
  });
});

// ---------------------------------------------------------------------------
// CORS — verify headers are present
// ---------------------------------------------------------------------------
describe("CORS middleware", () => {
  it("includes Access-Control-Allow-Origin in the response", async () => {
    const res = await app.request("/", {
      headers: { Origin: "http://localhost:3000" },
    });
    // Hono's cors() middleware sets this header
    const acao = res.headers.get("Access-Control-Allow-Origin");
    expect(acao).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 404 — unknown routes
// ---------------------------------------------------------------------------
describe("unknown routes", () => {
  it("returns 404 for unregistered paths", async () => {
    const res = await app.request("/nonexistent");
    expect(res.status).toBe(404);
  });
});
