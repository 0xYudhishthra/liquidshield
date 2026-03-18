"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

interface HeroProps {
  isConnected: boolean;
}

export function Hero({ isConnected }: HeroProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const showConnected = mounted && isConnected;
  return (
    <section className="relative min-h-[80vh] flex flex-col items-center justify-center px-4 sm:px-6 pt-20 overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-500/[0.04] blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
        className="relative z-10 max-w-4xl text-center"
      >
        <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-8">
          Uniswap v4 Hook &middot; Base Sepolia &middot; Reactive Network
        </p>

        <h1 className="text-5xl sm:text-7xl lg:text-[7rem] font-bold leading-[0.9] tracking-[-0.04em] text-white mb-2">
          Never get
        </h1>
        <h1 className="text-5xl sm:text-7xl lg:text-[7rem] font-bold leading-[0.9] tracking-[-0.04em] text-white/50 mb-8">
          liquidated again.
        </h1>

        <p className="text-base sm:text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
          LiquidShield monitors your Aave lending positions and automatically
          defends them before liquidation — powered by Reactive Network and
          Uniswap v4 hooks on Unichain.
        </p>

        {/* Two clear CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
          {showConnected ? (
            <a
              href="#protect"
              className="btn-wipe btn-wipe-white relative px-8 py-3 bg-white text-black text-sm font-semibold tracking-wide hover:text-white transition-colors"
            >
              <span className="relative z-10">Protect My Positions</span>
            </a>
          ) : (
            <ConnectButton label="Connect Wallet to Start" />
          )}
          <a
            href="https://app.aqua0.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-wipe btn-wipe-dark relative px-8 py-3 border border-white/20 text-sm font-semibold tracking-wide text-white/50 hover:text-white transition-colors"
          >
            <span className="relative z-10">Provide Liquidity via Aqua0</span>
          </a>
        </div>

        <p className="text-xs text-white/25 tracking-wide">
          Non-custodial &middot; Approval-based &middot; Aave V3 on Base Sepolia
        </p>
      </motion.div>
    </section>
  );
}
