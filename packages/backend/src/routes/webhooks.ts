import { Hono } from "hono";
import type { DefenseEvent, DefenseStrategy } from "../../../shared/src/types";
import { addDefenseEvent } from "../services/defense-store";

export const webhooksRoutes = new Hono();

/**
 * POST /rsc-callback
 * Called by the Reactive Network RSC when a health factor drop is detected on a source chain.
 * The RSC natively sends a transaction to the hook on Unichain, but also
 * notifies this backend so we can update the in-memory defense store immediately.
 *
 * Expected body:
 * {
 *   positionId: string,
 *   currentHealth: number,
 *   sourceChainId: number,
 *   detectedAt: number (timestamp ms),
 *   txHash?: string
 * }
 */
webhooksRoutes.post("/rsc-callback", async (c) => {
  try {
    const body = await c.req.json();

    const { positionId, currentHealth, sourceChainId, detectedAt, txHash } = body;

    if (!positionId) {
      return c.json({ error: "Missing positionId" }, 400);
    }

    console.log(
      `[RSC Callback] Position ${positionId} health dropped to ${currentHealth} on chain ${sourceChainId}`
    );

    // Store as a defense event with partial data (will be enriched by defense-notification)
    const event: DefenseEvent = {
      positionId,
      strategy: "COLLATERAL_TOPUP", // Will be updated when defense is actually triggered
      defenseAmount: "0",           // Not known yet at RSC detection time
      defenseFee: "0",
      healthBefore: currentHealth || 0,
      healthAfter: 0,               // Not known yet
      timestamp: detectedAt || Date.now(),
      txHash: txHash || "0x_pending",
      chainId: sourceChainId || 0,
    };

    addDefenseEvent(event);

    return c.json({
      status: "received",
      positionId,
      message: "RSC callback processed",
    });
  } catch (error) {
    console.error("[RSC Callback] Error:", error);
    return c.json({ error: "Failed to process RSC callback" }, 500);
  }
});

/**
 * POST /defense-notification
 * Called after a defense has been executed (either by the hook or by the filler service).
 * Contains the full defense event with before/after health, amounts, fees, etc.
 *
 * Expected body:
 * {
 *   positionId: string,
 *   strategy: "COLLATERAL_TOPUP" | "BATCHED_UNWIND",
 *   defenseAmount: string,
 *   defenseFee: string,
 *   healthBefore: number,
 *   healthAfter: number,
 *   txHash: string,
 *   chainId: number,
 *   timestamp?: number
 * }
 */
webhooksRoutes.post("/defense-notification", async (c) => {
  try {
    const body = await c.req.json();

    const {
      positionId,
      strategy,
      defenseAmount,
      defenseFee,
      healthBefore,
      healthAfter,
      txHash,
      chainId,
      timestamp,
    } = body;

    if (!positionId || !txHash) {
      return c.json({ error: "Missing positionId or txHash" }, 400);
    }

    // Validate strategy
    const validStrategies: DefenseStrategy[] = ["COLLATERAL_TOPUP", "BATCHED_UNWIND"];
    const resolvedStrategy: DefenseStrategy = validStrategies.includes(strategy)
      ? strategy
      : "COLLATERAL_TOPUP";

    console.log(
      `[Defense Notification] Position ${positionId} defended with ${resolvedStrategy}, amount: ${defenseAmount}, HF: ${healthBefore} -> ${healthAfter}`
    );

    const event: DefenseEvent = {
      positionId,
      strategy: resolvedStrategy,
      defenseAmount: defenseAmount || "0",
      defenseFee: defenseFee || "0",
      healthBefore: healthBefore || 0,
      healthAfter: healthAfter || 0,
      timestamp: timestamp || Date.now(),
      txHash,
      chainId: chainId || 0,
    };

    addDefenseEvent(event);

    return c.json({
      status: "recorded",
      positionId,
      txHash,
      message: "Defense notification recorded",
    });
  } catch (error) {
    console.error("[Defense Notification] Error:", error);
    return c.json({ error: "Failed to process defense notification" }, 500);
  }
});

/**
 * POST /settlement
 * Called by the filler service when an ERC-7683 intent has been settled on Unichain.
 *
 * Expected body:
 * {
 *   positionId: string,
 *   orderId: string,
 *   defenseAmount: string,
 *   fillerAddress: string,
 *   settlementTxHash: string,
 *   sourceChainTxHash: string,
 *   timestamp?: number
 * }
 */
webhooksRoutes.post("/settlement", async (c) => {
  try {
    const body = await c.req.json();

    const {
      positionId,
      orderId,
      defenseAmount,
      fillerAddress,
      settlementTxHash,
      sourceChainTxHash,
      timestamp,
    } = body;

    if (!positionId || !settlementTxHash) {
      return c.json({ error: "Missing positionId or settlementTxHash" }, 400);
    }

    console.log(
      `[Settlement] Position ${positionId} settled. Order: ${orderId}, Amount: ${defenseAmount}, Filler: ${fillerAddress}`
    );

    return c.json({
      status: "recorded",
      positionId,
      orderId,
      settlementTxHash,
      message: "Settlement recorded",
    });
  } catch (error) {
    console.error("[Settlement] Error:", error);
    return c.json({ error: "Failed to process settlement" }, 500);
  }
});
