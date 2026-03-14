"use client";

import { usePositions } from "@/hooks/usePositions";
import { useDefenseHistory } from "@/hooks/useDefenseHistory";
import type { ProtectedPosition, DefenseEvent } from "@shared/src/types";

export function ProtectionStats({ address }: { address: string }) {
  const { data: posData } = usePositions(address);
  const { data: defData } = useDefenseHistory(address);

  const positions: ProtectedPosition[] = (posData?.all ?? []).filter(
    (p: any) => p.status && p.strategy
  );
  const defenses: DefenseEvent[] = defData?.defenses ?? [];

  const totalProtectedUsd = positions.reduce(
    (sum: number, p: ProtectedPosition) => sum + (p.collateralUsd || 0),
    0
  );
  const defensesTriggered = defenses.length;
  const totalFees = defenses.reduce(
    (sum: number, d: DefenseEvent) => sum + parseFloat(d.defenseFee || "0"),
    0
  );

  const stats = [
    { label: "Total Protected", value: `$${totalProtectedUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
    { label: "Active Shields", value: positions.length.toString() },
    { label: "Defenses Triggered", value: defensesTriggered.toString() },
    { label: "Total Fees Paid", value: `$${totalFees.toFixed(2)}` },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map(({ label, value }) => (
        <div key={label} className="bg-shield-surface rounded-lg border border-shield-border p-4">
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
        </div>
      ))}
    </div>
  );
}
