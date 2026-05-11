# Phase R.3.1 — Goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `/goals` to adopt the prototype's rich card-per-goal IA, delete `/goals/[id]` deep-dive, restyle the two surviving form routes — first of six R.3 per-page sweep sub-phases.

**Architecture:** 7 atomic-commit task sequence on `feat/r3-1-goals` (branched from `feat/redesign` post-R.2 merge). Reuses existing data layer (`getGoalsWithProgress`, `getBehindSavingsCoachingCategory`, `paceVerdict`, `composeCoaching`, `formatFreshness` from R.2) — only one small new pure helper introduced (`buildCoachingInput` to wrap the page→card CoachingInput shaping). One `'use client'` island only (`<ArchivedToggle>` for show/hide state).

**Tech Stack:** Next.js 14 App Router · TypeScript · Drizzle ORM · Tailwind + Foothold tokens · Vitest 4.

**Date**: 2026-05-10
**Depends on**: [docs/redesign/r3-1-goals/SPEC.md](SPEC.md) (5 locked brainstorming decisions), [docs/redesign/SPEC.md](../SPEC.md) (R.0 master), [docs/redesign/r2-dashboard/PLAN.md](../r2-dashboard/PLAN.md) (precedent execution rhythm)
**Bundle reference**: [claude-design-context/foothold-goals.jsx](../../../claude-design-context/foothold-goals.jsx)
**Branch**: `feat/r3-1-goals` (cut from `feat/redesign`)
**Estimate**: ~1 week

---

## ▶ Resume point (as of 2026-05-10 evening)

**R.3.1 COMPLETE.** All 7 tasks shipped on `feat/r3-1-goals`; UAT pass clean; merged into `feat/redesign`.

| Task | Status | Commit |
|---|---|---|
| SPEC | ✅ | `0fd2c31` |
| PLAN | ✅ | `fad3089` |
| **T1** Page header + summary strip | ✅ | `7c8c342` |
| **T2+T3** GoalCard + GoalProgress + buildCoachingInput (combined) | ✅ | `832cc59` |
| **T4** /goals route rewrite + archived toggle | ✅ | `4cf4a83` |
| **T5** Delete /goals/[id] + obsolete components | ✅ | `5a5c2d3` |
| UAT polish: % label tracks dot horizontally | ✅ | `cd97a82` |
| UAT polish: `/goals/:id` redirect regex tightened | ✅ | `cbf051e` |
| UAT polish: % label moved above bar (no edge collision) | ✅ | `5dc3b35` |
| **T6** Restyle /goals/new + /goals/[id]/edit forms | ✅ | `73be5e3` |
| **T7** UAT polish reservation | ✅ (zero polish commits — UAT pass clean) | — |

**Test count:** 549 passing (started session at 542; +11 from coaching-input.test.ts, −4 from deleted trajectory.test.ts). Net above the predicted 539–542 budget because trajectory.test.ts only shed 4 cases instead of the 5–10 forecast.

**Acceptance gates:** all 10 met (typecheck clean, prod build clean — 27/27 pages — RSC grep clean, browser UAT pass, redirect curls verified pre-T6 via `cbf051e`).

**Outcome:** `feat/r3-1-goals` merged to `feat/redesign` + pushed. Next sub-phase: R.3.2 (Recurring) — see [docs/redesign/README.md](../README.md) for sub-phase queue.

---

---

## Branching + commit rhythm

All work lands on `feat/r3-1-goals`. One atomic commit per task per SPEC § "Task sequence." Commit subject format: `feat(r3.1): <task summary>`. T7 polish may produce 1-3 fixup commits — `fix(r3.1): <issue>`.

When all 7 tasks ship and UAT passes, branch merges to `feat/redesign` (the long-lived redesign branch). The full milestone single-PRs to `main` after R.6.

---

## Pre-flight (one-time before T1)

- [ ] **Confirm working branch**

```bash
git branch --show-current
```
Expected: `feat/r3-1-goals`

- [ ] **Confirm SPEC commit present**

```bash
git log --oneline -3
```
Expected to contain: `docs(r3.1): lock R.3.1 goals SPEC` (0fd2c31)

- [ ] **Snapshot baseline test count**

```bash
npm run test 2>&1 | tail -5
```
Record the passing count. Target post-R.3.1: baseline + ~5 (new `buildCoachingInput` tests) − ~5 to −10 (deleted `trajectory.test.ts` cases). Net ≈ baseline or slight decrease.

- [ ] **Read the SPEC end-to-end before T1**

[docs/redesign/r3-1-goals/SPEC.md](SPEC.md). Section "Final component map" is the canonical inventory of new / modified / deleted files. Section "Locked decisions" governs all ambiguity calls.

- [ ] **Read R.2's PLAN-vs-actual for context on the polish pattern**

[docs/redesign/r2-dashboard/PLAN.md § T8](../r2-dashboard/PLAN.md) — establishes the UAT-driven `fix(r3.1):` polish-commit convention.

---

## T1 — Page header + summary strip

**Goal:** Replace the current ad-hoc page header on `/goals` with `<GoalsPageHeader>` (eyebrow + h1 + right-meta freshness strip) + `<GoalsSummaryStrip>` (4-stat row). Mounts both on `/goals`.

**Files:**
- Create: `src/components/goals/goals-page-header.tsx`
- Create: `src/components/goals/goals-summary-strip.tsx`
- Modify: `src/app/(app)/goals/page.tsx` — add `getSourceHealth` + `formatFreshness` calls, mount both new components

**Subtasks:**

- [ ] **Step 1.1 — Create `<GoalsPageHeader>` (server component)**

```tsx
// src/components/goals/goals-page-header.tsx

/**
 * /goals page header — mirrors the dashboard <PageHeader> from R.2 with
 * route-specific copy. Eyebrow + h1 (left) + freshness meta (right).
 * Page sub line ("Targets you've committed to.") renders below in
 * page.tsx, not here, to keep this component layout-pure.
 */
export function GoalsPageHeader({
  freshnessHeadline,
  freshnessCaveat,
}: {
  freshnessHeadline: string;
  freshnessCaveat: string | null;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Plan
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[--text]">
          Goals
        </h1>
      </div>
      <div className="hidden text-right text-xs text-[--text-2] sm:block">
        <div>{freshnessHeadline}</div>
        {freshnessCaveat && (
          <div className="mt-0.5 text-[--text-3]">{freshnessCaveat}</div>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 1.2 — Create `<GoalsSummaryStrip>` (server component)**

```tsx
// src/components/goals/goals-summary-strip.tsx
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import { formatCurrencyCompact } from '@/lib/utils';

type Props = {
  activeGoals: GoalWithProgress[];
};

/**
 * 4-stat strip per prototype: Active goals · On track · Total saved ·
 * Total committed. "On track" excludes savings-behind + spend-cap-over/
 * projected-over (those count as off-track). Aggregate stats only —
 * per-goal data lives in <GoalCard>.
 */
