"use client";

import { motion } from "framer-motion";

const TECH = [
  {
    name: "Uniswap v4 Hooks",
    desc: "ERC-6909 defense reserve, dynamic fees, poolManager.donate()",
  },
  {
    name: "Unichain",
    desc: "200ms Flashblocks, TEE priority ordering, sub-second defense",
  },
  {
    name: "Reactive Network",
    desc: "Cross-chain RSC monitoring with native callbacks",
  },
  {
    name: "ERC-7683",
    desc: "Cross-chain intent settlement via IOriginSettler",
  },
];

export function TechStrip() {
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
            Built With
          </p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white mb-4">
            Production-grade
          </h2>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] text-white/50 mb-16">
            infrastructure.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
          {TECH.map((tech, i) => (
            <motion.div
              key={tech.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.4,
                delay: i * 0.1,
                ease: [0.25, 0.4, 0.25, 1],
              }}
              className={`border border-white/[0.08] p-8 ${
                i > 0 ? "sm:border-l-0" : ""
              } ${i >= 2 ? "lg:border-t-0" : ""} ${
                i === 2 ? "sm:border-l sm:border-l-white/[0.08] lg:border-l-0" : ""
              }`}
            >
              <p className="text-sm font-bold text-white mb-2">{tech.name}</p>
              <p className="text-xs text-white/35 leading-relaxed">
                {tech.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Defense strategies */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-0">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="border border-white/[0.08] p-8 sm:p-10"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-4">
              Strategy A
            </p>
            <p className="text-lg font-bold text-white mb-2">
              Collateral Top-Up
            </p>
            <p className="text-sm text-white/50 leading-relaxed">
              Aave V3 on Arbitrum. Hook extracts WETH from defense reserve,
              filler deposits as additional collateral. Health factor recovers
              from 1.1x to 1.6x.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="border border-white/[0.08] lg:border-l-0 p-8 sm:p-10"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-blue-400/60 mb-4">
              Strategy B
            </p>
            <p className="text-lg font-bold text-white mb-2">
              Batched Gradual Unwind
            </p>
            <p className="text-sm text-white/50 leading-relaxed">
              Morpho Blue on Ethereum. N sequential ERC-7683 intents, each for a
              fractional portion. Position gracefully unwound without cascade
              liquidation.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
