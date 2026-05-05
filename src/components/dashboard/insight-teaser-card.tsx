import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { Insight } from '@/lib/db/schema';

type Props = {
  insight: Insight | null;
};

/**
 * Single-sentence preview from the latest weekly insight. The dashboard
 * is not the place for the full narrative — that lives at /insights.
 * Renders nothing when no insight has been generated yet (empty state
 * lives on /insights).
 */
export function InsightTeaserCard({ insight }: Props) {
  if (!insight) return null;
  const lead = firstSentence(insight.narrative);
  if (!lead) return null;

  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-accent text-foreground/80">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            This week's insight
          </p>
          <p className="mt-1.5 text-base leading-snug text-foreground">
            {lead}
          </p>
          <Link
            href="/insights"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
          >
            Read more
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Pull the first sentence from the narrative. Uses a conservative
 * boundary (period+space, or first newline) — narrative is markdown but
 * we don't render formatting in the teaser, just the lede.
 */
function firstSentence(narrative: string): string | null {
  const trimmed = narrative.trim();
  if (!trimmed) return null;
  // Split on first `. ` or newline. The dot-space rule keeps "U.S." intact
  // for now (rare in finance copy); newline rule catches markdown headers.
  const periodIdx = trimmed.indexOf('. ');
  const newlineIdx = trimmed.indexOf('\n');
  let cut = -1;
  if (periodIdx > 0 && (newlineIdx === -1 || periodIdx < newlineIdx)) {
    cut = periodIdx + 1;
  } else if (newlineIdx > 0) {
    cut = newlineIdx;
  }
  if (cut === -1) return trimmed.slice(0, 200);
  return trimmed.slice(0, cut);
}
