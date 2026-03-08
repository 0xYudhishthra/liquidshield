import { getAavePositions, type AavePosition } from "./aave.service";
import { getMorphoPositions, type MorphoPosition } from "./morpho.service";

export type Position = AavePosition | MorphoPosition;
const SUPPORTED_CHAINS = [1, 42161, 10, 8453];

export async function getAllPositions(address: string) {
  const [aaveResults, morphoResults] = await Promise.all([
    Promise.all(SUPPORTED_CHAINS.map((c) => getAavePositions(address, c))),
    Promise.all(SUPPORTED_CHAINS.map((c) => getMorphoPositions(address, c))),
  ]);
  const aave = aaveResults.flat();
  const morpho = morphoResults.flat();
  const all: Position[] = [...aave, ...morpho].sort((a, b) => a.healthFactor - b.healthFactor);
  return { aave, morpho, all, totalPositions: all.length, atRiskCount: all.filter((p) => p.healthFactor < 1.5).length };
}
