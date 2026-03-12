import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRegister = vi.fn();
const mockApprove = vi.fn();
const mockNeedsApproval = vi.fn(() => false);

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xUserAddress" as `0x${string}` }),
}));

vi.mock("@/hooks/useContractActions", () => ({
  useRegisterPosition: () => ({
    register: mockRegister,
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useTokenApproval", () => ({
  useTokenApproval: () => ({
    approve: mockApprove,
    needsApproval: mockNeedsApproval,
    isPending: false,
  }),
}));

vi.mock("viem", () => ({
  parseUnits: (value: string, decimals: number) => {
    return BigInt(Math.round(parseFloat(value) * 10 ** decimals));
  },
  keccak256: () => "0x" + "a".repeat(64),
  encodePacked: () => "0xencodedpacked",
}));

vi.mock("@/lib/contracts", () => ({
  CONTRACTS: {
    router: { address: "0xRouterAddress", chainId: 1301 },
    hook: { address: "0xHookAddress", chainId: 1301 },
    settler: { address: "0xSettlerAddress", chainId: 1301 },
  },
  ROUTER_ABI: [{ type: "function", name: "stub" }],
}));

import { RegisterModal } from "@/components/dashboard/RegisterModal";
import type { Position } from "../../../../shared/src/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockPosition: Position = {
  positionId: "pos-1",
  owner: "0xUserAddress",
  protocol: "aave",
  chainId: 421614,
  collateralAsset: "0xWETH",
  collateralSymbol: "WETH",
  collateralAmount: "2.5",
  collateralUsd: 5000,
  debtAsset: "0xUSDC",
  debtSymbol: "USDC",
  debtAmount: "3000",
  debtUsd: 3000,
  healthFactor: 1.45,
  liquidationThreshold: 0.825,
};

const noop = () => {};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockNeedsApproval.mockReturnValue(false);
});

describe("RegisterModal", () => {
  describe("visibility", () => {
    it("renders when isOpen is true", () => {
      render(<RegisterModal isOpen={true} onClose={noop} />);
      expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Activate Protection");
    });

    it("does not render when isOpen is false", () => {
      const { container } = render(
        <RegisterModal isOpen={false} onClose={noop} />
      );
      expect(container.innerHTML).toBe("");
    });
  });

  describe("strategy buttons", () => {
    it("defaults to topup strategy selected", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );

      const topupButton = screen.getByText("Collateral Top-Up");
      const unwindButton = screen.getByText("Gradual Unwind");

      // topup should have the primary bg class
      expect(topupButton.className).toContain("bg-shield-primary");
      // unwind should not
      expect(unwindButton.className).not.toContain("bg-shield-primary");
    });

    it("toggles to unwind when Gradual Unwind is clicked", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );

      const unwindButton = screen.getByText("Gradual Unwind");
      fireEvent.click(unwindButton);

      expect(unwindButton.className).toContain("bg-shield-primary");
      const topupButton = screen.getByText("Collateral Top-Up");
      expect(topupButton.className).not.toContain("bg-shield-primary");
    });

    it("toggles back to topup when Collateral Top-Up is clicked after switching", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );

      fireEvent.click(screen.getByText("Gradual Unwind"));
      fireEvent.click(screen.getByText("Collateral Top-Up"));

      const topupButton = screen.getByText("Collateral Top-Up");
      expect(topupButton.className).toContain("bg-shield-primary");
    });
  });

  describe("threshold slider", () => {
    it("displays default threshold value of 1.3x", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );
      expect(screen.getByText("Threshold: 1.3x")).toBeInTheDocument();
    });

    it("updates display when slider value changes", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );

      const sliders = screen.getAllByRole("slider");
      // First slider is threshold (min 1.1, max 1.8)
      const thresholdSlider = sliders[0];
      fireEvent.change(thresholdSlider, { target: { value: "1.5" } });

      expect(screen.getByText("Threshold: 1.5x")).toBeInTheDocument();
    });
  });

  describe("duration slider", () => {
    it("displays default duration of 3 months", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );
      expect(screen.getByText("Duration: 3 months")).toBeInTheDocument();
    });

    it("updates display when slider value changes", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );

      const sliders = screen.getAllByRole("slider");
      // Second slider is duration (min 1, max 12)
      const durationSlider = sliders[1];
      fireEvent.change(durationSlider, { target: { value: "6" } });

      expect(screen.getByText("Duration: 6 months")).toBeInTheDocument();
    });

    it("updates premium cost when duration changes", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );

      // Default: 3 months * 10 USDC = 30.00 USDC
      expect(screen.getByText("30.00 USDC")).toBeInTheDocument();

      const sliders = screen.getAllByRole("slider");
      const durationSlider = sliders[1];
      fireEvent.change(durationSlider, { target: { value: "6" } });

      // 6 months * 10 USDC = 60.00 USDC
      expect(screen.getByText("60.00 USDC")).toBeInTheDocument();
    });

    it("shows correct premium cost for 1 month", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );

      const sliders = screen.getAllByRole("slider");
      const durationSlider = sliders[1];
      fireEvent.change(durationSlider, { target: { value: "1" } });

      expect(screen.getByText("10.00 USDC")).toBeInTheDocument();
    });
  });

  describe("cancel button", () => {
    it("calls onClose when Cancel is clicked", () => {
      const onClose = vi.fn();
      render(
        <RegisterModal isOpen={true} onClose={onClose} position={mockPosition} />
      );

      fireEvent.click(screen.getByText("Cancel"));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe("position info", () => {
    it("shows position info when position prop is provided", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );

      expect(screen.getByText(/AAVE on Chain 421614/)).toBeInTheDocument();
      expect(
        screen.getByText(/WETH \/ USDC — HF: 1.45x/)
      ).toBeInTheDocument();
    });

    it("does not show position info section when position is not provided", () => {
      render(<RegisterModal isOpen={true} onClose={noop} />);

      expect(screen.queryByText(/AAVE/)).not.toBeInTheDocument();
      expect(screen.queryByText(/HF:/)).not.toBeInTheDocument();
    });
  });

  describe("premium cost label", () => {
    it("shows Premium Cost heading", () => {
      render(
        <RegisterModal isOpen={true} onClose={noop} position={mockPosition} />
      );
      expect(screen.getByText("Premium Cost")).toBeInTheDocument();
    });
  });
});
