"use client";

import { useAccount } from "wagmi";
import { Landing } from "./Landing";

export default function ClientPage() {
  const { isConnected, address } = useAccount();
  return <Landing isConnected={isConnected} address={address} />;
}
