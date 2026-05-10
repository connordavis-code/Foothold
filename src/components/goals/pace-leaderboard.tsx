import { GoalRow } from '@/components/goals/goal-row';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { paceVerdict, severityKey } from '@/lib/goals/pace';

type Props = {
  goals: GoalWithProgress[];
};

export function PaceLeaderboard({ goals }: Props) {
  const { behind, onPace, archived } = partition(goals);

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
      {archived.length > 0 && (
        <Section
          eyebrow={`Archived · ${archived.length} ${plural(archived.length, 'goal')}`}
          goals={archived}
          muted
        />
      )}
    </div>
  );
}

function Section({
  eyebrow,
  goals,
  muted = false,
}: {
  eyebrow: string;
  goals: GoalWithProgress[];
  muted?: boolean;
}) {
  return (
    <section className="space-y-3">
      <p className="text-eyebrow">{eyebrow}</p>
      <ul
        className={
          muted
            ? 'overflow-hidden rounded-card border border-border bg-surface-elevated divide-y divide-border/60 opacity-70'
            : 'overflow-hidden rounded-card border border-border bg-surface-elevated divide-y divide-border/60'
        }
      >
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
  const archived: GoalWithProgress[] = [];
  for (const g of goals) {
    if (!g.isActive) {
      archived.push(g);
      continue;
    }
    const v = paceVerdict(g);
    if (v === 'over' || v === 'behind') behind.push(g);
    else onPace.push(g);
  }
  behind.sort((a, b) => severityKey(b) - severityKey(a));
  onPace.sort((a, b) => b.progress.fraction - a.progress.fraction);
  archived.sort((a, b) => +b.createdAt - +a.createdAt);
  return { behind, onPace, archived };
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
