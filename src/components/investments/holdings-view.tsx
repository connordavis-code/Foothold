'use client';

import { useMemo, useState } from 'react';
import type { FlatHolding } from '@/lib/db/queries/investments';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';

type ViewKey = 'positions' | 'accounts';

type AccountBreakdown = {
  accountId: string;
  accountName: string;
  accountMask: string | null;
  value: number;
  holdings: FlatHolding[];
};

// Strike-3 RSC boundary guard: props are plain-data only. No
// function props, no forwardRef components — both T8 and T10 are
// the new client islands in R.3.4 and the lesson from /drift's
// flag-history regression (2026-05-07) is fresh.
export function HoldingsView({ holdings }: { holdings: FlatHolding[] }) {
  const [view, setView] = useState<ViewKey>('positions');

  const accountsBreakdown = useMemo<AccountBreakdown[]>(() => {
    const map = new Map<string, AccountBreakdown>();
    for (const h of holdings) {
      const key = h.accountId;
      const entry = map.get(key) ?? {
        accountId: h.accountId,
        accountName: h.accountName,
        accountMask: h.accountMask,
        value: 0,
        holdings: [],
      };
      entry.value += h.institutionValue ?? 0;
      entry.holdings.push(h);
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [holdings]);

  return (
    <section className="space-y-4 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow">
            Holdings
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[--text]">
            {view === 'positions' ? 'By position' : 'By account'}
          </h2>
        </div>
        <div className="flex gap-1 rounded-full border border-[--hairline] p-1">
          {(['positions', 'accounts'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'rounded-full px-3 py-1 text-xs capitalize transition-colors',
                view === v && 'bg-accent/12 text-accent',
                view !== v && 'text-[--text-2] hover:text-[--text]',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      {view === 'positions' ? (
        <PositionsList holdings={holdings} />
      ) : (
        <AccountsList breakdown={accountsBreakdown} />
      )}
    </section>
  );
}

function PositionsList({ holdings }: { holdings: FlatHolding[] }) {
  if (holdings.length === 0) {
    return (
      <p className="px-3 py-12 text-center text-sm text-[--text-3]">
        No holdings reported yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[--hairline]">
      {holdings.map((h) => {
        const value = h.institutionValue ?? 0;
        const gl =
          h.costBasis != null && h.institutionValue != null
            ? h.institutionValue - h.costBasis
            : null;
        const glPct = gl != null && h.costBasis ? gl / h.costBasis : null;
        const isUp = gl != null && gl >= 0;
        return (
          <li
            key={h.id}
            className="grid grid-cols-2 gap-3 py-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]"
          >
            <div className="col-span-2 md:col-span-1">
              <p className="font-mono text-sm font-medium text-[--text]">
                {h.ticker ?? '—'}
              </p>
              <p className="truncate text-xs text-[--text-2]">
                {h.securityName ?? '—'}
              </p>
              <p className="text-xs text-[--text-3]">
                {prettifyType(h.securityType)} · {h.accountName}
                {h.accountMask && <span> ····{h.accountMask}</span>}
              </p>
            </div>
            <div className="text-right font-mono text-xs tabular-nums text-[--text-2]">
              {h.quantity.toLocaleString(undefined, {
                maximumFractionDigits: 4,
              })}{' '}
              <span className="text-[--text-3]">sh</span>
            </div>
            <div className="text-right font-mono text-xs tabular-nums text-[--text-2]">
              {h.institutionPrice != null
                ? formatCurrency(h.institutionPrice)
                : '—'}
            </div>
            <div className="text-right font-mono text-sm font-medium tabular-nums text-[--text]">
              {formatCurrency(value)}
            </div>
            <div
              className={cn(
                'text-right font-mono text-xs tabular-nums',
                gl == null
                  ? 'text-[--text-3]'
                  : isUp
                    ? 'text-positive'
                    : 'text-destructive',
              )}
            >
              {gl == null ? '—' : formatCurrency(gl, { signed: true })}
              {glPct != null && (
                <div className="text-[10px] opacity-80">
                  {formatPercent(glPct)}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AccountsList({ breakdown }: { breakdown: AccountBreakdown[] }) {
  if (breakdown.length === 0) {
    return (
      <p className="px-3 py-12 text-center text-sm text-[--text-3]">
        No accounts reported yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {breakdown.map((acct) => (
        <div
          key={acct.accountId}
          className="rounded-xl border border-[--hairline] p-4"
        >
          <header className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[--text]">
                {acct.accountName}
                {acct.accountMask && (
                  <span className="ml-1 text-xs text-[--text-3]">
                    ····{acct.accountMask}
                  </span>
                )}
              </p>
              <p className="text-xs text-[--text-3]">
                {acct.holdings.length}{' '}
                {acct.holdings.length === 1 ? 'position' : 'positions'}
              </p>
            </div>
            <p className="font-mono text-base font-semibold tabular-nums text-[--text]">
              {formatCurrency(acct.value)}
            </p>
          </header>
          <ul className="mt-3 space-y-1.5">
            {acct.holdings.map((h) => (
              <li
                key={h.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-medium text-[--text]">
                    {h.ticker ?? '—'}
                  </span>
                  <span className="truncate text-[--text-2]">
                    {h.securityName ?? '—'}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-[--text-2]">
                  {formatCurrency(h.institutionValue ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function prettifyType(t: string | null): string {
  if (!t) return 'Other';
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
}
