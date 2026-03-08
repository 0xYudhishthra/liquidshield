import { executeCollateralTopup } from "./strategies/collateral-topup";
import { executeBatchedUnwind } from "./strategies/debt-repay";
import type { DefenseIntent } from "./watcher";

export function createExecutor() {
  /**
   * Routes the defense intent to the correct strategy handler.
   * Strategy 0 = Collateral top-up (e.g., Aave V3 on Arbitrum)
   * Strategy 1 = Batched unwind (e.g., Morpho Blue on Ethereum)
   *
   * Each strategy function handles wallet client creation, contract call,
   * and transaction receipt verification internally.
   */
  async function fill(intent: DefenseIntent): Promise<string> {
    console.log(`Filling intent ${intent.orderId} with strategy ${intent.strategy}`);

    switch (intent.strategy) {
      case 0:
        return await executeCollateralTopup(intent);
      case 1:
        return await executeBatchedUnwind(intent);
      default:
        throw new Error(`Unknown defense strategy: ${intent.strategy}`);
    }
  }

  return { fill };
}
