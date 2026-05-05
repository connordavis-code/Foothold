import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { formatWeekRange } from '@/lib/utils/format-week-range';

type Props = {
  weekStart: string;
  weekEnd: string;
};

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
        Viewing {formatWeekRange(weekStart, weekEnd)}
      </span>
    </div>
  );
}
