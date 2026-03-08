"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Hero() {
  return (
    <section className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <h2 className="text-5xl font-bold text-white mb-4">Never get liquidated again.</h2>
      <p className="text-lg text-gray-400 max-w-2xl mb-8">
        LiquidShield monitors your DeFi lending positions across chains and automatically defends them before liquidation hits. Powered by Uniswap v4 hooks on Unichain.
      </p>
      <ConnectButton label="Connect Wallet to Get Started" />
      <p className="text-sm text-gray-500 mt-4">Non-custodial. Your keys, your funds.</p>
    </section>
  );
}
