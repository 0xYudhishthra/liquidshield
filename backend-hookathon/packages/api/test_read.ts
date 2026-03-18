import { readAggregatedPositions, readPoolLiquidity } from "./src/contracts/v4-client.ts";
async function run() {
    const poolId = "0x4df014947c8607a870dccb9dd5f627a195c72c5faf5b27ba90dd9865a9d5b4f0";
    console.log("Liquidity:", await readPoolLiquidity(696969, poolId as any));
    console.log("Ranges:", await readAggregatedPositions(696969, poolId as any));
}
run().catch(console.error);
