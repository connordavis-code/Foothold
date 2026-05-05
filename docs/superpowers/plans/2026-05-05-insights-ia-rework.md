# /insights IA Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `/insights` from a single-narrative card into a latest-read + drilldown surface — narrative stays the editorial hero, supplements render below as conditional tiles linking to `/drift`, `/goals`, `/recurring`, and a footer earlier-weeks list enables history browsing via `?week=YYYY-MM-DD`.

**Architecture:** UI/IA-only change. New: pure-predicate modules (week param, button mode, tile visibility, first-sentence extract), one new server-side query (`getInsightSupplements`), one query extension (`getInsightsForArchive`), parameterized drift anchor, and 9 new presentational components. No schema changes, no new server actions, no changes to generation/cron paths.

**Tech Stack:** Next.js 14 (App Router, RSC) · TypeScript strict · Drizzle ORM · vitest 4 · Tailwind + shadcn tokens (`rounded-card`, `bg-surface-elevated`, `font-serif` reserved for narrative).

**Spec:** [`docs/superpowers/specs/2026-05-05-insights-ia-rework-design.md`](../specs/2026-05-05-insights-ia-rework-design.md).

---

## File map

**New files (16):**

| Path | Responsibility |
|---|---|
| `src/lib/utils/first-sentence.ts` | Pure `firstSentence(narrative)` helper. |
| `src/lib/utils/first-sentence.test.ts` | vitest cases. |
| `src/lib/insights/types.ts` | `InsightSupplements` type. Imported by tile-visibility + supplements query. |
| `src/lib/insights/week-param.ts` | Pure `resolveWeekParam(param)` shape validator. |
| `src/lib/insights/week-param.test.ts` | vitest cases. |
| `src/lib/insights/button-mode.ts` | Pure `resolveButtonMode({hasDisplayedInsight,isPastWeekView})`. |
| `src/lib/insights/button-mode.test.ts` | vitest cases. |
| `src/lib/insights/tile-visibility.ts` | Pure `getVisibleTiles(supplements)` + `tileGridIsSingleColumn`. |
| `src/lib/insights/tile-visibility.test.ts` | vitest cases. |
| `src/lib/db/queries/insight-supplements.ts` | `getInsightSupplements(userId, weekStart, weekEnd)` server query. |
| `src/components/insights/header-block.tsx` | Eyebrow + title + subtitle + GenerateButton wrapper. |
| `src/components/insights/past-week-banner.tsx` | Conditional banner for `?week`. |
| `src/components/insights/narrative-article.tsx` | Article card; owns stale-week chip. |
| `src/components/insights/receipts-section.tsx` | Eyebrow + grid wrapper. Renders tiles per visibility. |
| `src/components/insights/earlier-weeks.tsx` | Footer list of past insights. |
| `src/components/insights/tiles/spending-tile.tsx` | Always-on tile. |
| `src/components/insights/tiles/drift-tile.tsx` | Conditional tile. |
| `src/components/insights/tiles/goals-tile.tsx` | Conditional tile. |
| `src/components/insights/tiles/recurring-tile.tsx` | Conditional tile. |

**Modified (6):**

| Path | Change |
|---|---|
| `src/lib/db/queries/insights.ts` | Add `getInsightsForArchive`. Existing exports unchanged. |
| `src/lib/db/queries/drift.ts` | `getDriftAnalysis` accepts optional `endAnchor`. Default = `yesterday()`. |
| `src/components/insights/generate-button.tsx` | Accepts `mode: 'generate' \| 'regenerate' \| 'back'`. Strips `?week=` on success. |
| `src/components/dashboard/insight-teaser-card.tsx` | Inline `firstSentence` removed; imports from `@/lib/utils/first-sentence`. |
| `src/app/(app)/insights/page.tsx` | Rewritten. |
| `src/app/(app)/insights/loading.tsx` | Skeleton mirrors new layout. |

**Untouched:** `src/lib/insights/generate.ts`, `src/lib/insights/actions.ts`, `src/lib/anthropic/insights.ts`, `src/lib/db/queries/insights-data.ts`, `src/app/api/cron/insight/route.ts`, schema, dashboard composition.

---

## Test convention reference

- Tests live colocated next to source: `src/foo/bar.ts` ↔ `src/foo/bar.test.ts`. `vitest.config.ts` matches `src/**/*.test.ts`.
- Imports: `import { describe, expect, it } from 'vitest';` — sibling import for the unit under test (`./bar`); `@/...` for cross-module.
- Run a single file: `npx vitest run src/lib/insights/week-param.test.ts`.
- Run the whole suite: `npm test`.

---

## Task 1 — Extract `firstSentence` to a shared util

**Files:**
- Create: `src/lib/utils/first-sentence.ts`
- Create: `src/lib/utils/first-sentence.test.ts`

Extracts the inline implementation from `src/components/dashboard/insight-teaser-card.tsx` so both the dashboard teaser and the new earlier-weeks list reuse it.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/utils/first-sentence.test.ts
import { describe, expect, it } from 'vitest';
import { firstSentence } from './first-sentence';

