import { Hono } from "hono";
import { getAllPositions } from "../services/position-aggregator";

export const positionsRoutes = new Hono();
positionsRoutes.get("/:address", async (c) => {
  const address = c.req.param("address");
  try {
    const positions = await getAllPositions(address);
    return c.json(positions);
  } catch (error) {
    console.error("Error fetching positions:", error);
    return c.json({ error: "Failed to fetch positions" }, 500);
  }
});
