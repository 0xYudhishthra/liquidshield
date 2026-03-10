import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @hono/node-server to prevent real server startup
vi.mock("@hono/node-server", () => ({
  serve: vi.fn(),
}));

// Mock position-aggregator (imported by other routes during app init)
vi.mock("../services/position-aggregator", () => ({
  getAllPositions: vi.fn(),
}));

import app from "../index";
import { clearDefenseEvents, getAllDefenseEvents } from "../services/defense-store";

beforeEach(() => {
  vi.clearAllMocks();
  clearDefenseEvents();
});

// ---------------------------------------------------------------------------
// POST /webhooks/rsc-callback
// ---------------------------------------------------------------------------
describe("POST /webhooks/rsc-callback", () => {
  it("returns 200 and records event on valid payload", async () => {
    const res = await app.request("/webhooks/rsc-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positionId: "0xabc123",
        currentHealth: 1.2,
        sourceChainId: 421614,
        detectedAt: 1700000000,
        txHash: "0xtx123",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("received");
    expect(body.positionId).toBe("0xabc123");

    const events = getAllDefenseEvents();
    expect(events).toHaveLength(1);
    expect(events[0].positionId).toBe("0xabc123");
    expect(events[0].healthBefore).toBe(1.2);
  });

  it("returns 400 when positionId is missing", async () => {
    const res = await app.request("/webhooks/rsc-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentHealth: 1.1 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing positionId");
  });

  it("uses defaults for missing optional fields", async () => {
    const res = await app.request("/webhooks/rsc-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: "0xdef" }),
    });

    expect(res.status).toBe(200);
    const events = getAllDefenseEvents();
    expect(events[0].healthBefore).toBe(0);
    expect(events[0].txHash).toBe("0x_pending");
    expect(events[0].chainId).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /webhooks/defense-notification
// ---------------------------------------------------------------------------
describe("POST /webhooks/defense-notification", () => {
  it("returns 200 and records full defense event", async () => {
    const res = await app.request("/webhooks/defense-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positionId: "0xpos1",
        strategy: "BATCHED_UNWIND",
        defenseAmount: "1000000",
        defenseFee: "15000",
        healthBefore: 1.15,
        healthAfter: 1.65,
        txHash: "0xtxhash",
        chainId: 11155111,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("recorded");
    expect(body.txHash).toBe("0xtxhash");

    const events = getAllDefenseEvents();
    expect(events).toHaveLength(1);
    expect(events[0].strategy).toBe("BATCHED_UNWIND");
    expect(events[0].defenseAmount).toBe("1000000");
    expect(events[0].healthAfter).toBe(1.65);
  });

  it("returns 400 when positionId is missing", async () => {
    const res = await app.request("/webhooks/defense-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHash: "0x123" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when txHash is missing", async () => {
    const res = await app.request("/webhooks/defense-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: "0xpos1" }),
    });

    expect(res.status).toBe(400);
  });

  it("defaults invalid strategy to COLLATERAL_TOPUP", async () => {
    const res = await app.request("/webhooks/defense-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positionId: "0xpos1",
        txHash: "0xtx",
        strategy: "INVALID_STRATEGY",
      }),
    });

    expect(res.status).toBe(200);
    const events = getAllDefenseEvents();
    expect(events[0].strategy).toBe("COLLATERAL_TOPUP");
  });
});

// ---------------------------------------------------------------------------
// POST /webhooks/settlement
// ---------------------------------------------------------------------------
describe("POST /webhooks/settlement", () => {
  it("returns 200 on valid settlement payload", async () => {
    const res = await app.request("/webhooks/settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positionId: "0xpos1",
        orderId: "0xorder1",
        defenseAmount: "500000",
        fillerAddress: "0xfiller",
        settlementTxHash: "0xsettle",
        sourceChainTxHash: "0xsource",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("recorded");
    expect(body.orderId).toBe("0xorder1");
    expect(body.settlementTxHash).toBe("0xsettle");
  });

  it("returns 400 when positionId is missing", async () => {
    const res = await app.request("/webhooks/settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settlementTxHash: "0xsettle" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when settlementTxHash is missing", async () => {
    const res = await app.request("/webhooks/settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: "0xpos1" }),
    });

    expect(res.status).toBe(400);
  });
});
