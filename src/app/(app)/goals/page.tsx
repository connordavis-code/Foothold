import { ArrowRight, Plus, Target } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { GoalsPageHeader } from '@/components/goals/goals-page-header';
import { GoalsSummaryStrip } from '@/components/goals/goals-summary-strip';
import { PaceLeaderboard } from '@/components/goals/pace-leaderboard';
import { Button } from '@/components/ui/button';
import { getGoalsWithProgress } from '@/lib/db/queries/goals';
import { getSourceHealth } from '@/lib/db/queries/health';
import { formatFreshness } from '@/lib/format/freshness';

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.user) return null;

  // includeInactive so the leaderboard's Archived section can render. The
  // partition step inside <PaceLeaderboard> bucketizes by isActive first.
  const [goals, sourceHealth] = await Promise.all([
    getGoalsWithProgress(session.user.id, { includeInactive: true }),
    getSourceHealth(session.user.id),
  ]);

  if (goals.length === 0) {
    return <EmptyState />;
  }

  const active = goals.filter((g) => g.isActive);
  const freshness = formatFreshness({
    sources: sourceHealth.map((s) => ({
      name: s.institutionName ?? 'Source',
      lastSyncAt: s.lastSuccessfulSyncAt,
    })),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <GoalsPageHeader
        freshnessHeadline={freshness.headline}
        freshnessCaveat={freshness.caveat}
      />
      <p className="text-sm text-[--text-2]">Targets you've committed to.</p>
      <GoalsSummaryStrip activeGoals={active} />

      {/* T4 swaps PaceLeaderboard for the new card list + archived toggle. */}
      <PaceLeaderboard goals={goals} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-accent text-foreground/80">
          <Target className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Set a savings target or spend cap
          </h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Track an emergency fund, a down payment, or cap a category
            like dining. Progress updates automatically as accounts sync.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/goals/new">
              Create a goal
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
