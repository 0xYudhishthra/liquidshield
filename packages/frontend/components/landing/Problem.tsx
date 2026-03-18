"use client";

import { motion } from "framer-motion";

const STATS = [
  { value: "$2B+", label: "Liquidated in 2024", sublabel: "Across DeFi lending protocols" },
  { value: "5-15%", label: "Penalty per liquidation", sublabel: "Lost to bots and MEV searchers" },
  { value: "0", label: "Automated cross-chain solutions", sublabel: "Until now" },
];

export function Problem() {
  return (
    <section className="border-t border-white/[0.06] py-20 sm:py-32">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
        >
          <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-6">
            The Problem
          </p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white mb-4">
            DeFi liquidations are
          </h2>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white/50 mb-16">
            a $2 billion problem.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.5,
                delay: i * 0.15,
                ease: [0.25, 0.4, 0.25, 1],
              }}
              className={`border border-white/[0.08] p-8 sm:p-10 ${
                i > 0 ? "md:border-l-0" : ""
              }`}
            >
              <p className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-3">
                {stat.value}
              </p>
              <p className="text-sm font-semibold text-white/80 mb-1">
                {stat.label}
              </p>
              <p className="text-sm text-white/35">{stat.sublabel}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-12 border border-white/[0.08] p-8 sm:p-10"
        >
          <p className="text-sm text-white/50 leading-relaxed">
            Users monitor positions manually, set price alerts, and scramble to
            add collateral when markets move. There is no automated,
            non-custodial defense layer that works across chains.{" "}
            <span className="text-white/80 font-semibold">
              LiquidShield changes this
            </span>{" "}
            — embedding liquidation defense directly into a Uniswap v4 hook.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
