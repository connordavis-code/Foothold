import { describe, expect, it } from 'vitest';
import { buildAllocation, classifyHolding } from './allocation';

describe('classifyHolding', () => {
  it('etf maps to ETF', () => {
    expect(classifyHolding('etf')).toBe('ETF');
  });

  it('equity maps to Equity', () => {
    expect(classifyHolding('equity')).toBe('Equity');
  });

  it('stock maps to Equity', () => {
    expect(classifyHolding('stock')).toBe('Equity');
  });

  it('mutual fund maps to Mutual fund', () => {
    expect(classifyHolding('mutual fund')).toBe('Mutual fund');
  });

  it('mutual_fund maps to Mutual fund', () => {
    expect(classifyHolding('mutual_fund')).toBe('Mutual fund');
  });

  it('fixed income maps to Bond / fixed income', () => {
    expect(classifyHolding('fixed income')).toBe('Bond / fixed income');
  });

  it('bond maps to Bond / fixed income', () => {
    expect(classifyHolding('bond')).toBe('Bond / fixed income');
  });

  it('cash maps to Cash', () => {
    expect(classifyHolding('cash')).toBe('Cash');
  });

  it('null maps to Other', () => {
    expect(classifyHolding(null)).toBe('Other');
  });

  it('empty string maps to Other', () => {
    expect(classifyHolding('')).toBe('Other');
  });

  it('unknown type maps to Other', () => {
    expect(classifyHolding('crypto')).toBe('Other');
  });

  it('is case-insensitive: EQUITY maps to Equity', () => {
    expect(classifyHolding('EQUITY')).toBe('Equity');
  });

  // SnapTrade writes the FIGI-style short code from `symbol.type.code`
  // directly (see snaptrade/sync.ts). R.3.4 UAT surfaced every holding
  // landing in 'Other' because only Plaid's long-form values were
  // mapped; the dev-DB scan (2026-05-11) found cs/et/oef/ad in use.
  describe('SnapTrade short codes', () => {
    it('cs (common stock) maps to Equity', () => {
      expect(classifyHolding('cs')).toBe('Equity');
    });
    it('ad (ADR) maps to Equity', () => {
      expect(classifyHolding('ad')).toBe('Equity');
    });
    it('et (ETF) maps to ETF', () => {
      expect(classifyHolding('et')).toBe('ETF');
    });
    it('oef (open-end fund) maps to Mutual fund', () => {
      expect(classifyHolding('oef')).toBe('Mutual fund');
    });
    it('bnd (bond) maps to Bond / fixed income', () => {
      expect(classifyHolding('bnd')).toBe('Bond / fixed income');
    });
  });
});

describe('buildAllocation', () => {
  it('returns empty array on empty holdings', () => {
    expect(buildAllocation([])).toEqual([]);
  });

  it('single ETF holding becomes a single 100% segment', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: 1000 },
    ]);
    expect(out).toEqual([{ name: 'ETF', value: 1000, pct: 100 }]);
  });

  it('two classes sorted by value desc', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: 300 },
      { securityType: 'cash', institutionValue: 700 },
    ]);
    expect(out.map((s) => s.name)).toEqual(['Cash', 'ETF']);
  });

  it('Other pinned last regardless of rank', () => {
    const out = buildAllocation([
      { securityType: 'crypto', institutionValue: 9000 },
      { securityType: 'etf', institutionValue: 100 },
    ]);
    expect(out.map((s) => s.name)).toEqual(['ETF', 'Other']);
  });

  it('null institutionValue treated as 0', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: null },
      { securityType: 'cash', institutionValue: 500 },
    ]);
    expect(out).toEqual([{ name: 'Cash', value: 500, pct: 100 }]);
  });

  it('filters out zero-value buckets', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: 0 },
      { securityType: 'cash', institutionValue: 500 },
    ]);
    expect(out.map((s) => s.name)).toEqual(['Cash']);
  });

  it('pct math sums to ~100', () => {
    const out = buildAllocation([
      { securityType: 'etf', institutionValue: 300 },
      { securityType: 'cash', institutionValue: 700 },
    ]);
    const total = out.reduce((s, x) => s + x.pct, 0);
    expect(total).toBeCloseTo(100, 4);
  });

  it('sums multiple holdings into same class', () => {
    const out = buildAllocation([
      { securityType: 'equity', institutionValue: 100 },
      { securityType: 'stock', institutionValue: 200 },
      { securityType: 'etf', institutionValue: 500 },
    ]);
    const equity = out.find((s) => s.name === 'Equity');
    expect(equity?.value).toBe(300);
  });
});
