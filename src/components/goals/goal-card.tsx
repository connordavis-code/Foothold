import Link from 'next/link';
import { Pencil } from 'lucide-react';
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import type { CoachingOutput } from '@/lib/goals/coaching';
import type { PaceVerdict } from '@/lib/goals/pace';
import { ArchiveGoalButton } from './archive-goal-button';
import { DeleteGoalButton } from './delete-goal-button';
import { GoalProgress } from './goal-progress';
import { formatCurrency, formatCurrencyCompact } from '@/lib/utils';

type Props = {
  goal: GoalWithProgress;
  verdict: PaceVerdict;
  coaching: CoachingOutput | null;
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const fmtDate = (yyyymmdd: string | null) => {
  if (!yyyymmdd) return '—';
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const monthDeltaText = (
  projected: string | null,
  target: string | null,
): { text: string; tone: 'pos' | 'neg' | 'neutral' } => {
  if (!projected || !target) return { text: '', tone: 'neutral' };
  const p = new Date(`${projected}T00:00:00Z`).getTime();
  const t = new Date(`${target}T00:00:00Z`).getTime();
  const months = Math.round((p - t) / MONTH_MS);
  if (months === 0) return { text: 'on schedule', tone: 'neutral' };
  if (months < 0) return { text: `↑${Math.abs(months)}mo ahead`, tone: 'pos' };
  return { text: `↓${months}mo behind`, tone: 'neg' };
};

export function GoalCard({ goal, verdict, coaching }: Props) {
  const p = goal.progress;
  const intent =
    goal.scopedAccountNames.length > 0
      ? `Tracked from ${goal.scopedAccountNames.join(', ')}`
      : null;

  return (
    <article className="rounded-card bg-[--surface] p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[--text]">
            {goal.name}
          </h3>
          {intent && (
            <p className="mt-0.5 truncate text-xs text-[--text-3]">{intent}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill verdict={verdict} type={p.type} />
          <Link
            href={`/goals/${goal.id}/edit`}
            className="grid h-7 w-7 place-items-center rounded text-[--text-3] hover:bg-[--surface-2] hover:text-[--text]"
            aria-label="Edit goal"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
          <ArchiveGoalButton
            goalId={goal.id}
            goalName={goal.name}
            isArchived={!goal.isActive}
            iconOnly
          />
          <DeleteGoalButton goalId={goal.id} goalName={goal.name} iconOnly />
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {p.type === 'savings' ? (
          <>
            <Cell
              label="Target"
              value={formatCurrency(p.target)}
              sub={`by ${fmtDate(goal.targetDate)}`}
            />
            <Cell
              label="Saved"
              value={formatCurrency(p.current)}
              sub={`${formatCurrencyCompact(p.remaining)} to go`}
            />
            <Cell
              label="Projected"
              value={fmtDate(p.projectedDate)}
              sub={monthDeltaText(p.projectedDate, goal.targetDate).text}
              subTone={monthDeltaText(p.projectedDate, goal.targetDate).tone}
            />
            <Cell
              label="Pace"
              value={formatCurrencyCompact(p.monthlyVelocity)}
              sub="per month"
            />
          </>
        ) : (
          <>
            <Cell label="Cap" value={formatCurrency(p.cap)} sub="this month" />
            <Cell
              label="Spent"
              value={formatCurrency(p.spent)}
              sub={`${formatCurrencyCompact(Math.max(0, p.remaining))} left`}
            />
            <Cell
              label="Projected"
              value={formatCurrency(p.projectedMonthly)}
              sub={p.projectedMonthly > p.cap ? 'over cap' : 'under cap'}
              subTone={p.projectedMonthly > p.cap ? 'neg' : 'pos'}
            />
            <Cell
              label="Pace"
              value={formatCurrencyCompact(p.spent)}
              sub="month-to-date"
            />
          </>
        )}
      </div>

      <div className="mt-4">
        <GoalProgress goal={goal} verdict={verdict} />
      </div>

      {coaching && (
        <div className="mt-4 border-t border-[--hairline] pt-4">
          <p className="text-sm italic text-[--text-2]">{coaching.status}</p>
          {coaching.action && (
            <p className="mt-1 text-sm italic text-[--text-2]">
              {coaching.action}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function Cell({
  label,
  value,
  sub,
  subTone = 'neutral',
}: {
  label: string;
  value: string;
  sub: string;
  subTone?: 'pos' | 'neg' | 'neutral';
}) {
  const subColor =
    subTone === 'pos'
      ? 'var(--semantic-success)'
      : subTone === 'neg'
        ? 'var(--semantic-caution)'
        : 'var(--text-3)';
  return (
    <div>
      <div className="text-eyebrow-sm">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-[--text]">
        {value}
      </div>
      <div className="mt-0.5 text-[11px]" style={{ color: subColor }}>
        {sub}
      </div>
    </div>
  );
}

function StatusPill({
  verdict,
  type,
}: {
  verdict: PaceVerdict;
  type: 'savings' | 'spend_cap';
}) {
  const config = pillConfig(verdict, type);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
      style={{ background: config.bg, color: config.fg }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: config.dot,
        }}
      />
      {config.label}
    </span>
  );
}

function pillConfig(verdict: PaceVerdict, type: 'savings' | 'spend_cap') {
  const success = {
    bg: 'color-mix(in srgb, var(--semantic-success) 18%, transparent)',
    fg: 'var(--semantic-success)',
    dot: 'var(--semantic-success)',
  };
  const caution = {
    bg: 'color-mix(in srgb, var(--semantic-caution) 18%, transparent)',
    fg: 'var(--semantic-caution)',
    dot: 'var(--semantic-caution)',
  };
  const neutral = {
    bg: 'color-mix(in srgb, var(--text-2) 12%, transparent)',
    fg: 'var(--text-2)',
    dot: 'var(--text-2)',
  };

  if (type === 'savings') {
    if (verdict === 'hit') return { ...success, label: 'Hit target' };
    if (verdict === 'behind') return { ...caution, label: 'Behind pace' };
    return { ...neutral, label: 'On track' };
  }
  if (verdict === 'over') return { ...caution, label: 'Over cap' };
  if (verdict === 'behind') return { ...caution, label: 'Projected over' };
  if (verdict === 'hit') return { ...success, label: 'Under cap' };
  return { ...neutral, label: 'On pace' };
}
