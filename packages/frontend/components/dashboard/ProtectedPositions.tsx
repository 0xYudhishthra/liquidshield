"use client";

import { usePositions } from "@/hooks/usePositions";
import { useUnregisterPosition, useTopUpPremium } from "@/hooks/useContractActions";
import { ProtocolLogo } from "@/components/shared/ProtocolLogo";
import { ChainBadge } from "@/components/shared/ChainBadge";
import { HealthFactorBadge } from "@/components/shared/HealthFactorBadge";
import type { ProtectedPosition } from "../../../../shared/src/types";

export function ProtectedPositions({ address }: { address: string }) {
  const { data, isLoading } = usePositions(address);
  const { unregister, isPending: isUnregistering } = useUnregisterPosition();
  const { topUp, isPending: isToppingUp } = useTopUpPremium();

  // Filter positions that are protected (have strategy and status fields)
  const positions: ProtectedPosition[] = (data?.all ?? []).filter(
    (p: any) => p.status && p.strategy
  );

  const handleUnregister = (positionId: string) => {
    unregister(positionId as `0x${string}`);
  };

  const handleTopUp = (positionId: string, token: string) => {
    topUp({
      positionId: positionId as `0x${string}`,
      token: token as `0x${string}`,
      amount: BigInt(10e6), // 10 USDC
      months: 1n,
    });
  };

  return (
    <div className="bg-shield-surface rounded-lg border border-shield-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-gray-400 border-b border-shield-border">
            <th className="px-4 py-3">Protocol</th>
            <th className="px-4 py-3">Chain</th>
            <th className="px-4 py-3">Collateral</th>
            <th className="px-4 py-3">Debt</th>
            <th className="px-4 py-3">Health Factor</th>
            <th className="px-4 py-3">Strategy</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
          ) : positions.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No protected positions yet.</td></tr>
          ) : (
            positions.map((pos, i) => (
              <tr key={`${pos.positionId}-${i}`} className="border-b border-shield-border/50 hover:bg-shield-bg/30">
                <td className="px-4 py-3"><ProtocolLogo protocol={pos.protocol} /></td>
                <td className="px-4 py-3"><ChainBadge chainId={pos.chainId} /></td>
                <td className="px-4 py-3 text-sm text-white">{pos.collateralAmount} {pos.collateralSymbol}</td>
                <td className="px-4 py-3 text-sm text-white">{pos.debtAmount} {pos.debtSymbol}</td>
                <td className="px-4 py-3"><HealthFactorBadge value={pos.healthFactor} /></td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  {pos.strategy === "COLLATERAL_TOPUP" ? "Top-Up" : "Unwind"}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    pos.status === "ACTIVE" ? "bg-green-400/10 text-green-400" :
                    pos.status === "DEFENDING" ? "bg-yellow-400/10 text-yellow-400" :
                    pos.status === "UNWINDING" ? "bg-blue-400/10 text-blue-400" :
                    "bg-gray-400/10 text-gray-400"
                  }`}>
                    {pos.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTopUp(pos.positionId, pos.debtAsset)}
                      disabled={isToppingUp}
                      className="px-2 py-1 bg-shield-bg border border-shield-border rounded text-xs text-gray-300 hover:text-white disabled:opacity-50"
                    >
                      Top Up
                    </button>
                    <button
                      onClick={() => handleUnregister(pos.positionId)}
                      disabled={isUnregistering}
                      className="px-2 py-1 bg-shield-bg border border-red-500/30 rounded text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
