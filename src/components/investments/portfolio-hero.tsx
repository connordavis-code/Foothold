import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { PortfolioSummary } from '@/lib/db/queries/investments';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';

/**
 * Hero summary for /investments. Replaces the prior <PortfolioSummary>
 * 3-cell layout with a prototype-style hero: large portfolio value
 * (the biggest object on the page), cost-basis delta line below,
 * and a 2-cell aside (Cost basis · Holdings count).
 *
 * Day delta is intentionally absent here — it moves to the
 * <PerformanceChart>'s 1D range tab per R.3.4 SPEC #7. Per-position
 * day delta is still visible on <HoldingsView> rows.
 */
export function PortfolioHero({ summary }: { summary: PortfolioSummary }) {
  const hasCostBasis = summary.costedHoldingsCount > 0;
  const gainLoss = hasCostBasis ? summary.unrealizedGainLoss : null;
  const gainPct = summary.unrealizedGainLossPct;
  const isUp = gainLoss != null && gainLoss >= 0;
  const Arrow = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <section className="grid grid-cols-1 gap-6 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:grid-cols-3 md:gap-8 md:p-8">
      <div className="md:col-span-2">
        <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Portfolio value · today
        </p>
        <p className="mt-2 font-mono text-4xl font-semibold tabular-nums tracking-tight text-[--text] md:text-5xl">
          {formatCurrency(summary.totalValue)}
        </p>
        {gainLoss != null ? (
          <p
            className={cn(
              'mt-3 inline-flex items-center gap-1 font-mono text-sm tabular-nums',
              isUp ? 'text-positive' : 'text-destructive',
            )}
          >
            <Arrow className="h-3.5 w-3.5" />
            {formatCurrency(gainLoss, { signed: true })}
            {gainPct != null && (
              <span className="text-[--text-3]">
                {' · '}
                {formatPercent(gainPct)}
              </span>
            )}
            <span className="ml-2 text-[--text-3]">since cost basis</span>
          </p>
        ) : (
          <p className="mt-3 text-xs text-[--text-3]">
            No cost basis from sources yet
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-1 md:gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Cost basis
          </p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[--text]">
            {hasCostBasis ? formatCurrency(summary.totalCost) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Holdings
          </p>
          <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[--text]">
            {summary.costedHoldingsCount > 0 ? summary.costedHoldingsCount : '—'}
            <span className="ml-1 text-xs font-normal text-[--text-3]">
              · {summary.accountCount}{' '}
              {summary.accountCount === 1 ? 'account' : 'accounts'}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
