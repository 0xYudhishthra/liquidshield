import { encodeSqrtRatioX96, TickMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";

// ETH/USDC
const price1 = 1978.16;
const encode1 = encodeSqrtRatioX96(197816, 100);
const tick1 = TickMath.getTickAtSqrtRatio(encode1);
console.log("ETH/USDC: sqrtPriceX96 =", encode1.toString(), "tick =", tick1);

// USDC/WBTC
// 1 WBTC = 67848.1 USDC 
// Token0 is USDC, Token1 is WBTC. Price P = Token1 / Token0 = 1 / 67848.1
const encode2 = encodeSqrtRatioX96(10, 678481);
const tick2 = TickMath.getTickAtSqrtRatio(encode2);
console.log("USDC/WBTC: sqrtPriceX96 =", encode2.toString(), "tick =", tick2);
