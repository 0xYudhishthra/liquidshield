import { describe, it, expect } from "bun:test";
import { app } from "../index";

// NOTE:
// These are lightweight end-to-end tests that do NOT depend on
// Supabase, Ponder, or Redis connectivity. They are intended to
// verify that the API server is wired correctly and that core
// routes conform to the documented specs for v1.

// Auth headers for Basic Auth + API Key
const authHeaders = {
  Authorization: `Basic ${btoa(`${process.env.API_BASIC_AUTH_USER || "admin"}:${process.env.API_BASIC_AUTH_PASSWORD || "admin"}`)}`,
  "X-API-Key": process.env.API_KEY || "test-api-key",
};

describe("Aqua0 API - basic health and swap flows", () => {
  it("GET /health should return liveness status (no auth required)", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });

  it("GET /api/v1/chains should return supported chains (no auth required)", async () => {
    const res = await app.request("/api/v1/chains");

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.chains)).toBe(true);
    expect(body.chains.length).toBeGreaterThan(0);
    expect(body.chains[0]).toHaveProperty("id");
    expect(body.chains[0]).toHaveProperty("name");
  });

  it("POST /api/v1/swaps/quote without auth should return 401", async () => {
    const res = await app.request("/api/v1/swaps/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        order: {
          maker: "0x0000000000000000000000000000000000000001",
          traits: "0",
          data: "0x",
        },
        tokenIn: "0x0000000000000000000000000000000000000001",
        tokenOut: "0x0000000000000000000000000000000000000002",
        amountIn: "1000000",
        takerData: "0x",
      }),
    });

    expect(res.status).toBe(401);
  });

  it("POST /api/v1/swaps/quote with auth should pass validation", async () => {
    const res = await app.request("/api/v1/swaps/quote", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        order: {
          maker: "0x0000000000000000000000000000000000000001",
          traits: "0",
          data: "0x",
        },
        tokenIn: "0x0000000000000000000000000000000000000001",
        tokenOut: "0x0000000000000000000000000000000000000002",
        amountIn: "1000000",
        takerData: "0x",
      }),
    });

    // The quote may fail (500) since the contract addresses are invalid,
    // but it should NOT return 400 (schema validation should pass)
    // or 401 (auth should pass)
    expect([200, 500]).toContain(res.status);
  });
});
