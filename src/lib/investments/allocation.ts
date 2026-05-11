export type AllocationClass =
  | 'Equity'
  | 'ETF'
  | 'Mutual fund'
  | 'Bond / fixed income'
  | 'Cash'
  | 'Other';

export type AllocationSegment = {
  name: AllocationClass;
  value: number;
  pct: number;
};

// Observed `securities.type` values by provider:
//   Plaid:     etf, equity, stock, mutual fund, fixed income, cash
//              (and *_underscore variants observed in some Plaid envs)
//   SnapTrade: cs (common stock), et (ETF), oef (open-end fund),
//              ad (ADR), bnd (bond), crypto (cryptocurrency)
// SnapTrade writes `symbol.type.code` directly per snaptrade/sync.ts;
// codes mirror FIGI / ISO short-form. R.3.4 UAT surfaced every holding
// landing in 'Other' because the original lookup only covered Plaid's
// long-form values. Anything still unknown falls through to 'Other'.
const TYPE_LOOKUP: Record<string, AllocationClass> = {
  // Plaid + long-form
  etf: 'ETF',
  equity: 'Equity',
  stock: 'Equity',
  'mutual fund': 'Mutual fund',
  mutual_fund: 'Mutual fund',
  'fixed income': 'Bond / fixed income',
  fixed_income: 'Bond / fixed income',
  bond: 'Bond / fixed income',
  bond_fund: 'Bond / fixed income',
  cash: 'Cash',
  'money market': 'Cash',
  // SnapTrade short codes
  cs: 'Equity',
  ad: 'Equity',
  et: 'ETF',
  oef: 'Mutual fund',
  bnd: 'Bond / fixed income',
};

export function classifyHolding(securityType: string | null): AllocationClass {
  if (!securityType) return 'Other';
  const key = securityType.toLowerCase().trim();
  return TYPE_LOOKUP[key] ?? 'Other';
}

type InputHolding = {
  securityType: string | null;
  institutionValue: number | null;
};

/**
 * Build allocation segments from holdings. Sorted by value desc with
 * 'Other' pinned last regardless of rank. Zero-value classes filtered
 * out. Mirrors /recurring's "Other category pinned last" pattern.
 */
export function buildAllocation(
  holdings: InputHolding[],
): AllocationSegment[] {
  if (holdings.length === 0) return [];

  const buckets = new Map<AllocationClass, number>();
  let total = 0;
  for (const h of holdings) {
    const value = h.institutionValue ?? 0;
    if (value <= 0) continue;
    const cls = classifyHolding(h.securityType);
    buckets.set(cls, (buckets.get(cls) ?? 0) + value);
    total += value;
  }
  if (total === 0) return [];

  const segments: AllocationSegment[] = Array.from(buckets.entries()).map(
    ([name, value]) => ({ name, value, pct: (value / total) * 100 }),
  );

  // Sort value desc, then pin 'Other' last.
  segments.sort((a, b) => {
    if (a.name === 'Other' && b.name !== 'Other') return 1;
    if (b.name === 'Other' && a.name !== 'Other') return -1;
    return b.value - a.value;
  });

  return segments;
}
