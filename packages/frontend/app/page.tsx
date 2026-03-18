"use client";
import { useAccount } from "wagmi";
import { Landing } from "@/components/landing/Landing";

export default function Home() {
  const { isConnected, address } = useAccount();
  return <Landing isConnected={isConnected} address={address} />;
}
