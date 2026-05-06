import { GoalRow } from '@/components/goals/goal-row';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { paceVerdict, severityKey } from '@/lib/goals/pace';

type Props = {
  goals: GoalWithProgress[];
};

export function PaceLeaderboard({ goals }: Props) {
  const { behind, onPace } = partition(goals);

  return (
    <div className="space-y-6">
      {behind.length > 0 && (
        <Section
          eyebrow={`Behind pace · ${behind.length} ${plural(behind.length, 'goal')}`}
          goals={behind}
        />
      )}
      {onPace.length > 0 && (
        <Section
          eyebrow={`On pace · ${onPace.length} ${plural(onPace.length, 'goal')}`}
          goals={onPace}
        />
      )}
    </div>
  );
}

function Section({
  eyebrow,
  goals,
}: {
  eyebrow: string;
  goals: GoalWithProgress[];
}) {
  return (
    <section className="space-y-3">
      <p className="text-eyebrow">{eyebrow}</p>
      <ul className="overflow-hidden rounded-card border border-border bg-surface-elevated divide-y divide-border/60">
        {goals.map((g) => (
          <GoalRow key={g.id} goal={g} />
        ))}
      </ul>
    </section>
  );
}

function partition(goals: GoalWithProgress[]) {
  const behind: GoalWithProgress[] = [];
  const onPace: GoalWithProgress[] = [];
  for (const g of goals) {
    const v = paceVerdict(g);
    if (v === 'over' || v === 'behind') behind.push(g);
    else onPace.push(g);
  }
  behind.sort((a, b) => severityKey(b) - severityKey(a));
  onPace.sort((a, b) => b.progress.fraction - a.progress.fraction);
  return { behind, onPace };
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
