'use client';

import type {
  FlatHolding,
  RecentInvestmentTxn,
} from '@/lib/db/queries/investments';
import { cn, formatCurrency } from '@/lib/utils';
import { MobileList } from '@/components/operator/mobile-list';

/**
 * Mobile-only render for /investments. Pairs with desktop
 * <HoldingsTable> + <InvestmentTxnsTable> via the CSS swap. Holdings
 * render flat (no group-by toggle on mobile — read+react), sorted by
 * institutionValue desc as the query already provides; recent
 * investment txns render date-grouped.
 */
export function MobileInvestments({
  holdings,
  transactions,
}: {
  holdings: FlatHolding[];
  transactions: RecentInvestmentTxn[];
}) {
  return (
    <div className="space-y-6 md:hidden">
      <section className="space-y-3">
        <p className="text-eyebrow">
          Holdings · {holdings.length}
        </p>
        <MobileList<FlatHolding>
          rows={holdings}
          config={{
            rowKey: (h) => h.id,
            topLine: (h) => (
              <span className="flex items-baseline gap-2">
                {h.ticker && (
                  <span className="font-mono text-xs font-medium text-foreground">
                    {h.ticker}
                  </span>
                )}
                <span className="truncate font-medium">
                  {h.securityName ?? '—'}
                </span>
              </span>
            ),
            secondLine: (h) => {
              const type = prettifyType(h.securityType);
              const acct = h.accountMask
                ? `${h.accountName} ····${h.accountMask}`
                : h.accountName;
              return `${type} · ${acct}`;
            },
            rightCell: (h) =>
              h.institutionValue != null
                ? formatCurrency(h.institutionValue)
                : '—',
            rightSubCell: (h) => (
              <span
                className={cn(
                  h.dayDelta == null
                    ? 'text-muted-foreground'
                    : h.dayDelta >= 0
                      ? 'text-positive'
                      : 'text-destructive',
                )}
              >
                {h.dayDelta == null
                  ? '—'
                  : formatCurrency(h.dayDelta, { signed: true })}
              </span>
            ),
          }}
          empty={
            <div className="rounded-card border border-border bg-surface-elevated px-4 py-12 text-center text-sm text-muted-foreground">
              No holdings reported yet.
            </div>
          }
        />
      </section>

      {transactions.length > 0 && (
        <section className="space-y-3">
          <p className="text-eyebrow">
            Recent investment activity · {transactions.length}
          </p>
          <MobileList<RecentInvestmentTxn>
            rows={transactions}
            config={{
              rowKey: (t) => t.id,
              dateField: (t) => t.date,
              topLine: (t) => (
                <span className="flex items-baseline gap-2">
                  {t.ticker && (
                    <span className="font-mono text-xs font-medium text-foreground">
                      {t.ticker}
                    </span>
                  )}
                  <span className="truncate">
                    {t.securityName ?? t.name ?? '—'}
                  </span>
                </span>
              ),
              secondLine: (t) => {
                const type = t.type ?? '—';
                const acct = t.accountMask
                  ? `${t.accountName} ····${t.accountMask}`
                  : t.accountName;
                return `${type.toUpperCase()} · ${acct}`;
              },
              rightCell: (t) => {
                const display = -t.amount;
                const isPositive = display > 0;
                return (
                  <span className={cn(isPositive && 'text-positive')}>
                    {formatCurrency(display, { signed: true })}
                  </span>
                );
              },
              rightSubCell: (t) =>
                t.quantity != null
                  ? `${t.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} sh`
                  : null,
            }}
          />
        </section>
      )}
    </div>
  );
}

function prettifyType(t: string | null): string {
  if (!t) return 'Other';
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
}
