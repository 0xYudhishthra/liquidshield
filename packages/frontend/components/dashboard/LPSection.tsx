"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLPEarnings } from "@/lib/api";
import type { LPEarnings } from "@shared/src/types";

export function LPSection({ address }: { address: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data } = useQuery<LPEarnings>({
    queryKey: ["lpEarnings", address],
    queryFn: () => fetchLPEarnings(address),
    enabled: !!address && isExpanded,
    refetchInterval: 30_000,
  });

  const earnings = data ?? {
    swapFees: "0",
    premiumYield: "0",
    defenseFeeYield: "0",
    totalYield: "0",
    apy: 0,
  };

  const stats = [
    { label: "Swap Fees Earned", value: `$${Number(earnings.swapFees).toFixed(2)}` },
    { label: "Premium Yield", value: `$${Number(earnings.premiumYield).toFixed(2)}` },
    { label: "Defense Fee Yield", value: `$${Number(earnings.defenseFeeYield).toFixed(2)}` },
    { label: "Total Yield", value: `$${Number(earnings.totalYield).toFixed(2)}` },
    { label: "APY", value: `${(earnings.apy * 100).toFixed(2)}%` },
  ];

  return (
    <section>
      <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 text-xl font-bold text-white mb-4">
        <span>{isExpanded ? "v" : ">"}</span> Liquidity Provider
      </button>
      {isExpanded && (
        <div className="bg-shield-surface rounded-lg border border-shield-border p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {stats.map(({ label, value }) => (
              <div key={label}>
                <p className="text-sm text-gray-400">{label}</p>
                <p className="text-lg text-white mt-1">{value}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-6">
            <a
              href="https://app.uniswap.org/pool"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-shield-primary rounded-lg text-white text-sm"
            >
              Add Liquidity
            </a>
            <a
              href="https://app.uniswap.org/pool"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-shield-surface border border-shield-border rounded-lg text-white text-sm"
            >
              Remove Liquidity
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
