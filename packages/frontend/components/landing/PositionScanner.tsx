"use client";

import { motion } from "framer-motion";
import { useState } from "react";

// Demo positions — in production these come from the backend API
const DEMO_POSITIONS = [
  {
    id: "aave-arb-1",
    protocol: "Aave V3",
    chain: "Arbitrum Sepolia",
    chainId: 421614,
    collateral: { symbol: "WETH", amount: "2.5", usdValue: "$5,000" },
    debt: { symbol: "USDC", amount: "3,200", usdValue: "$3,200" },
    healthFactor: 1.42,
    protected: false,
  },
  {
    id: "aave-arb-2",
    protocol: "Aave V3",
    chain: "Arbitrum Sepolia",
    chainId: 421614,
    collateral: { symbol: "WETH", amount: "1.0", usdValue: "$2,000" },
    debt: { symbol: "USDC", amount: "1,500", usdValue: "$1,500" },
    healthFactor: 1.18,
    protected: false,
  },
];

function HealthBadge({ value }: { value: number }) {
  const color =
    value > 1.5
      ? "text-green-400/80"
      : value > 1.3
        ? "text-yellow-400/80"
        : "text-red-400/80";
  return <span className={`font-mono text-sm ${color}`}>{value.toFixed(2)}</span>;
}

interface PositionScannerProps {
  address: string;
}

export function PositionScanner({ address }: PositionScannerProps) {
  const [protectedIds, setProtectedIds] = useState<Set<string>>(new Set());
  const [protecting, setProtecting] = useState<string | null>(null);

  const handleProtect = async (positionId: string) => {
    setProtecting(positionId);
    // Simulate protection flow — in production this calls the router contract
    await new Promise((r) => setTimeout(r, 2000));
    setProtectedIds((prev) => new Set(prev).add(positionId));
    setProtecting(null);
  };

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <section className="border-t border-white/[0.06] py-20 sm:py-32" id="protect">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
        >
          <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-6">
            Your Positions &middot; {truncated}
          </p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white mb-4">
            Protect your
          </h2>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white/50 mb-12">
            lending positions.
          </h2>
        </motion.div>

        {/* Two-column: Protect + LP */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 mb-12">
          {/* Positions (2/3) */}
          <div className="lg:col-span-2 border border-white/[0.08]">
            <div className="p-6 border-b border-white/[0.06]">
              <p className="text-xs uppercase tracking-[0.2em] text-white/35">
                Detected Lending Positions
              </p>
            </div>

            {DEMO_POSITIONS.map((pos, i) => {
              const isProtected = protectedIds.has(pos.id);
              const isProtecting = protecting === pos.id;

              return (
                <motion.div
                  key={pos.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className={`p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    i > 0 ? "border-t border-white/[0.06]" : ""
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-bold text-white">
                        {pos.protocol}
                      </span>
                      <span className="text-xs text-white/25 border border-white/[0.08] px-2 py-0.5">
                        {pos.chain}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-white/50">
                      <span>
                        Collateral: {pos.collateral.amount} {pos.collateral.symbol}{" "}
                        <span className="text-white/25">({pos.collateral.usdValue})</span>
                      </span>
                      <span>
                        Debt: {pos.debt.amount} {pos.debt.symbol}{" "}
                        <span className="text-white/25">({pos.debt.usdValue})</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-white/25 mb-0.5">Health Factor</p>
                      <HealthBadge value={pos.healthFactor} />
                    </div>

                    {isProtected ? (
                      <span className="px-4 py-2 text-xs font-semibold tracking-wide text-green-400/80 border border-green-400/20 bg-green-400/[0.05]">
                        Protected
                      </span>
                    ) : (
                      <button
                        onClick={() => handleProtect(pos.id)}
                        disabled={isProtecting}
                        className="btn-wipe btn-wipe-white relative px-4 py-2 border border-white/30 text-xs font-semibold tracking-wide text-white hover:text-black transition-colors disabled:opacity-50"
                      >
                        <span className="relative z-10">
                          {isProtecting ? "Protecting..." : "Protect"}
                        </span>
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* LP sidebar (1/3) */}
          <div className="border border-white/[0.08] lg:border-l-0 p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/35 mb-4">
                Earn as an LP
              </p>
              <p className="text-sm text-white/50 leading-relaxed mb-6">
                Provide liquidity via Aqua0 to earn swap fees, premium yield,
                and defense execution fees from the same pool.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  "Swap fees (standard v4)",
                  "Premium donations (40%)",
                  "Defense fee yield (1.5%)",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-blue-400/60" />
                    <span className="text-xs text-white/40">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <a
              href="https://app.aqua0.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-wipe btn-wipe-dark relative block text-center px-4 py-3 border border-white/20 text-sm font-semibold tracking-wide text-white/50 hover:text-white transition-colors"
            >
              <span className="relative z-10">Provide Liquidity via Aqua0</span>
            </a>
          </div>
        </div>

        {/* Defense reserve stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
          {[
            { label: "Defense Reserve (mWETH)", value: "99.97" },
            { label: "Defense Reserve (mUSDC)", value: "100,000" },
            { label: "Positions Protected", value: "1" },
            { label: "Premiums Earned", value: "0.023 mWETH" },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className={`border border-white/[0.08] p-6 ${i > 0 ? "border-l-0" : ""}`}
            >
              <p className="text-lg sm:text-xl font-bold tracking-tight text-white mb-1">
                {stat.value}
              </p>
              <p className="text-xs text-white/25">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
