import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type Props = {
  weekStart: string;
  weekEnd: string;
};

function formatRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

export function PastWeekBanner({ weekStart, weekEnd }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-accent/40 px-4 py-3 text-xs">
      <Link
        href="/insights"
        className="inline-flex items-center gap-1.5 font-medium text-foreground/80 hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to current week
      </Link>
      <span className="text-muted-foreground">
        Viewing {formatRange(weekStart, weekEnd)}
      </span>
    </div>
  );
}
