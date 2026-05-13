import type { RecurringStreamRow } from '@/lib/db/queries/recurring';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils';

type Props = {
  monthlyOutflow: number;
  netMonthly: number;
  activeOutflowCount: number;
  nextCharge: { stream: RecurringStreamRow; dateIso: string } | null;
};

/**
 * 3-cell KPI strip per locked decision #8 (Hybrid 3-stat). Mono
 * numerals, sub-line copy. Empty/null next-charge renders an em-dash
 * with a muted "No charges scheduled" sub-line so the cell never
 * collapses.
 *
 * Formatter split is intentional: Monthly outflow + Next charge sub-line
 * use formatCurrencyCompact (narrative-tile reading flow); Net monthly
 * uses formatCurrency({ signed: true }) because the sign is load-bearing
 * math semantics, not narrative.
 */
export function RecurringSummaryStrip({
  monthlyOutflow,
  netMonthly,
  activeOutflowCount,
  nextCharge,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-card bg-[--surface] p-5 sm:grid-cols-3">
      <Stat
        label="Monthly outflow"
        value={formatCurrencyCompact(monthlyOutflow)}
        sub={`${activeOutflowCount} ${activeOutflowCount === 1 ? 'outflow' : 'outflows'}`}
      />
      <Stat
        label="Net monthly"
        value={formatCurrency(netMonthly, { signed: true })}
        sub="inflows minus outflows"
        valueClass={netMonthly >= 0 ? 'text-positive' : 'text-destructive'}
      />
      <Stat
        label="Next charge"
        value={nextCharge ? formatChargeDate(nextCharge.dateIso) : '—'}
        sub={
          nextCharge
            ? `${pickMerchantLabel(nextCharge.stream)} · ${formatCurrencyCompact(pickAmount(nextCharge.stream))}`
            : 'No charges scheduled'
        }
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-eyebrow-sm">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xl font-semibold tabular-nums text-[--text] ${valueClass ?? ''}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[--text-3]">{sub}</div>
    </div>
  );
}

function formatChargeDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function pickMerchantLabel(stream: RecurringStreamRow): string {
  return (
    stream.merchantName?.trim() ||
    stream.description?.trim() ||
    'Recurring charge'
  );
}

function pickAmount(stream: RecurringStreamRow): number {
  return stream.lastAmount ?? stream.averageAmount ?? 0;
}
