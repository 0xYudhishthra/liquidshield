// ============================================
// Health & Status Routes
// ============================================

import { Hono } from "hono";
import type { AppEnv } from "../index";

import { getPonderDb } from "../db/ponder";
import { getRedis, isRedisAvailable } from "../db/redis";

export const healthRoutes = new Hono<AppEnv>();

// Supported chains
const SUPPORTED_CHAINS = [
  { id: 8453, name: "base", displayName: "Base" },
  { id: 130, name: "unichain", displayName: "Unichain" },
];

// ============================================
// GET /health - Liveness check
// ============================================

healthRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// GET /ready - Readiness check (DB + cache)
// ============================================

healthRoutes.get("/ready", async (c) => {
  const checks: Record<string, { status: string; latency?: number }> = {};
  let allHealthy = true;


  // Check Ponder DB
  try {
    const start = Date.now();
    const sql = getPonderDb();
    if (!sql) {
      checks.ponder = { status: "not_configured" };
      allHealthy = false;
    } else {
      await sql`SELECT 1`;
      checks.ponder = { status: "healthy", latency: Date.now() - start };
    }
  } catch (error) {
    checks.ponder = { status: "unhealthy" };
    allHealthy = false;
  }

  // Check Redis (optional — doesn't fail readiness)
  try {
    const start = Date.now();
    const redis = getRedis();
    if (!redis || !isRedisAvailable()) {
      checks.redis = { status: "not_configured" };
      // Redis is optional — don't fail readiness
    } else {
      await redis.ping();
      checks.redis = { status: "healthy", latency: Date.now() - start };
    }
  } catch (error) {
    checks.redis = { status: "unhealthy" };
    // Redis is optional — don't fail readiness
  }

  const status = allHealthy ? 200 : 503;

  return c.json(
    {
      status: allHealthy ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      checks,
    },
    status,
  );
});

// ============================================
// GET /api/v1/chains - Supported chains
// ============================================

healthRoutes.get("/api/v1/chains", (c) => {
  return c.json({
    chains: SUPPORTED_CHAINS,
  });
});
