"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 pt-20 overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Shield glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-500/[0.04] blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
        className="relative z-10 max-w-4xl text-center"
      >
        <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-8">
          Uniswap v4 Hook &middot; Unichain &middot; Reactive Network
        </p>

        <h1 className="text-5xl sm:text-7xl lg:text-[7rem] font-bold leading-[0.9] tracking-[-0.04em] text-white mb-2">
          Never get
        </h1>
        <h1 className="text-5xl sm:text-7xl lg:text-[7rem] font-bold leading-[0.9] tracking-[-0.04em] text-white/50 mb-10">
          liquidated again.
        </h1>

        <p className="text-base sm:text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
          LiquidShield monitors your lending positions across chains and
          automatically defends them before liquidation hits — turning Uniswap
          LPs into decentralized insurance providers.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <ConnectButton label="Launch App" />
          <a
            href="https://github.com/0xYudhishthra/liquidshield"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-wipe btn-wipe-dark relative px-6 py-3 border border-white/20 text-sm font-semibold tracking-wide text-white/50 hover:text-white transition-colors"
          >
            <span className="relative z-10">View Source</span>
          </a>
        </div>

        <p className="text-xs text-white/25 tracking-wide">
          Non-custodial &middot; Approval-based &middot; No custody of funds
        </p>
      </motion.div>

      {/* Stats bar at bottom */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.8 }}
        className="absolute bottom-0 left-0 right-0 border-t border-white/[0.06]"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {[
            { value: "3", label: "Chains Protected" },
            { value: "2", label: "Lending Protocols" },
            { value: "150+", label: "Tests Passing" },
            { value: "<1s", label: "Defense Response" },
          ].map((stat) => (
            <div key={stat.label} className="text-center sm:text-left">
              <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {stat.value}
              </p>
              <p className="text-xs text-white/35 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
