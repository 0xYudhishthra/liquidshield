"use client";

import { useState } from "react";
import { usePositions } from "@/hooks/usePositions";
import { ProtocolLogo } from "@/components/shared/ProtocolLogo";
import { ChainBadge } from "@/components/shared/ChainBadge";
import { HealthFactorBadge } from "@/components/shared/HealthFactorBadge";
import { RegisterModal } from "./RegisterModal";
import type { Position } from "../../../../shared/src/types";

export function UnprotectedPositions({ address }: { address: string }) {
  const { data, isLoading, error } = usePositions(address);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  const positions: Position[] = data?.all ?? [];

  return (
    <>
      <div className="bg-shield-surface rounded-lg border border-shield-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-400 border-b border-shield-border">
              <th className="px-4 py-3">Protocol</th>
              <th className="px-4 py-3">Chain</th>
              <th className="px-4 py-3">Collateral</th>
              <th className="px-4 py-3">Debt</th>
              <th className="px-4 py-3">Health Factor</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Scanning positions...</td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-red-400">Failed to load positions</td></tr>
            ) : positions.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No unprotected positions found.</td></tr>
            ) : (
              positions.map((pos, i) => (
                <tr key={`${pos.protocol}-${pos.chainId}-${i}`} className="border-b border-shield-border/50 hover:bg-shield-bg/30">
                  <td className="px-4 py-3"><ProtocolLogo protocol={pos.protocol} /></td>
                  <td className="px-4 py-3"><ChainBadge chainId={pos.chainId} /></td>
                  <td className="px-4 py-3 text-sm text-white">{pos.collateralAmount} {pos.collateralSymbol}</td>
                  <td className="px-4 py-3 text-sm text-white">{pos.debtAmount} {pos.debtSymbol}</td>
                  <td className="px-4 py-3"><HealthFactorBadge value={pos.healthFactor} /></td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedPosition(pos)}
                      className="px-3 py-1 bg-shield-primary rounded text-white text-sm hover:bg-shield-primary/80"
                    >
                      Protect
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <RegisterModal
        isOpen={!!selectedPosition}
        onClose={() => setSelectedPosition(null)}
        position={selectedPosition ?? undefined}
      />
    </>
  );
}
