"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ProtectedPositions } from "./ProtectedPositions";
import { UnprotectedPositions } from "./UnprotectedPositions";
import { DefenseHistory } from "./DefenseHistory";
import { ProtectionStats } from "./ProtectionStats";
import { LPSection } from "./LPSection";

export function Dashboard() {
  const { address } = useAccount();
  return (
    <main className="min-h-screen bg-shield-bg">
      <header className="flex items-center justify-between px-8 py-4 border-b border-shield-border">
        <h1 className="text-xl font-bold text-white">LiquidShield</h1>
        <ConnectButton />
      </header>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <ProtectionStats address={address!} />
        <section>
          <h2 className="text-xl font-bold text-white mb-4">Protected Positions</h2>
          <ProtectedPositions address={address!} />
        </section>
        <section>
          <h2 className="text-xl font-bold text-white mb-4">Unprotected Positions</h2>
          <UnprotectedPositions address={address!} />
        </section>
        <section>
          <h2 className="text-xl font-bold text-white mb-4">Defense History</h2>
          <DefenseHistory address={address!} />
        </section>
        <LPSection address={address!} />
      </div>
    </main>
  );
}
