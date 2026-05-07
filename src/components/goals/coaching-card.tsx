// src/components/goals/coaching-card.tsx
import type { CoachingOutput } from '@/lib/goals/coaching';

type Props = { coaching: CoachingOutput };

export function GoalCoachingCard({ coaching }: Props) {
  return (
    <section className="rounded-card border border-border bg-card p-5 sm:p-6">
      <p className="text-eyebrow mb-3">Coaching</p>
      <p className="text-base italic text-foreground">{coaching.status}</p>
      {coaching.action && (
        <p className="mt-2 text-sm text-muted-foreground">{coaching.action}</p>
      )}
    </section>
  );
}
