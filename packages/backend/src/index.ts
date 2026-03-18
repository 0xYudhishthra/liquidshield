import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { positionsRoutes } from "./routes/positions";
import { healthRoutes } from "./routes/health";
import { defensesRoutes } from "./routes/defenses";
import { lpRoutes } from "./routes/lp";
import { webhooksRoutes } from "./routes/webhooks";
import { protectRoutes } from "./routes/protect";

const app = new Hono();
app.use("*", cors());
app.route("/positions", positionsRoutes);
app.route("/health", healthRoutes);
app.route("/defenses", defensesRoutes);
app.route("/lp", lpRoutes);
app.route("/webhooks", webhooksRoutes);
app.route("/protect", protectRoutes);
app.get("/", (c) => c.json({ status: "ok", service: "liquidshield-api" }));

const port = parseInt(process.env.PORT || "3001");
console.log(`LiquidShield API running on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
