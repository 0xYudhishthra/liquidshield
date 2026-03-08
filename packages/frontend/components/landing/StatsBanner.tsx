"use client";

import { useReserveBalances, useAccumulatedPremiums } from "@/hooks/useContractReads";
import { formatUnits } from "viem";

export function StatsBanner() {
  const { data: reserves } = useReserveBalances();
  const { data: premiums } = useAccumulatedPremiums();

  const reserve0 = reserves ? formatUnits(reserves[0] as bigint, 18) : "0";
  const reserve1 = reserves ? formatUnits(reserves[1] as bigint, 6) : "0";
  const totalPremiums = premiums ? formatUnits(premiums as bigint, 6) : "0";

  const stats = [
    { label: "WETH Reserve", value: `${Number(reserve0).toFixed(4)} ETH` },
    { label: "USDC Reserve", value: `$${Number(reserve1).toLocaleString()}` },
    { label: "Total Premiums", value: `$${Number(totalPremiums).toLocaleString()}` },
    { label: "Supported Chains", value: "3" },
  ];

  return (
    <section className="px-8 py-12 bg-shield-bg">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
        {stats.map(({ label, value }) => (
          <div key={label} className="text-center">
            <p className="text-2xl font-bold text-shield-primary">{value}</p>
            <p className="text-sm text-gray-400 mt-1">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
