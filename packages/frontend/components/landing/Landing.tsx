"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Problem } from "./Problem";
import { TechStrip } from "./TechStrip";
import { CTA } from "./CTA";

export function Landing() {
  return (
    <main className="min-h-screen bg-black">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-8 py-4 bg-black/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="LiquidShield" className="w-7 h-7" />
          <span className="text-[15px] font-bold tracking-wide text-white">
            LiquidShield
          </span>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/0xYudhishthra/liquidshield"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] tracking-wide text-white/50 hover:text-white/80 transition-colors hidden sm:block"
          >
            GitHub
          </a>
          <ConnectButton />
        </div>
      </header>

      <Hero />
      <Problem />
      <HowItWorks />
      <TechStrip />
      <CTA />

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="LiquidShield" className="w-5 h-5 opacity-50" />
              <span className="text-sm font-bold text-white/50">
                LiquidShield
              </span>
            </div>
            <p className="text-xs text-white/25">
              UHI8 Hookathon 2026 &middot; Built on Uniswap v4
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
