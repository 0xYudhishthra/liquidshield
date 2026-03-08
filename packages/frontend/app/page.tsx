"use client";
import { useAccount } from "wagmi";
import { Landing } from "@/components/landing/Landing";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function Home() {
  const { isConnected } = useAccount();
  return isConnected ? <Dashboard /> : <Landing />;
}
