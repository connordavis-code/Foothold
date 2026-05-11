'use client';

import type { RecentInvestmentTxn } from '@/lib/db/queries/investments';
import { cn, formatCurrency } from '@/lib/utils';
import { MobileList } from '@/components/operator/mobile-list';

/**
 * Mobile-only render for /investments recent activity. Paired with
 * the desktop <InvestmentTxnsTable> via CSS swap. Holdings mobile
 * path is gone — the responsive <HoldingsView> handles both
 * breakpoints fluidly.
 */
export function MobileInvestments({
  transactions,
}: {
  transactions: RecentInvestmentTxn[];
}) {
  if (transactions.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-[--hairline] bg-[--surface] p-5 md:hidden">
      <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
        Recent activity · {transactions.length}
      </p>
      <MobileList<RecentInvestmentTxn>
        rows={transactions}
        config={{
          rowKey: (t) => t.id,
          dateField: (t) => t.date,
          topLine: (t) => (
            <span className="flex items-baseline gap-2">
              {t.ticker && (
                <span className="font-mono text-xs font-medium text-[--text]">
                  {t.ticker}
                </span>
              )}
              <span className="truncate text-[--text]">
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
              ? `${t.quantity.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })} sh`
              : null,
        }}
      />
    </section>
  );
}
