// ============================================
// Aqua0 API Server
// Built with Hono for high performance
// ============================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { basicAuth } from "hono/basic-auth";
import { apiReference } from "@scalar/hono-api-reference";

// Routes
import { healthRoutes } from "./routes/health";
import { v4LpRoutes } from "./routes/v4-lp";
import { v4PoolsRoutes } from "./routes/v4-pools";

// Middleware
import { errorHandler } from "./middleware/error-handler";

// Types
export type AppEnv = {
  Variables: {
    walletAddress?: string;
    userId?: string;
  };
};

// Create app
const app = new Hono<AppEnv>();

// ============================================
// GLOBAL MIDDLEWARE
// ============================================

// Security headers
app.use("*", secureHeaders());

// CORS
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://aqua0.xyz",
      "https://*.aqua0.xyz",
      "https://yudhishthra-eth.taila3275f.ts.net:8443",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
  }),
);

// Logger (skip in production for performance)
if (process.env.NODE_ENV !== "production") {
  app.use("*", logger());
}

// Pretty JSON in development
if (process.env.NODE_ENV !== "production") {
  app.use("*", prettyJSON());
}

// Timing headers
app.use("*", timing());

// Error handler
app.onError(errorHandler);

// ============================================
// HEALTH ROUTES (unauthenticated)
// ============================================

app.route("/", healthRoutes);

// ============================================
// BASIC AUTH (all routes except /health, /ready)
// ============================================

app.use("/*", async (c, next) => {
  const path = c.req.path;
  // Skip basic auth for health checks and API routes (API routes use X-API-Key instead)
  if (path === "/health" || path === "/ready" || path.startsWith("/api/")) {
    return next();
  }
  const auth = basicAuth({
    username: process.env.API_BASIC_AUTH_USER || "admin",
    password: process.env.API_BASIC_AUTH_PASSWORD || "admin",
  });
  return auth(c, next);
});

// ============================================
// OPENAPI SPEC & SCALAR DOCS UI
// ============================================

app.get("/openapi.yaml", async (c) => {
  const specPath = new URL("../../../openapi.yaml", import.meta.url).pathname;
  const content = await Bun.file(specPath).text();
  return c.text(content, 200, { "Content-Type": "text/yaml" });
});

app.get(
  "/",
  apiReference({
    pageTitle: "Aqua0 API Docs",
    theme: "kepler",
    spec: {
      url: "/openapi.yaml",
    },
  } as any),
);

// ============================================
// API V1 ROUTES
// ============================================

const api = new Hono<AppEnv>();

// API Key middleware for all /api/v1/* routes
api.use("*", async (c, next) => {
  const apiKey = c.req.header("X-API-Key");
  const expectedKey = process.env.API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return c.json({ error: "Unauthorized", message: "Invalid or missing API key" }, 401);
  }
  return next();
});

// V4 Hookathon routes
api.route("/v4/lp", v4LpRoutes);
api.route("/v4/pools", v4PoolsRoutes);

app.route("/api/v1", api);

// ============================================
// 404 HANDLER
// ============================================

app.notFound((c) => {
  return c.json(
    {
      error: "Not Found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404,
  );
});

// ============================================
// SERVER START
// ============================================

const port = parseInt(process.env.PORT || "3001", 10);

console.log(`
╔═══════════════════════════════════════╗
║         Aqua0 API Server              ║
╠═══════════════════════════════════════╣
║  Port: ${port}                           ║
║  Env:  ${process.env.NODE_ENV || "development"}                   ║
╚═══════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};

// Export app for testing
export { app };
