"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { StatsBanner } from "./StatsBanner";
import { TechStrip } from "./TechStrip";

export function Landing() {
  return (
    <main className="min-h-screen bg-shield-bg">
      <header className="flex items-center justify-between px-8 py-4 border-b border-shield-border">
        <h1 className="text-xl font-bold text-white">LiquidShield</h1>
        <ConnectButton />
      </header>
      <Hero />
      <HowItWorks />
      <StatsBanner />
      <TechStrip />
      <footer className="px-8 py-6 text-center border-t border-shield-border">
        <p className="text-sm text-gray-600">
          LiquidShield — UHI8 Hookathon 2026 &bull;{" "}
          <a href="https://github.com/0xYudhishthra/liquidshield" className="text-shield-primary hover:underline">GitHub</a>
        </p>
      </footer>
    </main>
  );
}
