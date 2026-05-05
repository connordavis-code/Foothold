import { Sparkles } from 'lucide-react';
import { auth } from '@/auth';
import {
  getInsightForWeek,
  getInsightsForArchive,
  getLatestInsight,
} from '@/lib/db/queries/insights';
import { getInsightSupplements } from '@/lib/db/queries/insight-supplements';
import { resolveButtonMode } from '@/lib/insights/button-mode';
import { resolveWeekParam } from '@/lib/insights/week-param';
import { EarlierWeeks } from '@/components/insights/earlier-weeks';
import { HeaderBlock } from '@/components/insights/header-block';
import { NarrativeArticle } from '@/components/insights/narrative-article';
import { PastWeekBanner } from '@/components/insights/past-week-banner';
import { ReceiptsSection } from '@/components/insights/receipts-section';

const DAY_MS = 24 * 60 * 60 * 1000;

function yesterdayKey(): string {
  return new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
}

type Props = {
  searchParams: Promise<{ week?: string }>;
};

export default async function InsightsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) return null;

  const params = await searchParams;
  const weekParam = resolveWeekParam(params.week);

  // Step 1: parallel reads — archive footer + the requested week (or latest).
  const [requestedInsight, archive] = await Promise.all([
    weekParam
      ? getInsightForWeek(session.user.id, weekParam)
      : getLatestInsight(session.user.id),
    getInsightsForArchive(session.user.id, 6),
  ]);

  // Silent fallback: ?week= didn't match a row. Re-fetch latest so the user
  // gets *something* useful instead of an empty page. The URL keeps ?week=,
  // which is acceptable per the spec.
  const insight =
    requestedInsight ??
    (weekParam ? await getLatestInsight(session.user.id) : null);

  const isPastWeekView =
    weekParam !== null &&
    requestedInsight !== null &&
    insight?.weekStart === weekParam;

  // Step 2: supplements only when an insight is actually displayed.
  const supplements = insight
    ? await getInsightSupplements(
        session.user.id,
        insight.weekStart,
        insight.weekEnd,
      )
    : null;

  const buttonMode = resolveButtonMode({
    hasDisplayedInsight: insight !== null,
    isPastWeekView,
  });

  const currentWeekKey = yesterdayKey();
  const isCurrentWeek = insight?.weekEnd === currentWeekKey;
  const showStaleChip = !isPastWeekView && insight !== null && !isCurrentWeek;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <HeaderBlock
        mode={isPastWeekView ? 'past' : 'current'}
        buttonMode={buttonMode}
      />

      {isPastWeekView && insight && (
        <PastWeekBanner weekStart={insight.weekStart} weekEnd={insight.weekEnd} />
      )}

      {insight ? (
        <>
          <NarrativeArticle
            insight={insight}
            isCurrentWeek={isCurrentWeek}
            showStaleChip={showStaleChip}
          />
          {supplements && <ReceiptsSection supplements={supplements} />}
        </>
      ) : (
        <EmptyState />
      )}

      {insight && (
        <EarlierWeeks
          entries={archive}
          excludeWeekStart={isPastWeekView ? insight.weekStart : null}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border border-border bg-surface-elevated p-8 text-center sm:p-12">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-gradient-hero text-white">
        <Sparkles className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">
        No insights yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Generate to see Claude's read on the last 7 days — spending, goal
        pace, recurring outflows — alongside the underlying numbers.
      </p>
    </div>
  );
}
