"use client";

import dynamic from "next/dynamic";

// Dynamically import to avoid SSR issues with WalletConnect/indexedDB
const ClientPage = dynamic(() => import("@/components/landing/ClientPage"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-white/30 text-sm">Loading...</p>
    </div>
  ),
});

export default function Home() {
  return <ClientPage />;
}
