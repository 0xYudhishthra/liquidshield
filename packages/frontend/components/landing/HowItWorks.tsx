const STEPS = [
  { step: 1, title: "Connect & Scan", desc: "Connect your wallet — we scan your Aave and Morpho positions across all chains automatically." },
  { step: 2, title: "Choose Protection", desc: "Select which positions to protect, choose a defense strategy, and set your trigger threshold." },
  { step: 3, title: "Sleep Soundly", desc: "Our hook monitors 24/7 and defends your positions before liquidation — automatically." },
];

export function HowItWorks() {
  return (
    <section className="px-8 py-16 bg-shield-surface">
      <h3 className="text-2xl font-bold text-white text-center mb-12">How It Works</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
        {STEPS.map(({ step, title, desc }) => (
          <div key={step} className="flex flex-col items-center text-center p-6 rounded-lg bg-shield-bg border border-shield-border">
            <div className="w-10 h-10 rounded-full bg-shield-primary flex items-center justify-center text-white font-bold mb-4">{step}</div>
            <h4 className="text-lg font-semibold text-white mb-2">{title}</h4>
            <p className="text-sm text-gray-400">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
