import Link from 'next/link';
import { Fragment } from 'react';
import { ArrowRight } from 'lucide-react';
import { GenerateButton } from './generate-button';
import type { Insight } from '@/lib/db/schema';

type Props = {
  insight: Insight | null;
  sequenceNumber: number;
  stats: { spendCents: number; incomeCents: number; netCents: number } | null;
};

const fmtMoney = (cents: number) =>
  `$${(Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtWeekRange = (weekStart: string, weekEnd: string) => {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${weekEnd}T00:00:00Z`);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startStr = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endStr = sameMonth
    ? end.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
    : end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
  return `${startStr}–${endStr}, ${start.getUTCFullYear()}`;
};

/**
 * Wraps numeric tokens ($X.YY, NX, N×) in a mono span so they render in
 * IBM Plex Mono inline with the Fraunces body text. Regex-only — AI
 * output is plain prose.
 */
function withMonoNumerals(text: string): React.ReactNode {
  const parts = text.split(/(\$[\d,]+\.\d{2}|\d+(?:\.\d+)?[x×])/g);
  return parts.map((p, i) =>
    /\$[\d,]+\.\d{2}|\d+(?:\.\d+)?[x×]/.test(p) ? (
      <span key={i} className="font-mono tabular-nums">
        {p}
      </span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/**
 * Pulls the first sentence off the front of the narrative for the
 * Fraunces editorial lead. Returns null when the first sentence is too
 * long (>180c) or too short (<20c) — in those cases the card falls back
 * to rendering all paragraphs as body, preserving honesty when the AI
 * prompt happens to produce a run-on opener.
 *
 * Sentence boundary = punctuation + whitespace. Decimals like $338.69
 * don't match because they have no trailing space.
 *
 * When the AI prompt is later tuned to emit editorial leads natively
 * (R.3 concern), this extractor becomes the no-op fallback.
 */
function extractLead(firstParagraph: string): {
  lead: string | null;
  remainder: string;
} {
  const match = firstParagraph.match(/[.!?]\s+/);
  if (!match) return { lead: null, remainder: firstParagraph };
  const idx = match.index! + match[0].length;
  const candidate = firstParagraph.slice(0, idx).trim();
  if (candidate.length > 180 || candidate.length < 20) {
    return { lead: null, remainder: firstParagraph };
  }
  return {
    lead: candidate,
    remainder: firstParagraph.slice(idx).trim(),
  };
}

export function WeekInsightCard({ insight, sequenceNumber, stats }: Props) {
  if (!insight) {
    return (
      <section
        id="brief"
        className="rounded-card bg-[--surface] p-6 text-center"
      >
        <p className="text-sm text-[--text-2]">No brief for this week yet.</p>
        <div className="mt-4">
          <GenerateButton />
        </div>
      </section>
    );
  }

  const paragraphs = insight.narrative.split(/\n\n+/).filter(Boolean);
  const firstPara = paragraphs[0] ?? '';
  const { lead, remainder } = extractLead(firstPara);
  // Body = (remainder of first paragraph, if any) + subsequent paragraphs.
  const body = [remainder, ...paragraphs.slice(1)].filter(Boolean);

  return (
    <article id="brief" className="rounded-card bg-[--surface] p-6">
      <header className="flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
        <span>Weekly Brief</span>
        <span className="h-px flex-1 bg-[--text-3] opacity-30" />
        <span>
          № {sequenceNumber} ·{' '}
          {fmtWeekRange(insight.weekStart, insight.weekEnd)}
        </span>
      </header>

      <div className="mt-5 space-y-3">
        {lead && (
          <p className="font-serif text-xl italic leading-snug text-[--text]">
            {withMonoNumerals(lead)}
          </p>
        )}
        {body.map((para, i) => (
          <p key={i} className="text-sm leading-relaxed text-[--text-2]">
            {withMonoNumerals(para)}
          </p>
        ))}
      </div>

      {stats && (
        <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-[--hairline] pt-4 text-xs">
          <div>
            <dt className="text-[--text-3]">Spend</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-[--text]">
              {fmtMoney(stats.spendCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[--text-3]">Income</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-[--text]">
              {fmtMoney(stats.incomeCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[--text-3]">Net</dt>
            <dd
              className="mt-0.5 font-mono tabular-nums"
              style={{
                color:
                  stats.netCents >= 0
                    ? 'var(--semantic-success)'
                    : 'var(--semantic-caution)',
              }}
            >
              {stats.netCents >= 0 ? '+' : '−'}
              {fmtMoney(stats.netCents)}
            </dd>
          </div>
        </dl>
      )}

      <footer className="mt-5 flex items-center justify-between text-xs text-[--text-3]">
        <span>— Foothold</span>
        <Link
          href={`/dashboard?week=${insight.weekStart}`}
          className="inline-flex items-center gap-1 text-[--text-2] hover:text-[--text]"
        >
          Read full brief <ArrowRight className="h-3 w-3" />
        </Link>
      </footer>
    </article>
  );
}
