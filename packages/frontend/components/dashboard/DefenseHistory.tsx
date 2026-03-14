"use client";

import { useDefenseHistory } from "@/hooks/useDefenseHistory";
import type { DefenseEvent } from "@shared/src/types";

const EXPLORER_URL = "https://sepolia.uniscan.xyz";

export function DefenseHistory({ address }: { address: string }) {
  const { data, isLoading, error } = useDefenseHistory(address);

  const defenses: DefenseEvent[] = data?.defenses ?? [];

  return (
    <div className="bg-shield-surface rounded-lg border border-shield-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-gray-400 border-b border-shield-border">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Position</th>
            <th className="px-4 py-3">Strategy</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Health Before/After</th>
            <th className="px-4 py-3">Fee</th>
            <th className="px-4 py-3">Tx</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading defense history...</td></tr>
          ) : error ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-red-400">Failed to load defense history</td></tr>
          ) : defenses.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No defense events yet.</td></tr>
          ) : (
            defenses.map((d, i) => (
              <tr key={`${d.txHash}-${i}`} className="border-b border-shield-border/50 hover:bg-shield-bg/30">
                <td className="px-4 py-3 text-sm text-gray-300">
                  {new Date(d.timestamp * 1000).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-white font-mono">
                  {d.positionId.slice(0, 10)}...
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  {d.strategy === "COLLATERAL_TOPUP" ? "Top-Up" : "Unwind"}
                </td>
                <td className="px-4 py-3 text-sm text-white">{d.defenseAmount}</td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  <span className="text-red-400">{d.healthBefore.toFixed(2)}</span>
                  {" -> "}
                  <span className="text-green-400">{d.healthAfter.toFixed(2)}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">{d.defenseFee}</td>
                <td className="px-4 py-3 text-sm">
                  <a
                    href={`${EXPLORER_URL}/tx/${d.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-shield-primary hover:underline"
                  >
                    {d.txHash.slice(0, 8)}...
                  </a>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
