import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { InsightSupplements } from '@/lib/insights/types';

type Props = {
  data: InsightSupplements['goals'];
};

export function GoalsTile({ data }: Props) {
  const lead = data.notable[0];
  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Goals
      </p>
      <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
        {data.onPaceCount}
        <span className="text-muted-foreground"> / {data.activeCount}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">on pace</p>
      {lead && (
        <p className="mt-3 truncate text-xs text-foreground/80">
          {lead.name} · {Math.round(lead.pacePct * 100)}%
        </p>
      )}
      <Link
        href="/goals"
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
      >
        See goals
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
