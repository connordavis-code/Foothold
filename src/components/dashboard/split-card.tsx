import { formatCurrency } from '@/lib/utils';

type Props = {
  liquidBalance: number;
  liquidAccountCount: number;
  eomProjected: number;
};

/**
 * Two paired metrics in one card — liquid balance vs. projected
 * end-of-month cash. The vertical rule between halves is a deliberate
 * editorial divider; on small screens the halves stack with a horizontal
 * rule instead. EOM projection comes from the existing forecast engine.
 */
export function SplitCard({
  liquidBalance,
  liquidAccountCount,
  eomProjected,
}: Props) {
  const projectedDelta = eomProjected - liquidBalance;
  const projectedDirection = projectedDelta >= 0 ? '+' : '−';

  return (
    <section className="grid grid-cols-1 divide-y divide-border rounded-card border border-border bg-surface-elevated sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      <Half
        label="Liquid balance"
        value={formatCurrency(liquidBalance)}
        sub={`across ${liquidAccountCount} ${liquidAccountCount === 1 ? 'account' : 'accounts'}`}
      />
      <Half
        label="EOM projected"
        value={formatCurrency(eomProjected)}
        sub={
          liquidAccountCount === 0
            ? 'connect an account to project'
            : `${projectedDirection}${formatCurrency(Math.abs(projectedDelta))} from today`
        }
      />
    </section>
  );
}

function Half({
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
      <p className="text-eyebrow">
        {label}
      </p>
      <p className="text-2xl font-semibold tracking-[-0.015em] tabular-nums sm:text-3xl">
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