export function GoalsSummaryStrip({ activeGoals }: Props) {
  if (activeGoals.length === 0) return null;

  const onTrackCount = activeGoals.filter((g) => {
    const p = g.progress;
    if (p.type === 'spend_cap') {
      return p.fraction <= 1 && p.projectedMonthly <= p.cap;
    }
    // savings: hit or on-pace (positive velocity, projected on/ahead of target)
    if (p.fraction >= 1) return true;
    if (p.monthlyVelocity <= 0) return false;
    if (g.targetDate && p.projectedDate && p.projectedDate > g.targetDate) {
      return false;
    }
    return true;
  }).length;

  const totalSaved = activeGoals.reduce((sum, g) => {
    return sum + (g.progress.type === 'savings' ? g.progress.current : g.progress.spent);
  }, 0);

  const totalCommitted = activeGoals.reduce((sum, g) => {
    return sum + (g.progress.type === 'savings' ? g.progress.target : g.progress.cap);
  }, 0);

  return (
    <div className="grid grid-cols-2 gap-3 rounded-card bg-[--surface] p-5 sm:grid-cols-4">
      <Stat label="Active goals" value={String(activeGoals.length)} />
      <Stat label="On track" value={`${onTrackCount}/${activeGoals.length}`} />
      <Stat label="Total saved" value={formatCurrencyCompact(totalSaved)} />
      <Stat label="Total committed" value={formatCurrencyCompact(totalCommitted)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-[--text]">
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 1.3 — Wire into `/goals` page**

Open [src/app/(app)/goals/page.tsx](../../../src/app/(app)/goals/page.tsx). Replace the existing header block + add the summary strip:

```tsx
// src/app/(app)/goals/page.tsx

import { GoalsPageHeader } from '@/components/goals/goals-page-header';
import { GoalsSummaryStrip } from '@/components/goals/goals-summary-strip';
import { formatFreshness } from '@/lib/format/freshness';
import { getSourceHealth } from '@/lib/db/queries/health';
// (keep existing imports for getGoalsWithProgress, PaceLeaderboard, auth, etc.)

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.user) return null;

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

      {/* T4 will replace the PaceLeaderboard mount with the card list +
          archived toggle. For T1, keep the leaderboard so the page
          continues to render. */}
      <PaceLeaderboard goals={goals} />
    </div>
  );
}
```

- [ ] **Step 1.4 — Typecheck + tests**

```bash
npm run typecheck && npm run test 2>&1 | tail -5
```
Expected: typecheck clean; tests at baseline (T1 adds no tests).

- [ ] **Step 1.5 — Commit T1**

```bash
git add src/components/goals/goals-page-header.tsx \
        src/components/goals/goals-summary-strip.tsx \
        "src/app/(app)/goals/page.tsx"
git commit -m "$(cat <<'EOF'
feat(r3.1): T1 goals page header + summary strip

New <GoalsPageHeader> mirrors R.2's dashboard PageHeader contract:
eyebrow "Plan" + h1 "Goals" + right-aligned freshness meta consuming
formatFreshness() from R.2's T7. New <GoalsSummaryStrip> renders 4
stats (Active goals · On track · Total saved · Total committed) per
prototype. Page sub copy "Targets you've committed to." (drops the
Moves-referential second sentence — defers to R.4).

PaceLeaderboard mount preserved at the bottom — T4 swaps it for the
new card list + archived toggle. T1 ships isolated visual primitives
so each later task lands a focused diff.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T2 — `<GoalCard>` component + buildCoachingInput helper

**Goal:** Rich card per prototype: title + intent + status pill + 3 action icons in header, type-dependent 4-cell number grid, progress bar slot (filled by T3), coaching sentence slot. Page composes CoachingInput via new pure helper; card receives `coaching: CoachingOutput | null` as a prop and stays presentational.

**Files:**
- Create: `src/lib/goals/coaching-input.ts` — new `buildCoachingInput` pure helper
- Create: `src/lib/goals/coaching-input.test.ts` — ~6 cases
- Create: `src/components/goals/goal-card.tsx`
- Modify: `src/components/goals/archive-goal-button.tsx` — add `variant: 'icon'` prop
- Modify: `src/components/goals/delete-goal-button.tsx` — add `variant: 'icon'` prop

**Subtasks:**

- [ ] **Step 2.1 — Write `coaching-input.test.ts` first (TDD)**

```ts
// src/lib/goals/coaching-input.test.ts
import { describe, expect, it } from 'vitest';
import { buildCoachingInput } from './coaching-input';
import type { GoalWithProgress } from '@/lib/db/queries/goals';

// Minimal fake goal builders — keep these to just the fields buildCoachingInput consumes.
const savingsGoal = (
  overrides: Partial<{
    fraction: number;
    monthlyVelocity: number;
    requiredMonthlyVelocity: number;
    projectedDate: string | null;
    targetDate: string | null;
    current: number;
    target: number;
  }> = {},
): GoalWithProgress =>
  ({
    id: 'g1',
    name: 'Test',
    type: 'savings',
    targetAmount: overrides.target ?? 10000,
    monthlyAmount: null,
    accountIds: null,
    categoryFilter: null,
    targetDate: overrides.targetDate ?? '2027-01-01',
    isActive: true,
    createdAt: new Date(),
    scopedAccountNames: [],
    progress: {
      type: 'savings',
      current: overrides.current ?? 5000,
      target: overrides.target ?? 10000,
      fraction: overrides.fraction ?? 0.5,
      remaining: 5000,
      monthlyVelocity: overrides.monthlyVelocity ?? 400,
      requiredMonthlyVelocity: overrides.requiredMonthlyVelocity ?? 500,
      projectedDate: overrides.projectedDate ?? '2027-06-01',
    },
  }) as unknown as GoalWithProgress;

const spendCapGoal = (
  overrides: Partial<{
    fraction: number;
    spent: number;
    cap: number;
    projectedMonthly: number;
  }> = {},
): GoalWithProgress =>
  ({
    id: 'g2',
    name: 'Test Cap',
    type: 'spend_cap',
    targetAmount: null,
    monthlyAmount: overrides.cap ?? 400,
    accountIds: null,
    categoryFilter: ['FOOD_AND_DRINK'],
    targetDate: null,
    isActive: true,
    createdAt: new Date(),
    scopedAccountNames: [],
    progress: {
      type: 'spend_cap',
      spent: overrides.spent ?? 200,
      cap: overrides.cap ?? 400,
      fraction: overrides.fraction ?? 0.5,
      remaining: 200,
      projectedMonthly: overrides.projectedMonthly ?? 380,
    },
  }) as unknown as GoalWithProgress;

describe('buildCoachingInput', () => {
  it('returns null for savings hit (let composeCoaching handle hit branch internally)', () => {
    // Actually buildCoachingInput SHOULD return a savings-hit input so
    // composeCoaching can produce the "You hit this goal" line. Verify.
    const input = buildCoachingInput(
      savingsGoal({ fraction: 1.1, current: 11000 }),
      'hit',
      null,
    );
    expect(input).not.toBeNull();
    expect(input?.kind).toBe('savings');
    expect(input?.verdict).toBe('hit');
  });

  it('returns savings-behind input with topDiscretionaryCategory when provided', () => {
    const input = buildCoachingInput(
      savingsGoal({ monthlyVelocity: 200, requiredMonthlyVelocity: 500 }),
      'behind',
      { name: 'Travel', monthlyAmount: 298 },
    );
    expect(input?.kind).toBe('savings');
    expect(input?.verdict).toBe('behind');
    if (input?.kind === 'savings' && input.verdict === 'behind') {
      expect(input.monthlyVelocity).toBe(200);
      expect(input.requiredMonthlyVelocity).toBe(500);
      expect(input.topDiscretionaryCategory).toEqual({
        name: 'Travel',
        monthlyAmount: 298,
      });
    }
  });

  it('returns savings-behind input with null category when not provided', () => {
    const input = buildCoachingInput(
      savingsGoal({ monthlyVelocity: 200, requiredMonthlyVelocity: 500 }),
      'behind',
      null,
    );
    if (input?.kind === 'savings' && input.verdict === 'behind') {
      expect(input.topDiscretionaryCategory).toBeNull();
    }
  });

  it('returns savings-on-pace input', () => {
    const input = buildCoachingInput(
      savingsGoal({ monthlyVelocity: 600, requiredMonthlyVelocity: 500 }),
      'on-pace',
      null,
    );
    expect(input?.kind).toBe('savings');
    expect(input?.verdict).toBe('on-pace');
  });

  it('returns spend_cap-on-pace input', () => {
    const input = buildCoachingInput(spendCapGoal({ fraction: 0.5 }), 'on-pace', null);
    expect(input?.kind).toBe('spend_cap');
    expect(input?.verdict).toBe('on-pace');
  });

  it('returns spend_cap-over input', () => {
    const input = buildCoachingInput(
      spendCapGoal({ fraction: 1.2, spent: 480, cap: 400 }),
      'over',
      null,
    );
    expect(input?.kind).toBe('spend_cap');
    expect(input?.verdict).toBe('over');
  });

  it('returns null for unknown verdict (defensive)', () => {
    // Type assertion to force an invalid verdict for the test
    const input = buildCoachingInput(savingsGoal(), 'invalid' as never, null);
    expect(input).toBeNull();
  });
});
```

- [ ] **Step 2.2 — Run failing tests**

```bash
npx vitest run src/lib/goals/coaching-input.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 2.3 — Implement `buildCoachingInput`**

```ts
// src/lib/goals/coaching-input.ts
import type { GoalWithProgress } from '@/lib/db/queries/goals';
import type { CoachingInput } from './coaching';
import type { PaceVerdict } from './pace';

export type TopDiscretionaryCategory = { name: string; monthlyAmount: number };

/**
 * Builds the discriminated-union input that composeCoaching expects, from
 * a goal + its computed paceVerdict + the page-level top-discretionary
 * category (only consumed by the savings-behind branch).
 *
 * Returns null for unknown verdicts (defensive; verdict comes from
 * paceVerdict which always returns one of 4 known strings, so this
 * branch is unreachable in practice but documents intent).
 *
 * Note: spend_cap-behind and spend_cap topMerchants are not surfaced by
 * R.3.1 (the prototype's card doesn't render the merchant breakdown
 * coaching produces for that branch). We map to spend_cap-on-pace
 * coaching when projection is over cap — the status pill ("Projected
 * over") already conveys the warning.
 */
export function buildCoachingInput(
  goal: GoalWithProgress,
  verdict: PaceVerdict,
  topDiscretionaryCategory: TopDiscretionaryCategory | null,
): CoachingInput | null {
  const p = goal.progress;

  if (p.type === 'savings') {
    if (verdict === 'hit') {
      // savings-hit needs hitDate + overshoot. projectedDate is the proxy
      // for hitDate when fraction >= 1 (Phase 3-pt3 convention).
      return {
        kind: 'savings',
        verdict: 'hit',
        hitDate: p.projectedDate ?? new Date().toISOString().slice(0, 10),
        overshoot: Math.max(0, p.current - p.target),
      };
    }
    if (verdict === 'on-pace') {
      return {
        kind: 'savings',
        verdict: 'on-pace',
        monthlyVelocity: p.monthlyVelocity,
        requiredMonthlyVelocity: p.requiredMonthlyVelocity ?? 0,
        topDiscretionaryCategory: null,
      };
    }
    if (verdict === 'behind') {
      return {
        kind: 'savings',
        verdict: 'behind',
        monthlyVelocity: p.monthlyVelocity,
        requiredMonthlyVelocity: p.requiredMonthlyVelocity ?? 0,
        topDiscretionaryCategory,
      };
    }
    return null; // 'over' doesn't apply to savings
  }

  // spend_cap branch
  if (verdict === 'on-pace') {
    return {
      kind: 'spend_cap',
      verdict: 'on-pace',
      cap: p.cap,
      spent: p.spent,
      projectedMonthly: p.projectedMonthly,
      topMerchants: [],
    };
  }
  if (verdict === 'over') {
    return {
      kind: 'spend_cap',
      verdict: 'over',
      cap: p.cap,
      spent: p.spent,
      overshoot: p.spent - p.cap,
      topMerchants: [],
    };
  }
  if (verdict === 'behind') {
    // spend_cap "behind" = projected over but not yet over. Map to over-branch
    // semantics with the projection as the relevant amount.
    return {
      kind: 'spend_cap',
      verdict: 'behind',
      cap: p.cap,
      spent: p.spent,
      projectedMonthly: p.projectedMonthly,
      topMerchants: [],
    };
  }
  return null;
}
```

**⚠️ Verify before completing this step:** the `CoachingInput` union may have variants this draft doesn't cover (e.g., spend_cap 'behind' branch shape). Open [src/lib/goals/coaching.ts](../../../src/lib/goals/coaching.ts) and confirm each branch this helper returns matches a variant of the `CoachingInput` union. Adjust shape if needed.

- [ ] **Step 2.4 — Run tests to confirm pass**

```bash
npx vitest run src/lib/goals/coaching-input.test.ts
```
Expected: PASS — 7 cases green.

- [ ] **Step 2.5 — Add icon-button variant to `<ArchiveGoalButton>`**

Open [src/components/goals/archive-goal-button.tsx](../../../src/components/goals/archive-goal-button.tsx). Add an `iconOnly?: boolean` prop. When true, render the trigger button as an icon-only square (28x28px hit area) using `lucide-react`'s `<Archive>` / `<ArchiveRestore>` icons.

```tsx
// At top of file, extend imports:
import { Archive, ArchiveRestore } from 'lucide-react';

// Extend Props type:
type Props = {
  goalId: string;
  goalName: string;
  isArchived: boolean;
  /** When true, renders as 28px icon button instead of text Button. */
  iconOnly?: boolean;
};

// In the component, conditionally render the trigger:
// Restore path (isArchived=true):
if (isArchived) {
  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={onRestore}
        disabled={isPending}
        className="grid h-7 w-7 place-items-center rounded text-[--text-3] hover:bg-[--surface-2] hover:text-[--text]"
        aria-label="Restore goal"
      >
        <ArchiveRestore className="h-3.5 w-3.5" />
      </button>
    );
  }
  // existing text-button render unchanged
  return (
    <Button /* ...existing props... */ >
      {isPending ? 'Restoring…' : 'Restore'}
    </Button>
  );
}

// Archive path: AlertDialog wrapper with conditional trigger:
return (
  <AlertDialog open={open} onOpenChange={setOpen}>
    <AlertDialogTrigger asChild>
      {iconOnly ? (
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded text-[--text-3] hover:bg-[--surface-2] hover:text-[--text]"
          aria-label="Archive goal"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button /* ...existing text-button props... */>Archive</Button>
      )}
    </AlertDialogTrigger>
    {/* existing AlertDialogContent unchanged */}
  </AlertDialog>
);
```

The existing text-button render path is preserved for any current consumers; new card consumer passes `iconOnly`.

- [ ] **Step 2.6 — Add icon-button variant to `<DeleteGoalButton>`**

Open [src/components/goals/delete-goal-button.tsx](../../../src/components/goals/delete-goal-button.tsx). Same pattern as 2.5 but with `<Trash2>` from lucide-react and aria-label "Delete goal." Preserve the existing confirmation modal flow.

- [ ] **Step 2.7 — Create `<GoalCard>` component**

```tsx
// src/components/goals/goal-card.tsx
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
  const months = Math.round((p - t) / (1000 * 60 * 60 * 24 * 30));
  if (months === 0) return { text: 'on schedule', tone: 'neutral' };
  if (months < 0) return { text: `↑${Math.abs(months)}mo ahead`, tone: 'pos' };
  return { text: `↓${months}mo behind`, tone: 'neg' };
};

export function GoalCard({ goal, verdict, coaching }: Props) {
  const p = goal.progress;
  const intent = goal.scopedAccountNames.length > 0
    ? `Tracked from ${goal.scopedAccountNames.join(', ')}`
    : null;

  return (
    <article className="rounded-card bg-[--surface] p-5">
      {/* Header row: title + intent (left) · status pill + action icons (right) */}
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

      {/* 4-cell number grid */}
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
              value={`${formatCurrencyCompact(p.monthlyVelocity)}`}
              sub="per month"
            />
          </>
        ) : (
          <>
            <Cell
              label="Cap"
              value={formatCurrency(p.cap)}
              sub="this month"
            />
            <Cell
              label="Spent"
              value={formatCurrency(p.spent)}
              sub={`${formatCurrencyCompact(p.remaining)} left`}
            />
            <Cell
              label="Projected"
              value={formatCurrency(p.projectedMonthly)}
              sub={p.projectedMonthly > p.cap ? 'over cap' : 'under cap'}
              subTone={p.projectedMonthly > p.cap ? 'neg' : 'pos'}
            />
            <Cell
              label="Pace"
              value={`${formatCurrencyCompact(p.spent)}`}
              sub="month-to-date"
            />
          </>
        )}
      </div>

      {/* Progress bar (T3 ships this) */}
      <div className="mt-4">
        <GoalProgress goal={goal} verdict={verdict} />
      </div>

      {/* Coaching slot — Moves placeholder until R.4 */}
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
      <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
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
  // Color tokens: success for hit/under-cap, caution for behind/over.
  // on-pace renders neutral grey-on-grey.
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
    return { ...neutral, label: 'On track' }; // on-pace
  }
  // spend_cap
  if (verdict === 'over') return { ...caution, label: 'Over cap' };
  if (verdict === 'behind') return { ...caution, label: 'Projected over' };
  if (verdict === 'hit') return { ...success, label: 'Under cap' };
  return { ...neutral, label: 'On pace' }; // on-pace
}
```

**⚠️ Note:** `<GoalProgress>` is imported at the top — T3 creates it. The card won't fully render until T3 ships (or you stub with a placeholder div). T2 + T3 are reviewed together.

- [ ] **Step 2.8 — Typecheck + tests**

```bash
npm run typecheck 2>&1 | tail -3 && npm run test 2>&1 | tail -5
```
Expected: typecheck may fail until T3 ships `<GoalProgress>` (the GoalCard import). Either: (a) commit T2 + T3 together as a pair, or (b) temporarily stub `<GoalProgress>` in T2 then replace in T3. Plan recommends (a) — collapse T2 + T3 into a single commit titled `feat(r3.1): T2+T3 GoalCard + GoalProgress`.

- [ ] **Step 2.9 — Commit T2 (deferred — combines with T3)**

Hold the commit until T3's `<GoalProgress>` lands. T3 step 3.4 ships both as a single atomic commit.

---

## T3 — `<GoalProgress>` (tick + position-dot bar)

**Goal:** Per-prototype progress bar shape — track + filled portion + hairline ticks at 25/50/75% + "you are here" position dot at fill-edge + 3-cell amount row below.

**Files:**
- Create: `src/components/goals/goal-progress.tsx`
- Delete: `src/components/goals/progress-bar.tsx` (superseded; verify no surviving consumers via grep before delete)

**Subtasks:**

- [ ] **Step 3.1 — Create `<GoalProgress>`**

```tsx
// src/components/goals/goal-progress.tsx
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
 * amber for behind/over. Inline-style for color tokens because both
 * --semantic-success and --semantic-caution are complete-color
 * Foothold tokens (NOT shadcn HSL fragments — see R.2 fix(r2)
 * commit 986c822 for the rule).
 */
export function GoalProgress({ goal, verdict }: Props) {
  const p = goal.progress;
  const fractionRaw = p.fraction;
  const fraction = Math.max(0, Math.min(1, fractionRaw));
  const pct = Math.round(fractionRaw * 100);

  // Color rule: success for hit, on-pace; caution for behind, over.
  const fillColor =
    verdict === 'hit' || verdict === 'on-pace'
      ? 'var(--semantic-success)'
      : 'var(--semantic-caution)';

  // Current / target values depend on type
  const currentValue =
    p.type === 'savings' ? p.current : p.spent;
  const targetValue =
    p.type === 'savings' ? p.target : p.cap;

  return (
    <div>
      {/* Track + fill + ticks + dot */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        {/* Fill */}
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${fraction * 100}%`, background: fillColor }}
          aria-hidden
        />
        {/* Hairline ticks at 25/50/75% */}
        {[0.25, 0.5, 0.75].map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full w-px bg-[--text-3] opacity-50"
            style={{ left: `${t * 100}%` }}
            aria-hidden
          />
        ))}
        {/* Position dot — only render when fraction > 5% so it reads as
            a marker, not a generic leading indicator */}
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

      {/* 3-cell amount row */}
      <div className="mt-2 flex items-baseline justify-between gap-2 font-mono text-[11px] tabular-nums text-[--text-2]">
        <span>{formatCurrencyCompact(currentValue)}</span>
        <span
          style={{
            color:
              verdict === 'over' || verdict === 'behind'
                ? 'var(--semantic-caution)'
                : 'var(--text-2)',
          }}
        >
          {pct}%
        </span>
        <span>{formatCurrencyCompact(targetValue)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.2 — Verify and delete `<ProgressBar>`**

```bash
grep -rn "from.*progress-bar\|from.*ProgressBar" src/ --include="*.tsx" --include="*.ts"
```

If results show consumers OTHER than the soon-to-be-deleted dashboard/goal-detail components (which already deleted in R.2 or will delete in T5), update them. If only consumers are deleted files: safe to remove.

```bash
rm src/components/goals/progress-bar.tsx
```

- [ ] **Step 3.3 — Typecheck + tests**

```bash
npm run typecheck && npm run test 2>&1 | tail -5
```
Expected: typecheck clean (now that `<GoalProgress>` exists, T2's `<GoalCard>` import resolves). Tests at baseline + 7 (from coaching-input.test.ts in T2). NO tests for GoalProgress or GoalCard — pure presentational with no testable predicates.

- [ ] **Step 3.4 — Commit T2 + T3 together**

```bash
git add src/lib/goals/coaching-input.ts \
        src/lib/goals/coaching-input.test.ts \
        src/components/goals/goal-card.tsx \
        src/components/goals/goal-progress.tsx \
        src/components/goals/archive-goal-button.tsx \
        src/components/goals/delete-goal-button.tsx
git add -u src/components/goals/progress-bar.tsx
git commit -m "$(cat <<'EOF'
feat(r3.1): T2+T3 GoalCard + GoalProgress + buildCoachingInput helper

Rich goal card per prototype. Header carries title + intent + status
pill (paceVerdict-mapped) + 3 icon buttons (edit/archive/delete).
Type-dependent 4-cell number grid (Target/Saved/Projected/Pace for
savings; Cap/Spent/Projected/Pace for spend_cap). Progress bar with
hairline ticks at 25/50/75% + position-dot at fill-edge with halo
(mirrors R.2's hero "you are here" pattern). Coaching sentence
renders below progress when composeCoaching returns non-null —
fills the prototype's Moves slot pending R.4.

New pure helper buildCoachingInput() in src/lib/goals/coaching-input.ts
(7 vitest cases) wraps the discriminated-union construction of
CoachingInput from a goal + paceVerdict + page-level top-discretionary
category. Keeps the GoalCard presentational; page composes inputs.

ArchiveGoalButton + DeleteGoalButton gain an iconOnly prop variant
(28px hit area with lucide Archive/Trash2 icons) — preserves existing
text-button consumers; card uses icon variant.

Position-dot suppressed when fraction <= 5% so it reads as a position
marker, not a generic leading indicator. Status pill colors via
color-mix() composition of --semantic-success / --semantic-caution
(success for hit; caution for behind/over; neutral grey for on-pace).

Test count delta: +7 (coaching-input). Old progress-bar.tsx deleted
(superseded by goal-progress.tsx).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T4 — /goals route rewrite + archived toggle

**Goal:** Rewrite `src/app/(app)/goals/page.tsx` to render new components in prototype order: header → sub copy → summary strip → active card list → "Add a goal" bottom CTA → archived toggle. New `<ArchivedToggle>` client component for show/hide state.

**Files:**
- Create: `src/components/goals/archived-toggle.tsx` (`'use client'`)
- Rewrite: `src/app/(app)/goals/page.tsx`

**Subtasks:**

- [ ] **Step 4.1 — Create `<ArchivedToggle>`**

```tsx
// src/components/goals/archived-toggle.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type Props = {
  count: number;
  children: ReactNode;
};

/**
 * Disclosure toggle for archived goals. Renders nothing when count=0.
 * Children are the archived card list — toggle only controls visibility.
 * Server provides the markup; client only owns the open state.
 */
export function ArchivedToggle({ count, children }: Props) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;

  return (
    <div className="border-t border-[--hairline] pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-[--text-2] hover:text-[--text]"
      >
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        {open ? 'Hide archived' : `Show archived (${count})`}
      </button>
      {open && (
        <div className="mt-4 space-y-3 opacity-70">{children}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4.2 — Rewrite `/goals/page.tsx`**

```tsx
// src/app/(app)/goals/page.tsx
import Link from 'next/link';
import { Plus, Target, ArrowRight } from 'lucide-react';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { ArchivedToggle } from '@/components/goals/archived-toggle';
import { GoalCard } from '@/components/goals/goal-card';
import { GoalsPageHeader } from '@/components/goals/goals-page-header';
import { GoalsSummaryStrip } from '@/components/goals/goals-summary-strip';
import { buildCoachingInput } from '@/lib/goals/coaching-input';
import { composeCoaching } from '@/lib/goals/coaching';
import { formatFreshness } from '@/lib/format/freshness';
import { paceVerdict, severityKey } from '@/lib/goals/pace';
import { getGoalsWithProgress } from '@/lib/db/queries/goals';
import { getBehindSavingsCoachingCategory } from '@/lib/db/queries/goal-detail';
import { getSourceHealth } from '@/lib/db/queries/health';

export default async function GoalsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  const [goals, sourceHealth, coachingCategory] = await Promise.all([
    getGoalsWithProgress(userId, { includeInactive: true }),
    getSourceHealth(userId),
    getBehindSavingsCoachingCategory(userId),
  ]);

  if (goals.length === 0) {
    return <EmptyState />;
  }

  // Partition by isActive; sort active by severity desc (urgent first)
  const active = goals
    .filter((g) => g.isActive)
    .sort((a, b) => severityKey(b) - severityKey(a));
  const archived = goals.filter((g) => !g.isActive);

  const freshness = formatFreshness({
    sources: sourceHealth.map((s) => ({
      name: s.institutionName ?? 'Source',
      lastSyncAt: s.lastSuccessfulSyncAt,
    })),
  });

  // Pre-compute verdict + coaching for each goal (avoids per-card recompute
  // and lets <GoalCard> stay presentational).
  const enriched = goals.map((g) => {
    const verdict = paceVerdict(g);
    const input = buildCoachingInput(g, verdict, coachingCategory);
    const coaching = input ? composeCoaching(input) : null;
    return { goal: g, verdict, coaching };
  });
  const activeEnriched = enriched.filter((e) => e.goal.isActive);
  const archivedEnriched = enriched.filter((e) => !e.goal.isActive);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <GoalsPageHeader
        freshnessHeadline={freshness.headline}
        freshnessCaveat={freshness.caveat}
      />
      <p className="text-sm text-[--text-2]">Targets you've committed to.</p>
      <GoalsSummaryStrip activeGoals={active} />

      <div className="space-y-3">
        {activeEnriched
          .sort((a, b) => severityKey(b.goal) - severityKey(a.goal))
          .map((e) => (
            <GoalCard
              key={e.goal.id}
              goal={e.goal}
              verdict={e.verdict}
              coaching={e.coaching}
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
        {archivedEnriched.map((e) => (
          <GoalCard
            key={e.goal.id}
            goal={e.goal}
            verdict={e.verdict}
            coaching={e.coaching}
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
```

The `<PaceLeaderboard>` import from T1's temporary mount is removed entirely; T5 deletes the component file.

- [ ] **Step 4.3 — Typecheck + tests**

```bash
npm run typecheck && npm run test 2>&1 | tail -5
```
Expected: clean. Test count unchanged from T3 commit.

- [ ] **Step 4.4 — Commit T4**

```bash
git add src/components/goals/archived-toggle.tsx \
        "src/app/(app)/goals/page.tsx"
git commit -m "$(cat <<'EOF'
feat(r3.1): T4 /goals route rewrite + archived toggle

Page rewritten to render the new card-per-goal IA: header → sub copy →
summary strip → active card list (sorted by severityKey desc) → "Add a
goal" bottom CTA → archived disclosure. Three-call Promise.all gathers
goals, source health, and the page-level top-discretionary coaching
category in parallel.

Each goal's verdict + coaching pre-computed at the page level
(paceVerdict + buildCoachingInput + composeCoaching) so GoalCard stays
presentational. Single coachingCategory fetch shared across all
behind-savings cards (N+1 risk resolved in SPEC brainstorming).

<ArchivedToggle> client component owns only open/close state; server
provides the archived card markup as children. Renders nothing when
archived.length === 0. Archived cards render at 70% opacity to
visually de-emphasize.

PaceLeaderboard temporary mount from T1 removed — component file
itself deletes in T5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T5 — Delete `/goals/[id]` + obsolete components

**Goal:** Detail page route deletion + cleanup of components and queries it exclusively consumed. Audit revalidatePath calls. Add redirect.

**Files:**
- Delete: `src/app/(app)/goals/[id]/page.tsx`
- Delete: `src/components/goals/pace-leaderboard.tsx`
- Delete: `src/components/goals/goal-row.tsx`
- Delete: `src/components/goals/coaching-card.tsx`
- Delete: `src/components/goals/projection-card.tsx`
- Delete: `src/components/goals/trajectory-chart.tsx`
- Delete: `src/components/goals/savings-feed.tsx`
- Delete: `src/components/goals/spend-cap-feed.tsx`
- Delete: `src/components/goals/detail-header.tsx`
- Delete: `src/lib/goals/trajectory.ts`
- Delete: `src/lib/goals/trajectory.test.ts`
- Trim: `src/lib/db/queries/goal-detail.ts` — drop functions only used by deleted feeds
- Modify: `next.config.js` — add `/goals/:id → /goals` redirect
- Modify: `src/lib/goals/actions.ts` — audit `revalidatePath('/goals/...')` calls
- Modify: `CLAUDE.md` — add R.3.1 note to Phase 3-pt3 entry

**Subtasks:**

- [ ] **Step 5.1 — Verify what `goal-detail.ts` queries are still used**

```bash
grep -rn "from.*db/queries/goal-detail" src/ --include="*.tsx" --include="*.ts"
```

For each function exported from `goal-detail.ts`, grep for consumers. Functions used only by deleted files can be removed. `getBehindSavingsCoachingCategory` IS still used (by /goals/page.tsx after T4) — keep it.

- [ ] **Step 5.2 — Delete the route + components + library files**

```bash
rm -rf "src/app/(app)/goals/[id]/page.tsx"
rm src/components/goals/pace-leaderboard.tsx \
   src/components/goals/goal-row.tsx \
   src/components/goals/coaching-card.tsx \
   src/components/goals/projection-card.tsx \
   src/components/goals/trajectory-chart.tsx \
   src/components/goals/savings-feed.tsx \
   src/components/goals/spend-cap-feed.tsx \
   src/components/goals/detail-header.tsx \
   src/lib/goals/trajectory.ts \
   src/lib/goals/trajectory.test.ts
```

**Important:** the `[id]` directory itself must NOT be deleted — `[id]/edit/page.tsx` survives. Only `[id]/page.tsx` (and any sibling files like `loading.tsx` if present) deletes.

```bash
# Check for sibling files in [id]/ that need removal
ls "src/app/(app)/goals/[id]/"
```

Expected: `edit/` directory only. If `loading.tsx` or similar exists at that level, delete it too.

- [ ] **Step 5.3 — Trim `goal-detail.ts` exports**

Open [src/lib/db/queries/goal-detail.ts](../../../src/lib/db/queries/goal-detail.ts). Remove any function that step 5.1's grep showed had zero remaining consumers. `getBehindSavingsCoachingCategory` stays. Likely candidates for removal: feed-data queries like `getSavingsWeeklyDeltas`, `getSpendCapTopTransactions` (exact names depend on the file).

- [ ] **Step 5.4 — Add /goals/:id redirect to `next.config.js`**

```js
// next.config.js — extend the existing redirects() array
async redirects() {
  return [
    { source: '/drift', destination: '/dashboard#drift', permanent: true },
    { source: '/insights', destination: '/dashboard#brief', permanent: true },
    {
      source: '/insights/:week',
      destination: '/dashboard?week=:week',
      permanent: true,
    },
    // R.3.1: /goals/[id] detail page folded into /goals card list
    { source: '/goals/:id', destination: '/goals', permanent: true },
  ];
},
```

**⚠️ Verify:** the `/goals/:id` pattern must not match `/goals/:id/edit` or `/goals/new`. Next.js redirect-rule matching is path-segment-precise; `/goals/:id` matches only single-segment paths after `/goals/`. `/goals/new` matches `/goals/:id` where `:id='new'` — this would intercept the new-goal route! Test:

```bash
# After modifying next.config.js, restart dev and verify:
curl -i http://localhost:3000/goals/new
# Expected: 200 (or 307 to /login if not authed), NOT 308 to /goals
curl -i http://localhost:3000/goals/abc123
# Expected: 308 to /goals
```

If `/goals/new` gets caught by the redirect, refine the rule. Options:
- Use a regex pattern that excludes 'new': `:id(?!new)` (Next.js supports regex constraints)
- Use `has` rules
- Add an explicit `/goals/new` pass-through entry BEFORE the redirect (Next.js evaluates in order)

Recommended: add explicit pass-through above:

```js
async redirects() {
  return [
    // ... other redirects ...
    // Negative match: /goals/new and /goals/:id/edit pass through;
    // any other /goals/:id pattern redirects.
    {
      source: '/goals/:id((?!new$).*)',
      destination: '/goals',
      permanent: true,
    },
  ];
}
```

This regex excludes `new` from matching. `/goals/:id/edit` doesn't match `/goals/:id` (it's a deeper path), so no special handling needed for edit.

- [ ] **Step 5.5 — Audit revalidatePath calls**

```bash
grep -n "revalidatePath" src/lib/goals/actions.ts
```

For each match, evaluate the path it revalidates:
- `revalidatePath('/goals')` — keep, /goals still exists
- `revalidatePath('/goals/${goalId}')` or similar — rewrite to `revalidatePath('/goals')` since detail page deleted
- `revalidatePath('/goals/${goalId}/edit')` — keep, /goals/[id]/edit still exists

Apply the rewrites inline.

- [ ] **Step 5.6 — Update CLAUDE.md roadmap entry**

Find the Phase 3-pt3 section in CLAUDE.md (search for "Phase 3-pt3"). Add a note that /goals/[id] was deleted in R.3.1:

```markdown
**Phase 3-pt3 — Per-goal coaching detail page** (2026-05-07 evening; ...)
- [existing content]
- **R.3.1 update (2026-05-10):** /goals/[id] detail page deleted as
  part of the goals IA shift to card-per-goal on /goals. Trajectory
  chart, contributing-data feed, and CoachingCard components removed.
  composeCoaching + walkBack — wait, walkBackTrajectory deleted with
  the chart. composeCoaching, paceVerdict, severityKey, and
  pickTopDiscretionaryCategory survive (relocated into goal-card
  consumers). See [docs/redesign/r3-1-goals/SPEC.md](docs/redesign/r3-1-goals/SPEC.md).
```

Use the Edit tool with a targeted before/after.

- [ ] **Step 5.7 — Typecheck + tests**

```bash
npm run typecheck && npm run test 2>&1 | tail -5
```
Expected: typecheck clean; test count drops by however many cases were in `trajectory.test.ts` (likely 5-10). Net test count after T2's +7 and T5's deletion ≈ baseline.

- [ ] **Step 5.8 — Browser sanity (dev server)**

```bash
npm run dev
# In another shell:
curl -i http://localhost:3000/goals/some-id-that-doesnt-matter
# Expected: 308 to /goals
curl -i http://localhost:3000/goals/new
# Expected: 200 or auth redirect (NOT 308 to /goals)
```

- [ ] **Step 5.9 — Commit T5**

```bash
git add next.config.js \
        src/lib/db/queries/goal-detail.ts \
        src/lib/goals/actions.ts \
        CLAUDE.md
git add -u  # stages all the deletions
git commit -m "$(cat <<'EOF'
feat(r3.1): T5 delete /goals/[id] + obsolete components

Removes /goals/[id] route + every component and pure helper exclusively
consumed by the deep-dive detail page. Card-per-goal IA on /goals (T4)
replaces the leaderboard + drill-into-detail flow entirely.

Deletes (route): src/app/(app)/goals/[id]/page.tsx
Deletes (components, src/components/goals/):
  pace-leaderboard, goal-row, coaching-card, projection-card,
  trajectory-chart, savings-feed, spend-cap-feed, detail-header
Deletes (pure logic): src/lib/goals/trajectory.{ts,test.ts}
Trims: src/lib/db/queries/goal-detail.ts — drops functions only used
  by deleted feeds. getBehindSavingsCoachingCategory stays (T4 page
  still consumes it for the savings-behind coaching path).

Redirect: /goals/:id → /goals permanent (308). Regex constraint
:id((?!new$).*) preserves /goals/new from incidental match.
/goals/[id]/edit unaffected (deeper path, no overlap).

revalidatePath audit: rewrites /goals/${id} invalidations to /goals
in src/lib/goals/actions.ts.

CLAUDE.md Phase 3-pt3 entry updated to note R.3.1 deletion and link
the SPEC. composeCoaching, paceVerdict, severityKey,
pickTopDiscretionaryCategory all survive (relocated into the card path).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T6 — Restyle `/goals/new` + `/goals/[id]/edit` forms

**Goal:** Visual restyle of `<GoalForm>` and the two pages that consume it. Foothold tokens, editorial page header (eyebrow + h1). No logic changes.

**Files:**
- Modify: `src/components/goals/goal-form.tsx`
- Modify: `src/app/(app)/goals/new/page.tsx`
- Modify: `src/app/(app)/goals/[id]/edit/page.tsx`

**Subtasks:**

- [ ] **Step 6.1 — Audit current form styling**

```bash
grep -n "className\|bg-\|text-" src/components/goals/goal-form.tsx | head -30
```

Identify rogue slate / shadcn-default classes (`bg-card`, `text-muted-foreground` etc.) that should map to Foothold tokens.

- [ ] **Step 6.2 — Restyle `<GoalForm>`**

Targeted edits in [src/components/goals/goal-form.tsx](../../../src/components/goals/goal-form.tsx):
- Section backgrounds: `bg-card` → `bg-[--surface]`
- Section borders: drop `border border-border` where present (Foothold cards are chrome-less)
- Field labels: `text-muted-foreground` → `text-[--text-2]`
- Helper text: `text-muted-foreground text-xs` → `text-[--text-3] text-xs`
- Spacing: `space-y-4` → `space-y-5` for breathing room (matches dashboard cards)
- Buttons: existing `<Button>` uses tailwind-config `bg-primary` which IS `hsl(var(--primary))` (works via config mapping); no change needed

The exact edits depend on the current file's structure — apply minimal changes targeting rogue classes only. Don't rewrite layout; logic must remain untouched.

- [ ] **Step 6.3 — Restyle `/goals/new` page**

```tsx
// src/app/(app)/goals/new/page.tsx
import { auth } from '@/auth';
import { GoalForm } from '@/components/goals/goal-form';
import { getActiveAccounts } from '@/lib/db/queries/accounts';
// keep any other existing imports

export default async function NewGoalPage() {
  const session = await auth();
  if (!session?.user) return null;
  const accounts = await getActiveAccounts(session.user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <header>
        <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Plan
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[--text]">
          New goal
        </h1>
      </header>
      <GoalForm accounts={accounts} />
    </div>
  );
}
```

Adapt to whatever existing data fetches the page does (e.g., `getActiveAccounts`). Don't change behavior, only chrome.

- [ ] **Step 6.4 — Restyle `/goals/[id]/edit` page**

Mirror the same header pattern in `/goals/[id]/edit/page.tsx`:

```tsx
return (
  <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
    <header>
      <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
        Plan
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[--text]">
        Edit goal
      </h1>
    </header>
    <GoalForm accounts={accounts} goal={goal} />
  </div>
);
```

Preserve the existing data fetch + `notFound()` guard for invalid id.

- [ ] **Step 6.5 — Typecheck + tests**

```bash
npm run typecheck && npm run test 2>&1 | tail -5
```
Expected: clean. No test changes.

- [ ] **Step 6.6 — Browser sanity**

Open http://localhost:3000/goals/new — verify chrome restyle, submit flow unchanged.
Open http://localhost:3000/goals/<an existing goal id>/edit — same check.

- [ ] **Step 6.7 — Commit T6**

```bash
git add src/components/goals/goal-form.tsx \
        "src/app/(app)/goals/new/page.tsx" \
        "src/app/(app)/goals/[id]/edit/page.tsx"
git commit -m "$(cat <<'EOF'
feat(r3.1): T6 restyle /goals/new + /goals/[id]/edit forms

Visual-only restyle of <GoalForm> + the two consumer pages. Foothold
tokens replace rogue shadcn defaults (bg-card → bg-[--surface]; muted-
foreground → --text-2 / --text-3). Editorial page header pattern
(eyebrow "Plan" + h1) matches R.3.1's /goals page identity.

No logic changes, no behavior changes. Form submit + delete + cancel
all preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T7 — UAT polish

**Goal:** Reserved fixup commits surfaced during the post-T6 UAT pass. Analogous to R.2's 10 polish commits.

**Process:**

- [ ] **Step 7.1 — Run full UAT pass against SPEC § UAT criteria**

Walk every checkbox in [SPEC.md § UAT criteria](SPEC.md#uat-criteria). Record failures.

- [ ] **Step 7.2 — Cross-check against the prototype**

Open [claude-design-context/foothold-goals.jsx](../../../claude-design-context/foothold-goals.jsx) side-by-side with the live /goals page. Note visual deltas. Decide which are bugs vs. acceptable variance.

- [ ] **Step 7.3 — Test the redirect**

```bash
curl -i http://localhost:3000/goals/non-existent-id
curl -i http://localhost:3000/goals/new
```
Expected: redirect to /goals on the first; pass-through on the second.

- [ ] **Step 7.4 — Verify revalidate paths with active mutations**

- Archive a goal → list should update without hard reload
- Restore from the archived toggle → moves back to active
- Delete a goal → list updates
- Edit a goal via /goals/[id]/edit → save → returns to /goals with updated card

- [ ] **Step 7.5 — Dark mode parity pass**

Toggle theme. Walk /goals. Verify cards, pills, progress bars, archived toggle, and forms all render correctly. Check status pill colors against `--semantic-success` (green) and `--semantic-caution` (amber) tokens.

- [ ] **Step 7.6 — `prefers-reduced-motion` audit**

DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`. Reload /goals. No motion to verify on this surface (no count-up animations) but check archived toggle expands cleanly without animation lag.

- [ ] **Step 7.7 — RSC boundary verification**

```bash
grep -rn "'use client'" src/components/goals/
```
Expected matches: `archive-goal-button.tsx`, `delete-goal-button.tsx`, `archived-toggle.tsx`, possibly `goal-form.tsx` (if existing). No `'use client'` on `goal-card.tsx`, `goal-progress.tsx`, `goals-page-header.tsx`, `goals-summary-strip.tsx`.

Run production build to surface any RSC serialization issues:
```bash
rm -rf .next
npm run build
```
Expected: clean.

- [ ] **Step 7.8 — Open questions from SPEC**

Review SPEC § "Open questions for T7 polish":
- Card density at 3+ goals — visually assess; defer compact mode unless cards feel crammed
- Status pill on-pace color — verify neutral grey reads correctly; consider subtle green tint if too muted
- Position dot at fraction=0 — verify suppression at <5% reads right
- Coaching slot for "hit" goals — verify the "You hit this goal" copy reads sensibly

- [ ] **Step 7.9 — Commit each fix as its own commit**

```bash
git add <touched files>
git commit -m "fix(r3.1): <terse description of issue>

<one or two sentences on root cause + fix>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Aim for 1-5 polish commits. R.2 hit 10 — R.3.1 should land fewer since the design surface is smaller and many R.2 lessons (HSL fragment trap, position-dot pattern, theme-aware tokens) are already absorbed in the plan above.

---

## Acceptance gates (full phase)

R.3.1 ships when:

1. ✅ All 7 tasks (T1-T7) committed atomically on `feat/r3-1-goals`
2. ✅ `npm run typecheck` passes
3. ✅ `npm run test` passes — baseline + ~7 (coaching-input) − ~5-10 (trajectory) ≈ baseline
4. ✅ `npm run build` produces a clean build
5. ✅ `npm run dev` renders /goals cleanly without console errors
6. ✅ Every checkbox in SPEC § UAT criteria checked
7. ✅ /goals/[id] redirects 308 to /goals; /goals/new + /goals/[id]/edit unaffected
8. ✅ Active goal mutations (archive / restore / delete / edit) revalidate /goals correctly
9. ✅ Dark + light mode parity verified on /goals + the two form pages
10. ✅ Branch ready to merge to `feat/redesign`

---

## Out of scope (explicit non-goals for R.3.1)

- Moves feature implementation → R.4 (the Moves slot is filled by coaching sentence in R.3.1)
- Other R.3 routes (Recurring, Transactions, Investments, Simulator, Settings) → R.3.2–R.3.6
- LLM-based coaching upgrades — composeCoaching stays pure/deterministic
- Mobile rebuild → R.5
- Goal sharing / multi-user features → multi-user readiness track
- `/goals/[id]/edit` IA changes — only visual restyle in T6

---

## Dependencies

**Upstream**: R.2 Dashboard shipped on `feat/redesign` (provides `formatFreshness`, `<PageHeader>` precedent, freshness token conventions).

**Downstream**: R.3.2–R.3.6 inherit the `formatFreshness` propagation pattern this phase consumes on a non-dashboard surface. R.4 Moves slot replaces the coaching-sentence slot established here.

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `/goals/:id` redirect catches `/goals/new` | Medium | T5 step 5.4 uses regex constraint `:id((?!new$).*)`; step 5.8 verifies via curl |
| `composeCoaching` per-card recompute on render | Low | T4 pre-computes verdict + coaching at page level (single Promise.all); cards receive resolved outputs |
| `buildCoachingInput` shape mismatch with `CoachingInput` union | Medium | T2 step 2.3 "verify before completing" check against coaching.ts type; tests in 2.1 cover happy paths |
| Archived goals' position dot at fraction=1 (hit savings, now archived) | Low | Suppression rule is `fraction > 0.05` — hit goals show the dot at right edge of bar |
| Build vs dev simultaneous run | Low | T7 step 7.7 explicit `rm -rf .next` before build |
| RSC boundary failure on `<GoalCard>` (strike-3 watch) | Low | GoalCard is server component; only `archived-toggle`, `archive-goal-button`, `delete-goal-button`, `goal-form` carry `'use client'`. None pass function props across boundary. |
| Coaching for `hit` savings reads stale | Low | composeCoaching `hit` branch is deterministic on hitDate (we pass projectedDate). T7 verifies real-data render. |
| Phase 3-pt3 detail page test coverage gone | Low | trajectory.test.ts cases delete with the module; expected per SPEC. composeCoaching/discretionary/pace tests survive. |

---

## Locked decisions (carried from SPEC.md)

1. **IA**: adopt prototype IA wholesale — rich card-per-goal on /goals
2. **/goals/[id]**: delete entirely; edit reachable via /goals/[id]/edit
3. **Moves slot**: composeCoaching sentence until R.4
4. **Archived**: "Show archived (N)" toggle below active list
5. **Freshness**: page-meta strip mirroring R.2 PageHeader

---

## Test plan summary

| Surface | Type | New cases |
|---|---|---|
| `src/lib/goals/coaching-input.ts` | Unit (vitest) | ~7 |
| `src/lib/goals/trajectory.ts` | DELETED | -5 to -10 |
| Component files (GoalCard, GoalProgress, etc.) | UAT only | 0 |
| `src/components/goals/archived-toggle.tsx` | UAT only | 0 |
| Form components (T6) | UAT only | 0 |

**Net**: roughly flat (+7 from coaching-input, −5 to −10 from trajectory removal). Target post-R.3.1: ~539–542.

---

## Cross-references

- [docs/redesign/r3-1-goals/SPEC.md](SPEC.md) — locked design decisions
- [docs/redesign/SPEC.md](../SPEC.md) — R.0 master spec
- [docs/redesign/r2-dashboard/PLAN.md](../r2-dashboard/PLAN.md) — precedent execution rhythm
- [claude-design-context/foothold-goals.jsx](../../../claude-design-context/foothold-goals.jsx) — canonical visual reference
- [CLAUDE.md](../../../CLAUDE.md) — Phase 3-pt3 + Phase 3-pt3.b for the surviving logic context
- [src/lib/goals/coaching.ts](../../../src/lib/goals/coaching.ts) — CoachingInput / CoachingOutput type definitions referenced throughout
- [src/lib/goals/pace.ts](../../../src/lib/goals/pace.ts) — PaceVerdict + severityKey + paceVerdict definitions
