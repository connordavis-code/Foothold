import { ArrowRight, Plus, Target } from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { ArchivedToggle } from '@/components/goals/archived-toggle';
import { GoalCard } from '@/components/goals/goal-card';
import { GoalsPageHeader } from '@/components/goals/goals-page-header';
import { GoalsSummaryStrip } from '@/components/goals/goals-summary-strip';
import { Button } from '@/components/ui/button';
import { getCategoryOptions } from '@/lib/db/queries/categories';
import { getDriftAnalysis } from '@/lib/db/queries/drift';
import { getGoalsWithProgress } from '@/lib/db/queries/goals';
import { getBehindSavingsCoachingCategory } from '@/lib/db/queries/goal-detail';
import { getSourceHealth } from '@/lib/db/queries/health';
import { getGoalMoves } from '@/lib/db/queries/moves';
import { getRecurringStreams } from '@/lib/db/queries/recurring';
import { humanizeCategory } from '@/lib/format/category';
import { formatFreshness } from '@/lib/format/freshness';
import { composeCoaching } from '@/lib/goals/coaching';
import { buildCoachingInput } from '@/lib/goals/coaching-input';
import { suggestFromDrift, suggestFromHikes } from '@/lib/goals/move-suggestions';
import { paceVerdict, severityKey } from '@/lib/goals/pace';

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  // Seven-call fetch: goals + source health (for freshness) + page-level
  // top-discretionary coaching category (shared across all behind-savings
  // cards, single fetch — see SPEC § N+1 risk resolution) + R.4 move data
  // (goalMoves, driftAnalysis, streams, categories shared across all cards).
  const [goals, sourceHealth, coachingCategory, goalMoves, driftAnalysis, streams, categoryOptions] = await Promise.all([
    getGoalsWithProgress(userId, { includeInactive: true }),
    getSourceHealth(userId),
    getBehindSavingsCoachingCategory(userId),
    getGoalMoves(userId),
    getDriftAnalysis(userId),
    getRecurringStreams(userId),
    getCategoryOptions(userId),
  ]);

  // getCategoryOptions returns { id, name, source } — map to the { key, label }
  // shape GoalCard expects (humanizeCategory normalises PFC strings).
  const categories = categoryOptions.map((opt) => ({
    key: opt.name,
    label: humanizeCategory(opt.name),
  }));

  if (goals.length === 0) {
    return <EmptyState />;
  }

  // Pre-compute verdict + coaching + move props at page level so <GoalCard>
  // stays presentational and we don't recompute per-render.
  //
  // movesByGoal is a Map so we avoid an O(n²) filter inside the render loop
  // — both active and archived sections iterate goals, so the map is shared.
  const movesByGoal = new Map<string, typeof goalMoves>();
  for (const m of goalMoves) {
    if (!m.goalId) continue;
    const arr = movesByGoal.get(m.goalId) ?? [];
    arr.push(m);
    movesByGoal.set(m.goalId, arr);
  }

  const enriched = goals.map((goal) => {
    const verdict = paceVerdict(goal);
    const input = buildCoachingInput(goal, verdict, coachingCategory);
    const coaching = composeCoaching(input);
    const attachedMoves = movesByGoal.get(goal.id) ?? [];
    const driftSuggestions = suggestFromDrift(driftAnalysis, goal, attachedMoves);
    const hikeSuggestions = suggestFromHikes(streams, goal, attachedMoves);
    return { goal, verdict, coaching, attachedMoves, driftSuggestions, hikeSuggestions };
  });

  const active = enriched
    .filter((e) => e.goal.isActive)
    .sort((a, b) => severityKey(b.goal) - severityKey(a.goal));
  const archived = enriched.filter((e) => !e.goal.isActive);

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
      <p className="text-sm text-[--text-2]">Targets you&apos;ve committed to.</p>
      <GoalsSummaryStrip activeGoals={active.map((e) => e.goal)} />

      <div className="space-y-3">
        {active.map((e) => (
          <GoalCard
            key={e.goal.id}
            goal={e.goal}
            verdict={e.verdict}
            coaching={e.coaching}
            attachedMoves={e.attachedMoves}
            driftSuggestions={e.driftSuggestions}
            hikeSuggestions={e.hikeSuggestions}
            streams={streams}
            categories={categories}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[--hairline] pt-4">
        <Button asChild size="sm">
          <Link href="/goals/new">
            <Plus className="h-4 w-4" />
            New goal
          </Link>
        </Button>
        <span className="text-xs text-[--text-3]">
          A goal becomes real when you commit to it.
        </span>
      </div>

      <ArchivedToggle count={archived.length}>
        {archived.map((e) => (
          <GoalCard
            key={e.goal.id}
            goal={e.goal}
            verdict={e.verdict}
            coaching={e.coaching}
            attachedMoves={e.attachedMoves}
            driftSuggestions={e.driftSuggestions}
            hikeSuggestions={e.hikeSuggestions}
            streams={streams}
            categories={categories}
          />
        ))}
      </ArchivedToggle>
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
          <h1 className="font-serif text-2xl font-semibold italic tracking-tight">
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
