"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { parseUnits, keccak256, encodePacked } from "viem";
import { useRegisterPosition } from "@/hooks/useContractActions";
import { useTokenApproval } from "@/hooks/useTokenApproval";
import type { Position } from "../../../../shared/src/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  position?: Position;
}

const PREMIUM_TOKEN = (process.env.NEXT_PUBLIC_PREMIUM_TOKEN || "0x") as `0x${string}`;
const PREMIUM_PER_MONTH = parseUnits("10", 6); // 10 USDC per month

export function RegisterModal({ isOpen, onClose, position }: Props) {
  const { address } = useAccount();
  const [strategy, setStrategy] = useState<"topup" | "unwind">("topup");
  const [threshold, setThreshold] = useState(1.3);
  const [months, setMonths] = useState(3);

  const premiumAmount = PREMIUM_PER_MONTH * BigInt(months);

  const { register, isPending, isConfirming, isSuccess, error } = useRegisterPosition();
  const { approve, needsApproval, isPending: isApproving } = useTokenApproval(PREMIUM_TOKEN, address);

  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);

  if (!isOpen) return null;

  const positionId = position
    ? keccak256(
        encodePacked(
          ["address", "uint256", "string"],
          [address as `0x${string}`, BigInt(position.chainId), position.protocol]
        )
      )
    : ("0x" + "0".repeat(64)) as `0x${string}`;

  const handleActivate = () => {
    if (!position || !address) return;

    if (needsApproval(premiumAmount)) {
      approve(premiumAmount);
      return;
    }

    register({
      positionId,
      collateralAsset: position.collateralAsset as `0x${string}`,
      debtAsset: position.debtAsset as `0x${string}`,
      positionSize: parseUnits(position.collateralAmount, 18),
      sourceChainId: BigInt(position.chainId),
      strategy: strategy === "topup" ? "COLLATERAL_TOPUP" : "BATCHED_UNWIND",
      healthThreshold: parseUnits(threshold.toString(), 18),
      lendingAdapter: "0x" as `0x${string}`,
      premiumMonths: BigInt(months),
      premiumToken: PREMIUM_TOKEN,
      premiumAmount,
    });
  };

  const isLoading = isPending || isConfirming || isApproving;

  const buttonLabel = isApproving
    ? "Approving..."
    : isPending
    ? "Confirming..."
    : isConfirming
    ? "Waiting for receipt..."
    : needsApproval(premiumAmount)
    ? "Approve & Activate"
    : "Activate Protection";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-shield-surface border border-shield-border rounded-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold text-white mb-4">Activate Protection</h3>

        {position && (
          <div className="mb-4 p-3 rounded-lg bg-shield-bg border border-shield-border">
            <p className="text-sm text-gray-400">
              {position.protocol.toUpperCase()} on Chain {position.chainId}
            </p>
            <p className="text-sm text-white">
              {position.collateralSymbol} / {position.debtSymbol} — HF: {position.healthFactor.toFixed(2)}x
            </p>
          </div>
        )}

        <div className="mb-4">
          <label className="text-sm text-gray-400 block mb-2">Defense Strategy</label>
          <div className="flex gap-2">
            <button onClick={() => setStrategy("topup")} className={`flex-1 p-3 rounded-lg text-sm ${strategy === "topup" ? "bg-shield-primary text-white" : "bg-shield-bg border border-shield-border text-gray-400"}`}>Collateral Top-Up</button>
            <button onClick={() => setStrategy("unwind")} className={`flex-1 p-3 rounded-lg text-sm ${strategy === "unwind" ? "bg-shield-primary text-white" : "bg-shield-bg border border-shield-border text-gray-400"}`}>Gradual Unwind</button>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-sm text-gray-400 block mb-2">Threshold: {threshold.toFixed(1)}x</label>
          <input type="range" min="1.1" max="1.8" step="0.1" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} className="w-full" />
        </div>

        <div className="mb-4">
          <label className="text-sm text-gray-400 block mb-2">Duration: {months} months</label>
          <input type="range" min="1" max="12" step="1" value={months} onChange={(e) => setMonths(parseInt(e.target.value))} className="w-full" />
        </div>

        <div className="mb-6 p-3 rounded-lg bg-shield-bg border border-shield-border">
          <p className="text-sm text-gray-400">Premium Cost</p>
          <p className="text-lg text-white">{(Number(premiumAmount) / 1e6).toFixed(2)} USDC</p>
        </div>

        {error && (
          <p className="text-sm text-red-400 mb-4">{(error as Error).message?.slice(0, 100)}</p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={isLoading} className="flex-1 px-4 py-2 bg-shield-bg border border-shield-border rounded-lg text-gray-400 text-sm">Cancel</button>
          <button onClick={handleActivate} disabled={isLoading || !position} className="flex-1 px-4 py-2 bg-shield-primary rounded-lg text-white text-sm font-semibold disabled:opacity-50">
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
