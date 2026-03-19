"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { usePublicClient, useWalletClient } from "wagmi";

const AAVE_POOL = "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27";
const WETH_GATEWAY = "0x0568130e794429D2eEBC4dafE18f25Ff1a1ed8b6";
const USDC_ADDRESS = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f";
const AWETH_ADDRESS = "0x73a5bB60b0B0fc35710DDc0ea9c407031E31Bdbb";
const ADAPTER_ADDRESS = "0x560010aEA084A62B3e666f7e48A190A299049129";

const BASE_EXPLORER = "https://sepolia.basescan.org";
const UNICHAIN_EXPLORER = "https://sepolia.uniscan.xyz";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function HealthBadge({ value }: { value: number }) {
  const color = value > 1.5 ? "text-green-400/80" : value > 1.3 ? "text-yellow-400/80" : "text-red-400/80";
  return <span className={`font-mono text-sm ${color}`}>{value.toFixed(2)}</span>;
}

interface PositionScannerProps { address: string; }
interface AavePosition { collateralUsd: number; debtUsd: number; healthFactor: number; hasPosition: boolean; }

export function PositionScanner({ address }: PositionScannerProps) {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [position, setPosition] = useState<AavePosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createTxHash, setCreateTxHash] = useState<string | null>(null);
  const [protecting, setProtecting] = useState(false);
  const [protectStep, setProtectStep] = useState("");
  const [protectTxHash, setProtectTxHash] = useState<string | null>(null);

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  useEffect(() => {
    async function fetchPosition() {
      if (!publicClient) return;
      try {
        const data = await publicClient.readContract({
          address: AAVE_POOL as `0x${string}`,
          abi: [{ name: "getUserAccountData", type: "function", stateMutability: "view",
            inputs: [{ type: "address" }],
            outputs: [
              { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
              { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
            ],
          }],
          functionName: "getUserAccountData",
          args: [address as `0x${string}`],
        });
        const [collateral, debt, , , , hf] = data as unknown as bigint[];
        setPosition({
          collateralUsd: Number(collateral) / 1e8,
          debtUsd: Number(debt) / 1e8,
          healthFactor: debt > 0n ? Number(hf) / 1e18 : 0,
          hasPosition: collateral > 0n,
        });
      } catch { setPosition({ collateralUsd: 0, debtUsd: 0, healthFactor: 0, hasPosition: false }); }
      setLoading(false);
    }
    fetchPosition();
    const interval = setInterval(fetchPosition, 10000);
    return () => clearInterval(interval);
  }, [address, publicClient, createTxHash]);

  async function handleCreatePosition() {
    if (!walletClient) return;
    setCreating(true);
    try {
      const supplyHash = await walletClient.sendTransaction({
        to: WETH_GATEWAY as `0x${string}`,
        data: ("0x474cf53d" + AAVE_POOL.slice(2).padStart(64, "0") +
          address.slice(2).padStart(64, "0") +
          "0".padStart(64, "0")) as `0x${string}`,
        value: BigInt("20000000000000000"),
      });
      setCreateTxHash(supplyHash);
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: supplyHash });

      const borrowData = ("0xa415bcad" + USDC_ADDRESS.slice(2).padStart(64, "0") +
        "0000000000000000000000000000000000000000000000000000000000989680" +
        "0000000000000000000000000000000000000000000000000000000000000002" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        address.slice(2).padStart(64, "0")) as `0x${string}`;
      const borrowHash = await walletClient.sendTransaction({ to: AAVE_POOL as `0x${string}`, data: borrowData });
      setCreateTxHash(borrowHash);
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: borrowHash });
      setLoading(true);
    } catch (err) { console.error("Failed to create position:", err); }
    setCreating(false);
  }

  async function handleProtect() {
    if (!walletClient) return;
    setProtecting(true);
    try {
      setProtectStep("Approving adapter to manage your position...");
      const approveHash = await walletClient.writeContract({
        address: AWETH_ADDRESS as `0x${string}`,
        abi: [{ name: "approve", type: "function", stateMutability: "nonpayable",
          inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }],
        functionName: "approve",
        args: [ADAPTER_ADDRESS as `0x${string}`, BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935")],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: approveHash });

      setProtectStep("Sign to authorize protection...");
      const message = `LiquidShield: Protect my Aave V3 position.\nAddress: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await walletClient.signMessage({ message });

      setProtectStep("Registering protection on Unichain...");
      const res = await fetch(`${API_URL}/protect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address, signature, message, sourceChainId: 84532, strategy: 1, healthThreshold: "1500000000000000000" }),
      });
      const result = await res.json();
      if (result.txHash) { setProtectTxHash(result.txHash); }
      else { console.error("Protection failed:", result.error); }
    } catch (err) { console.error("Failed to protect:", err); }
    setProtecting(false);
    setProtectStep("");
  }

  return (
    <section className="border-t border-white/[0.06] py-12 sm:py-16" id="protect">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="text-xs uppercase tracking-[0.25em] text-white/35 mb-6">
            Aave V3 &middot; Base Sepolia &middot; {truncated}
          </p>

          {loading ? (
            <div className="border border-white/[0.08] p-12 text-center">
              <p className="text-sm text-white/50">Scanning for lending positions on Base Sepolia...</p>
            </div>
          ) : position && position.hasPosition ? (
            <div className="border border-white/[0.08]">
              <div className="p-6 border-b border-white/[0.06] flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-white/35">Detected Position</p>
                <span className="text-xs text-white/25 border border-white/[0.08] px-2 py-0.5">Aave V3 &middot; Base Sepolia</span>
              </div>
              <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div><p className="text-xs text-white/25 mb-1">Collateral</p><p className="text-lg font-bold text-white">${position.collateralUsd.toFixed(2)}</p></div>
                <div><p className="text-xs text-white/25 mb-1">Debt</p><p className="text-lg font-bold text-white">${position.debtUsd.toFixed(2)}</p></div>
                <div><p className="text-xs text-white/25 mb-1">Health Factor</p><HealthBadge value={position.healthFactor} /></div>
                <div><p className="text-xs text-white/25 mb-1">Strategy</p><p className="text-sm text-white/80">Batched Unwind</p></div>
              </div>
              <div className="p-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-white/50">Premium: <span className="text-white/80 font-semibold">10 mUSDC / month</span></p>
                  {protectTxHash && <p className="text-xs text-green-400/60 mt-1">Position protected. Reactive Network is monitoring your health factor.</p>}
                  {protectStep && <p className="text-xs text-blue-400/60 mt-1">{protectStep}</p>}
                </div>
                {protectTxHash ? (
                  <div className="text-right">
                    <p className="text-xs text-green-400/80 font-semibold mb-1">Protected</p>
                    <a href={`${UNICHAIN_EXPLORER}/tx/${protectTxHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-white/25 hover:text-white/50 font-mono">{protectTxHash.slice(0, 14)}...</a>
                    <p className="text-[10px] text-white/15 mt-1">Registered on Unichain Sepolia</p>
                  </div>
                ) : (
                  <button onClick={handleProtect} disabled={protecting} className="btn-wipe btn-wipe-white relative px-6 py-2.5 bg-white text-black text-sm font-semibold tracking-wide hover:text-white transition-colors disabled:opacity-50">
                    <span className="relative z-10">{protecting ? "Processing..." : "Protect This Position"}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-white/[0.08] p-8 text-center">
              <p className="text-lg font-bold text-white mb-2">No Aave position detected</p>
              <p className="text-sm text-white/50 mb-6 max-w-md mx-auto">Create a lending position on Aave V3 (Base Sepolia) to see LiquidShield in action.</p>
              {createTxHash ? (
                <div><p className="text-xs text-green-400/80 font-semibold mb-2">Position created!</p>
                  <a href={`${BASE_EXPLORER}/tx/${createTxHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-white/25 hover:text-white/50 font-mono">{createTxHash.slice(0, 20)}...</a></div>
              ) : (
                <button onClick={handleCreatePosition} disabled={creating} className="btn-wipe btn-wipe-white relative px-6 py-3 bg-white text-black text-sm font-semibold tracking-wide hover:text-white transition-colors disabled:opacity-50">
                  <span className="relative z-10">{creating ? "Creating position..." : "Create Demo Position (0.02 ETH)"}</span>
                </button>
              )}
            </div>
          )}

          <div className="mt-4 border border-white/[0.08] p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              {["Swap fees", "Premium yield (40%)", "Defense fees (1.5%)"].map((item) => (
                <div key={item} className="flex items-center gap-2"><div className="w-1 h-1 bg-blue-400/60" /><span className="text-xs text-white/40">{item}</span></div>
              ))}
            </div>
            <a href="https://app.aqua0.xyz" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-white/50 hover:text-white transition-colors">Earn as LP via Aqua0 →</a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
