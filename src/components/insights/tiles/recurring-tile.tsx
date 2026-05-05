import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { InsightSupplements } from '@/lib/insights/types';

type Props = {
  data: InsightSupplements['recurring'];
};

export function RecurringTile({ data }: Props) {
  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <p className="text-eyebrow">
        Recurring
      </p>
      <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
        {formatCurrency(data.hitThisWeekTotal)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        hit this week · {formatCurrency(data.monthlyTotal)}/mo total
      </p>
      <Link
        href="/recurring"
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
      >
        See recurring
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
