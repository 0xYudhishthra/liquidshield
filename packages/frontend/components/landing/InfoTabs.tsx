"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const TABS = ["The Problem", "How It Works", "The Hook", "Architecture"] as const;

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
          embedding liquidation defense directly into a Uniswap v4 hook, turning passive LP
          liquidity into active insurance infrastructure.
        </p>
      </div>
    </div>
  );
}

function HowItWorksTab() {
  const steps = [
    {
      num: "01",
      title: "Provide Liquidity via Aqua0",
      desc: "LPs deposit into Aqua0's SharedLiquidityPool. The hook inherits Aqua0BaseHook for JIT liquidity amplification — the same pool earns swap fees + premium yield from defense users.",
    },
    {
      num: "02",
      title: "Create Position on Aave (Base Sepolia)",
      desc: "Users supply collateral and borrow on Aave V3 on Base Sepolia. This creates a lending position with a health factor that needs monitoring.",
    },
    {
      num: "03",
      title: "Register Protection (Unichain Sepolia)",
      desc: "The user registers their position for protection by calling the LiquidShield Router on Unichain Sepolia and paying an upfront premium. 60% goes to the ERC-6909 defense reserve, 40% to LP rewards.",
    },
    {
      num: "04",
      title: "Reactive Monitoring",
      desc: "A Reactive Smart Contract on Lasna periodically triggers a HealthChecker on Base Sepolia via CRON. The HealthChecker reads getUserAccountData() from Aave V3 on-chain. If health drops below threshold, it emits HealthDanger.",
    },
    {
      num: "05",
      title: "Defense + Filler Execution",
      desc: "The RSC detects HealthDanger → callback to Unichain → hook burns ERC-6909, emits ERC-7683 intent → filler executes batched unwind on Aave V3 via DefenseExecutor → settles back on Unichain with 1.5% fee to LPs.",
    },
  ];

  return (
    <div className="space-y-0">
      {steps.map((step) => (
        <div key={step.num} className="border-t border-white/[0.08] py-8 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8">
          <div className="lg:col-span-1">
            <span className="text-4xl font-bold text-white/[0.08]">{step.num}</span>
          </div>
          <div className="lg:col-span-3">
            <h3 className="text-base font-bold text-white">{step.title}</h3>
          </div>
          <div className="lg:col-span-8">
            <p className="text-sm text-white/50 leading-relaxed">{step.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HookTab() {
  return (
    <div className="space-y-6">
      <div className="border border-white/[0.08] p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-4">Core Innovation</p>
        <h3 className="text-xl font-bold text-white mb-3">
          The Uniswap v4 Hook as Insurance Infrastructure
        </h3>
        <p className="text-sm text-white/50 leading-relaxed mb-6">
          LiquidShield is a Uniswap v4 hook that transforms a standard LP pool into a decentralized
          insurance layer. The hook intercepts pool lifecycle events to manage defense capital,
          dynamic fees, JIT liquidity, and premium distribution — all within v4&apos;s flash accounting constraints.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { hook: "afterInitialize", desc: "Stores the PoolKey. All defense operations reference this pool." },
            { hook: "beforeSwap", desc: "Injects Aqua0 JIT virtual liquidity + defense-aware dynamic fees. Higher fees when reserve utilization is high." },
            { hook: "afterSwap", desc: "Removes JIT liquidity, settles swap deltas with SharedLiquidityPool." },
            { hook: "triggerDefense", desc: "Burns ERC-6909 claims (+delta) → takes tokens (-delta) → deltas net to zero. Emits ERC-7683 intent via Settler." },
          ].map((item) => (
            <div key={item.hook} className="border border-white/[0.06] p-4">
              <p className="text-xs font-mono text-blue-400/80 mb-1">{item.hook}()</p>
              <p className="text-xs text-white/40 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <div className="border border-white/[0.08] p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-3">ERC-6909 Defense Reserve</p>
          <p className="text-sm text-white/50 leading-relaxed">
            Defense capital is held as ERC-6909 claims on the PoolManager — separate from pool liquidity.
            When defense triggers, the hook atomically burns claims and takes tokens.
            All deltas resolve to zero within a single unlock callback — v4&apos;s core constraint.
          </p>
        </div>
        <div className="border border-white/[0.08] lg:border-l-0 p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-3">LP Triple Yield</p>
          <p className="text-sm text-white/50 leading-relaxed">
            LPs earn from three sources: standard swap fees, 40% of protection premiums
            (donated via poolManager.donate()), and 1.5% of every defense settlement.
            A new DeFi primitive — liquidation insurance yield.
          </p>
        </div>
      </div>
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
        <div className="border border-white/[0.08] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-3">Unichain Sepolia</p>
          <div className="space-y-2">
            {["LiquidShieldHook", "LiquidShieldSettler (ERC-7683)", "LiquidShieldRouter", "DefenseCallback", "mWETH/mUSDC Pool (dynamic fee)"].map((c) => (
              <p key={c} className="text-xs text-white/50 border border-white/[0.04] px-2 py-1">{c}</p>
            ))}
          </div>
        </div>
        <div className="border border-white/[0.08] lg:border-l-0 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-3">Base Sepolia</p>
          <div className="space-y-2">
            {["HealthChecker (reads Aave on-chain)", "DefenseExecutor", "AaveV3Adapter (batched unwind)", "Aave V3 Pool (real position)"].map((c) => (
              <p key={c} className="text-xs text-white/50 border border-white/[0.04] px-2 py-1">{c}</p>
            ))}
          </div>
        </div>
        <div className="border border-white/[0.08] lg:border-l-0 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-3">Reactive Lasna</p>
          <div className="space-y-2">
            {["PositionMonitor (RSC)", "CRON subscription (every 10 blocks)", "HealthDanger event subscription", "Two-hop callback routing"].map((c) => (
              <p key={c} className="text-xs text-white/50 border border-white/[0.04] px-2 py-1">{c}</p>
            ))}
          </div>
        </div>
      </div>
      <div className="border border-white/[0.08] p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-4">Two-Hop Defense Flow</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
          {[
            "CRON tick (Lasna)",
            "RSC → HealthChecker",
            "Read Aave health",
            "Emit HealthDanger",
            "RSC → Unichain",
            "DefenseCallback → Hook",
            "Burn ERC-6909 + take",
            "Emit ERC-7683",
            "Filler unwinding on Aave",
            "Settle + 1.5% to LPs",
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
        <div className="flex gap-0 mb-12 border-b border-white/[0.06] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`px-4 sm:px-6 py-3 text-xs uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-colors border-b-2 whitespace-nowrap ${
                active === tab
                  ? "text-white border-white"
                  : "text-white/35 border-transparent hover:text-white/60"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <motion.div
          key={active}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {active === "The Problem" && <ProblemTab />}
          {active === "How It Works" && <HowItWorksTab />}
          {active === "The Hook" && <HookTab />}
          {active === "Architecture" && <ArchitectureTab />}
        </motion.div>
      </div>
    </section>
  );
}
