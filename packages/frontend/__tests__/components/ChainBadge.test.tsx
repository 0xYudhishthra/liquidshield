import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChainBadge } from '@/components/shared/ChainBadge';

describe('ChainBadge', () => {
  // ─── Supported chains ─────────────────────────────────────────────────────────

  describe('supported chains', () => {
    it('shows "Unichain Sepolia" for chainId 1301', () => {
      render(<ChainBadge chainId={1301} />);
      expect(screen.getByText('Unichain Sepolia')).toBeInTheDocument();
    });

    it('shows "Arbitrum Sepolia" for chainId 421614', () => {
      render(<ChainBadge chainId={421614} />);
      expect(screen.getByText('Arbitrum Sepolia')).toBeInTheDocument();
    });

    it('shows "Ethereum Sepolia" for chainId 11155111', () => {
      render(<ChainBadge chainId={11155111} />);
      expect(screen.getByText('Ethereum Sepolia')).toBeInTheDocument();
    });
  });

  // ─── Unsupported chains ───────────────────────────────────────────────────────

  describe('unsupported chains', () => {
    it('shows "Unknown" for unsupported chain ID 1', () => {
      render(<ChainBadge chainId={1} />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('shows "Unknown" for unsupported chain ID 42161', () => {
      render(<ChainBadge chainId={42161} />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('shows "Unknown" for chain ID 0', () => {
      render(<ChainBadge chainId={0} />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('shows "Unknown" for negative chain ID', () => {
      render(<ChainBadge chainId={-1} />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('shows "Unknown" for very large chain ID', () => {
      render(<ChainBadge chainId={999999999} />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  // ─── Styling ──────────────────────────────────────────────────────────────────

  describe('styling', () => {
    it('applies correct CSS classes for supported chain', () => {
      render(<ChainBadge chainId={1301} />);
      const badge = screen.getByText('Unichain Sepolia');
      expect(badge.className).toContain('inline-flex');
      expect(badge.className).toContain('items-center');
      expect(badge.className).toContain('gap-1');
      expect(badge.className).toContain('text-sm');
      expect(badge.className).toContain('text-gray-300');
    });

    it('applies gray-500 text color for unknown chain', () => {
      render(<ChainBadge chainId={9999} />);
      const badge = screen.getByText('Unknown');
      expect(badge.className).toContain('text-gray-500');
    });

    it('renders as a span element for supported chain', () => {
      render(<ChainBadge chainId={421614} />);
      const badge = screen.getByText('Arbitrum Sepolia');
      expect(badge.tagName).toBe('SPAN');
    });

    it('renders as a span element for unknown chain', () => {
      render(<ChainBadge chainId={9999} />);
      const badge = screen.getByText('Unknown');
      expect(badge.tagName).toBe('SPAN');
    });
  });
});
