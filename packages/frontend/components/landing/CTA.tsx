"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";

export function CTA() {
  return (
    <section className="border-t border-white/[0.06] py-20 sm:py-32">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white mb-4">
            Protect your positions.
          </h2>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white/50 mb-10">
            Earn as an LP.
          </h2>
          <p className="text-base text-white/50 max-w-lg mx-auto mb-10">
            Connect your wallet to scan your lending positions and activate
            protection, or provide liquidity via Aqua0 to earn swap fees +
            premium yield + defense fees.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <ConnectButton label="Protect My Positions" />
            <a
              href="https://aqua0.fi"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-wipe btn-wipe-dark relative px-6 py-3 border border-white/20 text-sm font-semibold tracking-wide text-white/50 hover:text-white transition-colors"
            >
              <span className="relative z-10">Provide Liquidity via Aqua0</span>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
