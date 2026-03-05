import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthFactorBadge } from '@/components/shared/HealthFactorBadge';

describe('HealthFactorBadge', () => {
  // ─── Display formatting ───────────────────────────────────────────────────────

  describe('display formatting', () => {
    it('displays value formatted to 2 decimal places with "x" suffix', () => {
      render(<HealthFactorBadge value={1.6} />);
      expect(screen.getByText('1.60x')).toBeInTheDocument();
    });

    it('formats integer values with two decimal places', () => {
      render(<HealthFactorBadge value={2} />);
      expect(screen.getByText('2.00x')).toBeInTheDocument();
    });

    it('formats values with many decimal places to exactly 2', () => {
      render(<HealthFactorBadge value={1.23456} />);
      expect(screen.getByText('1.23x')).toBeInTheDocument();
    });

    it('formats zero correctly', () => {
      render(<HealthFactorBadge value={0} />);
      expect(screen.getByText('0.00x')).toBeInTheDocument();
    });

    it('formats very large values correctly', () => {
      render(<HealthFactorBadge value={99.99} />);
      expect(screen.getByText('99.99x')).toBeInTheDocument();
    });
  });

  // ─── Color coding: green (safe) ──────────────────────────────────────────────

  describe('green color (safe: value > 1.5)', () => {
    it('applies green text color when value is above 1.5', () => {
      render(<HealthFactorBadge value={1.8} />);
      const badge = screen.getByText('1.80x');
      expect(badge.className).toContain('text-green-400');
    });

    it('applies green background when value is above 1.5', () => {
      render(<HealthFactorBadge value={2.0} />);
      const badge = screen.getByText('2.00x');
      expect(badge.className).toContain('bg-green-400/10');
    });

    it('applies green for very high health factors', () => {
      render(<HealthFactorBadge value={5.0} />);
      const badge = screen.getByText('5.00x');
      expect(badge.className).toContain('text-green-400');
      expect(badge.className).toContain('bg-green-400/10');
    });
  });

  // ─── Color coding: yellow (warning) ──────────────────────────────────────────

  describe('yellow color (warning: 1.3 < value <= 1.5)', () => {
    it('applies yellow text color when value is between 1.3 and 1.5', () => {
      render(<HealthFactorBadge value={1.4} />);
      const badge = screen.getByText('1.40x');
      expect(badge.className).toContain('text-yellow-400');
    });

    it('applies yellow background when value is between 1.3 and 1.5', () => {
      render(<HealthFactorBadge value={1.4} />);
      const badge = screen.getByText('1.40x');
      expect(badge.className).toContain('bg-yellow-400/10');
    });

    it('applies yellow for value of 1.35', () => {
      render(<HealthFactorBadge value={1.35} />);
      const badge = screen.getByText('1.35x');
      expect(badge.className).toContain('text-yellow-400');
      expect(badge.className).toContain('bg-yellow-400/10');
    });
  });

  // ─── Color coding: red (danger) ──────────────────────────────────────────────

  describe('red color (danger: value <= 1.3)', () => {
    it('applies red text color when value is below 1.3', () => {
      render(<HealthFactorBadge value={1.1} />);
      const badge = screen.getByText('1.10x');
      expect(badge.className).toContain('text-red-400');
    });

    it('applies red background when value is below 1.3', () => {
      render(<HealthFactorBadge value={1.1} />);
      const badge = screen.getByText('1.10x');
      expect(badge.className).toContain('bg-red-400/10');
    });

    it('applies red for critical health factor near 1.0', () => {
      render(<HealthFactorBadge value={1.01} />);
      const badge = screen.getByText('1.01x');
      expect(badge.className).toContain('text-red-400');
      expect(badge.className).toContain('bg-red-400/10');
    });

    it('applies red for health factor of zero', () => {
      render(<HealthFactorBadge value={0} />);
      const badge = screen.getByText('0.00x');
      expect(badge.className).toContain('text-red-400');
    });
  });

  // ─── Edge values at thresholds ────────────────────────────────────────────────

  describe('edge values at exact thresholds', () => {
    it('applies yellow (not green) when value is exactly 1.5', () => {
      // value > 1.5 is green, so exactly 1.5 should be yellow
      render(<HealthFactorBadge value={1.5} />);
      const badge = screen.getByText('1.50x');
      expect(badge.className).toContain('text-yellow-400');
      expect(badge.className).not.toContain('text-green-400');
    });

    it('applies red (not yellow) when value is exactly 1.3', () => {
      // value > 1.3 is yellow, so exactly 1.3 should be red
      render(<HealthFactorBadge value={1.3} />);
      const badge = screen.getByText('1.30x');
      expect(badge.className).toContain('text-red-400');
      expect(badge.className).not.toContain('text-yellow-400');
    });

    it('applies green when value is 1.51 (just above 1.5)', () => {
      render(<HealthFactorBadge value={1.51} />);
      const badge = screen.getByText('1.51x');
      expect(badge.className).toContain('text-green-400');
    });

    it('applies yellow when value is 1.31 (just above 1.3)', () => {
      render(<HealthFactorBadge value={1.31} />);
      const badge = screen.getByText('1.31x');
      expect(badge.className).toContain('text-yellow-400');
    });
  });

  // ─── Base styling ─────────────────────────────────────────────────────────────

  describe('base styling', () => {
    it('always applies base CSS classes', () => {
      render(<HealthFactorBadge value={1.6} />);
      const badge = screen.getByText('1.60x');
      expect(badge.className).toContain('px-2');
      expect(badge.className).toContain('py-1');
      expect(badge.className).toContain('rounded');
      expect(badge.className).toContain('text-sm');
      expect(badge.className).toContain('font-mono');
    });

    it('renders as a span element', () => {
      render(<HealthFactorBadge value={1.6} />);
      const badge = screen.getByText('1.60x');
      expect(badge.tagName).toBe('SPAN');
    });
  });
});
