# Phase R.2 — Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the new identity dashboard with trajectory hero, runway KPI, drift module (folds `/drift`), editorial weekly brief (folds `/insights`), and the canonical freshness-annotation pattern that R.3 will propagate.

**Architecture:** 8 atomic-commit task sequence on `feat/r2-dashboard` (branched from `feat/redesign` post-R.1). Reuses existing data layer (`getDashboardSummary`, `getDriftAnalysis`, `getLatestInsight`, `getSourceHealth`, `projectCash`, `getNetWorthSparkline`) with two new query helpers and three new pure-function modules (`forecast/trajectory.ts`, `forecast/runway.ts`, `format/freshness.ts`). Route deletes of `/drift` and `/insights` with permanent redirects in `next.config.js`. One `'use client'` island only (`<HeroTrajectory>` for the SVG count-up animation).

**Tech Stack:** Next.js 14 App Router · TypeScript · Drizzle ORM · Tailwind + Foothold tokens · Recharts (deferred — trajectory SVG is hand-rolled) · Vitest 4 · Anthropic Haiku 4.5 (existing weekly-brief generation, unchanged).

**Date**: 2026-05-10
**Depends on**: [docs/redesign/r2-dashboard/SPEC.md](SPEC.md) (5 locked brainstorming decisions), [docs/redesign/SPEC.md](../SPEC.md) (R.0 master), [docs/redesign/r1-foundation/PLAN.md](../r1-foundation/PLAN.md) (precedent execution rhythm)
**Bundle reference**: [claude-design-context/foothold-dashboard.jsx](../../../claude-design-context/foothold-dashboard.jsx)
**Branch**: `feat/r2-dashboard` (already cut, SPEC committed)
**Estimate**: 1 week

---

## Branching + commit rhythm

All work lands on `feat/r2-dashboard`. One atomic commit per task per SPEC § "Task sequence." Commit subject format: `feat(r2): <task summary>`. T8 polish may produce 1-3 fixup commits — `fix(r2): <issue>`.

When all 8 tasks ship and UAT passes, branch merges to `feat/redesign` (the long-lived redesign branch). The full milestone single-PRs to `main` after R.6.

---

## Pre-flight (one-time before T1)

- [ ] **Confirm working branch**

```bash
git branch --show-current
```
Expected: `feat/r2-dashboard`

- [ ] **Confirm SPEC commit present**

```bash
git log --oneline -3
```
Expected to contain: `docs(r2): lock R.2 dashboard SPEC`

- [ ] **Snapshot baseline test count**

```bash
npm run test 2>&1 | tail -5
```
Record the passing count. Target post-R.2: baseline + ~28 (we'll add ~28 pure-helper tests across T2/T3/T7).

- [ ] **Read the SPEC end-to-end before T1**

[docs/redesign/r2-dashboard/SPEC.md](SPEC.md). Section "Final component map" is the canonical inventory of new / modified / deleted files. Section "Locked decisions" governs all ambiguity calls.

---

## T1 — Page header restyle

**Goal:** New `<PageHeader>` server component renders eyebrow, h1, and right-meta strip on the dashboard. Replaces the ad-hoc `<div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">` wrapper's lack of explicit header. Healthy-branch TrustStrip content absorbs into the meta; elevated/no-signal branches survive below.

**Files:**
- Create: `src/components/dashboard/page-header.tsx`
- Modify: `src/components/sync/trust-strip.tsx` (healthy branch returns `null`)
- Modify: `src/app/(app)/dashboard/page.tsx` (mount `<PageHeader>`)

**Subtasks:**

- [ ] **Step 1.1 — Write the failing test for PageHeader's pure props branching**

There's no testable predicate at the component level (it's a presentational shell). PageHeader consumes data through `formatFreshness()` which lands in T7. Skip a component test; cover via T7 freshness tests + manual UAT.

Decision: no unit test for T1. Move to step 1.2.

- [ ] **Step 1.2 — Create `<PageHeader>` server component**

```tsx
// src/components/dashboard/page-header.tsx
import type { SourceHealth } from '@/lib/db/queries/health';

/**
 * Top-of-dashboard header strip. Three columns: left eyebrow + title,
 * right freshness meta. Renders at every dashboard load.
 *
 * Right-meta is the page-level freshness anchor for R.2's locked pattern.
 * The full helper (formatFreshness) lands in T7; T1 mounts an inline
 * approximation that T7 swaps to the helper output.
 */
export function PageHeader({
  todayLabel,
  freshnessHeadline,
  freshnessCaveat,
}: {
  /** "Today · Sat, May 10" eyebrow text (computed by caller server-side). */
  todayLabel: string;
  /** "Fresh 2h ago · 3 sources" — from T7's formatFreshness. */
  freshnessHeadline: string;
  /** Optional caveat — null in healthy state. */
  freshnessCaveat: string | null;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          {todayLabel}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[--text]">
          Dashboard
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

- [ ] **Step 1.3 — Modify TrustStrip's healthy branch to return null**

```tsx
// src/components/sync/trust-strip.tsx (line ~47)
//
// BEFORE: healthy branch returned a <p> with "Fresh Nh ago · N sources"
// AFTER:  healthy branch returns null — content absorbed into PageHeader
//
// Edit `if (summary.kind === 'healthy')` body to:

if (summary.kind === 'healthy') {
  return null;
}
```

The `quiet`, `no_signal`, and `elevated` branches **stay unchanged**. They surface below the page header when present and never disappear from the page.

- [ ] **Step 1.4 — Mount PageHeader in dashboard page**

```tsx
// src/app/(app)/dashboard/page.tsx — add to imports
import { PageHeader } from '@/components/dashboard/page-header';
import { summarizeTrustStrip } from '@/lib/sync/trust-strip';

// In the return JSX, before <MotionStack>, add:
//
// Compute the eyebrow + freshness inline for T1; replace with formatFreshness
// in T7.
const todayLabel = `Today · ${new Date().toLocaleDateString('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})}`;

const trustSummary = summarizeTrustStrip(sourceHealth);
const freshnessHeadline =
  trustSummary.kind === 'healthy'
    ? `Fresh ${formatRelative(trustSummary.freshAt)} · ${trustSummary.sourceCount} ${
        trustSummary.sourceCount === 1 ? 'source' : 'sources'
      }`
    : trustSummary.kind === 'no_signal'
      ? `Sync pending · ${trustSummary.sourceCount} sources`
      : trustSummary.kind === 'quiet'
        ? `Synced ${formatRelative(trustSummary.syncedAt)} · ${trustSummary.sourceCount} sources`
        : `${trustSummary.elevated.length} source${trustSummary.elevated.length === 1 ? '' : 's'} need attention`;

// Then in the JSX:
return (
  <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
    <PageHeader
      todayLabel={todayLabel}
      freshnessHeadline={freshnessHeadline}
      freshnessCaveat={null}
    />
    <MotionStack className="mt-6 space-y-5">
      <TrustStrip sources={sourceHealth} />
      {/* ...rest of cards unchanged for T1... */}
    </MotionStack>
  </div>
);
```

Also add `import { formatRelative } from '@/lib/format/date';` if not present.

- [ ] **Step 1.5 — Run typecheck + lint**

```bash
npm run typecheck && npm run lint
```
Expected: both clean.

- [ ] **Step 1.6 — Run dev server + browser-verify**

```bash
npm run dev
```
Open http://localhost:3000/dashboard (already authed). Verify:
- Page header renders with "Today · ..." eyebrow + "Dashboard" h1
- Right-meta strip renders "Fresh Nh ago · N sources" (visible at `sm+`)
- TrustStrip healthy branch returns null — no duplicate "Fresh" line above hero
- Elevated/no-signal branches: simulate by temporarily editing `summarizeTrustStrip` consumer (revert) — confirm those still render

- [ ] **Step 1.7 — Commit T1**

```bash
git add src/components/dashboard/page-header.tsx \
        src/components/sync/trust-strip.tsx \
        src/app/\(app\)/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
feat(r2): T1 page header — eyebrow + h1 + freshness meta strip

New <PageHeader> server component renders the top of /dashboard with
date-eyebrow, h1, and right-aligned freshness meta. <TrustStrip>'s
healthy branch absorbs into the meta strip (returns null when healthy);
elevated/no-signal/quiet branches survive unchanged below the header.

Freshness text computed inline at the page-level for T1 — T7 swaps in
the canonical formatFreshness() helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T2 — NetWorthHero + trajectory + uncertainty band

**Goal:** Replace `<HeroCard>` with `<NetWorthHero>` (server) + `<HeroTrajectory>` (client SVG island). Adds 90d-history + 90d-forecast trajectory with sqrt-widening uncertainty band, count-up animation, contour watermark, "you are here" position dot.

**Files:**
- Create: `src/lib/forecast/trajectory.ts` (pure helpers)
- Create: `src/lib/forecast/trajectory.test.ts`
- Create: `src/components/dashboard/net-worth-hero.tsx` (server component)
- Create: `src/components/dashboard/hero-trajectory.tsx` (client SVG island)
- Modify: `src/app/(app)/dashboard/page.tsx` — call site `getNetWorthSparkline(userId, 30)` → `getNetWorthSparkline(userId, 90)`; replace `<HeroCard>` mount with `<NetWorthHero>`
- Delete: `src/components/dashboard/hero-card.tsx`
- Delete: `src/components/dashboard/sparkline.tsx`

**Subtasks:**

- [ ] **Step 2.1 — Write `trajectory.test.ts` first (TDD)**

