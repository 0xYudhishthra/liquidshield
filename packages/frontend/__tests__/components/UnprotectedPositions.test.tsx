import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Position } from "@shared/src/types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUsePositions = vi.fn();

vi.mock("@/hooks/usePositions", () => ({
  usePositions: (...args: unknown[]) => mockUsePositions(...args),
}));

// Mock the shared child components to simplify rendering
vi.mock("@/components/shared/ProtocolLogo", () => ({
  ProtocolLogo: ({ protocol }: { protocol: string }) => (
    <span data-testid="protocol-logo">{protocol}</span>
  ),
}));

vi.mock("@/components/shared/ChainBadge", () => ({
  ChainBadge: ({ chainId }: { chainId: number }) => (
    <span data-testid="chain-badge">{chainId}</span>
  ),
}));

vi.mock("@/components/shared/HealthFactorBadge", () => ({
  HealthFactorBadge: ({ value }: { value: number }) => (
    <span data-testid="hf-badge">{value.toFixed(2)}x</span>
  ),
}));

// Mock RegisterModal to observe when it gets opened
const mockOnClose = vi.fn();
vi.mock("@/components/dashboard/RegisterModal", () => ({
  RegisterModal: ({
    isOpen,
    onClose,
    position,
  }: {
    isOpen: boolean;
    onClose: () => void;
    position?: Position;
  }) => {
    // Store onClose for later invocation in tests
    mockOnClose.mockImplementation(onClose);
    return isOpen ? (
      <div data-testid="register-modal">
        Modal open for {position?.protocol ?? "none"}
      </div>
    ) : null;
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xUser" }),
}));

vi.mock("viem", () => ({
  parseUnits: (value: string, decimals: number) =>
    BigInt(Math.round(parseFloat(value) * 10 ** decimals)),
  keccak256: () => "0x" + "a".repeat(64),
  encodePacked: () => "0xencodedpacked",
}));

vi.mock("@/hooks/useContractActions", () => ({
  useRegisterPosition: () => ({
    register: vi.fn(),
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useTokenApproval", () => ({
  useTokenApproval: () => ({
    approve: vi.fn(),
    needsApproval: () => false,
    isPending: false,
  }),
}));

vi.mock("@/lib/contracts", () => ({
  CONTRACTS: {
    router: { address: "0xRouter", chainId: 1301 },
    hook: { address: "0xHook", chainId: 1301 },
    settler: { address: "0xSettler", chainId: 1301 },
  },
  ROUTER_ABI: [],
}));

import { UnprotectedPositions } from "@/components/dashboard/UnprotectedPositions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const createPosition = (overrides: Partial<Position> = {}): Position => ({
  positionId: "pos-1",
  owner: "0xUser",
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
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UnprotectedPositions", () => {
  describe("loading state", () => {
    it("shows loading text when data is loading", () => {
      mockUsePositions.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      });

      render(<UnprotectedPositions address="0xUser" />);
      expect(screen.getByText("Scanning positions...")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error message when fetch fails", () => {
      mockUsePositions.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("network error"),
      });

      render(<UnprotectedPositions address="0xUser" />);
      expect(
        screen.getByText("Failed to load positions")
      ).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("shows empty state when no positions are returned", () => {
      mockUsePositions.mockReturnValue({
        data: { all: [] },
        isLoading: false,
        error: null,
      });

      render(<UnprotectedPositions address="0xUser" />);
      expect(
        screen.getByText("No unprotected positions found.")
      ).toBeInTheDocument();
    });

    it("shows empty state when data.all is undefined", () => {
      mockUsePositions.mockReturnValue({
        data: {},
        isLoading: false,
        error: null,
      });

      render(<UnprotectedPositions address="0xUser" />);
      expect(
        screen.getByText("No unprotected positions found.")
      ).toBeInTheDocument();
    });
  });

  describe("position rows", () => {
    it("renders position rows with protocol, chain, collateral, debt, and HF", () => {
      const positions = [
        createPosition({
          protocol: "aave",
          chainId: 421614,
          collateralAmount: "2.5",
          collateralSymbol: "WETH",
          debtAmount: "3000",
          debtSymbol: "USDC",
          healthFactor: 1.45,
        }),
      ];

      mockUsePositions.mockReturnValue({
        data: { all: positions },
        isLoading: false,
        error: null,
      });

      render(<UnprotectedPositions address="0xUser" />);

      // Protocol via mocked ProtocolLogo
      expect(screen.getByText("aave")).toBeInTheDocument();
      // Chain via mocked ChainBadge
      expect(screen.getByText("421614")).toBeInTheDocument();
      // Collateral
      expect(screen.getByText("2.5 WETH")).toBeInTheDocument();
      // Debt
      expect(screen.getByText("3000 USDC")).toBeInTheDocument();
      // Health factor via mocked HealthFactorBadge
      expect(screen.getByText("1.45x")).toBeInTheDocument();
    });

    it("renders multiple positions", () => {
      const positions = [
        createPosition({
          positionId: "p1",
          protocol: "aave",
          chainId: 421614,
          healthFactor: 1.6,
        }),
        createPosition({
          positionId: "p2",
          protocol: "morpho",
          chainId: 11155111,
          healthFactor: 1.2,
          collateralSymbol: "USDC",
          collateralAmount: "5000",
          debtSymbol: "DAI",
          debtAmount: "4000",
        }),
      ];

      mockUsePositions.mockReturnValue({
        data: { all: positions },
        isLoading: false,
        error: null,
      });

      render(<UnprotectedPositions address="0xUser" />);

      // Both protocols
      expect(screen.getByText("aave")).toBeInTheDocument();
      expect(screen.getByText("morpho")).toBeInTheDocument();
      // Both chains
      expect(screen.getByText("421614")).toBeInTheDocument();
      expect(screen.getByText("11155111")).toBeInTheDocument();
      // Both HF badges
      expect(screen.getByText("1.60x")).toBeInTheDocument();
      expect(screen.getByText("1.20x")).toBeInTheDocument();
      // Both Protect buttons
      const protectButtons = screen.getAllByText("Protect");
      expect(protectButtons).toHaveLength(2);
    });

    it("renders a Protect button for each position", () => {
      mockUsePositions.mockReturnValue({
        data: { all: [createPosition()] },
        isLoading: false,
        error: null,
      });

      render(<UnprotectedPositions address="0xUser" />);
      expect(screen.getByText("Protect")).toBeInTheDocument();
    });
  });

  describe("Protect button interaction", () => {
    it("opens RegisterModal when Protect is clicked", () => {
      const pos = createPosition({ protocol: "aave" });
      mockUsePositions.mockReturnValue({
        data: { all: [pos] },
        isLoading: false,
        error: null,
      });

      render(<UnprotectedPositions address="0xUser" />);

      // Modal should not be open initially
      expect(screen.queryByTestId("register-modal")).not.toBeInTheDocument();

      // Click Protect
      fireEvent.click(screen.getByText("Protect"));

      // Modal should now be open with the position's protocol
      expect(screen.getByTestId("register-modal")).toBeInTheDocument();
      expect(screen.getByText("Modal open for aave")).toBeInTheDocument();
    });

    it("opens modal for the correct position when there are multiple", () => {
      const positions = [
        createPosition({ positionId: "p1", protocol: "aave" }),
        createPosition({ positionId: "p2", protocol: "morpho" }),
      ];

      mockUsePositions.mockReturnValue({
        data: { all: positions },
        isLoading: false,
        error: null,
      });

      render(<UnprotectedPositions address="0xUser" />);

      // Click the second Protect button (morpho)
      const protectButtons = screen.getAllByText("Protect");
      fireEvent.click(protectButtons[1]);

      expect(screen.getByText("Modal open for morpho")).toBeInTheDocument();
    });
  });

  describe("table headers", () => {
    it("renders all expected column headers", () => {
      mockUsePositions.mockReturnValue({
        data: { all: [] },
        isLoading: false,
        error: null,
      });

      render(<UnprotectedPositions address="0xUser" />);

      expect(screen.getByText("Protocol")).toBeInTheDocument();
      expect(screen.getByText("Chain")).toBeInTheDocument();
      expect(screen.getByText("Collateral")).toBeInTheDocument();
      expect(screen.getByText("Debt")).toBeInTheDocument();
      expect(screen.getByText("Health Factor")).toBeInTheDocument();
      expect(screen.getByText("Action")).toBeInTheDocument();
    });
  });
});
