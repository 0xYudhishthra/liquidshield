import { createWatcher } from "./watcher";
import { createExecutor } from "./executor";
import { createSettlement } from "./settlement";

async function main() {
  console.log("Starting LiquidShield Filler Service...");
  const watcher = createWatcher();
  const executor = createExecutor();
  const settlement = createSettlement();

  watcher.on("newIntent", async (intent) => {
    console.log(`New defense intent: ${intent.orderId}`);
    try {
      const fillTx = await executor.fill(intent);
      console.log(`Defense filled on chain ${intent.sourceChainId}: ${fillTx}`);
      const settleTx = await settlement.settle(intent.orderId, fillTx);
      console.log(`Settlement complete: ${settleTx}`);
    } catch (error) { console.error(`Failed to fill intent ${intent.orderId}:`, error); }
  });

  await watcher.start();
  console.log("Filler running. Watching for defense intents...");
}

main().catch(console.error);