```ts
// src/lib/forecast/trajectory.test.ts
import { describe, expect, it } from 'vitest';
import {
  forecastDailySeries,
  uncertaintyBand,
} from './trajectory';
import type { ProjectionMonth } from './types';

const month = (endCash: number): ProjectionMonth => ({
  month: '2026-06',
  startCash: 0,
  inflows: 0,
  outflows: 0,
  endCash,
  byCategory: {},
});

describe('forecastDailySeries', () => {
  it('returns daysOut + 1 points (today + daysOut future days)', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series).toHaveLength(91);
  });

  it('day 0 equals startLiquidCash', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series[0]).toBe(1000);
  });

  it('day 30 approximately equals projection[0].endCash', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series[30]).toBeCloseTo(900, 0);
  });

  it('day 60 approximately equals projection[1].endCash', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series[60]).toBeCloseTo(800, 0);
  });

  it('day 90 approximately equals projection[2].endCash', () => {
    const series = forecastDailySeries(1000, [month(900), month(800), month(700)], 90);
    expect(series[90]).toBeCloseTo(700, 0);
  });

  it('handles negative endCash (over-budget projection)', () => {
    const series = forecastDailySeries(500, [month(-200), month(-500), month(-800)], 90);
    expect(series[90]).toBeCloseTo(-800, 0);
  });

  it('returns single-element [startCash] when daysOut=0', () => {
    const series = forecastDailySeries(1000, [month(900)], 0);
    expect(series).toEqual([1000]);
  });

  it('handles empty projection by holding startCash flat', () => {
    const series = forecastDailySeries(1000, [], 30);
    expect(series).toEqual(Array(31).fill(1000));
  });
});

describe('uncertaintyBand', () => {
  it('returns null when historical < 60 points', () => {
    const hist = Array(59).fill(0).map((_, i) => 1000 + i);
    const fcast = Array(91).fill(0).map((_, i) => 1059 + i);
    expect(uncertaintyBand(hist, fcast)).toBeNull();
  });

  it('returns band with widening half-spread when historical ≥ 60', () => {
    // Linear historical: daily delta = +1, stddev = 0
    const hist = Array(91).fill(0).map((_, i) => 1000 + i);
    const fcast = Array(91).fill(0).map((_, i) => 1090 + i);
    const band = uncertaintyBand(hist, fcast);
    expect(band).not.toBeNull();
    // Zero-stddev → upper === lower === fcast at every t
    expect(band!.upper[0]).toBeCloseTo(fcast[0], 5);
    expect(band!.lower[0]).toBeCloseTo(fcast[0], 5);
  });

  it('band widens monotonically with forecast horizon', () => {
    // Random-walk historical (synthetic stddev > 0)
    const hist = [1000];
    for (let i = 1; i < 91; i++) {
      hist.push(hist[i - 1] + (i % 2 === 0 ? 10 : -8));
    }
    const fcast = Array(91).fill(0).map((_, i) => hist[hist.length - 1] - i);
    const band = uncertaintyBand(hist, fcast)!;
    const halfWidth = (i: number) => band.upper[i] - band.lower[i];
    expect(halfWidth(60)).toBeGreaterThan(halfWidth(10));
    expect(halfWidth(10)).toBeGreaterThan(halfWidth(0));
  });

  it('upper/lower symmetric around forecast line', () => {
    const hist = Array(91).fill(0).map((_, i) => 1000 + (i % 10) * 20);
    const fcast = Array(91).fill(0).map((_, i) => 1080 + i);
    const band = uncertaintyBand(hist, fcast)!;
    band.upper.forEach((u, i) => {
      const center = (u + band.lower[i]) / 2;
      expect(center).toBeCloseTo(fcast[i], 5);
    });
  });
});
```

- [ ] **Step 2.2 — Run failing tests**

```bash
npx vitest run src/lib/forecast/trajectory.test.ts
```
Expected: FAIL — `Cannot find module './trajectory'`.

- [ ] **Step 2.3 — Implement `trajectory.ts`**

```ts
// src/lib/forecast/trajectory.ts
import type { ProjectionMonth } from './types';

/**
 * Daily liquid-cash series for [today, today+daysOut]. Linear-interpolates
 * between projectCash's monthly endCash anchors at day 30 / 60 / 90.
 *
 * Why not run projectCash per-day? The engine bakes recurring streams into
 * monthly endCash; running per-day would generate spurious daily noise as
 * recurring charges flip across day boundaries. The monthly chain is the
 * engine's actual signal; daily interpolation is the visual presentation.
 *
 * Returns daysOut + 1 points (today included).
 */
export function forecastDailySeries(
  startLiquidCash: number,
  projection: ProjectionMonth[],
  daysOut = 90,
): number[] {
  if (daysOut <= 0) return [startLiquidCash];
  if (projection.length === 0) return Array(daysOut + 1).fill(startLiquidCash);

  // Anchor points: [day 0, day 30, day 60, day 90, ...] → [startCash, p[0].endCash, p[1].endCash, ...]
  const anchors: Array<{ day: number; cash: number }> = [
    { day: 0, cash: startLiquidCash },
  ];
  for (let i = 0; i < projection.length; i++) {
    anchors.push({ day: (i + 1) * 30, cash: projection[i].endCash });
  }

  const series: number[] = [];
  for (let day = 0; day <= daysOut; day++) {
    // Find the anchor pair bracketing this day
    let lower = anchors[0];
    let upper = anchors[anchors.length - 1];
    for (let i = 0; i < anchors.length - 1; i++) {
      if (anchors[i].day <= day && anchors[i + 1].day >= day) {
        lower = anchors[i];
        upper = anchors[i + 1];
        break;
      }
    }
    if (lower.day === upper.day) {
      series.push(lower.cash);
      continue;
    }
    const t = (day - lower.day) / (upper.day - lower.day);
    series.push(lower.cash + (upper.cash - lower.cash) * t);
  }
  return series;
}

/**
 * Symmetric uncertainty band around a forecast series. Half-width at day t
 * is σ × sqrt(t), where σ is the stddev of daily net-worth deltas over the
 * historical series. Returns null when historical < 60 points (honesty
 * floor — variance estimate from too-small a window is false precision
 * dressed as quantified uncertainty).
 */
export function uncertaintyBand(
  historicalDailySeries: number[],
  forecastDailySeries: number[],
): { upper: number[]; lower: number[] } | null {
  if (historicalDailySeries.length < 60) return null;

  // Daily deltas (yesterday → today)
  const deltas: number[] = [];
  for (let i = 1; i < historicalDailySeries.length; i++) {
    deltas.push(historicalDailySeries[i] - historicalDailySeries[i - 1]);
  }
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance =
    deltas.reduce((acc, d) => acc + (d - mean) ** 2, 0) / deltas.length;
  const sigma = Math.sqrt(variance);

  const upper: number[] = [];
  const lower: number[] = [];
  for (let t = 0; t < forecastDailySeries.length; t++) {
    const halfWidth = sigma * Math.sqrt(t);
    upper.push(forecastDailySeries[t] + halfWidth);
    lower.push(forecastDailySeries[t] - halfWidth);
  }
  return { upper, lower };
}
```

- [ ] **Step 2.4 — Run tests to confirm pass**

```bash
npx vitest run src/lib/forecast/trajectory.test.ts
```
Expected: PASS — 12 cases green.

- [ ] **Step 2.5 — Create `<HeroTrajectory>` client island**

```tsx
// src/components/dashboard/hero-trajectory.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  historicalSeries: number[]; // length up to 91 (90 days back + today)
  forecastSeries: number[]; // length up to 91 (today + 90 days forward)
  band: { upper: number[]; lower: number[] } | null;
};

/**
 * Hand-rolled SVG trajectory chart. Single client island for the dashboard.
 * No Recharts — the chart is simple polylines + a band polygon; Recharts'
 * overhead isn't worth it here.
 */
export function HeroTrajectory({ historicalSeries, forecastSeries, band }: Props) {
  const allValues = useMemo(() => {
    const values = [...historicalSeries, ...forecastSeries];
    if (band) values.push(...band.upper, ...band.lower);
    return values;
  }, [historicalSeries, forecastSeries, band]);

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const totalPoints = historicalSeries.length + forecastSeries.length - 1; // shared "today" point
  const W = 100;
  const H = 100;

  const xy = (i: number, v: number): [number, number] => {
    const x = (i / Math.max(totalPoints, 1)) * W;
    const y = H - ((v - min) / range) * H * 0.85 - H * 0.075;
    return [x, y];
  };

  const historicalPath = historicalSeries
    .map((v, i) => xy(i, v))
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  const forecastOffset = historicalSeries.length - 1;
  const forecastPath = forecastSeries
    .map((v, i) => xy(forecastOffset + i, v))
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

  const bandPath = band
    ? (() => {
        const upper = band.upper.map((v, i) => xy(forecastOffset + i, v));
        const lower = band.lower.map((v, i) => xy(forecastOffset + i, v)).reverse();
        return (
          'M ' +
          upper.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ') +
          ' L ' +
          lower.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ') +
          ' Z'
        );
      })()
    : null;

  // "You are here" dot — at the boundary between history and forecast
  const [todayX, todayY] = xy(forecastOffset, historicalSeries[historicalSeries.length - 1]);

  return (
    <div className="relative" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-24 w-full">
        {bandPath && (
          <path d={bandPath} fill="var(--accent)" opacity="0.08" />
        )}
        <path
          d={historicalPath}
          fill="none"
          stroke="var(--text-3)"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={forecastPath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="0.6 1.4"
        />
        <line
          x1={todayX}
          y1="0"
          x2={todayX}
          y2="100"
          stroke="var(--text-3)"
          strokeWidth="0.4"
          strokeDasharray="0.6 1.2"
          opacity="0.35"
        />
        <circle cx={todayX} cy={todayY} r="1.6" fill="var(--accent)" />
        <circle cx={todayX} cy={todayY} r="3" fill="var(--accent)" opacity="0.18" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-[--text-3]">
        <span>90 days back</span>
        <span>today</span>
        <span>+90 days</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2.6 — Create `<NetWorthHero>` server component**

```tsx
// src/components/dashboard/net-worth-hero.tsx
import { FootholdMark } from '@/components/brand/foothold-mark';
import { HeroTrajectory } from './hero-trajectory';
import { CountUpNumber } from './count-up-number'; // see Step 2.7

type Props = {
  netWorth: number;
  monthlyDelta: number;
  historicalSeries: number[]; // empty array when <30d history
  forecastSeries: number[];
  band: { upper: number[]; lower: number[] } | null;
  /** Page-level freshness headline from formatFreshness (T7). */
  freshnessHeadline: string;
};

