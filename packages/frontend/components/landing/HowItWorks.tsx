"use client";

import { motion } from "framer-motion";

const STEPS = [
  {
    num: "01",
    title: "Register & Pay Premium",
    desc: "Connect your wallet, scan your Aave or Morpho positions, choose a defense strategy (collateral top-up or gradual unwind), and pay an upfront premium. 60% goes to the defense reserve, 40% to LP rewards.",
  },
  {
    num: "02",
    title: "Cross-Chain Monitoring",
    desc: "Reactive Smart Contracts on Reactive Network subscribe to lending protocol events across Arbitrum and Ethereum. When your health factor drops below threshold, the RSC triggers a callback to the hook on Unichain.",
  },
  {
    num: "03",
    title: "Automated Defense",
    desc: "The hook atomically extracts defense capital (ERC-6909 burn + take), emits an ERC-7683 cross-chain intent, and the filler executes the defense on the source chain — all within ~400ms via Flashblocks.",
  },
];

export function HowItWorks() {
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
            How It Works
          </p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white mb-4">
            Register once.
          </h2>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white/50 mb-16">
            Protected forever.
          </h2>
        </motion.div>

        <div className="space-y-0">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.5,
                delay: i * 0.15,
                ease: [0.25, 0.4, 0.25, 1],
              }}
              className="border-t border-white/[0.08] py-10 sm:py-12 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12"
            >
              <div className="lg:col-span-1">
                <span className="text-5xl font-bold text-white/[0.08]">
                  {step.num}
                </span>
              </div>
              <div className="lg:col-span-3">
                <h3 className="text-lg sm:text-xl font-bold text-white">
                  {step.title}
                </h3>
              </div>
              <div className="lg:col-span-8">
                <p className="text-sm sm:text-base text-white/50 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
