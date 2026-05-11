import type { GoalWithProgress } from '@/lib/db/queries/goals';
import type { PaceVerdict } from '@/lib/goals/pace';
import { formatCurrencyCompact } from '@/lib/utils';

type Props = {
  goal: GoalWithProgress;
  verdict: PaceVerdict;
};

/**
 * Progress bar per prototype shape. Track + fill + hairline ticks at
 * 25/50/75% + "you are here" position dot at fill-edge + 3-cell labels
 * below (current short · pct% · target short).
 *
 * Fill color follows verdict — success green for on-pace/hit, caution
 * amber for behind/over. Inline-style for color tokens because
 * --semantic-success / --semantic-caution are complete-color Foothold
 * tokens (NOT shadcn HSL fragments — see R.2 fix(r2) commit 986c822
 * for the rule). Position dot suppressed when fraction <= 5% so it
 * reads as a position marker rather than a generic leading indicator.
 */
export function GoalProgress({ goal, verdict }: Props) {
  const p = goal.progress;
  const fractionRaw = p.fraction;
  const fraction = Math.max(0, Math.min(1, fractionRaw));
  const pct = Math.round(fractionRaw * 100);

  const fillColor =
    verdict === 'hit' || verdict === 'on-pace'
      ? 'var(--semantic-success)'
      : 'var(--semantic-caution)';

  const currentValue = p.type === 'savings' ? p.current : p.spent;
  const targetValue = p.type === 'savings' ? p.target : p.cap;

  return (
    <div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${fraction * 100}%`, background: fillColor }}
          aria-hidden
        />
        {[0.25, 0.5, 0.75].map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full w-px bg-[--text-3] opacity-50"
            style={{ left: `${t * 100}%` }}
            aria-hidden
          />
        ))}
        {fraction > 0.05 && (
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${fraction * 100}%` }}
            aria-hidden
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                background: fillColor,
                boxShadow: '0 0 0 3px var(--dot-halo)',
              }}
            />
          </div>
        )}
      </div>

      {/* Below-bar labels: current (left) + pct (tracks the dot position) +
          target (right). Pct uses absolute positioning so it follows the
          fill-edge instead of sitting at the geometric center — reads as
          "you are HERE, at N%" instead of "the middle of the bar is N%". */}
      <div className="relative mt-2 h-4 font-mono text-[11px] tabular-nums text-[--text-2]">
        <span className="absolute left-0">
          {formatCurrencyCompact(currentValue)}
        </span>
        <span
          className="absolute"
          style={{
            left: `${Math.max(0, Math.min(100, fraction * 100))}%`,
            transform: 'translateX(-50%)',
            color:
              verdict === 'over' || verdict === 'behind'
                ? 'var(--semantic-caution)'
                : 'var(--text-2)',
          }}
        >
          {pct}%
        </span>
        <span className="absolute right-0">
          {formatCurrencyCompact(targetValue)}
        </span>
      </div>
    </div>
  );
}
