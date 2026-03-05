import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtocolLogo } from '@/components/shared/ProtocolLogo';
import { SUPPORTED_PROTOCOLS } from '@/lib/chains';

describe('ProtocolLogo', () => {
  // ─── Supported protocols ──────────────────────────────────────────────────────

  describe('supported protocols', () => {
    it('shows "Aave V3" for protocol "aave"', () => {
      render(<ProtocolLogo protocol="aave" />);
      expect(screen.getByText('Aave V3')).toBeInTheDocument();
    });

    it('shows "Morpho Blue" for protocol "morpho"', () => {
      render(<ProtocolLogo protocol="morpho" />);
      expect(screen.getByText('Morpho Blue')).toBeInTheDocument();
    });
  });

  // ─── Unsupported protocols ────────────────────────────────────────────────────

  describe('unsupported protocols', () => {
    it('returns null (renders nothing) for unsupported protocol', () => {
      // Cast to bypass TypeScript since we're testing runtime behavior
      const { container } = render(
        <ProtocolLogo protocol={'compound' as keyof typeof SUPPORTED_PROTOCOLS} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing for empty string protocol', () => {
      const { container } = render(
        <ProtocolLogo protocol={'' as keyof typeof SUPPORTED_PROTOCOLS} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing for a random string protocol', () => {
      const { container } = render(
        <ProtocolLogo protocol={'maker' as keyof typeof SUPPORTED_PROTOCOLS} />
      );
      expect(container.innerHTML).toBe('');
    });
  });

  // ─── Styling ──────────────────────────────────────────────────────────────────

  describe('styling', () => {
    it('applies correct CSS classes for Aave', () => {
      render(<ProtocolLogo protocol="aave" />);
      const element = screen.getByText('Aave V3');
      expect(element.className).toContain('inline-flex');
      expect(element.className).toContain('items-center');
      expect(element.className).toContain('gap-1');
      expect(element.className).toContain('text-sm');
      expect(element.className).toContain('text-gray-300');
    });

    it('applies correct CSS classes for Morpho', () => {
      render(<ProtocolLogo protocol="morpho" />);
      const element = screen.getByText('Morpho Blue');
      expect(element.className).toContain('inline-flex');
      expect(element.className).toContain('items-center');
      expect(element.className).toContain('gap-1');
      expect(element.className).toContain('text-sm');
      expect(element.className).toContain('text-gray-300');
    });

    it('renders as a span element', () => {
      render(<ProtocolLogo protocol="aave" />);
      const element = screen.getByText('Aave V3');
      expect(element.tagName).toBe('SPAN');
    });
  });
});