export function NetWorthHero({
  netWorth,
  monthlyDelta,
  historicalSeries,
  forecastSeries,
  band,
  freshnessHeadline,
}: Props) {
  const deltaSign = monthlyDelta > 0 ? '+' : monthlyDelta < 0 ? '−' : '';
  const deltaAbs = Math.abs(monthlyDelta);

  return (
    <article
      className="relative overflow-hidden rounded-card bg-[--surface] p-6"
      style={{ minHeight: 280 }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.07]">
        <FootholdMark size={400} simplified={false} withDot={false} />
      </div>

      <header className="relative flex items-start justify-between">
        <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
          Net Worth
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[--text-2]">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-[--accent]"
            aria-hidden
          />
          You are here ·{' '}
          {new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </header>

      <div className="relative mt-4 font-mono text-[clamp(2.5rem,5vw,3.75rem)] font-semibold tracking-tight tabular-nums text-[--text]">
        <CountUpNumber target={netWorth} />
      </div>

      {historicalSeries.length === 0 ? (
        <p className="relative mt-6 text-sm text-[--text-3]">
          Trend appears once your accounts have 30 days of history.
        </p>
      ) : (
        <div className="relative mt-4">
          <HeroTrajectory
            historicalSeries={historicalSeries}
            forecastSeries={forecastSeries}
            band={band}
          />
        </div>
      )}

      <footer className="relative mt-4 flex items-baseline justify-between gap-3 text-xs">
        <div
          className={
            monthlyDelta < 0
              ? 'text-[--caution]'
              : monthlyDelta > 0
                ? 'text-[--success]'
                : 'text-[--text-3]'
          }
        >
          <span className="font-mono tabular-nums">
            {deltaSign}${deltaAbs.toFixed(2)}
          </span>{' '}
          <span className="text-[--text-3]">this month</span>
        </div>
        <div className="text-right text-[--text-3]">{freshnessHeadline}</div>
      </footer>
    </article>
  );
}
```

- [ ] **Step 2.7 — Extract `<CountUpNumber>` (also client island)**

```tsx
// src/components/dashboard/count-up-number.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { target: number };

/**
 * One-time count-up on first paint. Eases out over 900ms.
 * Honors prefers-reduced-motion (renders target immediately).
 */
export function CountUpNumber({ target }: Props) {
  const [n, setN] = useState(() => {
    if (typeof window === 'undefined') return target;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduced ? target : target * 0.985;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setN(target);
      return;
    }
    let raf: number;
    const start = performance.now();
    const dur = 900;
    const from = target * 0.985;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(from + (target - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs).toLocaleString();
  const cents = Math.round((abs % 1) * 100)
    .toString()
    .padStart(2, '0');
  return (
    <>
      {sign}${whole}
      <span className="text-[--text-2]">.{cents}</span>
    </>
  );
}
```

- [ ] **Step 2.8 — Wire NetWorthHero into dashboard page**

```tsx
// src/app/(app)/dashboard/page.tsx

// Add imports:
import { NetWorthHero } from '@/components/dashboard/net-worth-hero';
import {
  forecastDailySeries,
  uncertaintyBand,
} from '@/lib/forecast/trajectory';

// Remove imports:
// - import { HeroCard } from '@/components/dashboard/hero-card';

// In the Promise.all, change sparkline call:
getNetWorthSparkline(userId, 90),  // was: 30

// After projection computation, add:
const forecastSeries = forecastDailySeries(liquidBalance, projection.projection, 90);
const historicalSeries = sparkline.map((p) => p.netWorth);
const band = uncertaintyBand(historicalSeries, forecastSeries);

// Replace <HeroCard ... /> mount with:
<NetWorthHero
  netWorth={summary.netWorth}
  monthlyDelta={monthlyDelta}
  historicalSeries={historicalSeries}
  forecastSeries={forecastSeries}
  band={band}
  freshnessHeadline={freshnessHeadline}
/>
```

- [ ] **Step 2.9 — Delete obsolete components**

```bash
rm src/components/dashboard/hero-card.tsx
rm src/components/dashboard/sparkline.tsx
```

- [ ] **Step 2.10 — Typecheck + lint + full test run**

```bash
npm run typecheck && npm run lint && npm run test
```
Expected: all clean; +12 new tests in trajectory.test.ts.

- [ ] **Step 2.11 — Browser UAT (dev server)**

Open http://localhost:3000/dashboard. Verify:
- Count-up animation fires on mount (~900ms)
- 180-point trajectory renders
- Today vertical dashed line at history/forecast boundary
- "You are here" dot at the boundary with halo
- Forecast line dashed, history line solid
- Band visible when ≥60 days of history present; absent otherwise
- Empty-state message when sparkline returns []
- Browser DevTools → emulate `prefers-reduced-motion: reduce` → count-up disabled

- [ ] **Step 2.12 — Verify RSC boundary cleanliness**

```bash
grep -n "use client" src/components/dashboard/net-worth-hero.tsx
```
Expected: NO match (server component). Only `<HeroTrajectory>` and `<CountUpNumber>` carry `'use client'`.

```bash
grep -rn "Functions cannot be passed" .next/ 2>/dev/null | head
```
Expected: no matches in build output (no RSC serialization errors).

- [ ] **Step 2.13 — Commit T2**

```bash
git add src/lib/forecast/trajectory.ts \
        src/lib/forecast/trajectory.test.ts \
        src/components/dashboard/net-worth-hero.tsx \
        src/components/dashboard/hero-trajectory.tsx \
        src/components/dashboard/count-up-number.tsx \
        src/app/\(app\)/dashboard/page.tsx
git add -u src/components/dashboard/hero-card.tsx \
            src/components/dashboard/sparkline.tsx
git commit -m "$(cat <<'EOF'
feat(r2): T2 NetWorthHero — 180d trajectory + uncertainty band + count-up

Replaces <HeroCard> with <NetWorthHero> server component + <HeroTrajectory>
client SVG island. Trajectory renders 90 days history + 90 days forecast
with sqrt(t)-widening σ-band; band returns null when <60 days of history
(honesty floor — variance estimate from too-small a window is false
precision). Count-up animation isolated in its own client island, respects
prefers-reduced-motion.

New pure helpers in src/lib/forecast/trajectory.ts (12 vitest cases):
- forecastDailySeries: linear interp between projectCash monthly endCash
  anchors at day 30/60/90
- uncertaintyBand: σ from historical daily deltas, half-width = σ × √t

getNetWorthSparkline call site bumped 30 → 90 days.

Deletes obsolete hero-card.tsx and sparkline.tsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T3 — KPI strip (Liquid · EOM · Runway)

**Goal:** Replace `<SplitCard>` 2-cell layout with `<Kpis>` 3-cell. Adds Runway with "Net positive" fallback.

**Files:**
- Create: `src/lib/forecast/runway.ts`
- Create: `src/lib/forecast/runway.test.ts`
- Create: `src/components/dashboard/kpis.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (replace `<SplitCard>` with `<Kpis>`)
- Delete: `src/components/dashboard/split-card.tsx`

**Subtasks:**

- [ ] **Step 3.1 — Write `runway.test.ts` first (TDD)**

```ts
// src/lib/forecast/runway.test.ts
import { describe, expect, it } from 'vitest';
import { computeRunway } from './runway';

// Helper to build a minimal monthly history record
const monthly = (inflow: number, outflow: number) => ({ inflow, outflow });

describe('computeRunway', () => {
  it('returns null when net-positive (income > outflow)', () => {
    const history = [monthly(5000, 3000), monthly(5200, 3100), monthly(4800, 2900)];
    expect(computeRunway(10000, history)).toBeNull();
  });

  it('returns weeks when net-negative', () => {
    const history = [monthly(2000, 4000), monthly(2100, 4200), monthly(1900, 3900)];
    // medianNetMonthly = median(2000, 2100, 2000) = 2000
    // runway = 10000 / 2000 × 4.33 = 21.65 wks
    const wks = computeRunway(10000, history);
    expect(wks).toBeCloseTo(21.65, 1);
  });

  it('returns null when net-zero', () => {
    const history = [monthly(3000, 3000), monthly(3000, 3000), monthly(3000, 3000)];
    expect(computeRunway(5000, history)).toBeNull();
  });

  it('uses median, not mean (single-month spike does not skew)', () => {
    const history = [monthly(2000, 4000), monthly(2000, 4100), monthly(2000, 12000)];
    // median net = 2000 (not the 10000 outlier)
    const wks = computeRunway(10000, history);
    expect(wks).toBeCloseTo(21.65, 1);
  });

  it('returns null when history is empty', () => {
    expect(computeRunway(10000, [])).toBeNull();
  });

  it('returns null when liquidBalance ≤ 0', () => {
    const history = [monthly(2000, 4000), monthly(2100, 4200), monthly(1900, 3900)];
    expect(computeRunway(0, history)).toBeNull();
    expect(computeRunway(-500, history)).toBeNull();
  });
});
```

- [ ] **Step 3.2 — Run failing tests**

```bash
npx vitest run src/lib/forecast/runway.test.ts
```
Expected: FAIL.

- [ ] **Step 3.3 — Implement `runway.ts`**

```ts
// src/lib/forecast/runway.ts

/** Trailing-month history record. */
export type MonthlyTotals = { inflow: number; outflow: number };

/**
 * Runway in weeks at current burn. Returns null when:
 *   - liquidBalance ≤ 0 (no cushion to count)
 *   - History is empty (no signal)
 *   - Median monthly net (outflow - inflow) is ≤ 0 (net positive — runway
 *     is not a useful number; caller renders "Net positive" sub-text)
 *
 * Uses median over the supplied history (typically trailing 3 complete
 * months) so a single-month spike doesn't skew the burn estimate.
 *
 * Weeks = liquidBalance / medianNetMonthly × 4.33  (months-to-weeks).
 */
export function computeRunway(
  liquidBalance: number,
  history: MonthlyTotals[],
): number | null {
  if (liquidBalance <= 0) return null;
  if (history.length === 0) return null;

  const netDeltas = history
    .map((m) => m.outflow - m.inflow)
    .sort((a, b) => a - b);
  const mid = Math.floor(netDeltas.length / 2);
  const medianNet =
    netDeltas.length % 2 === 0
      ? (netDeltas[mid - 1] + netDeltas[mid]) / 2
      : netDeltas[mid];

  if (medianNet <= 0) return null;
  return (liquidBalance / medianNet) * 4.33;
}
```

- [ ] **Step 3.4 — Run tests to confirm pass**

```bash
npx vitest run src/lib/forecast/runway.test.ts
```
Expected: PASS — 6 cases.

- [ ] **Step 3.5 — Create `<Kpis>` component**

```tsx
// src/components/dashboard/kpis.tsx

type KpiCellProps = {
  label: string;
  value: string;
  sub: string;
};

function KpiCell({ label, value, sub }: KpiCellProps) {
  return (
    <div className="flex-1 rounded-card bg-[--surface] p-5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[--text]">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[--text-2]">{sub}</div>
    </div>
  );
}

type Props = {
  liquidBalance: number;
  liquidAccountCount: number;
  eomProjected: number;
  /** From computeRunway. Null = net-positive. */
  runwayWeeks: number | null;
};

const fmtMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Kpis({
  liquidBalance,
  liquidAccountCount,
  eomProjected,
  runwayWeeks,
}: Props) {
  const eomDelta = eomProjected - liquidBalance;
  const eomDeltaSign = eomDelta > 0 ? '+' : eomDelta < 0 ? '−' : '';
  const eomDeltaAbs = Math.abs(eomDelta);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <KpiCell
        label="Liquid Balance"
        value={fmtMoney(liquidBalance)}
        sub={`across ${liquidAccountCount} ${liquidAccountCount === 1 ? 'account' : 'accounts'}`}
      />
      <KpiCell
        label="EOM Projected"
        value={fmtMoney(eomProjected)}
        sub={`${eomDeltaSign}${fmtMoney(eomDeltaAbs).slice(1)} from today`}
      />
      <KpiCell
        label="Runway"
        value={runwayWeeks === null ? 'Net positive' : `${Math.floor(runwayWeeks)} wks`}
        sub={runwayWeeks === null ? 'no runway risk' : 'at current burn'}
      />
    </div>
  );
}
```

- [ ] **Step 3.6 — Wire Kpis into dashboard page**

```tsx
// src/app/(app)/dashboard/page.tsx

// Add imports:
import { Kpis } from '@/components/dashboard/kpis';
import { computeRunway } from '@/lib/forecast/runway';

// Remove import:
// - import { SplitCard } from '@/components/dashboard/split-card';

// After projectCash computation, derive the monthly-totals history for runway.
// projectCash output's projection[0..2] gives FUTURE months. For runway we
// want PAST months. Pull from forecastHistory.monthlyTotals — already exists
// per getForecastHistory return shape. Confirm field name during T3 work.

// Assume forecastHistory.monthlyTotals: Array<{ month: string; inflow: number; outflow: number }>
// Take trailing 3 complete months:
const trailingMonths = (forecastHistory.monthlyTotals ?? []).slice(-3);
const runwayWeeks = computeRunway(liquidBalance, trailingMonths);

// Replace <SplitCard> mount with:
<Kpis
  liquidBalance={liquidBalance}
  liquidAccountCount={liquidAccounts}
  eomProjected={eomProjected}
  runwayWeeks={runwayWeeks}
/>
```

**⚠️ Verify before coding step 3.6:** the exact shape of `getForecastHistory` return. Open [src/lib/db/queries/forecast.ts](../../../src/lib/db/queries/forecast.ts) and confirm the trailing-monthly-totals field name and structure. If the shape doesn't match `{ inflow, outflow }[]`, write an inline adapter:

```ts
const trailingMonths: MonthlyTotals[] = forecastHistory.someField.slice(-3).map((m) => ({
  inflow: m.totalIncome ?? 0,
  outflow: m.totalSpend ?? 0,
}));
```

- [ ] **Step 3.7 — Delete `<SplitCard>`**

```bash
rm src/components/dashboard/split-card.tsx
```

- [ ] **Step 3.8 — Typecheck + lint + tests**

```bash
npm run typecheck && npm run lint && npm run test
```
Expected: all green; +6 runway tests.

- [ ] **Step 3.9 — Browser UAT**

http://localhost:3000/dashboard. Verify:
- 3-cell KPI strip below hero, above existing cards
- Liquid · EOM · Runway labels in smallcaps
- All values render mono numerals
- Runway shows "N wks" when net-burning; "Net positive" when income > spend
- Sub-text correct under each cell
- Dark mode parity

- [ ] **Step 3.10 — Commit T3**

```bash
git add src/lib/forecast/runway.ts \
        src/lib/forecast/runway.test.ts \
        src/components/dashboard/kpis.tsx \
        src/app/\(app\)/dashboard/page.tsx
git add -u src/components/dashboard/split-card.tsx
git commit -m "$(cat <<'EOF'
feat(r2): T3 KPI strip — Liquid · EOM · Runway

Replaces <SplitCard> 2-cell with <Kpis> 3-cell. Adds Runway computation
via new pure helper computeRunway() — median trailing-3mo net burn,
liquidBalance / burn × 4.33 wks. Returns null when net-positive; KPI
cell renders "Net positive · no runway risk" preserving 3-cell layout.

6 vitest cases cover median-not-mean, net-positive fallback, empty
history, non-positive liquid balance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T4 — Drift module + /drift route delete

**Goal:** `<DriftModule>` horizontal-bar leaderboard replaces `<DriftFlagsCard>`. Delete `src/app/(app)/drift/`. Add permanent redirect. Audit `revalidatePath('/drift')`.

**Files:**
- Create: `src/components/dashboard/drift-module.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (mount `<DriftModule>`)
- Modify: `next.config.js` (add redirect)
- Modify: any `src/lib/**/actions.ts` containing `revalidatePath('/drift')`
- Delete: `src/components/dashboard/drift-flags-card.tsx`
- Delete: `src/app/(app)/drift/` (entire directory, including `<FlagHistoryList>`)

**Subtasks:**

- [ ] **Step 4.1 — Confirm drift query return shape**

```bash
grep -A 20 "currentlyElevated" src/lib/db/queries/drift.ts | head -40
```

The drift module needs `{ pfc: string; currentTotal: number; baseline: number; ratio: number }` per row. Confirm the field names match what `getDriftAnalysis().currentlyElevated` returns. Adapt the component's prop types to actual field names.

- [ ] **Step 4.2 — Create `<DriftModule>`**

```tsx
// src/components/dashboard/drift-module.tsx
import { humanizeCategory } from '@/lib/format/category';

type ElevatedRow = {
  pfc: string;          // adapt field name to actual drift query output
  currentTotal: number;
  baseline: number;
  ratio: number;
};

type Props = {
  elevated: ElevatedRow[];
};

const fmtMoney = (n: number) =>
  `$${Math.round(n).toLocaleString('en-US')}`;

export function DriftModule({ elevated }: Props) {
  // Locked decision: module renders null when no flagged categories.
  if (elevated.length === 0) return null;

  // Sort by ratio descending; "hot" = ratio > 1 per drift IA rework convention
  const sorted = [...elevated].sort((a, b) => b.ratio - a.ratio);
  const hotCount = sorted.filter((r) => r.ratio > 1).length;
  const label = hotCount === 1 ? 'category' : 'categories';

  return (
    <section id="drift" className="rounded-card bg-[--surface] p-5">
      <header className="flex items-center gap-2 text-sm text-[--text-2]">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-[--accent]"
          aria-hidden
        />
        <span>
          {hotCount} {label} running hot this week
        </span>
      </header>
      <div className="mt-4 space-y-2">
        {sorted.map((row) => {
          const isHot = row.ratio > 1;
          // Bar fill clamped at 10× ratio to prevent extreme outliers
          // blowing the bar width.
          const widthPct = Math.min(row.ratio * 10, 100);
          return (
            <div
              key={row.pfc}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs"
            >
              <div className="font-medium text-[--text]">
                {humanizeCategory(row.pfc)}
              </div>
              <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-[--surface-2]">
                {/* Baseline tick — 14% from left per prototype */}
                <div
                  className="absolute top-0 h-full w-px bg-[--text-3]"
                  style={{ left: '14%' }}
                  aria-hidden
                />
                <div
                  className={
                    isHot
                      ? 'h-full rounded-full bg-[--accent]'
                      : 'h-full rounded-full bg-[--text-3]'
                  }
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <div className="font-mono tabular-nums text-[--text-2]">
                {fmtMoney(row.currentTotal)}{' '}
                <span className="text-[--text-3]">
                  · {fmtMoney(row.baseline)} ({row.ratio.toFixed(1)}×)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4.3 — Wire DriftModule into dashboard page**

```tsx
// src/app/(app)/dashboard/page.tsx

// Replace import:
// - import { DriftFlagsCard } from '@/components/dashboard/drift-flags-card';
// + import { DriftModule } from '@/components/dashboard/drift-module';

// Replace mount:
// - <DriftFlagsCard flags={drift.currentlyElevated} />
// + <DriftModule elevated={drift.currentlyElevated} />
```

- [ ] **Step 4.4 — Add /drift redirect to `next.config.js`**

```bash
cat next.config.js
```

Confirm the file shape. Add to its `async redirects()` (create the function if it doesn't exist):

```js
async redirects() {
  return [
    {
      source: '/drift',
      destination: '/dashboard#drift',
      permanent: true,
    },
    // ...any existing redirects preserved
  ];
},
```

- [ ] **Step 4.5 — Audit and rewrite `revalidatePath('/drift')` calls**

```bash
grep -rn "revalidatePath.*'/drift'" src/
```

For each match found, rewrite to `revalidatePath('/dashboard')`. Likely candidates: `src/lib/categories/actions.ts`, `src/lib/transactions/actions.ts`.

- [ ] **Step 4.6 — Delete /drift route + DriftFlagsCard**

```bash
rm -rf src/app/\(app\)/drift/
rm src/components/dashboard/drift-flags-card.tsx
```

- [ ] **Step 4.7 — Typecheck + lint + tests**

```bash
npm run typecheck && npm run lint && npm run test
```
Expected: all green. Existing /drift unit tests (if any) deleted with the directory.

- [ ] **Step 4.8 — Browser UAT**

http://localhost:3000/dashboard:
- DriftModule renders when there are elevated categories
- Headline pluralizes correctly
- Bar fill visible; baseline tick at left-edge area
- Cool reference rows render in `--text-3`
- No hover state on rows (drilldown is gone)
- No `id="drift"` JS errors

http://localhost:3000/drift:
- Redirects to `/dashboard#drift`
- Page scrolls to module on anchor

Trigger a re-categorize from /transactions and verify dashboard still re-renders (the rewritten `revalidatePath('/dashboard')` from step 4.5 covers it).

- [ ] **Step 4.9 — Commit T4**

```bash
git add src/components/dashboard/drift-module.tsx \
        src/app/\(app\)/dashboard/page.tsx \
        next.config.js
git add -u src/lib/ src/components/dashboard/drift-flags-card.tsx src/app/\(app\)/drift/
git commit -m "$(cat <<'EOF'
feat(r2): T4 drift fold — leaderboard module + /drift route delete

<DriftFlagsCard> replaced by <DriftModule> horizontal-bar leaderboard
inline on /dashboard. Renders null when no elevated categories; pluralizes
headline; per-row bar fill clamped at 10× ratio with baseline tick.
Drilldown affordances dropped per locked decision R.0 #3.

/drift route deleted. /drift → /dashboard#drift permanent redirect added
to next.config.js. revalidatePath('/drift') calls in server actions
rewritten to '/dashboard'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T5 — Weekly brief editorial card + /insights route delete

**Goal:** `<WeekInsightCard>` editorial card with Fraunces lead, body paragraphs, computed stats grid, sequence number, "Read full brief →" link with `?week=` deep-link. Delete `src/app/(app)/insights/`. Two redirects. Audit `revalidatePath('/insights')` + email digest links.

**Files:**
- Create: `src/components/dashboard/week-insight-card.tsx`
- Move: `src/components/insights/generate-button.tsx` → `src/components/dashboard/generate-button.tsx`
- Modify: `src/lib/db/queries/insights.ts` (add `getWeeklyBriefStats`, `getInsightSequenceNumber`)
- Modify: `src/app/(app)/dashboard/page.tsx` (mount `<WeekInsightCard>`; honor `?week=` searchParam)
- Modify: `next.config.js` (add 2 redirects)
- Modify: any `src/lib/**/actions.ts` containing `revalidatePath('/insights')`
- Modify: `src/app/api/cron/digest/route.ts` (rewrite `/insights` links to `/dashboard#brief`)
- Delete: `src/components/dashboard/insight-teaser-card.tsx`
- Delete: `src/app/(app)/insights/` (entire directory)

**Subtasks:**

- [ ] **Step 5.1 — Add `getWeeklyBriefStats` query (TDD optional — pure SQL)**

```ts
// src/lib/db/queries/insights.ts — append

export type WeeklyBriefStats = {
  spendCents: number;
  incomeCents: number;
  netCents: number;
};

/**
 * Spend / income / net totals across [weekStart, weekEnd] for the brief
 * stats grid. Same exclusion list as getDashboardSummary (TRANSFER_IN/
 * TRANSFER_OUT/LOAN_PAYMENTS) so the numbers agree with the rest of the
 * dashboard.
 *
 * Plaid sign convention: positive amount = money out, negative = money in.
 */
export async function getWeeklyBriefStats(
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyBriefStats> {
  const [row] = await db
    .select({
      spend: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric > 0 THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount}::numeric < 0 THEN -${transactions.amount}::numeric ELSE 0 END), 0)`,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(externalItems.userId, userId),
        gte(transactions.date, weekStart),
        lte(transactions.date, weekEnd),
        notInArray(financialAccounts.type, ['investment']),
        sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`,
      ),
    );

  const spendCents = Math.round(Number(row?.spend ?? 0) * 100);
  const incomeCents = Math.round(Number(row?.income ?? 0) * 100);
  return {
    spendCents,
    incomeCents,
    netCents: incomeCents - spendCents,
  };
}

/**
 * 1-indexed sequence number for "№ N" eyebrow on the weekly brief card.
 * Counts insights with week_start ≤ this week's start.
 */
export async function getInsightSequenceNumber(
  userId: string,
  weekStart: string,
): Promise<number> {
  const [row] = await db
    .select({
      count: sql<string>`COUNT(*)`,
    })
    .from(insights)
    .where(
      and(
        eq(insights.userId, userId),
        lte(insights.weekStart, weekStart),
      ),
    );
  return Number(row?.count ?? 0);
}
```

Add the needed imports to the top of `insights.ts`:
```ts
import { and, eq, gte, lte, notInArray, sql } from 'drizzle-orm';
import {
  externalItems,
  financialAccounts,
  insights,
  transactions,
} from '@/lib/db/schema';
import { db } from '@/lib/db';
```

(Adapt the imports to whatever is already present in `insights.ts`.)

- [ ] **Step 5.2 — Move `<GenerateButton>` into dashboard components**

```bash
mv src/components/insights/generate-button.tsx src/components/dashboard/generate-button.tsx
```

Update its import path everywhere it's referenced (will only be the dashboard from now on, but check existing consumers):

```bash
grep -rn "components/insights/generate-button" src/
```

Rewrite each match to `components/dashboard/generate-button`.

- [ ] **Step 5.3 — Create `<WeekInsightCard>`**

```tsx
// src/components/dashboard/week-insight-card.tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GenerateButton } from './generate-button';
import type { Insight } from '@/lib/db/queries/insights';

type Props = {
  insight: Insight | null;
  sequenceNumber: number;
  stats: { spendCents: number; incomeCents: number; netCents: number } | null;
};

const fmtMoney = (cents: number) =>
  `$${(Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtWeekRange = (weekStart: string, weekEnd: string) => {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${weekEnd}T00:00:00Z`);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const startStr = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const endStr = sameMonth
    ? end.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
    : end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
  return `${startStr}–${endStr}, ${start.getUTCFullYear()}`;
};

/**
 * Wraps numeric tokens ($X.YY, NX, N×) in a mono span so they render in
 * Plex Mono inline with the Fraunces body text. Regex-only, no JSX
 * parsing — the AI output is plain text.
 */
function withMonoNumerals(text: string): React.ReactNode {
  const parts = text.split(/(\$[\d,]+\.\d{2}|\d+(?:\.\d+)?[x×])/g);
  return parts.map((p, i) =>
    /\$[\d,]+\.\d{2}|\d+(?:\.\d+)?[x×]/.test(p) ? (
      <span key={i} className="font-mono tabular-nums">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function WeekInsightCard({ insight, sequenceNumber, stats }: Props) {
  if (!insight) {
    return (
      <section id="brief" className="rounded-card bg-[--surface] p-6 text-center">
        <p className="text-sm text-[--text-2]">No brief for this week yet.</p>
        <div className="mt-4">
          <GenerateButton />
        </div>
      </section>
    );
  }

  const paragraphs = insight.narrative.split(/\n\n+/).filter(Boolean);
  const lead = paragraphs[0] ?? '';
  const body = paragraphs.slice(1);

  return (
    <article id="brief" className="rounded-card bg-[--surface] p-6">
      <header className="flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
        <span>Weekly Brief</span>
        <span className="h-px flex-1 bg-[--text-3] opacity-30" />
        <span>
          № {sequenceNumber} · {fmtWeekRange(insight.weekStart, insight.weekEnd)}
        </span>
      </header>

      <div className="mt-5 space-y-3">
        {lead && (
          <p className="font-serif text-xl italic leading-snug text-[--text]">
            {withMonoNumerals(lead)}
          </p>
        )}
        {body.map((para, i) => (
          <p key={i} className="text-sm leading-relaxed text-[--text-2]">
            {withMonoNumerals(para)}
          </p>
        ))}
      </div>

      {stats && (
        <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-[--hairline] pt-4 text-xs">
          <div>
            <dt className="text-[--text-3]">Spend</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-[--text]">
              {fmtMoney(stats.spendCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[--text-3]">Income</dt>
            <dd className="mt-0.5 font-mono tabular-nums text-[--text]">
              {fmtMoney(stats.incomeCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[--text-3]">Net</dt>
            <dd
              className={
                stats.netCents >= 0
                  ? 'mt-0.5 font-mono tabular-nums text-[--success]'
                  : 'mt-0.5 font-mono tabular-nums text-[--caution]'
              }
            >
              {stats.netCents >= 0 ? '+' : '−'}
              {fmtMoney(stats.netCents)}
            </dd>
          </div>
        </dl>
      )}

      <footer className="mt-5 flex items-center justify-between text-xs text-[--text-3]">
        <span>— Foothold</span>
        <Link
          href={`/dashboard?week=${insight.weekStart}`}
          className="inline-flex items-center gap-1 text-[--text-2] hover:text-[--text]"
        >
          Read full brief <ArrowRight className="h-3 w-3" />
        </Link>
      </footer>
    </article>
  );
}
```

- [ ] **Step 5.4 — Wire dashboard page to honor `?week=` searchParam**

```tsx
// src/app/(app)/dashboard/page.tsx

// Update signature:
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  // ...
  // Replace getLatestInsight call with conditional:
  const insightPromise = searchParams.week
    ? getInsightByWeekStart(userId, searchParams.week)  // new function — see step 5.5
    : getLatestInsight(userId);

  // Then in Promise.all, replace `getLatestInsight(userId)` with `insightPromise`.

  // After insight resolves, compute the rest:
  const [briefStats, briefSeqNum] = insight
    ? await Promise.all([
        getWeeklyBriefStats(userId, insight.weekStart, insight.weekEnd),
        getInsightSequenceNumber(userId, insight.weekStart),
      ])
    : [null, 0];

  // Replace <InsightTeaserCard insight={latestInsight} /> with:
  <WeekInsightCard
    insight={insight}
    sequenceNumber={briefSeqNum}
    stats={briefStats}
  />
}
```

- [ ] **Step 5.5 — Add `getInsightByWeekStart` (also in insights.ts)**

```ts
// src/lib/db/queries/insights.ts — append

export async function getInsightByWeekStart(
  userId: string,
  weekStart: string,
): Promise<Insight | null> {
  const [row] = await db
    .select()
    .from(insights)
    .where(
      and(
        eq(insights.userId, userId),
        eq(insights.weekStart, weekStart),
      ),
    )
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 5.6 — Add /insights redirects to `next.config.js`**

```js
async redirects() {
  return [
    { source: '/drift', destination: '/dashboard#drift', permanent: true },
    { source: '/insights', destination: '/dashboard#brief', permanent: true },
    {
      source: '/insights/:week',
      destination: '/dashboard?week=:week',
      permanent: true,
    },
    // ...preserved existing redirects
  ];
},
```

- [ ] **Step 5.7 — Audit and rewrite `revalidatePath('/insights')` calls**

```bash
grep -rn "revalidatePath.*'/insights'" src/
```

Rewrite each match to `revalidatePath('/dashboard')`. Likely match: `src/lib/insights/actions.ts` (GenerateButton's action).

- [ ] **Step 5.8 — Audit + rewrite email digest links**

```bash
grep -n "/insights" src/app/api/cron/digest/route.ts
```

For each match, rewrite to `/dashboard#brief` (or `/dashboard?week=...` if the digest deep-links a specific week).

- [ ] **Step 5.9 — Delete /insights route + InsightTeaserCard**

```bash
rm -rf src/app/\(app\)/insights/
rm src/components/dashboard/insight-teaser-card.tsx
```

Also delete `src/components/insights/` if it's now empty:
```bash
[ -z "$(ls src/components/insights/ 2>/dev/null)" ] && rmdir src/components/insights/
```

- [ ] **Step 5.10 — Typecheck + lint + tests**

```bash
npm run typecheck && npm run lint && npm run test
```
Expected: all green. Existing /insights tests delete with the route.

- [ ] **Step 5.11 — Browser UAT**

http://localhost:3000/dashboard:
- WeekInsightCard renders with eyebrow "Weekly Brief · № N · Date Range"
- Lead paragraph in Fraunces italic, larger size
- Body paragraphs at smaller body size
- Numeric tokens wrap in mono (`$338.69`, `10.3×`)
- Stats grid renders Spend / Income / Net with positive Net in `--success`
- "Read full brief →" link present

http://localhost:3000/insights → redirects to `/dashboard#brief`, scrolls to brief card.
http://localhost:3000/insights/2026-05-04 → redirects to `/dashboard?week=2026-05-04`. Dashboard renders the May 4 brief (not the latest).

Trigger a manual cron locally:
```bash
curl -X GET http://localhost:3000/api/cron/digest -H "Authorization: Bearer $CRON_SECRET"
```
Verify the rendered email links to `/dashboard#brief`, not `/insights`.

- [ ] **Step 5.12 — Commit T5**

```bash
git add src/components/dashboard/week-insight-card.tsx \
        src/components/dashboard/generate-button.tsx \
        src/lib/db/queries/insights.ts \
        src/app/\(app\)/dashboard/page.tsx \
        next.config.js \
        src/app/api/cron/digest/route.ts
git add -u src/lib/ \
            src/components/dashboard/insight-teaser-card.tsx \
            src/components/insights/ \
            src/app/\(app\)/insights/
git commit -m "$(cat <<'EOF'
feat(r2): T5 weekly brief fold — editorial card + /insights route delete

<InsightTeaserCard> replaced by <WeekInsightCard> editorial card inline
on /dashboard. Eyebrow renders "Weekly Brief · № N · WeekStart—WeekEnd";
existing insight.narrative split on \n\n with first paragraph promoted
to Fraunces italic lead. Numeric tokens auto-wrap in mono. Stats grid
(Spend/Income/Net) computed live from new getWeeklyBriefStats query.
Brief sequence number from new getInsightSequenceNumber query. Deep-link
via ?week= searchParam honored.

/insights and /insights/[week] routes deleted. Permanent redirects in
next.config.js: /insights → /dashboard#brief, /insights/:week →
/dashboard?week=:week. revalidatePath('/insights') in server actions
rewritten to '/dashboard'. Email digest links rewritten.

<GenerateButton> relocated from src/components/insights/ to
src/components/dashboard/ for empty-state rendering on the brief card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T6 — Goals + recurring + activity restyle

**Goal:** Restyle existing `<GoalsRow>`, `<UpcomingRecurringCard>` → `<RecurringList>`, `<RecentActivityCard>` → `<RecentActivity>` per prototype. Pure presentational rewrites — no new queries, no logic changes.

**Files:**
- Modify: `src/components/dashboard/goals-row.tsx`
- Create: `src/components/dashboard/recurring-list.tsx`
- Create: `src/components/dashboard/recent-activity.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (rename imports)
- Delete: `src/components/dashboard/upcoming-recurring-card.tsx`
- Delete: `src/components/dashboard/recent-activity-card.tsx`

**Subtasks:**

- [ ] **Step 6.1 — Read current components to preserve their data contracts**

```bash
cat src/components/dashboard/goals-row.tsx \
    src/components/dashboard/upcoming-recurring-card.tsx \
    src/components/dashboard/recent-activity-card.tsx
```

Note their props, drilldowns, and any mobile-tap-to-edit behavior to preserve.

- [ ] **Step 6.2 — Restyle `<GoalsRow>` to match prototype**

Reference: [claude-design-context/foothold-dashboard.jsx](../../../claude-design-context/foothold-dashboard.jsx) `GoalsRow` function.

Apply Foothold tokens (`--surface`, `--text`, `--text-2`, `--text-3`, `--accent`, `--caution`). Preserve the per-goal drilldown to `/goals/[id]`. Layout: section header with "All goals →" link, 2-up grid of goal cards each with name + sub-status + progress bar + amount/pct row.

- [ ] **Step 6.3 — Create `<RecurringList>` mirroring prototype**

Reference: `RecurringList` function in the bundle.

```tsx
// src/components/dashboard/recurring-list.tsx
import Link from 'next/link';
import { ArrowRight, Calendar } from 'lucide-react';
import type { UpcomingRecurring } from '@/lib/db/queries/recurring';

const fmtMoney = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (yyyymmdd: string) => {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

export function RecurringList({ upcoming }: { upcoming: UpcomingRecurring[] }) {
  const total = upcoming.reduce((sum, r) => sum + r.expectedAmount, 0);
  return (
    <section className="rounded-card bg-[--surface] p-5">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
            Recurring · Next 7 Days
          </div>
          <div className="mt-1 font-mono text-sm tabular-nums text-[--text]">
            {upcoming.length} {upcoming.length === 1 ? 'charge' : 'charges'} expected
            {' · '}
            {fmtMoney(total)}
          </div>
        </div>
        <Link
          href="/recurring"
          className="inline-flex items-center gap-1 text-xs text-[--text-2] hover:text-[--text]"
        >
          All recurring <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <ul className="mt-4 space-y-2">
        {upcoming.map((r) => {
          const RowContent = (
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm">
              <Calendar className="h-3.5 w-3.5 text-[--text-3]" aria-hidden />
              <div>
                <div className="text-[--text]">{r.merchantName ?? r.streamName}</div>
                <div className="text-xs text-[--text-3]">
                  {fmtDate(r.expectedDate)}
                </div>
              </div>
              <div className="font-mono tabular-nums text-[--text]">
                {fmtMoney(r.expectedAmount)}
              </div>
            </div>
          );
          const drillHref =
            r.merchantName
              ? `/transactions?q=${encodeURIComponent(r.merchantName)}&from=${sixMonthsAgoStr()}`
              : null;
          return (
            <li key={r.streamId}>
              {drillHref ? (
                <Link href={drillHref} className="block rounded p-1.5 hover:bg-[--surface-2]">
                  {RowContent}
                </Link>
              ) : (
                <div className="p-1.5">{RowContent}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function sixMonthsAgoStr(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}
```

(Confirm `UpcomingRecurring` field names match the actual return type from [src/lib/db/queries/recurring.ts](../../../src/lib/db/queries/recurring.ts) `getUpcomingRecurringOutflows`. Adapt as needed.)

- [ ] **Step 6.4 — Create `<RecentActivity>` mirroring prototype**

Reference: `RecentActivity` function in the bundle. Preserve mobile tap-to-edit at `<md` per Phase 6 mobile-first dashboard polish — at `md+` the rows are presentational; at `<md` they open the `<TransactionDetailSheet>` half-sheet.

Read the existing `<RecentActivityCard>` to know the exact tap-to-edit wiring; preserve its mobile state-management.

```tsx
// src/components/dashboard/recent-activity.tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { RecentTransaction } from '@/lib/db/queries/dashboard';
import { humanizeCategory } from '@/lib/format/category';
// Preserve mobile tap-to-edit infrastructure — copy from recent-activity-card.tsx

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (yyyymmdd: string) => {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

type Props = {
  transactions: RecentTransaction[];
  categoryOptions: Array<{ id: string; name: string }>;
};

export function RecentActivity({ transactions, categoryOptions }: Props) {
  return (
    <section>
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[--text]">Recent activity</h3>
          <div className="text-xs text-[--text-3]">Last {transactions.length} transactions</div>
        </div>
        <Link
          href="/transactions"
          className="inline-flex items-center gap-1 text-xs text-[--text-2] hover:text-[--text]"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <ul className="mt-3 divide-y divide-[--hairline]">
        {transactions.map((tx) => {
          const isInflow = tx.amount < 0;
          const sign = isInflow ? '+' : '−';
          return (
            <li
              key={tx.id}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-2.5 text-sm"
            >
              <div className="font-mono text-xs tabular-nums text-[--text-3]">
                {fmtDate(tx.date)}
              </div>
              <div>
                <div className="text-[--text]">{tx.merchantName ?? tx.name}</div>
                <div className="text-xs uppercase tracking-wide text-[--text-3]">
                  {tx.name}
                </div>
              </div>
              <div className="text-xs text-[--text-2]">
                {humanizeCategory(tx.overrideCategoryName ?? tx.primaryCategory ?? '')}
              </div>
              <div
                className={
                  isInflow
                    ? 'font-mono tabular-nums text-[--success]'
                    : 'font-mono tabular-nums text-[--text]'
                }
              >
                {sign}{fmtMoney(tx.amount)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

**Preserve mobile tap-to-edit:** wrap rows at `<md` with the existing detail-sheet trigger. Copy that logic from the soon-to-be-deleted `recent-activity-card.tsx`. Pattern: client-component wrapper holding `activeRow` state + `<TransactionDetailSheet>` mount.

- [ ] **Step 6.5 — Wire renamed components into dashboard page**

```tsx
// src/app/(app)/dashboard/page.tsx
// Replace imports:
// - import { UpcomingRecurringCard } from '@/components/dashboard/upcoming-recurring-card';
// - import { RecentActivityCard } from '@/components/dashboard/recent-activity-card';
// + import { RecurringList } from '@/components/dashboard/recurring-list';
// + import { RecentActivity } from '@/components/dashboard/recent-activity';

// Replace mounts:
// - <UpcomingRecurringCard upcoming={upcomingRecurring} />
// + <RecurringList upcoming={upcomingRecurring} />
//
// - <RecentActivityCard transactions={recent} categoryOptions={categoryOptions} />
// + <RecentActivity transactions={recent} categoryOptions={categoryOptions} />
```

- [ ] **Step 6.6 — Delete obsolete components**

```bash
rm src/components/dashboard/upcoming-recurring-card.tsx
rm src/components/dashboard/recent-activity-card.tsx
```

- [ ] **Step 6.7 — Typecheck + lint + tests**

```bash
npm run typecheck && npm run lint && npm run test
```
Expected: all green. No new tests in T6 (presentational rewrites).

- [ ] **Step 6.8 — Browser UAT**

http://localhost:3000/dashboard:
- Goals row: 2-up grid; existing per-goal drilldown to `/goals/[id]` works
- Recurring list: 7-day window, mono amounts, calendar icon per row, "All recurring →" link
- Recent activity: flat list (date · desc + raw · cat · amount), mobile tap opens edit sheet at `<md`

- [ ] **Step 6.9 — Commit T6**

```bash
git add src/components/dashboard/goals-row.tsx \
        src/components/dashboard/recurring-list.tsx \
        src/components/dashboard/recent-activity.tsx \
        src/app/\(app\)/dashboard/page.tsx
git add -u src/components/dashboard/upcoming-recurring-card.tsx \
            src/components/dashboard/recent-activity-card.tsx
git commit -m "$(cat <<'EOF'
feat(r2): T6 goals / recurring / activity restyle per Foothold identity

Pure presentational rewrites of three dashboard sections to match the
prototype. <GoalsRow> restyled to bundle's 2-up goal grid; per-goal
drilldown to /goals/[id] preserved. <UpcomingRecurringCard> renamed +
restyled to <RecurringList>; merchant drilldown to filtered /transactions
preserved. <RecentActivityCard> renamed + restyled to <RecentActivity>;
mobile tap-to-edit at <md preserved.

No new queries, no logic changes — all data shapes and consumer behaviors
identical to pre-T6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T7 — Freshness annotation helper

**Goal:** Single pure helper `formatFreshness()` locks the R.2 → R.3 propagation contract. Page header and hero consume it (replacing T1's inline approximation).

**Files:**
- Create: `src/lib/format/freshness.ts`
- Create: `src/lib/format/freshness.test.ts`
- Modify: `src/components/dashboard/page-header.tsx` (consume helper)
- Modify: `src/components/dashboard/net-worth-hero.tsx` (consume helper)
- Modify: `src/app/(app)/dashboard/page.tsx` (replace inline approximation with helper)

**Subtasks:**

- [ ] **Step 7.1 — Write `freshness.test.ts` first (TDD)**

```ts
// src/lib/format/freshness.test.ts
import { describe, expect, it } from 'vitest';
import { formatFreshness } from './freshness';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const now = new Date('2026-05-10T18:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const hoursAgo = (h: number) => new Date(now.getTime() - h * ONE_HOUR_MS);
const daysAgo = (d: number) => new Date(now.getTime() - d * ONE_DAY_MS);

describe('formatFreshness', () => {
  it('returns "No sources connected" when sources is empty', () => {
    expect(formatFreshness({ sources: [], now })).toEqual({
      headline: 'No sources connected',
      caveat: null,
    });
  });

  it('returns "Syncing · N sources" when all sources have lastSyncAt=null', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: null },
          { name: 'Wells Fargo', lastSyncAt: null },
        ],
        now,
      }),
    ).toEqual({
      headline: 'Syncing · 2 sources',
      caveat: 'Numbers will fill in shortly',
    });
  });

  it('returns "Syncing" branch when ANY source is never-synced', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: hoursAgo(2) },
          { name: 'Wells Fargo', lastSyncAt: null },
        ],
        now,
      }).headline,
    ).toMatch(/^Syncing/);
  });

  it('returns "Fresh Nh ago · N sources" when all fresh (≤ 12h)', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: hoursAgo(2) },
          { name: 'Wells Fargo', lastSyncAt: hoursAgo(5) },
        ],
        now,
      }),
    ).toEqual({
      headline: 'Fresh 5h ago · 2 sources',
      caveat: null,
    });
  });

  it('uses age of OLDEST source (conservative anchor per Phase 5)', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: minutesAgo(15) },
          { name: 'Wells Fargo', lastSyncAt: hoursAgo(8) },
        ],
        now,
      }).headline,
    ).toBe('Fresh 8h ago · 2 sources');
  });

  it('returns "Last sync Nh ago" when some sources stale (>12h, <7d)', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: hoursAgo(2) },
          { name: 'Wells Fargo', lastSyncAt: daysAgo(3) },
        ],
        now,
      }).headline,
    ).toMatch(/^Last sync 3d ago · 2 sources/);
  });

  it('singularizes source label when N=1', () => {
    expect(
      formatFreshness({
        sources: [{ name: 'Chase', lastSyncAt: hoursAgo(2) }],
        now,
      }).headline,
    ).toBe('Fresh 2h ago · 1 source');
  });

  it('uses minutes for ages <1h', () => {
    expect(
      formatFreshness({
        sources: [{ name: 'Chase', lastSyncAt: minutesAgo(8) }],
        now,
      }).headline,
    ).toBe('Fresh 8m ago · 1 source');
  });

  it('handles single never-synced source as Syncing', () => {
    expect(
      formatFreshness({
        sources: [{ name: 'Chase', lastSyncAt: null }],
        now,
      }),
    ).toEqual({
      headline: 'Syncing · 1 source',
      caveat: 'Numbers will fill in shortly',
    });
  });

  it('defaults now to Date.now() when not provided', () => {
    // Smoke test that the call shape works without `now`.
    const result = formatFreshness({
      sources: [{ name: 'Chase', lastSyncAt: new Date() }],
    });
    expect(result.headline).toContain('source');
  });
});
```

- [ ] **Step 7.2 — Run failing tests**

```bash
npx vitest run src/lib/format/freshness.test.ts
```
Expected: FAIL.

- [ ] **Step 7.3 — Implement `freshness.ts`**

```ts
// src/lib/format/freshness.ts
import { formatRelative } from './date';

export type FreshnessInput = {
  sources: Array<{ name: string; lastSyncAt: Date | null }>;
  now?: Date;
};

export type FreshnessText = {
  headline: string;
  caveat: string | null;
};

/** ≤ 12h per Phase 2 FRESHNESS_POLICY for balances; conservative default. */
const FRESH_WINDOW_MS = 12 * 60 * 60 * 1000;
/** >12h, <7d = "stale but reporting" — still informational, not alarming. */
const STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Canonical freshness pattern for R.2+. R.3 propagation contract — must
 * stay stable. Page-header, hero fineprint, and (later) section-level
 * freshness lines all read from this helper.
 *
 * Rules:
 *   - Empty sources: "No sources connected"
 *   - Any source never-synced: "Syncing · N sources" + caveat
 *   - All fresh: "Fresh Nh ago · N sources" (age = oldest source, per
 *     Phase 5's conservative-anchor decision — don't flatter a freshest
 *     source while others lag)
 *   - Some stale: "Last sync Nh ago · N sources" (age = oldest)
 */
export function formatFreshness(input: FreshnessInput): FreshnessText {
  const now = input.now ?? new Date();
  const { sources } = input;

  if (sources.length === 0) {
    return { headline: 'No sources connected', caveat: null };
  }

  const sourceLabel = sources.length === 1 ? 'source' : 'sources';

  const hasNeverSynced = sources.some((s) => s.lastSyncAt === null);
  if (hasNeverSynced) {
    return {
      headline: `Syncing · ${sources.length} ${sourceLabel}`,
      caveat: 'Numbers will fill in shortly',
    };
  }

  // All sources have a non-null lastSyncAt by here.
  const ages = sources.map((s) => now.getTime() - s.lastSyncAt!.getTime());
  const oldestAgeMs = Math.max(...ages);
  const oldestSync = new Date(now.getTime() - oldestAgeMs);

  const verb =
    oldestAgeMs <= FRESH_WINDOW_MS
      ? 'Fresh'
      : oldestAgeMs <= STALE_WINDOW_MS
        ? 'Last sync'
        : 'Last sync';

  return {
    headline: `${verb} ${formatRelative(oldestSync, now)} · ${sources.length} ${sourceLabel}`,
    caveat: null,
  };
}
```

- [ ] **Step 7.4 — Run tests to confirm pass**

```bash
npx vitest run src/lib/format/freshness.test.ts
```
Expected: PASS — 10 cases.

- [ ] **Step 7.5 — Wire helper into dashboard page (replacing T1's inline approximation)**

```tsx
// src/app/(app)/dashboard/page.tsx

// Add import:
import { formatFreshness } from '@/lib/format/freshness';

// Replace the inline `freshnessHeadline = trustSummary.kind === 'healthy' ? ...`
// block with:
const freshnessInput = {
  sources: sourceHealth.map((s) => ({
    name: s.institutionName,
    lastSyncAt: s.lastSuccessfulSyncAt,  // confirm field name in SourceHealth type
  })),
};
const freshness = formatFreshness(freshnessInput);

// Pass to PageHeader:
<PageHeader
  todayLabel={todayLabel}
  freshnessHeadline={freshness.headline}
  freshnessCaveat={freshness.caveat}
/>

// Pass to NetWorthHero (replaces the T2-era prop):
<NetWorthHero
  netWorth={summary.netWorth}
  monthlyDelta={monthlyDelta}
  historicalSeries={historicalSeries}
  forecastSeries={forecastSeries}
  band={band}
  freshnessHeadline={freshness.headline}
/>

// If historicalSeries is empty AND there's no caveat from freshness,
// the NetWorthHero's empty-state message handles "Trend appears once
// accounts have 30 days of history" — no additional caveat needed.
```

**⚠️ Confirm `SourceHealth.lastSuccessfulSyncAt` field name** by reading [src/lib/db/queries/health.ts](../../../src/lib/db/queries/health.ts) before this step.

- [ ] **Step 7.6 — Update NetWorthHero to accept optional caveat**

```tsx
// src/components/dashboard/net-worth-hero.tsx
// Add prop to type:
freshnessCaveat?: string | null;

// In footer, render caveat below freshnessHeadline if present:
<div className="text-right text-[--text-3]">
  <div>{freshnessHeadline}</div>
  {freshnessCaveat && <div className="mt-0.5">{freshnessCaveat}</div>}
</div>
```

Pass `freshnessCaveat={freshness.caveat}` from the dashboard page.

- [ ] **Step 7.7 — Typecheck + lint + tests**

```bash
npm run typecheck && npm run lint && npm run test
```
Expected: all green; +10 freshness tests.

- [ ] **Step 7.8 — Browser UAT**

http://localhost:3000/dashboard:
- Page header right-meta shows "Fresh Nh ago · N sources"
- Hero fineprint shows the same line (plus caveat if applicable)
- Toggle a source to a stale state (manually edit `error_log` or wait) → headline swaps to "Last sync Nh ago · N sources"
- Disconnect all sources (or test in a clean DB) → "No sources connected"
- Cold-start install (delete sync info) → "Syncing · N sources" + "Numbers will fill in shortly"

- [ ] **Step 7.9 — Commit T7**

```bash
git add src/lib/format/freshness.ts \
        src/lib/format/freshness.test.ts \
        src/components/dashboard/page-header.tsx \
        src/components/dashboard/net-worth-hero.tsx \
        src/app/\(app\)/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
feat(r2): T7 freshness annotation helper + propagation seam

New pure helper formatFreshness() in src/lib/format/freshness.ts locks
the R.2 → R.3 propagation contract. Five input states (empty, all
never-synced, any never-synced, all fresh, some stale) → canonical
{ headline, caveat } output. Age uses OLDEST source per Phase 5's
conservative-anchor rule (don't flatter freshest source while others lag).
Reuses formatRelative() from src/lib/format/date.ts; no duplication.

PageHeader + NetWorthHero consume the helper, replacing T1's inline
approximation in dashboard/page.tsx. R.3 phases (investments, forecast,
goals, recurring) will import the same helper for section-level lines.

10 vitest cases cover every input state plus singular-source label,
minute-resolution ages, and default `now` parameter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## T8 — UAT polish

**Goal:** Reserved fixup commits surfaced during the post-T7 UAT pass. Analogous to R.1's three polish commits (`d08f235`, `1ae898c`, `a95c209`).

**Process:**

- [ ] **Step 8.1 — Run full UAT pass against SPEC § "UAT criteria"**

Walk every checkbox in [SPEC.md § UAT criteria](SPEC.md). Record failures.

- [ ] **Step 8.2 — Cross-check against the prototype**

Open [claude-design-context/foothold-dashboard.jsx](../../../claude-design-context/foothold-dashboard.jsx) side-by-side with the live dashboard. Note visual deltas. Decide which are bugs vs. acceptable variance.

- [ ] **Step 8.3 — Test the redirects from clean state**

```bash
curl -i http://localhost:3000/drift
curl -i http://localhost:3000/insights
curl -i http://localhost:3000/insights/2026-05-04
```
Expected: each returns 308 Permanent Redirect with correct `Location` header.

- [ ] **Step 8.4 — Trigger the email digest cron locally**

```bash
curl -X GET http://localhost:3000/api/cron/digest -H "Authorization: Bearer $CRON_SECRET"
```
Confirm: no `/insights` or `/drift` in the rendered email body. All links route to `/dashboard` or `/dashboard#brief`.

- [ ] **Step 8.5 — Verify revalidatePath audits with an active mutation**

- Re-categorize a transaction on `/transactions` → verify dashboard's drift module and brief stats reflect the change without a hard reload
- Generate a fresh weekly brief via the dashboard's empty-state CTA → verify the new brief renders without a hard reload

- [ ] **Step 8.6 — Dark mode parity pass**

Toggle theme. Walk dashboard. Verify:
- Hero trajectory line + band legible
- All cards' surface, text-2, text-3 tokens resolve
- Goal progress bars + drift module bars render in `--accent`, `--caution`, `--text-3`
- Brief card Fraunces lead readable against dark surface

- [ ] **Step 8.7 — `prefers-reduced-motion` audit**

DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`. Reload dashboard. Verify:
- Hero count-up disabled
- `<MotionStack>` stagger animation disabled (existing behavior; should already respect)
- No JS errors

- [ ] **Step 8.8 — RSC boundary verification**

```bash
grep -rn "'use client'" src/components/dashboard/
```
Expected matches: `hero-trajectory.tsx`, `count-up-number.tsx`, possibly `recent-activity.tsx` (mobile tap-to-edit wrapper), `generate-button.tsx`. No `'use client'` on `page-header.tsx`, `net-worth-hero.tsx`, `kpis.tsx`, `drift-module.tsx`, `week-insight-card.tsx`, `recurring-list.tsx`, `goals-row.tsx`.

Trigger a production-mode build and inspect logs for `Functions cannot be passed` errors:
```bash
# Make sure dev is killed first
lsof -nP -iTCP:3000 -sTCP:LISTEN
# kill the process if present
npm run build
```
Expected: clean build, no RSC serialization errors.

- [ ] **Step 8.9 — Lighthouse before/after**

```bash
# Restart dev cleanly
rm -rf .next
npm run dev
```
Compare Lighthouse on `/dashboard` against R.1's baseline (recorded at end of R.1 work). Expected: no LCP / CLS / TBT regression.

- [ ] **Step 8.10 — Commit each fix as its own commit**

For each issue surfaced:

```bash
git add <touched files>
git commit -m "fix(r2): <terse description of issue>

<one or two sentences on root cause + fix>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Aim for 1-3 polish commits. If T8 surfaces more than 5 issues, that's a signal earlier tasks weren't fully verified — pause and reflect before continuing to merge.

---

## Acceptance gates (full phase)

R.2 ships when:

1. ✅ All 8 tasks (T1–T8) committed atomically on `feat/r2-dashboard`
2. ✅ `npm run typecheck` passes
3. ✅ `npm run lint` passes
4. ✅ `npm run test` passes — baseline + ~28 new tests
5. ✅ `npm run build` produces a green build (run AFTER killing `next dev`)
6. ✅ `npm run dev` renders /dashboard cleanly without console errors
7. ✅ Every checkbox in SPEC § UAT criteria checked
8. ✅ /drift, /insights, /insights/[week] all redirect via 308 Permanent
9. ✅ Email digest renders with `/dashboard` links only
10. ✅ Dark + light mode parity verified on /dashboard
11. ✅ `prefers-reduced-motion` honored on count-up animation
12. ✅ Lighthouse on /dashboard shows no regression vs R.1 baseline
13. ✅ Branch ready to merge to `feat/redesign`

---

## Out of scope (explicit non-goals for R.2)

- Per-page restyle of Goals, Recurring, Transactions, Investments, Simulator, Settings → R.3
- Goals "Moves" feature + scenario unification → R.4
- Mobile rebuild on top of new desktop visuals → R.5
- Hero count-up motion polish, position-dot pulse refinement, drift-row stagger → R.6
- Per-KPI freshness annotations (only page-level + hero-level in R.2) → R.3 if needed
- Anthropic prompt rewrite for editorial brief lead → defer; T8 may surface a need but the rewrite is its own concern
- Drift category drilldown re-add (locked decision drops it) → R.3 if 1-week UAT shows friction
- Plaid Balance product re-authorization (currently on Path B) → independent operations track
- `/recurring`, `/transactions`, `/investments` IA changes — they only inherit new tokens via R.1; full restyle is R.3

---

## Dependencies

**Upstream**: R.1 Foundation (tokens, fonts, `<FootholdMark>`, sidebar/top-bar restyle, page-bg textures) — assumed shipped on `feat/redesign` branch.

**Downstream**: R.3 per-page sweep depends on R.2's freshness helper (`formatFreshness`) being available for section-level annotations on every page.

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `<HeroTrajectory>` RSC boundary failure (strike 3 → architecture guard) | Medium | T2 + T8 step 8.8 explicit grep audit; only `<HeroTrajectory>` and `<CountUpNumber>` carry `'use client'` |
| Plaid Balance Path B honesty conflict with "Fresh Nh ago" copy | Low | T7 helper uses 12h `FRESH_WINDOW_MS` threshold matching Phase 2 policy; consistent across surfaces |
| Email digest links 404 post-redirect | Medium | T5 step 5.8 grep audit; T8 step 8.4 local cron verification |
| `npm run build` overwrites running `next dev` chunks → broken pages | Low | T8 step 8.9 explicit `rm -rf .next` + restart dev before Lighthouse |
| Hero forecast misleads on new install (<30d history) | High | Mitigation = feature-disable: `getNetWorthSparkline` returns `[]`; `<NetWorthHero>` renders caveat instead of chart. `uncertaintyBand` returns null when <60 points. UAT step 2.11 includes this case. |
| Weekly brief lead reads stilted at Fraunces size | Medium | T8 step 8.2 prototype cross-check decides; prompt rewrite is R.3 concern |
| Drift drilldown gap surfaces friction | Medium | 1-week-of-use UAT after R.2 ships; R.3 has freedom to re-add row → `/transactions` filter if needed |

---

## Locked decisions (carried from SPEC.md)

1. **Phase scoping**: one branch, atomic per-task commits matching R.1 rhythm
2. **Forecast band data**: reuse `projectCash()` + naive σ × √t band; null when <60 points history
3. **Runway definition**: net burn with "Net positive" fallback; preserves 3-cell KPI strip
4. **Brief data source**: render existing `insight.narrative` as prose, compute stats live; no schema or AI-prompt changes
5. **Freshness pattern**: aggregate text-only, page-level + hero; single `formatFreshness()` helper propagates to R.3

---

## Test plan summary

| Surface | Type | New cases |
|---|---|---|
| `src/lib/forecast/trajectory.ts` | Unit (vitest) | ~12 |
| `src/lib/forecast/runway.ts` | Unit (vitest) | ~6 |
| `src/lib/format/freshness.ts` | Unit (vitest) | ~10 |
| `getWeeklyBriefStats`, `getInsightSequenceNumber`, `getInsightByWeekStart` queries | UAT only | 0 |
| All component files | UAT only (visual + interaction) | 0 |

**Total**: baseline + 28 new tests (target ~475 total passing post-R.2).

---

## Cross-references

- [docs/redesign/r2-dashboard/SPEC.md](SPEC.md) — locked design decisions
- [docs/redesign/SPEC.md](../SPEC.md) — R.0 master spec
- [docs/redesign/r1-foundation/PLAN.md](../r1-foundation/PLAN.md) — precedent execution rhythm
- [claude-design-context/foothold-dashboard.jsx](../../../claude-design-context/foothold-dashboard.jsx) — canonical visual reference
- [claude-design-context/styles.css](../../../claude-design-context/styles.css) — token + component CSS
- [CLAUDE.md](../../../CLAUDE.md) — architecture invariants (Auth split, RSC boundary lessons, Plaid Balance Path B, Phase 5 trust strip)
