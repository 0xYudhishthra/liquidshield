"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const TABS = ["The Problem", "How It Works", "Architecture"] as const;

function ProblemTab() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        {[
          { value: "$2B+", label: "Liquidated in 2024", sub: "Across DeFi lending protocols" },
          { value: "5-15%", label: "Penalty per liquidation", sub: "Lost to bots and MEV searchers" },
          { value: "0", label: "Automated cross-chain solutions", sub: "Until now" },
        ].map((stat, i) => (
          <div key={stat.label} className={`border border-white/[0.08] p-8 ${i > 0 ? "md:border-l-0" : ""}`}>
            <p className="text-4xl font-bold tracking-tight text-white mb-2">{stat.value}</p>
            <p className="text-sm font-semibold text-white/80 mb-1">{stat.label}</p>
            <p className="text-xs text-white/35">{stat.sub}</p>
          </div>
        ))}
      </div>
      <div className="border border-white/[0.08] p-8">
        <p className="text-sm text-white/50 leading-relaxed">
          Users monitor positions manually, set price alerts, and scramble to add collateral.
          There is no automated, non-custodial defense layer that works across chains.{" "}
          <span className="text-white/80 font-semibold">LiquidShield changes this</span> —
          embedding liquidation defense directly into a Uniswap v4 hook.
        </p>
      </div>
    </div>
  );
}

function HowItWorksTab() {
  const steps = [
    { num: "01", title: "Register & Pay Premium", desc: "Connect your wallet, detect your Aave position, choose batched unwind strategy, and pay an upfront premium. 60% goes to the defense reserve, 40% to LP rewards." },
    { num: "02", title: "Cross-Chain Monitoring", desc: "A Reactive Smart Contract on Lasna periodically triggers a HealthChecker on Base Sepolia. The HealthChecker reads your health factor directly from Aave V3 on-chain." },
    { num: "03", title: "Automated Defense", desc: "When health drops below threshold, the RSC triggers defense on Unichain — ERC-6909 capital extraction, ERC-7683 intent emission, and filler executes the unwind on Aave." },
  ];

  return (
    <div className="space-y-0">
      {steps.map((step) => (
        <div key={step.num} className="border-t border-white/[0.08] py-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-1">
            <span className="text-5xl font-bold text-white/[0.08]">{step.num}</span>
          </div>
          <div className="lg:col-span-3">
            <h3 className="text-lg font-bold text-white">{step.title}</h3>
          </div>
          <div className="lg:col-span-8">
            <p className="text-sm text-white/50 leading-relaxed">{step.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
        {[
          { name: "Uniswap v4 Hook", desc: "ERC-6909 defense reserve, dynamic fees, poolManager.donate()" },
          { name: "Reactive Network", desc: "Two-hop RSC: CRON + HealthChecker + DefenseCallback" },
          { name: "ERC-7683 Intents", desc: "Cross-chain intent settlement via IOriginSettler" },
          { name: "Aqua0 JIT", desc: "Shared liquidity amplification on every swap" },
        ].map((tech, i) => (
          <div key={tech.name} className={`border border-white/[0.08] p-6 ${i > 0 ? "sm:border-l-0" : ""}`}>
            <p className="text-sm font-bold text-white mb-2">{tech.name}</p>
            <p className="text-xs text-white/35 leading-relaxed">{tech.desc}</p>
          </div>
        ))}
      </div>

      {/* Defense flow */}
      <div className="border border-white/[0.08] p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-4">Defense Flow</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          {[
            "CRON tick (Lasna)",
            "HealthChecker reads Aave (Base Sepolia)",
            "HealthDanger event",
            "RSC callback to Unichain",
            "Hook burns ERC-6909",
            "Settler emits ERC-7683",
            "Filler executes unwind",
            "Settlement + 1.5% fee",
          ].map((step, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-white/20">→</span>}
              <span className="border border-white/[0.08] px-2 py-1">{step}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InfoTabs() {
  const [active, setActive] = useState<typeof TABS[number]>("The Problem");

  return (
    <section className="border-t border-white/[0.06] py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Tab buttons */}
        <div className="flex gap-0 mb-12 border-b border-white/[0.06]">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`px-6 py-3 text-xs uppercase tracking-[0.2em] transition-colors border-b-2 ${
                active === tab
                  ? "text-white border-white"
                  : "text-white/35 border-transparent hover:text-white/60"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {active === "The Problem" && <ProblemTab />}
          {active === "How It Works" && <HowItWorksTab />}
          {active === "Architecture" && <ArchitectureTab />}
        </motion.div>
      </div>
    </section>
  );
}
