import { describe, it, expect } from 'vitest';
import { SUPPORTED_CHAINS, SUPPORTED_PROTOCOLS } from '@/lib/chains';

describe('lib/chains', () => {
  // ─── SUPPORTED_CHAINS ─────────────────────────────────────────────────────────

  describe('SUPPORTED_CHAINS', () => {
    it('contains exactly three supported chain IDs', () => {
      const chainIds = Object.keys(SUPPORTED_CHAINS).map(Number);
      expect(chainIds).toHaveLength(3);
      expect(chainIds).toContain(1301);
      expect(chainIds).toContain(421614);
      expect(chainIds).toContain(11155111);
    });

    it('has correct name for Unichain Sepolia (1301)', () => {
      expect(SUPPORTED_CHAINS[1301].name).toBe('Unichain Sepolia');
    });

    it('has correct name for Arbitrum Sepolia (421614)', () => {
      expect(SUPPORTED_CHAINS[421614].name).toBe('Arbitrum Sepolia');
    });

    it('has correct name for Ethereum Sepolia (11155111)', () => {
      expect(SUPPORTED_CHAINS[11155111].name).toBe('Ethereum Sepolia');
    });

    it('has correct logo path for Unichain Sepolia', () => {
      expect(SUPPORTED_CHAINS[1301].logo).toBe('/chains/unichain.svg');
    });

    it('has correct logo path for Arbitrum Sepolia', () => {
      expect(SUPPORTED_CHAINS[421614].logo).toBe('/chains/arbitrum.svg');
    });

    it('has correct logo path for Ethereum Sepolia', () => {
      expect(SUPPORTED_CHAINS[11155111].logo).toBe('/chains/ethereum.svg');
    });

    it('each chain entry has both name and logo properties', () => {
      for (const chainId of Object.keys(SUPPORTED_CHAINS) as Array<
        keyof typeof SUPPORTED_CHAINS
      >) {
        const chain = SUPPORTED_CHAINS[chainId];
        expect(chain).toHaveProperty('name');
        expect(chain).toHaveProperty('logo');
        expect(typeof chain.name).toBe('string');
        expect(typeof chain.logo).toBe('string');
      }
    });

    it('does not contain unsupported chain IDs', () => {
      const chainIds = Object.keys(SUPPORTED_CHAINS).map(Number);
      expect(chainIds).not.toContain(1); // Ethereum mainnet
      expect(chainIds).not.toContain(42161); // Arbitrum mainnet
      expect(chainIds).not.toContain(8453); // Base mainnet
    });
  });

  // ─── SUPPORTED_PROTOCOLS ──────────────────────────────────────────────────────

  describe('SUPPORTED_PROTOCOLS', () => {
    it('contains exactly two supported protocols', () => {
      const protocols = Object.keys(SUPPORTED_PROTOCOLS);
      expect(protocols).toHaveLength(2);
      expect(protocols).toContain('aave');
      expect(protocols).toContain('morpho');
    });

    it('has correct name for Aave V3', () => {
      expect(SUPPORTED_PROTOCOLS.aave.name).toBe('Aave V3');
    });

    it('has correct name for Morpho Blue', () => {
      expect(SUPPORTED_PROTOCOLS.morpho.name).toBe('Morpho Blue');
    });

    it('has correct logo path for Aave', () => {
      expect(SUPPORTED_PROTOCOLS.aave.logo).toBe('/protocols/aave.svg');
    });

    it('has correct logo path for Morpho', () => {
      expect(SUPPORTED_PROTOCOLS.morpho.logo).toBe('/protocols/morpho.svg');
    });

    it('each protocol entry has both name and logo properties', () => {
      for (const key of Object.keys(SUPPORTED_PROTOCOLS) as Array<
        keyof typeof SUPPORTED_PROTOCOLS
      >) {
        const protocol = SUPPORTED_PROTOCOLS[key];
        expect(protocol).toHaveProperty('name');
        expect(protocol).toHaveProperty('logo');
        expect(typeof protocol.name).toBe('string');
        expect(typeof protocol.logo).toBe('string');
      }
    });

    it('does not contain unsupported protocols', () => {
      const protocols = Object.keys(SUPPORTED_PROTOCOLS);
      expect(protocols).not.toContain('compound');
      expect(protocols).not.toContain('maker');
    });
  });
});