describe('firstSentence', () => {
  it('returns null for empty input', () => {
    expect(firstSentence('')).toBeNull();
    expect(firstSentence('   ')).toBeNull();
    expect(firstSentence('\n\n')).toBeNull();
  });

  it('cuts at the first period+space boundary', () => {
    expect(firstSentence('Spending was up. The rest of the week stayed flat.')).toBe(
      'Spending was up.',
    );
  });

  it('cuts at the first newline when no period+space precedes it', () => {
    expect(firstSentence('Top line summary\nThen a second paragraph.')).toBe(
      'Top line summary',
    );
  });

  it('prefers period+space when both period and newline exist', () => {
    expect(firstSentence('Short. Long\ntail.')).toBe('Short.');
  });

  it('prefers newline when newline comes first', () => {
    expect(firstSentence('Top line\nSecond line. Third.')).toBe('Top line');
  });

  it('truncates to 200 chars when no boundary is found', () => {
    const wall = 'a'.repeat(300);
    const result = firstSentence(wall);
    expect(result).toHaveLength(200);
    expect(result).toBe('a'.repeat(200));
  });

  it('trims leading whitespace before measuring', () => {
    expect(firstSentence('  Hello. World.')).toBe('Hello.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/first-sentence.test.ts`
Expected: FAIL with `Cannot find module './first-sentence'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/utils/first-sentence.ts

/**
 * Pull the first sentence from a free-form narrative. Used by the
 * dashboard teaser card and the /insights earlier-weeks list — both
 * want a one-line preview, not the whole body.
 *
 * Boundary order:
 *   1. First "period+space" — keeps "U.S." style abbreviations intact.
 *   2. Else first newline — handles paragraph breaks.
 *   3. Else 200-char truncation — soft cap on prose without punctuation.
 */
export function firstSentence(narrative: string): string | null {
  const trimmed = narrative.trim();
  if (!trimmed) return null;

  const periodIdx = trimmed.indexOf('. ');
  const newlineIdx = trimmed.indexOf('\n');

  let cut = -1;
  if (periodIdx > 0 && (newlineIdx === -1 || periodIdx < newlineIdx)) {
    cut = periodIdx + 1;
  } else if (newlineIdx > 0) {
    cut = newlineIdx;
  }

  if (cut === -1) return trimmed.slice(0, 200);
  return trimmed.slice(0, cut);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/first-sentence.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/first-sentence.ts src/lib/utils/first-sentence.test.ts
git commit -m "feat(utils): extract firstSentence helper for reuse"
```

---

## Task 2 — Update teaser card to consume shared helper

**Files:**
- Modify: `src/components/dashboard/insight-teaser-card.tsx`

Removes the inline `firstSentence` implementation; imports from the shared util. No behavior change.

- [ ] **Step 1: Replace the inline helper**

In `src/components/dashboard/insight-teaser-card.tsx`:

- Add import at top of file:
  ```ts
  import { firstSentence } from '@/lib/utils/first-sentence';
  ```
- Delete the entire `function firstSentence(...) { ... }` block at the bottom of the file.
- The existing call site `const lead = firstSentence(insight.narrative);` works unchanged.

- [ ] **Step 2: Verify the rest of the file is clean**

Run: `npx tsc --noEmit`
Expected: clean — no unused imports, no missing references.

- [ ] **Step 3: Run vitest to ensure no regression**

Run: `npm test`
Expected: all existing tests + Task 1's 7 new tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/insight-teaser-card.tsx
git commit -m "refactor(dashboard): use shared firstSentence util in insight teaser"
```

---

## Task 3 — Pure `resolveWeekParam` validator

**Files:**
- Create: `src/lib/insights/week-param.ts`
- Create: `src/lib/insights/week-param.test.ts`

Shape-only validation of the `?week` searchParam. Existence-against-DB is the page's job, not this module's.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/insights/week-param.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveWeekParam } from './week-param';

describe('resolveWeekParam', () => {
  beforeAll(() => {
    // Freeze "today" at 2026-05-05 UTC for the future-date branch.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T12:00:00Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns null for undefined / empty input', () => {
    expect(resolveWeekParam(undefined)).toBeNull();
    expect(resolveWeekParam('')).toBeNull();
  });

  it('returns the date for a well-formed past YYYY-MM-DD', () => {
    expect(resolveWeekParam('2026-04-27')).toBe('2026-04-27');
    expect(resolveWeekParam('2026-01-01')).toBe('2026-01-01');
  });

  it('returns the date for today', () => {
    expect(resolveWeekParam('2026-05-05')).toBe('2026-05-05');
  });

  it('returns null for malformed strings', () => {
    expect(resolveWeekParam('foo')).toBeNull();
    expect(resolveWeekParam('2026/05/05')).toBeNull();
    expect(resolveWeekParam('2026-5-5')).toBeNull();
    expect(resolveWeekParam('05-05-2026')).toBeNull();
  });

  it('returns null for impossible calendar dates', () => {
    expect(resolveWeekParam('2026-13-01')).toBeNull();
    expect(resolveWeekParam('2026-02-30')).toBeNull();
    expect(resolveWeekParam('2026-13-99')).toBeNull();
  });

  it('returns null for future dates', () => {
    expect(resolveWeekParam('2026-05-06')).toBeNull();
    expect(resolveWeekParam('2099-01-01')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/insights/week-param.test.ts`
Expected: FAIL with `Cannot find module './week-param'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/insights/week-param.ts

const WEEK_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate the shape of a `?week` searchParam from /insights.
 * Returns the date string if it's a well-formed, real, non-future
 * YYYY-MM-DD; otherwise null.
 *
 * Existence-against-DB is NOT this module's concern — the page passes
 * the result to getInsightForWeek() and falls back to latest if that
 * returns null.
 */
export function resolveWeekParam(param: string | undefined): string | null {
  if (!param) return null;
  if (!WEEK_PARAM_RE.test(param)) return null;

  const date = new Date(`${param}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  // Round-trip rejects values like '2026-13-99' that Date silently
  // shifts into a different valid date.
  if (date.toISOString().slice(0, 10) !== param) return null;

  // Future dates have no insight rows by construction; reject defensively
  // so the page never wastes a DB roundtrip on them.
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (param > todayUtc) return null;

  return param;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/insights/week-param.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/week-param.ts src/lib/insights/week-param.test.ts
git commit -m "feat(insights): add resolveWeekParam shape validator"
```

---

## Task 4 — Pure `resolveButtonMode`

**Files:**
- Create: `src/lib/insights/button-mode.ts`
- Create: `src/lib/insights/button-mode.test.ts`

Determines which of the three GenerateButton modes applies for a given page state.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/insights/button-mode.test.ts
import { describe, expect, it } from 'vitest';
import { resolveButtonMode } from './button-mode';

describe('resolveButtonMode', () => {
  it('returns "generate" when no insight is displayed', () => {
    expect(
      resolveButtonMode({ hasDisplayedInsight: false, isPastWeekView: false }),
    ).toBe('generate');
  });

  it('returns "regenerate" when displaying current/latest', () => {
    expect(
      resolveButtonMode({ hasDisplayedInsight: true, isPastWeekView: false }),
    ).toBe('regenerate');
  });

  it('returns "back" when displaying a past week', () => {
    expect(
      resolveButtonMode({ hasDisplayedInsight: true, isPastWeekView: true }),
    ).toBe('back');
  });

  // Defensive: this combo shouldn't occur (past-week views require a
  // resolved insight to display) but the resolver shouldn't blow up.
  it('returns "generate" for the impossible (no insight + past-week) state', () => {
    expect(
      resolveButtonMode({ hasDisplayedInsight: false, isPastWeekView: true }),
    ).toBe('generate');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/insights/button-mode.test.ts`
Expected: FAIL with `Cannot find module './button-mode'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/insights/button-mode.ts

export type ButtonMode = 'generate' | 'regenerate' | 'back';

type Args = {
  hasDisplayedInsight: boolean;
  isPastWeekView: boolean;
};

/**
 * Decide which mode the /insights GenerateButton should render in.
 *
 *   no insight                   → 'generate'
 *   latest displayed             → 'regenerate'
 *   past week (?week) displayed  → 'back' (Link, no action)
 *
 * The page computes `isPastWeekView` only when ?week resolved AND the
 * displayed insight matches that week (not the silent-fallback case).
 */
export function resolveButtonMode({
  hasDisplayedInsight,
  isPastWeekView,
}: Args): ButtonMode {
  if (!hasDisplayedInsight) return 'generate';
  if (isPastWeekView) return 'back';
  return 'regenerate';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/insights/button-mode.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/button-mode.ts src/lib/insights/button-mode.test.ts
git commit -m "feat(insights): add resolveButtonMode predicate"
```

---

## Task 5 — `InsightSupplements` type module

**Files:**
- Create: `src/lib/insights/types.ts`

Type-only module shared by tile-visibility (consumer) and the supplements query (producer). Defining it standalone lets Tasks 6 and 9 reference the same type without circular imports.

- [ ] **Step 1: Write the type module**

```ts
// src/lib/insights/types.ts
import type { GoalType } from '@/lib/db/queries/goals';

/**
 * Structured numbers that back the /insights "What Claude saw" section.
 * Built by getInsightSupplements() at request time (no persistence —
 * see spec Approach 1: live recompute for past weeks is acceptable).
 *
 * Each sub-object carries enough data for its tile to render PLUS the
 * predicate fields (`hasBaseline`, `activeCount`, etc.) that the
 * tile-visibility module reads.
 */
export type InsightSupplements = {
  spending: {
    totalThisWeek: number;
    /** (totalThisWeek) - (median weekly across the prior 4 weeks). null if no baseline. */
    deltaVsBaseline: number | null;
    /** Top 3 by total. */
    topCategories: { category: string; total: number }[];
  };
  drift: {
    elevated: {
      category: string;
      ratio: number;
      currentTotal: number;
      baselineWeekly: number;
    }[];
    /** False if user has <4 weeks of any spend → flagging is meaningless. */
    hasBaseline: boolean;
  };
  goals: {
    activeCount: number;
    onPaceCount: number;
    /** Up to 2 goals worst-pace-first; empty when activeCount === 0. */
    notable: { name: string; pacePct: number; type: GoalType }[];
  };
  recurring: {
    hitThisWeekCount: number;
    hitThisWeekTotal: number;
    monthlyTotal: number;
  };
};
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/insights/types.ts
git commit -m "feat(insights): define InsightSupplements shared type"
```

---

## Task 6 — Pure `getVisibleTiles`

**Files:**
- Create: `src/lib/insights/tile-visibility.ts`
- Create: `src/lib/insights/tile-visibility.test.ts`

Predicate: which receipt tiles render for a given supplements payload.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/insights/tile-visibility.test.ts
import { describe, expect, it } from 'vitest';
import type { InsightSupplements } from './types';
import { getVisibleTiles, tileGridIsSingleColumn } from './tile-visibility';

function baseSupplements(
  overrides: Partial<InsightSupplements> = {},
): InsightSupplements {
  return {
    spending: { totalThisWeek: 0, deltaVsBaseline: null, topCategories: [] },
    drift: { elevated: [], hasBaseline: false },
    goals: { activeCount: 0, onPaceCount: 0, notable: [] },
    recurring: { hitThisWeekCount: 0, hitThisWeekTotal: 0, monthlyTotal: 0 },
    ...overrides,
  };
}

describe('getVisibleTiles', () => {
  it('always renders spending', () => {
    expect(getVisibleTiles(baseSupplements()).spending).toBe(true);
  });

  it('hides drift when baseline is sparse', () => {
    const v = getVisibleTiles(
      baseSupplements({
        drift: {
          hasBaseline: false,
          elevated: [
            { category: 'FOOD', ratio: 2, currentTotal: 100, baselineWeekly: 50 },
          ],
        },
      }),
    );
    expect(v.drift).toBe(false);
  });

  it('hides drift when elevated list is empty even with a baseline', () => {
    const v = getVisibleTiles(
      baseSupplements({ drift: { hasBaseline: true, elevated: [] } }),
    );
    expect(v.drift).toBe(false);
  });

  it('shows drift when baseline exists and at least one category is elevated', () => {
    const v = getVisibleTiles(
      baseSupplements({
        drift: {
          hasBaseline: true,
          elevated: [
            { category: 'FOOD', ratio: 2, currentTotal: 100, baselineWeekly: 50 },
          ],
        },
      }),
    );
    expect(v.drift).toBe(true);
  });

  it('shows goals iff activeCount > 0', () => {
    expect(getVisibleTiles(baseSupplements()).goals).toBe(false);
    const withGoals = getVisibleTiles(
      baseSupplements({
        goals: { activeCount: 2, onPaceCount: 1, notable: [] },
      }),
    );
    expect(withGoals.goals).toBe(true);
  });

  it('shows recurring iff monthlyTotal > 0', () => {
    expect(getVisibleTiles(baseSupplements()).recurring).toBe(false);
    const withRecurring = getVisibleTiles(
      baseSupplements({
        recurring: { hitThisWeekCount: 0, hitThisWeekTotal: 0, monthlyTotal: 25 },
      }),
    );
    expect(withRecurring.recurring).toBe(true);
  });

  it('reports single-column when only spending is visible', () => {
    const v = getVisibleTiles(baseSupplements());
    expect(tileGridIsSingleColumn(v)).toBe(true);
  });

  it('reports multi-column when any other tile is visible', () => {
    const v = getVisibleTiles(
      baseSupplements({
        goals: { activeCount: 1, onPaceCount: 1, notable: [] },
      }),
    );
    expect(tileGridIsSingleColumn(v)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/insights/tile-visibility.test.ts`
Expected: FAIL with `Cannot find module './tile-visibility'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/insights/tile-visibility.ts
import type { InsightSupplements } from './types';

export type VisibleTiles = {
  spending: true;
  drift: boolean;
  goals: boolean;
  recurring: boolean;
};

/**
 * Decide which receipt tiles should render. Spending always shows
 * (anchor metric). Other tiles gate on having data worth showing,
 * mirroring the LLM prompt's "skip empty areas" rule.
 */
export function getVisibleTiles(s: InsightSupplements): VisibleTiles {
  return {
    spending: true,
    drift: s.drift.hasBaseline && s.drift.elevated.length > 0,
    goals: s.goals.activeCount > 0,
    recurring: s.recurring.monthlyTotal > 0,
  };
}

/** True when only the always-on Spending tile is visible. */
export function tileGridIsSingleColumn(v: VisibleTiles): boolean {
  return !v.drift && !v.goals && !v.recurring;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/insights/tile-visibility.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/tile-visibility.ts src/lib/insights/tile-visibility.test.ts
git commit -m "feat(insights): add getVisibleTiles tile-visibility predicate"
```

---

## Task 7 — Parameterize `getDriftAnalysis` with optional `endAnchor`

**Files:**
- Modify: `src/lib/db/queries/drift.ts`

Currently the function anchors on `yesterday()`. Past-week supplements need elevation detection anchored on the viewed week's end. Add an optional 3rd argument; default preserves current behavior.

- [ ] **Step 1: Modify the function signature**

In `src/lib/db/queries/drift.ts`, find:

```ts
export async function getDriftAnalysis(
  userId: string,
  visibleWeeks: number = DEFAULT_HISTORY_WEEKS,
): Promise<DriftAnalysis> {
  const endAnchor = yesterday();
```

Replace with:

```ts
export async function getDriftAnalysis(
  userId: string,
  visibleWeeks: number = DEFAULT_HISTORY_WEEKS,
  endAnchor?: string,
): Promise<DriftAnalysis> {
  const anchor = endAnchor ?? yesterday();
```

- [ ] **Step 2: Replace remaining `endAnchor` references**

In the same function body, change `buildWeekWindows(endAnchor, visibleWeeks)` to `buildWeekWindows(anchor, visibleWeeks)`. There should be only one such call site in this function.

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean. The existing `/drift` page caller (`getDriftAnalysis(session.user.id)`) is unaffected because the new arg is optional.

- [ ] **Step 4: Verify existing tests still pass**

Run: `npm test`
Expected: all previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/drift.ts
git commit -m "feat(drift): allow getDriftAnalysis to anchor on a custom week end"
```

---

## Task 8 — Add `getInsightsForArchive`

**Files:**
- Modify: `src/lib/db/queries/insights.ts`

Footer query: most recent 6 insight rows with the narrative truncated to 400 chars (enough for `firstSentence` extraction without loading full bodies).

- [ ] **Step 1: Add the new export**

Append to `src/lib/db/queries/insights.ts` (do NOT edit `getLatestInsight` or `getInsightForWeek`):

```ts
export type ArchiveEntry = {
  weekStart: string;
  weekEnd: string;
  generatedAt: Date;
  narrativePreview: string;
};

/**
 * Most recent insight rows for the earlier-weeks footer on /insights.
 * Returns up to `limit` rows ordered newest-first. Narrative is
 * truncated in SQL to 400 chars — enough for firstSentence() to
 * extract a one-line preview without pulling full bodies.
 */
export async function getInsightsForArchive(
  userId: string,
  limit: number = 6,
): Promise<ArchiveEntry[]> {
  const rows = await db
    .select({
      weekStart: insights.weekStart,
      weekEnd: insights.weekEnd,
      generatedAt: insights.generatedAt,
      narrativePreview: sql<string>`SUBSTRING(${insights.narrative} FROM 1 FOR 400)`,
    })
    .from(insights)
    .where(eq(insights.userId, userId))
    .orderBy(desc(insights.weekStart))
    .limit(limit);

  return rows;
}
```

- [ ] **Step 2: Add the `sql` import (if not already present)**

Ensure the top of the file imports the `sql` template tag:

```ts
import { and, desc, eq, sql } from 'drizzle-orm';
```

(File already imports `and, desc, eq` — just append `sql` if missing.)

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Verify all tests still pass**

Run: `npm test`
Expected: all previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/insights.ts
git commit -m "feat(insights): add getInsightsForArchive footer query"
```

---

## Task 9 — Build `getInsightSupplements`

**Files:**
- Create: `src/lib/db/queries/insight-supplements.ts`

The receipts data fetcher. Reuses `getDriftAnalysis` (now parameterized), `getGoalsWithProgress`, and `getRecurringStreams`. Computes spending stats inline with the same SQL idiom as `collectSnapshot`.

- [ ] **Step 1: Write the module**

```ts
// src/lib/db/queries/insight-supplements.ts
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  plaidItems,
  transactions,
} from '@/lib/db/schema';
import type { InsightSupplements } from '@/lib/insights/types';
import { getDriftAnalysis } from './drift';
import { getGoalsWithProgress } from './goals';
import {
  frequencyToMonthlyMultiplier,
  getRecurringStreams,
} from './recurring';

const DAY_MS = 24 * 60 * 60 * 1000;

function shiftDate(yyyymmdd: string, deltaDays: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Build the receipts payload that backs /insights's "What Claude saw"
 * section for a single week.
 *
 * Spending: same SQL idiom as collectSnapshot. We compute median
 * weekly per category across the prior 4 weeks for the deltaVsBaseline
 * line.
 *
 * Drift: delegated to getDriftAnalysis with endAnchor=weekEnd.
 *
 * Goals: getGoalsWithProgress + a pace-percent derivation per goal.
 *
 * Recurring: getRecurringStreams; monthlyTotal sums normalized
 * frequency multipliers, hitThisWeek* counts streams whose lastDate
 * falls inside [weekStart, weekEnd].
 */
export async function getInsightSupplements(
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<InsightSupplements> {
  const baselineStart = shiftDate(weekStart, -28);
  const baselineEnd = shiftDate(weekStart, -1);

  const [thisWeekRows, baselineRows, drift, goals, recurring] = await Promise.all([
    db
      .select({
        category: sql<string>`COALESCE(${transactions.primaryCategory}, 'UNCATEGORIZED')`,
        total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
      })
      .from(transactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(
        and(
          eq(plaidItems.userId, userId),
          gte(transactions.date, weekStart),
          lte(transactions.date, weekEnd),
          sql`${transactions.amount}::numeric > 0`,
          sql`${financialAccounts.type} != 'investment'`,
          sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
        ),
      )
      .groupBy(sql`COALESCE(${transactions.primaryCategory}, 'UNCATEGORIZED')`),

    db
      .select({
        date: transactions.date,
        amount: transactions.amount,
      })
      .from(transactions)
      .innerJoin(
        financialAccounts,
        eq(financialAccounts.id, transactions.accountId),
      )
      .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
      .where(
        and(
          eq(plaidItems.userId, userId),
          gte(transactions.date, baselineStart),
          lte(transactions.date, baselineEnd),
          sql`${transactions.amount}::numeric > 0`,
          sql`${financialAccounts.type} != 'investment'`,
          sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
        ),
      ),

    getDriftAnalysis(userId, 8, weekEnd),
    getGoalsWithProgress(userId),
    getRecurringStreams(userId),
  ]);

  // ─── Spending ─────────────────────────────────────────────────────
  const totalThisWeek = thisWeekRows.reduce(
    (acc, r) => acc + Number(r.total),
    0,
  );
  const topCategories = thisWeekRows
    .map((r) => ({ category: r.category, total: Number(r.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const baselineTotalsByWeek = new Map<number, number>();
  for (const r of baselineRows) {
    const weekIdx = Math.floor(
      (Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${baselineStart}T00:00:00Z`)) /
        (7 * DAY_MS),
    );
    baselineTotalsByWeek.set(
      weekIdx,
      (baselineTotalsByWeek.get(weekIdx) ?? 0) + Number(r.amount),
    );
  }
  const weeklyTotals = [0, 1, 2, 3].map((i) => baselineTotalsByWeek.get(i) ?? 0);
  const sortedTotals = [...weeklyTotals].sort((a, b) => a - b);
  // Median of 4 weeks = avg of the 2nd and 3rd values (sorted).
  const medianBaseline = (sortedTotals[1] + sortedTotals[2]) / 2;
  const deltaVsBaseline =
    baselineRows.length === 0 ? null : totalThisWeek - medianBaseline;

  // ─── Drift ───────────────────────────────────────────────────────
  const elevated = drift.currentlyElevated.map((f) => ({
    category: f.category,
    ratio: f.ratio,
    currentTotal: f.currentTotal,
    baselineWeekly: f.baselineWeekly,
  }));

  // ─── Goals ───────────────────────────────────────────────────────
  const activeGoals = goals.filter((g) => g.isActive);
  const goalNotable = activeGoals
    .map((g) => ({
      name: g.name,
      type: g.type,
      pacePct: paceForGoal(g),
    }))
    .sort((a, b) => a.pacePct - b.pacePct)
    .slice(0, 2);
  const onPaceCount = activeGoals.filter((g) => paceForGoal(g) >= 1).length;

  // ─── Recurring ───────────────────────────────────────────────────
  // RecurringStreamRow exposes `direction: 'inflow' | 'outflow'` and
  // `isActive: boolean`. Mirror getMonthlyRecurringOutflow's filter: only
  // active outflows count toward monthlyTotal. averageAmount is already
  // normalized to number | null in getRecurringStreams's mapping.
  const outflows = recurring.filter(
    (s) => s.direction === 'outflow' && s.isActive,
  );
  const monthlyTotal = outflows.reduce((acc, s) => {
    const avg = s.averageAmount ?? 0;
    return acc + avg * frequencyToMonthlyMultiplier(s.frequency);
  }, 0);
  const hitThisWeekStreams = outflows.filter(
    (s) => s.lastDate != null && s.lastDate >= weekStart && s.lastDate <= weekEnd,
  );
  const hitThisWeekTotal = hitThisWeekStreams.reduce(
    (acc, s) => acc + (s.lastAmount ?? 0),
    0,
  );

  return {
    spending: { totalThisWeek, deltaVsBaseline, topCategories },
    drift: { elevated, hasBaseline: !drift.baselineSparse },
    goals: {
      activeCount: activeGoals.length,
      onPaceCount,
      notable: goalNotable,
    },
    recurring: {
      hitThisWeekCount: hitThisWeekStreams.length,
      hitThisWeekTotal,
      monthlyTotal,
    },
  };
}

/**
 * Pace as a comparable number where 1.0 = "on pace".
 *
 *   savings: months-remaining-by-target-date / months-remaining-at-velocity.
 *            >1 = ahead, 1 = on pace, <1 = behind. 0 if velocity ≤ 0.
 *            Defaults to 1 when there's no targetDate (no concept of pace).
 *   spend_cap: 1 if spent ≤ cap, else 0. Binary because SpendCapProgress
 *              doesn't expose month-progress fields here; finer pace
 *              measurement belongs on /goals proper.
 */
function paceForGoal(goal: {
  type: 'savings' | 'spend_cap';
  targetDate: string | null;
  progress: import('./goals').GoalProgress;
}): number {
  if (goal.progress.type === 'spend_cap') {
    return goal.progress.cap > 0 && goal.progress.spent <= goal.progress.cap
      ? 1
      : 0;
  }
  // savings
  if (goal.targetDate == null) return 1;
  if (goal.progress.monthsToTarget == null) return 0; // velocity ≤ 0
  const monthsRemainingByDate = monthsBetween(
    new Date().toISOString().slice(0, 10),
    goal.targetDate,
  );
  if (monthsRemainingByDate <= 0) return goal.progress.fraction >= 1 ? 1 : 0;
  return monthsRemainingByDate / goal.progress.monthsToTarget;
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return (to.getTime() - from.getTime()) / (30 * DAY_MS);
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify tests still pass**

Run: `npm test`
Expected: all previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/insight-supplements.ts
git commit -m "feat(insights): add getInsightSupplements receipts query"
```

---

## Task 10 — Update `<GenerateButton>` with `mode` prop

**Files:**
- Modify: `src/components/insights/generate-button.tsx`

Three modes: `generate` / `regenerate` / `back`. The `back` mode renders as a Link with no action. After a successful generate/regenerate, navigates to `/insights` to strip any `?week=` from the URL.

- [ ] **Step 1: Read the current implementation**

Inspect `src/components/insights/generate-button.tsx`. Note that it already calls `generateInsightAction()` and surfaces inline errors. We're widening props, not rewriting.

- [ ] **Step 2: Replace the file with the new implementation**

```tsx
// src/components/insights/generate-button.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { generateInsightAction } from '@/lib/insights/actions';
import { Button } from '@/components/ui/button';
import type { ButtonMode } from '@/lib/insights/button-mode';

type Props = {
  mode: ButtonMode;
};

export function GenerateButton({ mode }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (mode === 'back') {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/insights" className="inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to current week
        </Link>
      </Button>
    );
  }

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        await generateInsightAction();
        // Strip any ?week= so the user lands on the just-generated narrative.
        router.push('/insights');
        router.refresh();
      } catch (err) {
        // generateInsightForUser throws caller-friendly Error messages
        // (see src/lib/insights/generate.ts).
        setError(err instanceof Error ? err.message : 'Failed to generate');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        size="sm"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isPending
          ? 'Generating…'
          : mode === 'regenerate'
          ? 'Regenerate'
          : 'Generate insights'}
      </Button>
      {error && (
        <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
```

> Note: `generateInsightAction()` throws caller-friendly Error messages (it does not return an `{error: ...}` shape). The try/catch above is correct.

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npx next lint`
Expected: clean. (`hasExisting` was the old prop name; if any other component still passes it, the typecheck will catch it. Page rewrite in Task 20 owns the only call site.)

- [ ] **Step 4: Commit**

```bash
git add src/components/insights/generate-button.tsx
git commit -m "feat(insights): add three-mode GenerateButton (generate/regenerate/back)"
```

---

## Task 11 — Header components: `<HeaderBlock>` + `<PastWeekBanner>` + `<NarrativeArticle>`

**Files:**
- Create: `src/components/insights/header-block.tsx`
- Create: `src/components/insights/past-week-banner.tsx`
- Create: `src/components/insights/narrative-article.tsx`

Three small server components that compose with the rewritten page.

- [ ] **Step 1: Create `<HeaderBlock>`**

```tsx
// src/components/insights/header-block.tsx
import type { ButtonMode } from '@/lib/insights/button-mode';
import { GenerateButton } from './generate-button';

type Props = {
  mode: 'current' | 'past';
  buttonMode: ButtonMode;
};

export function HeaderBlock({ mode, buttonMode }: Props) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
          {mode === 'current' ? 'Today' : 'Archived'}
        </p>
        <h1 className="text-xl font-semibold tracking-tight">Insights</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Weekly check-in on spending, goals, and recurring outflows —
          generated by Claude.
        </p>
      </div>
      <GenerateButton mode={buttonMode} />
    </div>
  );
}
```

- [ ] **Step 2: Create `<PastWeekBanner>`**

```tsx
// src/components/insights/past-week-banner.tsx
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

type Props = {
  weekStart: string;
  weekEnd: string;
};

function formatRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

export function PastWeekBanner({ weekStart, weekEnd }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-accent/40 px-4 py-3 text-xs">
      <Link
        href="/insights"
        className="inline-flex items-center gap-1.5 font-medium text-foreground/80 hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to current week
      </Link>
      <span className="text-muted-foreground">
        Viewing {formatRange(weekStart, weekEnd)}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create `<NarrativeArticle>`**

```tsx
// src/components/insights/narrative-article.tsx
import type { Insight } from '@/lib/db/schema';

type Props = {
  insight: Insight;
  isCurrentWeek: boolean;
  showStaleChip: boolean;
};

function formatGeneratedAt(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatWeekRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

export function NarrativeArticle({ insight, isCurrentWeek, showStaleChip }: Props) {
  return (
    <article className="space-y-5 rounded-card border border-border bg-surface-elevated p-6 sm:p-8">
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            Week of
          </p>
          <p className="font-mono text-sm tabular-nums text-foreground">
            {formatWeekRange(insight.weekStart, insight.weekEnd)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Generated {formatGeneratedAt(insight.generatedAt)}
          {showStaleChip && !isCurrentWeek && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              · regenerate for current week
            </span>
          )}
        </p>
      </header>
      <div className="font-serif text-[17px] leading-[1.7] text-foreground/95 whitespace-pre-wrap">
        {insight.narrative}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/insights/header-block.tsx src/components/insights/past-week-banner.tsx src/components/insights/narrative-article.tsx
git commit -m "feat(insights): add header, past-week banner, narrative article components"
```

---

## Task 12 — Receipt tile components

**Files:**
- Create: `src/components/insights/tiles/spending-tile.tsx`
- Create: `src/components/insights/tiles/drift-tile.tsx`
- Create: `src/components/insights/tiles/goals-tile.tsx`
- Create: `src/components/insights/tiles/recurring-tile.tsx`

Four small server components — same wrapper recipe (`rounded-card border bg-surface-elevated p-5 sm:p-6`), divergent bodies.

- [ ] **Step 1: Create `<SpendingTile>`**

```tsx
// src/components/insights/tiles/spending-tile.tsx
import { formatCurrency } from '@/lib/utils';
import type { InsightSupplements } from '@/lib/insights/types';

type Props = {
  data: InsightSupplements['spending'];
};

function humanizeCategory(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function SpendingTile({ data }: Props) {
  const { totalThisWeek, deltaVsBaseline, topCategories } = data;
  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Spending
      </p>
      <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
        {formatCurrency(totalThisWeek)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {deltaVsBaseline === null
          ? 'No baseline yet'
          : deltaVsBaseline > 0
          ? `↑ ${formatCurrency(deltaVsBaseline)} vs 4-wk median`
          : deltaVsBaseline < 0
          ? `↓ ${formatCurrency(Math.abs(deltaVsBaseline))} vs 4-wk median`
          : 'In line with 4-wk median'}
      </p>
      {topCategories.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-xs">
          {topCategories.map((c) => (
            <li
              key={c.category}
              className="flex items-center justify-between gap-3 text-foreground/80"
            >
              <span className="truncate">{humanizeCategory(c.category)}</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatCurrency(c.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create `<DriftTile>`**

```tsx
// src/components/insights/tiles/drift-tile.tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { InsightSupplements } from '@/lib/insights/types';

type Props = {
  data: InsightSupplements['drift'];
};

function humanizeCategory(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function DriftTile({ data }: Props) {
  const top = data.elevated.slice(0, 3);
  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Drift
      </p>
      <p className="mt-2 text-sm text-foreground">
        {data.elevated.length} {data.elevated.length === 1 ? 'category' : 'categories'} elevated
      </p>
      <ul className="mt-3 space-y-1.5 text-xs">
        {top.map((f) => (
          <li
            key={f.category}
            className="flex items-center justify-between gap-3 text-foreground/80"
          >
            <span className="truncate">{humanizeCategory(f.category)}</span>
            <span className="font-mono tabular-nums text-foreground">
              {f.ratio.toFixed(1)}× · {formatCurrency(f.currentTotal)}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/drift"
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
      >
        See drift detail
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
```

- [ ] **Step 3: Create `<GoalsTile>`**

```tsx
// src/components/insights/tiles/goals-tile.tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { InsightSupplements } from '@/lib/insights/types';

type Props = {
  data: InsightSupplements['goals'];
};

export function GoalsTile({ data }: Props) {
  const lead = data.notable[0];
  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Goals
      </p>
      <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
        {data.onPaceCount}
        <span className="text-muted-foreground"> / {data.activeCount}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">on pace</p>
      {lead && (
        <p className="mt-3 truncate text-xs text-foreground/80">
          {lead.name} · {Math.round(lead.pacePct * 100)}%
        </p>
      )}
      <Link
        href="/goals"
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
      >
        See goals
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
```

- [ ] **Step 4: Create `<RecurringTile>`**

```tsx
// src/components/insights/tiles/recurring-tile.tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { InsightSupplements } from '@/lib/insights/types';

type Props = {
  data: InsightSupplements['recurring'];
};

export function RecurringTile({ data }: Props) {
  return (
    <section className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Recurring
      </p>
      <p className="mt-2 font-mono text-2xl tabular-nums tracking-tight">
        {formatCurrency(data.hitThisWeekTotal)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        hit this week · {formatCurrency(data.monthlyTotal)}/mo total
      </p>
      <Link
        href="/recurring"
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 hover:text-foreground"
      >
        See recurring
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
```

- [ ] **Step 5: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/insights/tiles
git commit -m "feat(insights): add receipt tiles (spending/drift/goals/recurring)"
```

---

## Task 13 — `<ReceiptsSection>` wrapper

**Files:**
- Create: `src/components/insights/receipts-section.tsx`

Composes the four tiles per `getVisibleTiles` rules.

- [ ] **Step 1: Create the component**

```tsx
// src/components/insights/receipts-section.tsx
import type { InsightSupplements } from '@/lib/insights/types';
import { getVisibleTiles, tileGridIsSingleColumn } from '@/lib/insights/tile-visibility';
import { cn } from '@/lib/utils';
import { SpendingTile } from './tiles/spending-tile';
import { DriftTile } from './tiles/drift-tile';
import { GoalsTile } from './tiles/goals-tile';
import { RecurringTile } from './tiles/recurring-tile';

type Props = {
  supplements: InsightSupplements;
};

export function ReceiptsSection({ supplements }: Props) {
  const visible = getVisibleTiles(supplements);
  const singleCol = tileGridIsSingleColumn(visible);
  return (
    <section className="space-y-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        What Claude saw
      </p>
      <div
        className={cn('grid gap-3', singleCol ? 'grid-cols-1' : 'sm:grid-cols-2')}
      >
        <SpendingTile data={supplements.spending} />
        {visible.drift && <DriftTile data={supplements.drift} />}
        {visible.goals && <GoalsTile data={supplements.goals} />}
        {visible.recurring && <RecurringTile data={supplements.recurring} />}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/insights/receipts-section.tsx
git commit -m "feat(insights): add ReceiptsSection wrapping the tile grid"
```

---

## Task 14 — `<EarlierWeeks>` footer

**Files:**
- Create: `src/components/insights/earlier-weeks.tsx`

Footer list of past insights. Each row links to `?week=<weekStart>`. Omits the row matching the currently viewed week.

- [ ] **Step 1: Create the component**

```tsx
// src/components/insights/earlier-weeks.tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ArchiveEntry } from '@/lib/db/queries/insights';
import { firstSentence } from '@/lib/utils/first-sentence';

type Props = {
  entries: ArchiveEntry[];
  /** When viewing a past week, exclude that row from the list. */
  excludeWeekStart?: string | null;
};

function formatRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

export function EarlierWeeks({ entries, excludeWeekStart = null }: Props) {
  const rows = entries.filter((e) => e.weekStart !== excludeWeekStart);
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
        Earlier weeks
      </p>
      <div className="divide-y divide-border rounded-card border border-border bg-surface-elevated">
        {rows.map((entry) => {
          const lead = firstSentence(entry.narrativePreview);
          return (
            <Link
              key={entry.weekStart}
              href={`/insights?week=${entry.weekStart}`}
              className="flex items-center justify-between gap-4 px-5 py-3 text-foreground/80 transition-colors hover:bg-accent/30 hover:text-foreground"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs tabular-nums text-foreground/70">
                  {formatRange(entry.weekStart, entry.weekEnd)}
                </p>
                {lead && (
                  <p className="mt-0.5 truncate text-sm">{lead}</p>
                )}
              </div>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/insights/earlier-weeks.tsx
git commit -m "feat(insights): add EarlierWeeks footer list"
```

---

## Task 15 — Rewrite `/insights/page.tsx`

**Files:**
- Modify: `src/app/(app)/insights/page.tsx` (full rewrite)

Composes everything. Reads `?week`, runs queries in parallel, branches on state.

- [ ] **Step 1: Replace the file**

```tsx
// src/app/(app)/insights/page.tsx
import { Sparkles } from 'lucide-react';
import { auth } from '@/auth';
import { getInsightForWeek, getInsightsForArchive, getLatestInsight } from '@/lib/db/queries/insights';
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
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean. The old `<GenerateButton hasExisting={!!latest} />` call is gone — page now passes `mode` via `<HeaderBlock>`.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: all tests pass (134 baseline + ~25 new from Tasks 1–6).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/insights/page.tsx
git commit -m "feat(insights): rewrite page for latest-read + drilldown IA"
```

---

## Task 16 — Update `/insights/loading.tsx`

**Files:**
- Modify: `src/app/(app)/insights/loading.tsx`

Skeleton mirrors the new layout: header + article + 4-tile receipts + (no archive skeleton — chrome flicker is fine).

- [ ] **Step 1: Replace the file**

```tsx
// src/app/(app)/insights/loading.tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function InsightsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <article className="space-y-5 rounded-card border border-border bg-surface-elevated p-6 sm:p-8">
        <header className="flex items-baseline justify-between gap-3 border-b border-border pb-4">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-3 w-28" />
        </header>
        <div className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </article>

      <section className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-card border border-border bg-surface-elevated p-5 sm:p-6"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-32" />
              <Skeleton className="mt-2 h-3 w-40" />
              <div className="mt-4 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/insights/loading.tsx
git commit -m "feat(insights): update loading skeleton for new IA"
```

---

## Task 17 — Verification + browser walkthrough

**Files:** none modified (unless a fix surfaces).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: All tests**

Run: `npm test`
Expected: 134 baseline + ~25 new tests pass. Target wall-clock < 1s.

- [ ] **Step 4: Start dev server (NOT alongside `npm run build`)**

Run in a dedicated terminal: `npm run dev`
Wait for `Ready on http://localhost:3000`.

- [ ] **Step 5: Browser walkthrough — state matrix**

Visit each URL and confirm the rendered state. Record any discrepancies and fix-then-recommit before declaring done.

| State | URL / setup | Expected |
|---|---|---|
| 2 (Current, fresh) | `/insights` (latest insight is for this week) | TODAY eyebrow · article without amber chip · receipts · earlier-weeks if ≥1 prior. Button = "Regenerate". |
| 3 (Current, stale) | `/insights` (latest's `weekEnd` is older than yesterday) | TODAY · article WITH amber stale chip · receipts · earlier-weeks. Button = "Regenerate". |
| 4 (Past week) | `/insights?week=<an existing past weekStart>` | ARCHIVED · banner · article without stale chip · receipts for that week · earlier-weeks excluding that row. Button = "Back to current week". |
| 5 (Invalid `?week`) | `/insights?week=2099-01-01` and `/insights?week=foo` | Silent fallback to state 2/3 (no toast). |
| 1 (Pristine) | (Manually delete all rows for the test user via Drizzle Studio: `DELETE FROM insight WHERE user_id = '…';`) | EmptyState card. No archive footer. Button = "Generate insights". |
| 6 (Generating) | State 1 or 2 → click button | Spinner + "Generating…" until completion. |
| 7 (Error) | Temporarily unset `ANTHROPIC_API_KEY` in `.env.local`, restart dev, click button | Inline red error chip below the button. |

- [ ] **Step 6: Dashboard regression check**

Visit `/dashboard`. Confirm the `<InsightTeaserCard>` first-sentence preview renders identically to before (same DB row, same extraction logic — just imported from a different module).

- [ ] **Step 7: Receipts visibility spot checks**

For each scenario, visit `/insights` and confirm the tile grid:
- Spending only (sparse account / no goals / no recurring data) → grid renders single-column.
- Spending + drift + goals + recurring all qualify → 2×2 grid.
- Drift baseline sparse → drift tile hidden.

- [ ] **Step 8: Earlier-weeks navigation**

From `/insights`, click an earlier-weeks row. Confirm:
- URL updates to `?week=<that weekStart>`.
- Page transitions without full reload (Next Link).
- ARCHIVED eyebrow + banner appear.
- That row no longer appears in the earlier-weeks list (excluded).
- Click "Back to current week" → returns to `/insights` with TODAY eyebrow.

- [ ] **Step 9: Final commit if any fixes were applied during walkthrough**

If walkthrough caught issues, fix and commit per the established convention. If none, skip this step.

- [ ] **Step 10: Stop dev server**

Ctrl+C in the dev-server terminal. If port 3000 doesn't free up (per CLAUDE.md zombie-process note), `lsof -nP -iTCP:3000 -sTCP:LISTEN` and kill the holding PID.

---

## Acceptance criteria (re-stated for the executing engineer)

1. `/insights` (no `?week`) renders states 2/3 unchanged at the narrative level; receipts + earlier-weeks render below.
2. `/insights?week=<valid past>` renders state 4: ARCHIVED · banner · article · receipts for that week · earlier-weeks excluding the viewed row.
3. Receipts grid honors visibility rules; spending always present; degrades to `grid-cols-1` when only spending qualifies.
4. Earlier-weeks footer renders ≤6 entries; hidden when none qualify; each link transitions without full reload.
5. `<GenerateButton>` modes route correctly: generate / regenerate / back-to-current.
6. Empty/error states preserve current copy & error surfacing (with the lightly refreshed empty-state copy).
7. Dashboard `<InsightTeaserCard>` is unchanged at runtime.
8. All existing 134 vitest tests + ~25 new tests pass; `npm run typecheck` and `npm run lint` are clean.

---

## Notes for the executing engineer

- **Don't `npm run build` while `npm run dev` is running.** Per CLAUDE.md, this overwrites `.next/BUILD_ID` and corrupts the running dev server. Use `npm run typecheck` for verification while dev runs.
- **Server components by default.** Only `<GenerateButton>` is `'use client'` (it has state for the inline error and the `useTransition`). Everything else is RSC.
- **Imports use `@/...`.** No relative imports across `src/`.
- **Currency formatting:** always `formatCurrency()` from `@/lib/utils`. Never `toFixed(2)`.
- **No emojis in the rendered UI.** Use the lucide icons referenced in each component.
- **Comments encode WHY only.** Don't restate what the code does.
- **The serif font is reserved for the narrative body.** No new `font-serif` usage anywhere else on this page.
- **Past-week URLs keep `?week=`** even after a silent fallback — that's intentional. Don't add a redirect; per spec, a redirect would force a flash and fight the "fail soft" goal.
