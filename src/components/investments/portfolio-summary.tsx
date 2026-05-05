import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { PortfolioSummary as Summary } from '@/lib/db/queries/investments';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';

type Props = {
  summary: Summary;
};

/**
 * Three-cell operator grid for the portfolio header. Cells share a
 * vertical divider on md+; stack on small viewports. Total is the
 * lead value; day Δ + unrealized gain take the supporting roles.
 *
 * Month Δ / YTD Δ are deferred until a price-history table exists.
 * Showing them as "—" here would be honest but visually noisy; better
 * to ship three reliable cells than five with two-thirds blank.
 */
export function PortfolioSummary({ summary }: Props) {
  return (
    <section className="grid grid-cols-1 divide-y divide-border rounded-card border border-border bg-surface-elevated md:grid-cols-3 md:divide-x md:divide-y-0">
      <Cell
        label="Portfolio value"
        value={formatCurrency(summary.totalValue)}
        sub={`Across ${summary.accountCount} ${summary.accountCount === 1 ? 'account' : 'accounts'}`}
      />
      <DeltaCell
        label="Today"
        delta={summary.dayDelta}
        deltaPct={summary.dayDeltaPct}
        emptyLabel="No prior close yet"
      />
      <DeltaCell
        label="Unrealized gain"
        delta={
          summary.costedHoldingsCount > 0 ? summary.unrealizedGainLoss : null
        }
        deltaPct={summary.unrealizedGainLossPct}
        emptyLabel="No cost basis from Plaid yet"
      />
    </section>
  );
}

function Cell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-5 sm:p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        {label}
      </p>
      <p className="font-mono text-2xl font-semibold tracking-[-0.015em] tabular-nums sm:text-3xl">
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function DeltaCell({
  label,
  delta,
  deltaPct,
  emptyLabel,
}: {
  label: string;
  delta: number | null;
  deltaPct: number | null;
  emptyLabel: string;
}) {
  const known = delta != null;
  const isUp = known && delta >= 0;
  const Arrow = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="flex flex-col gap-1.5 p-5 sm:p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          'font-mono text-2xl font-semibold tracking-[-0.015em] tabular-nums sm:text-3xl',
          !known
            ? 'text-muted-foreground/70'
            : isUp
              ? 'text-positive'
              : 'text-destructive',
        )}
      >
        {known ? formatCurrency(delta, { signed: true }) : '—'}
      </p>
      {known ? (
        <p
          className={cn(
            'inline-flex items-center gap-1 text-xs tabular-nums',
            isUp ? 'text-positive' : 'text-destructive',
          )}
        >
          <Arrow className="h-3 w-3" />
          {deltaPct != null ? formatPercent(deltaPct) : '—'}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}
