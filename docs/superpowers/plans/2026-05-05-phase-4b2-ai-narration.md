# Phase 4-B2: AI Coaching Narrative — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-generated 3-5 sentence coaching summary panel to the `/simulator` page on top of Plan B-1's working simulator. Panel is suppressed for baseline-only scenarios; requires the user to save the scenario before the panel becomes available. Cached per `(scenarioId, inputHash)` so repeat opens are free.

**Architecture:** Pure history fingerprint and prompt builder modules (vitest-tested) feed a server-side narration core that calls Anthropic Haiku 4.5. Two server actions: `lookupForecastNarrative` (cache-only read) and `generateForecastNarrative` (LLM call + cache write). Client `NarrativePanel` component looks up on mount and shows a Generate button on miss. All caching uses the `forecast_narrative` table that Plan A Task 1 created.

**Tech Stack:** TypeScript · `@anthropic-ai/sdk@^0.32.1` (existing) · Drizzle ORM · `node:crypto` for SHA-256 · React 18 server actions · Vitest.

**Spec reference:** `docs/superpowers/specs/2026-05-04-phase-4-predictive-layer-design.md` §7 (entire AI section).

**Plan A + B-1 foundation consumed:**
- `forecastNarratives` table from `src/lib/db/schema.ts` (already created in Plan A; unique index on `(scenarioId, inputHash)`)
- `projectCash`, `ScenarioOverrides`, `ForecastHistory`, `MonthlyProjection`, `GoalImpact`, `ProjectionResult` types
- `getForecastHistory(userId)` query
- `anthropic` client + `hasAnthropicKey()` helper from `src/lib/anthropic/client.ts`
- `Scenario`, `ForecastNarrativeInsert` from `src/lib/db/schema.ts`
- Existing patterns: `src/lib/anthropic/insights.ts` (Anthropic call), `src/lib/insights/actions.ts` (server action shape), `src/lib/insights/generate.ts` (orchestration)
- `src/app/(app)/simulator/simulator-client.tsx` — Plan B-1's top-level client; will receive a new `<NarrativePanel>` child

---

## File Structure

```
src/lib/forecast/
  ├─ history-fingerprint.ts                CREATE  pure compute fn + query for fingerprint inputs
  └─ history-fingerprint.test.ts           CREATE  vitest unit tests (pure fn only)

src/lib/anthropic/
  ├─ forecast-prompt.ts                    CREATE  pure prompt-builder fn
  ├─ forecast-prompt.test.ts               CREATE  vitest unit tests
  └─ forecast-narrative.ts                 CREATE  Anthropic call + cache helpers (server-only)

src/lib/forecast/
  └─ narrative-actions.ts                  CREATE  lookupForecastNarrative + generateForecastNarrative server actions

src/components/simulator/
  └─ narrative-panel.tsx                   CREATE  Generate button + prose display + regenerate link

src/app/(app)/simulator/
  └─ simulator-client.tsx                  MODIFY  wire <NarrativePanel> into the right column
```

Total: 6 creates + 1 modify = 7 file changes.

**Testing scope:** Pure functions (`computeHistoryFingerprint`, prompt builder, hash util) get vitest coverage. Anthropic call output is non-deterministic — verified manually. Server actions verified via dev usage.

---

## Wave 1 — Pure utilities

### Task 1: History fingerprint module + tests

**Files:**
- Create: `src/lib/forecast/history-fingerprint.ts`
- Create: `src/lib/forecast/history-fingerprint.test.ts`

The fingerprint is the part of the cache key that captures "the underlying world state." It changes when (a) the calendar day rolls over, (b) new transactions sync, or (c) a Plaid item re-syncs. Pure compute function is unit-tested; the query function is verified manually because it touches the DB.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/forecast/history-fingerprint.test.ts
import { describe, expect, it } from 'vitest';
import { buildInputHash, computeHistoryFingerprint } from './history-fingerprint';
import type { ScenarioOverrides } from './types';

describe('computeHistoryFingerprint', () => {
  it('returns a deterministic string for the same inputs', () => {
    const inputs = {
      todayUtc: '2026-05-05',
      transactionCount: 142,
      latestTransactionDate: '2026-05-04',
      latestSyncDate: '2026-05-05',
    };
    expect(computeHistoryFingerprint(inputs)).toBe(
      computeHistoryFingerprint(inputs),
    );
  });

  it('changes when the calendar day rolls over', () => {
    const a = computeHistoryFingerprint({
      todayUtc: '2026-05-05',
      transactionCount: 0,
      latestTransactionDate: null,
      latestSyncDate: null,
    });
    const b = computeHistoryFingerprint({
      todayUtc: '2026-05-06',
      transactionCount: 0,
      latestTransactionDate: null,
      latestSyncDate: null,
    });
    expect(a).not.toBe(b);
  });

  it('changes when transaction count changes', () => {
    const base = {
      todayUtc: '2026-05-05',
      latestTransactionDate: '2026-05-04',
      latestSyncDate: '2026-05-05',
    };
    expect(computeHistoryFingerprint({ ...base, transactionCount: 100 }))
      .not.toBe(computeHistoryFingerprint({ ...base, transactionCount: 101 }));
  });

  it('changes when latest transaction date changes', () => {
    const base = {
      todayUtc: '2026-05-05',
      transactionCount: 100,
      latestSyncDate: '2026-05-05',
    };
    expect(
      computeHistoryFingerprint({ ...base, latestTransactionDate: '2026-05-04' }),
    ).not.toBe(
      computeHistoryFingerprint({ ...base, latestTransactionDate: '2026-05-03' }),
    );
  });

  it('handles null latestTransactionDate gracefully', () => {
    const result = computeHistoryFingerprint({
      todayUtc: '2026-05-05',
      transactionCount: 0,
      latestTransactionDate: null,
      latestSyncDate: null,
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('buildInputHash', () => {
  it('produces a stable SHA-256 hex string', () => {
    const overrides: ScenarioOverrides = { categoryDeltas: [{ categoryId: 'a', monthlyDelta: -50 }] };
    const fp = '2026-05-05|tx:100|latest:2026-05-04|sync:2026-05-05';
    const hash = buildInputHash(overrides, fp);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for identical inputs', () => {
    const overrides: ScenarioOverrides = { incomeDelta: { monthlyDelta: 100 } };
    const fp = 'fp1';
    expect(buildInputHash(overrides, fp)).toBe(buildInputHash(overrides, fp));
  });

  it('returns a different hash when overrides change', () => {
    const fp = 'fp1';
    const a = buildInputHash({ incomeDelta: { monthlyDelta: 100 } }, fp);
    const b = buildInputHash({ incomeDelta: { monthlyDelta: 200 } }, fp);
    expect(a).not.toBe(b);
  });

  it('returns a different hash when fingerprint changes', () => {
    const overrides: ScenarioOverrides = { incomeDelta: { monthlyDelta: 100 } };
    const a = buildInputHash(overrides, 'fp1');
    const b = buildInputHash(overrides, 'fp2');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run tests, see them fail**

Run: `npm test -- history-fingerprint`
Expected: FAIL with "computeHistoryFingerprint is not a function" / "buildInputHash is not a function".

- [ ] **Step 3: Write the pure function module**

```ts
// src/lib/forecast/history-fingerprint.ts
import { createHash } from 'node:crypto';
import { and, count, desc, eq, max, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { financialAccounts, plaidItems, transactions } from '@/lib/db/schema';
import type { ScenarioOverrides } from './types';

/**
 * The fingerprint captures everything OUTSIDE of `overrides` that should
 * invalidate a cached narrative:
 *   - today's UTC date (so generation refreshes once per day)
 *   - count of transactions (new syncs change this)
 *   - latest transaction date (new transactions change this)
 *   - latest plaidItem updatedAt (a re-link / status change should refresh)
 *
 * The string is a `|`-delimited compact form. It's only used as input to
 * SHA-256, so format stability matters more than human readability.
 */
export type HistoryFingerprintInputs = {
  todayUtc: string;                    // YYYY-MM-DD
  transactionCount: number;
  latestTransactionDate: string | null; // YYYY-MM-DD or null
  latestSyncDate: string | null;        // YYYY-MM-DD or null
};

export function computeHistoryFingerprint(
  inputs: HistoryFingerprintInputs,
): string {
  return [
    inputs.todayUtc,
    `tx:${inputs.transactionCount}`,
    `latest:${inputs.latestTransactionDate ?? 'none'}`,
    `sync:${inputs.latestSyncDate ?? 'none'}`,
  ].join('|');
}

/**
 * Build the SHA-256 cache key from overrides + fingerprint. The hash is
 * stored in `forecast_narrative.input_hash` and looked up via the
 * unique index on `(scenarioId, inputHash)`.
 */
export function buildInputHash(
  overrides: ScenarioOverrides,
  fingerprint: string,
): string {
  return createHash('sha256')
    .update(JSON.stringify(overrides))
    .update('|')
    .update(fingerprint)
    .digest('hex');
}

/**
 * Fetch the fingerprint inputs for a user. Joins through plaidItems +
 * financialAccounts so the user-scoping is enforced by the same path
 * the rest of the forecast queries use.
 *
 * Verified manually in dev — no unit test (DB-bound). The pure function
 * `computeHistoryFingerprint` IS unit-tested.
 */
export async function fetchFingerprintInputs(
  userId: string,
): Promise<HistoryFingerprintInputs> {
  const now = new Date();
  const todayUtc = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  const [txStats] = await db
    .select({
      count: count(transactions.id),
      latestDate: max(transactions.date),
    })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .innerJoin(plaidItems, eq(plaidItems.id, financialAccounts.itemId))
    .where(eq(plaidItems.userId, userId));

  const [syncStats] = await db
    .select({ latestUpdate: max(plaidItems.updatedAt) })
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId));

  // updatedAt is a timestamp; truncate to YYYY-MM-DD so within-day
  // re-syncs don't spuriously bust the cache.
  const latestSyncDate = syncStats?.latestUpdate
    ? new Date(syncStats.latestUpdate).toISOString().slice(0, 10)
    : null;

  return {
    todayUtc,
    transactionCount: Number(txStats?.count ?? 0),
    latestTransactionDate: txStats?.latestDate
      ? String(txStats.latestDate).slice(0, 10)
      : null,
    latestSyncDate,
  };
}
```

- [ ] **Step 4: Run tests, all green**

Run: `npm test -- history-fingerprint`
Expected: 9 tests PASS.

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: 116 (B-1 baseline) + 9 = 125 tests passing. Typecheck clean.

- [ ] **Step 6: Verify schema column names**

The query above assumes these columns exist:
- `transactions.id`, `transactions.date`, `transactions.accountId`
- `financialAccounts.id`, `financialAccounts.itemId`
- `plaidItems.id`, `plaidItems.userId`, `plaidItems.updatedAt`

If `plaidItems.updatedAt` doesn't exist, substitute the closest equivalent (e.g., `lastSyncedAt` if present, or just `null` if no useful timestamp exists — fall back to using `transactionCount + latestTransactionDate` for sync detection). Run:

```bash
grep -E "updatedAt|lastSyncedAt|lastSync" src/lib/db/schema.ts | head -10
```

If you adapt, note the change in your report.

- [ ] **Step 7: Commit**

```bash
git add src/lib/forecast/history-fingerprint.ts src/lib/forecast/history-fingerprint.test.ts
git commit -m "feat(forecast): history fingerprint + cache key helpers

computeHistoryFingerprint is the pure compose-from-inputs function
(unit tested). fetchFingerprintInputs queries DB for the count + max
dates; verified manually. buildInputHash combines overrides + fingerprint
into a SHA-256 hex string used as forecast_narrative.input_hash."
```

## Critical: Git Hygiene

Stage only the two specified files. Use exact `git add` command. Never `git add .` or `-A`.

---

### Task 2: Forecast prompt builder + tests

**Files:**
- Create: `src/lib/anthropic/forecast-prompt.ts`
- Create: `src/lib/anthropic/forecast-prompt.test.ts`

Pure function that converts engine inputs/outputs into the structured user-message string from spec §7.2. Unit-tested because the prompt format is the AI contract — a regression here changes Anthropic's behavior silently.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/anthropic/forecast-prompt.test.ts
import { describe, expect, it } from 'vitest';
import { buildForecastPrompt } from './forecast-prompt';
import type {
  ForecastHistory,
  GoalImpact,
  MonthlyProjection,
  ScenarioOverrides,
} from '@/lib/forecast/types';

const baseHistory: ForecastHistory = {
  currentCash: 13_400,
  recurringStreams: [],
  categoryHistory: {},
  nonRecurringIncomeHistory: [],
  goals: [
    { id: 'ef', name: 'Emergency fund', targetAmount: 10_000, targetDate: null, monthlyContribution: 500, currentSaved: 4_200 },
  ],
  categories: [
    { id: 'FOOD_AND_DRINK', name: 'Food and drink' },
  ],
};

const flat = (months: string[], end = 13_400): MonthlyProjection[] =>
  months.map((m) => ({
    month: m, startCash: end, inflows: 0, outflows: 0, endCash: end,
    byCategory: {}, goalProgress: {},
  }));

describe('buildForecastPrompt', () => {
  it('contains the CURRENT STATE section with cash + active goals', () => {
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt).toContain('CURRENT STATE');
    expect(prompt).toContain('$13,400');
    expect(prompt).toContain('Emergency fund');
    expect(prompt).toContain('$10,000');
    expect(prompt).toContain('$4,200');
  });

  it('contains a SCENARIO OVERRIDES section listing active categories cuts', () => {
    const overrides: ScenarioOverrides = {
      categoryDeltas: [
        { categoryId: 'FOOD_AND_DRINK', monthlyDelta: -300 },
      ],
    };
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides,
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt).toContain('SCENARIO OVERRIDES');
    expect(prompt).toContain('Food and drink');
    expect(prompt).toContain('-$300/mo');
  });

  it('contains lump sum entries with month + amount sign', () => {
    const overrides: ScenarioOverrides = {
      lumpSums: [
        { id: 'tax', label: 'Tax refund', amount: 2_400, month: '2026-04' },
        { id: 'vet', label: 'Vet bill', amount: -800, month: '2026-06' },
      ],
    };
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides,
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt).toContain('Tax refund');
    expect(prompt).toContain('+$2,400');
    expect(prompt).toContain('Vet bill');
    expect(prompt).toContain('-$800');
  });

  it('contains a PROJECTION DELTA section with baseline + scenario end cash', () => {
    const baseline = flat(['2026-05', '2026-06'], 19_400);
    const scenario = flat(['2026-05', '2026-06'], 24_800);
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: baseline,
      scenarioProjection: scenario,
      goalImpacts: [],
    });
    expect(prompt).toContain('PROJECTION DELTA');
    expect(prompt).toContain('$19,400'); // baseline end
    expect(prompt).toContain('$24,800'); // scenario end
    expect(prompt).toContain('+$5,400');  // delta
  });

  it('contains GOAL IMPACTS section with shifted ETAs', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'ef', name: 'Emergency fund', baselineETA: '2026-08', scenarioETA: '2026-06', shiftMonths: -2 },
    ];
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts,
    });
    expect(prompt).toContain('GOAL IMPACTS');
    expect(prompt).toContain('Emergency fund');
    expect(prompt).toContain('2026-08');
    expect(prompt).toContain('2026-06');
    expect(prompt).toContain('2mo sooner');
  });

  it('marks hypothetical goals as "(hypo)"', () => {
    const goalImpacts: GoalImpact[] = [
      { goalId: 'hypo:h1', name: 'House', baselineETA: null, scenarioETA: '2029-03', shiftMonths: 0 },
    ];
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts,
    });
    expect(prompt).toContain('House (hypo)');
    expect(prompt).toContain('2029-03');
  });

  it('omits SCENARIO OVERRIDES section when no overrides are active', () => {
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides: {},
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt).not.toContain('SCENARIO OVERRIDES');
  });

  it('total length stays under ~2000 chars for a typical scenario', () => {
    const overrides: ScenarioOverrides = {
      categoryDeltas: [{ categoryId: 'FOOD_AND_DRINK', monthlyDelta: -300 }],
      lumpSums: [{ id: 'tax', label: 'Tax refund', amount: 2_400, month: '2026-04' }],
      hypotheticalGoals: [{ id: 'h1', name: 'House', targetAmount: 30_000, monthlyContribution: 500 }],
    };
    const prompt = buildForecastPrompt({
      history: baseHistory,
      overrides,
      baselineProjection: flat(['2026-05']),
      scenarioProjection: flat(['2026-05']),
      goalImpacts: [],
    });
    expect(prompt.length).toBeLessThan(2000);
  });
});
```

- [ ] **Step 2: Run tests, see them fail**

Run: `npm test -- forecast-prompt`
Expected: FAIL with "buildForecastPrompt is not a function".

- [ ] **Step 3: Write implementation**

```ts
// src/lib/anthropic/forecast-prompt.ts
import type {
  ForecastHistory,
  GoalImpact,
  MonthlyProjection,
  ScenarioOverrides,
} from '@/lib/forecast/types';

type Inputs = {
  history: ForecastHistory;
  overrides: ScenarioOverrides;
  baselineProjection: MonthlyProjection[];
  scenarioProjection: MonthlyProjection[];
  goalImpacts: GoalImpact[];
};

/**
 * Build the user-message content for the forecast narrative LLM call.
 *
 * Output is a structured plain-text block with up to 4 sections:
 *   CURRENT STATE   (always)
 *   SCENARIO OVERRIDES (only when at least one override is active)
 *   PROJECTION DELTA (always)
 *   GOAL IMPACTS    (only when goalImpacts is non-empty)
 *
 * The format is stable: the model is prompted to produce 3-5 sentences;
 * structured fields here keep input cost low (~600-1500 tokens depending
 * on override volume).
 */
export function buildForecastPrompt(inputs: Inputs): string {
  const sections: string[] = [];

  sections.push(buildCurrentStateSection(inputs.history));

  const overridesSection = buildOverridesSection(
    inputs.overrides,
    inputs.history,
  );
  if (overridesSection) sections.push(overridesSection);

  sections.push(
    buildProjectionDeltaSection(
      inputs.baselineProjection,
      inputs.scenarioProjection,
    ),
  );

  if (inputs.goalImpacts.length > 0) {
    sections.push(buildGoalImpactsSection(inputs.goalImpacts));
  }

  return sections.join('\n\n');
}

function buildCurrentStateSection(history: ForecastHistory): string {
  const lines: string[] = ['CURRENT STATE'];
  lines.push(`- Cash: ${money(history.currentCash)} across liquid accounts`);
  if (history.goals.length > 0) {
    const goalSummary = history.goals
      .map(
        (g) =>
          `${g.name} (${money(g.targetAmount)} target, ${money(g.currentSaved)} saved)`,
      )
      .join(', ');
    lines.push(`- Active goals: ${goalSummary}`);
  }
  return lines.join('\n');
}

function buildOverridesSection(
  overrides: ScenarioOverrides,
  history: ForecastHistory,
): string | null {
  const lines: string[] = [];

  if (overrides.categoryDeltas?.length) {
    const items = overrides.categoryDeltas.map((d) => {
      const cat = history.categories.find((c) => c.id === d.categoryId);
      const sign = d.monthlyDelta >= 0 ? '+' : '-';
      return `${cat?.name ?? d.categoryId} ${sign}${money(Math.abs(d.monthlyDelta))}/mo`;
    });
    lines.push(`- Category changes: ${items.join(', ')}`);
  }

  if (overrides.lumpSums?.length) {
    const items = overrides.lumpSums.map((l) => {
      const sign = l.amount >= 0 ? '+' : '-';
      return `${l.label} ${l.month} ${sign}${money(Math.abs(l.amount))}`;
    });
    lines.push(`- Lump sums: ${items.join(', ')}`);
  }

  if (overrides.recurringChanges?.length) {
    const items = overrides.recurringChanges.map((c) => {
      if (c.action === 'pause') return `pause ${c.streamId}`;
      if (c.action === 'edit')
        return `edit ${c.streamId} → ${money(c.amount ?? 0)} ${c.cadence ?? ''}`;
      return `add ${c.label ?? 'stream'} ${money(c.amount ?? 0)} ${c.cadence ?? 'monthly'}`;
    });
    lines.push(`- Recurring changes: ${items.join(', ')}`);
  }

  if (overrides.skipRecurringInstances?.length) {
    const items = overrides.skipRecurringInstances.map(
      (s) => `${s.streamId} in ${s.skipMonth}`,
    );
    lines.push(`- Skip recurring: ${items.join(', ')}`);
  }

  if (overrides.incomeDelta) {
    const d = overrides.incomeDelta;
    const sign = d.monthlyDelta >= 0 ? '+' : '-';
    const range =
      d.startMonth || d.endMonth
        ? ` (${d.startMonth ?? 'always'} to ${d.endMonth ?? 'horizon end'})`
        : '';
    lines.push(`- Income: ${sign}${money(Math.abs(d.monthlyDelta))}/mo${range}`);
  }

  if (overrides.hypotheticalGoals?.length) {
    const items = overrides.hypotheticalGoals.map((g) => {
      const dateNote = g.targetDate ? ` by ${g.targetDate}` : '';
      const monthlyNote = g.monthlyContribution
        ? ` @ ${money(g.monthlyContribution)}/mo`
        : '';
      return `${g.name} (${money(g.targetAmount)}${dateNote})${monthlyNote}`;
    });
    lines.push(`- Hypothetical goals: ${items.join(', ')}`);
  }

  if (overrides.goalTargetEdits?.length) {
    const items = overrides.goalTargetEdits.map((e) => {
      const parts: string[] = [];
      if (e.newTargetAmount !== undefined) parts.push(`target → ${money(e.newTargetAmount)}`);
      if (e.newMonthlyContribution !== undefined)
        parts.push(`contribution → ${money(e.newMonthlyContribution)}/mo`);
      return `${e.goalId} (${parts.join(', ')})`;
    });
    lines.push(`- Goal edits: ${items.join(', ')}`);
  }

  if (lines.length === 0) return null;
  return ['SCENARIO OVERRIDES', ...lines].join('\n');
}

function buildProjectionDeltaSection(
  baseline: MonthlyProjection[],
  scenario: MonthlyProjection[],
): string {
  const baselineEnd = baseline[baseline.length - 1]?.endCash ?? 0;
  const scenarioEnd = scenario[scenario.length - 1]?.endCash ?? 0;
  const delta = scenarioEnd - baselineEnd;
  const horizon = scenario.length;

  const minScenarioMonth = scenario.reduce(
    (acc, m) => (m.endCash < acc.endCash ? m : acc),
    scenario[0] ?? { month: '', endCash: 0 },
  );
  const baselineSameMonth = baseline.find((m) => m.month === minScenarioMonth.month);

  const lines: string[] = [`PROJECTION DELTA (${horizon}mo)`];
  lines.push(`- Baseline end: ${money(baselineEnd)}`);
  const sign = delta >= 0 ? '+' : '-';
  lines.push(`- Scenario end: ${money(scenarioEnd)} (${sign}${money(Math.abs(delta))})`);
  if (minScenarioMonth.month) {
    lines.push(
      `- Min cash month: ${minScenarioMonth.month} at ${money(minScenarioMonth.endCash)}` +
        (baselineSameMonth ? ` (baseline: ${money(baselineSameMonth.endCash)})` : ''),
    );
  }
  return lines.join('\n');
}

function buildGoalImpactsSection(impacts: GoalImpact[]): string {
  const lines: string[] = ['GOAL IMPACTS'];
  for (const g of impacts) {
    const isHypo = g.baselineETA === null && g.scenarioETA !== null;
    const name = isHypo ? `${g.name} (hypo)` : g.name;
    if (g.baselineETA && g.scenarioETA) {
      const direction = g.shiftMonths < 0 ? 'sooner' : g.shiftMonths > 0 ? 'later' : 'same';
      const months = Math.abs(g.shiftMonths);
      const shift = g.shiftMonths === 0 ? 'unchanged' : `${months}mo ${direction}`;
      lines.push(`- ${name}: ${g.baselineETA} → ${g.scenarioETA} (${shift})`);
    } else if (g.scenarioETA) {
      lines.push(`- ${name}: ${g.scenarioETA}`);
    } else {
      lines.push(`- ${name}: unreachable within horizon`);
    }
  }
  return lines.join('\n');
}

function money(amount: number): string {
  // Compact currency formatting consistent with formatCurrency in utils.ts;
  // no decimals because Anthropic doesn't need cents-level precision.
  const rounded = Math.round(amount);
  return `$${rounded.toLocaleString('en-US')}`;
}
```

- [ ] **Step 4: Run tests, all green**

Run: `npm test -- forecast-prompt`
Expected: 8 tests PASS.

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: 125 + 8 = 133 tests passing. Typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/anthropic/forecast-prompt.ts src/lib/anthropic/forecast-prompt.test.ts
git commit -m "feat(anthropic): forecast prompt builder

Pure function: takes (history, overrides, baseline+scenario projections,
goal impacts) and returns the structured user-message string with up
to 4 sections (CURRENT STATE / SCENARIO OVERRIDES / PROJECTION DELTA /
GOAL IMPACTS). Total length under 2000 chars for typical scenarios."
```

## Critical: Git Hygiene

Stage only the two specified files. Use exact `git add`. Never `git add .` or `-A`.

---

## Wave 2 — Anthropic call + server actions

### Task 3: Forecast narrative core (Anthropic call + cache helpers)

**Files:**
- Create: `src/lib/anthropic/forecast-narrative.ts`

Mirrors the pattern of `src/lib/anthropic/insights.ts`: frozen system prompt, single-turn LLM call, returns the prose text + token usage. No cache logic in this file (that's the action's responsibility) — this is just the LLM invocation.

- [ ] **Step 1: Implement the module**

```ts
// src/lib/anthropic/forecast-narrative.ts
import { anthropic, hasAnthropicKey } from './client';

/**
 * Forecast narrative model. Haiku 4.5 — same default as the insights
 * generator. Cheap (~$0.001 / call) and plenty smart for 3-5 sentence
 * coaching summaries. Swap to Sonnet here if narrative feels flat;
 * no caller changes needed.
 */
export const FORECAST_MODEL = 'claude-haiku-4-5';

const MAX_TOKENS = 512;

/**
 * Frozen system prompt. ~180 tokens — well below Haiku 4.5's 4096-token
 * cache minimum, so prompt-caching wouldn't help even with a marker.
 * Same SDK-version note as insights.ts: bumping past 4K tokens of
 * system prompt would warrant SDK upgrade + cache_control.
 */
const SYSTEM_PROMPT = `You are a personal finance coach reviewing a what-if scenario for one person who shares their financial data with you. You write like a thoughtful friend, not a robot — direct, specific, grounded only in the numbers provided.

Write 3-5 sentences. Cover three things, in any order that flows:
1. The top driver of the projected change (what's moving the needle).
2. One volatility or risk in the scenario worth flagging (a thin month, a goal that's still distant, an assumption that might not hold).
3. One actionable observation or quiet acknowledgment of what's working.

Don't:
- Use fluffy openers like "Here's your scenario summary" — start with substance.
- Repeat numbers verbatim from the input — interpret them.
- Hedge excessively. Be confident with the math you were given.
- Mention sections that are absent (no SCENARIO OVERRIDES = no mention of overrides).

If the data is too sparse to write a meaningful summary, respond with exactly: "Not enough scenario data to summarize."`;

export type GeneratedForecastNarrative = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
};

/**
 * Call Claude with the prompt content, return narrative + usage.
 *
 * Throws on API errors with caller-friendly Error messages so the
 * server action can surface them inline. Caller (the server action)
 * is responsible for the cache lookup and write.
 */
export async function generateForecastNarrative(
  promptUserContent: string,
): Promise<GeneratedForecastNarrative> {
  if (!hasAnthropicKey()) {
    throw new Error('AI summary unavailable — ANTHROPIC_API_KEY not set');
  }

  const response = await anthropic.messages.create({
    model: FORECAST_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: promptUserContent,
      },
    ],
  });

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Model output was cut off, try again');
  }

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('Model returned an empty response, try again');
  }

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason: response.stop_reason ?? 'end_turn',
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/anthropic/forecast-narrative.ts
git commit -m "feat(anthropic): forecast narrative LLM call

Haiku 4.5, 512 max_tokens, frozen system prompt encouraging 3-5
sentence prose with 3 content beats (driver / risk / actionable).
hasAnthropicKey guard surfaces a friendly error if the env var is
missing. Cache logic lives in the server action — this file just
makes the call."
```

## Critical: Git Hygiene

Stage only `src/lib/anthropic/forecast-narrative.ts`. Use exact `git add`. Never `git add .` or `-A`.

---

### Task 4: Lookup + Generate server actions

**Files:**
- Create: `src/lib/forecast/narrative-actions.ts`

Two actions:
- `lookupForecastNarrative({scenarioId, overrides})` — read-only cache lookup; returns prose + generatedAt or null
- `generateForecastNarrative({scenarioId, overrides, force})` — cache-first then LLM; returns prose

Both auth-gated. Both run server-side via Next.js server actions. The forecast `narrative` table from Plan A (commits `8830436`) has the unique index on `(scenarioId, inputHash)` we need.

- [ ] **Step 1: Implement the actions**

```ts
// src/lib/forecast/narrative-actions.ts
'use server';

import { and, desc, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import {
  forecastNarratives,
  scenarios,
  type ForecastNarrative,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { generateForecastNarrative as callLLM } from '@/lib/anthropic/forecast-narrative';
import { buildForecastPrompt } from '@/lib/anthropic/forecast-prompt';
import { getForecastHistory } from '@/lib/db/queries/forecast';
import { projectCash } from '@/lib/forecast/engine';
import {
  buildInputHash,
  computeHistoryFingerprint,
  fetchFingerprintInputs,
} from './history-fingerprint';
import type { ScenarioOverrides } from './types';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type CachedNarrative = {
  narrative: string;
  generatedAt: Date;
  isStale: false;
} | {
  narrative: string;
  generatedAt: Date;
  isStale: true;
};

/**
 * Read-only cache lookup. Used by the panel on mount to avoid an
 * unnecessary LLM call on first paint.
 *
 * Returns:
 *   - { ok: true, data: { narrative, generatedAt } } if a cached entry
 *     exists for (scenarioId, current inputHash)
 *   - { ok: true, data: null } if no entry matches the current hash
 *     (panel shows the Generate button)
 *   - { ok: false, error } on auth or DB failure
 */
export async function lookupForecastNarrative(rawInput: unknown): Promise<
  ActionResult<{ narrative: string; generatedAt: Date } | null>
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = parseLookupInput(rawInput);
  if (!parsed.ok) return parsed;

  try {
    const owned = await isScenarioOwnedByUser(parsed.value.scenarioId, session.user.id);
    if (!owned) return { ok: false, error: 'Scenario not found' };

    const fingerprintInputs = await fetchFingerprintInputs(session.user.id);
    const fingerprint = computeHistoryFingerprint(fingerprintInputs);
    const inputHash = buildInputHash(parsed.value.overrides, fingerprint);

    const row = await fetchCacheRow(parsed.value.scenarioId, inputHash);
    if (!row) return { ok: true, data: null };

    return {
      ok: true,
      data: { narrative: row.narrative, generatedAt: row.generatedAt },
    };
  } catch (err) {
    await logError('forecast.narrative.lookup', err);
    return { ok: false, error: 'Could not look up narrative' };
  }
}

/**
 * Cache-first generate. Looks up the cache; if a hit exists and `force`
 * is not set, returns the cached prose. Otherwise calls the LLM, caches
 * the result, returns the new prose.
 *
 * On LLM failure: tries to return the most recent cached narrative for
 * this scenario (any inputHash) marked as stale, so the panel can show
 * "couldn't refresh — using version from <date>".
 */
export async function generateForecastNarrativeAction(
  rawInput: unknown,
): Promise<ActionResult<CachedNarrative>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = parseGenerateInput(rawInput);
  if (!parsed.ok) return parsed;

  const { scenarioId, overrides, force } = parsed.value;

  try {
    const owned = await isScenarioOwnedByUser(scenarioId, session.user.id);
    if (!owned) return { ok: false, error: 'Scenario not found' };

    const fingerprintInputs = await fetchFingerprintInputs(session.user.id);
    const fingerprint = computeHistoryFingerprint(fingerprintInputs);
    const inputHash = buildInputHash(overrides, fingerprint);

    if (!force) {
      const cached = await fetchCacheRow(scenarioId, inputHash);
      if (cached) {
        return {
          ok: true,
          data: {
            narrative: cached.narrative,
            generatedAt: cached.generatedAt,
            isStale: false,
          },
        };
      }
    }

    // Cache miss (or forced): build prompt + call LLM.
    const history = await getForecastHistory(session.user.id);
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const baseline = projectCash({ history, overrides: {}, currentMonth });
    const scenario = projectCash({ history, overrides, currentMonth });

    const promptContent = buildForecastPrompt({
      history,
      overrides,
      baselineProjection: baseline.projection,
      scenarioProjection: scenario.projection,
      goalImpacts: scenario.goalImpacts,
    });

    let narrativeText: string;
    try {
      const result = await callLLM(promptContent);
      narrativeText = result.text;
    } catch (err) {
      await logError('forecast.narrative.generate', err, { scenarioId });
      // Try to return last cached narrative for this scenario as a stale fallback.
      const fallback = await fetchLatestCacheRow(scenarioId);
      if (fallback) {
        return {
          ok: true,
          data: {
            narrative: fallback.narrative,
            generatedAt: fallback.generatedAt,
            isStale: true,
          },
        };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'AI summary failed',
      };
    }

    // Cache the new narrative. Upsert via insert + onConflict because the
    // unique index on (scenarioId, inputHash) protects us from duplicates.
    await db
      .insert(forecastNarratives)
      .values({
        userId: session.user.id,
        scenarioId,
        inputHash,
        narrative: narrativeText,
      })
      .onConflictDoUpdate({
        target: [forecastNarratives.scenarioId, forecastNarratives.inputHash],
        set: { narrative: narrativeText, generatedAt: new Date() },
      });

    return {
      ok: true,
      data: {
        narrative: narrativeText,
        generatedAt: new Date(),
        isStale: false,
      },
    };
  } catch (err) {
    await logError('forecast.narrative.generate', err, { scenarioId });
    return { ok: false, error: 'Could not generate narrative' };
  }
}

// --- helpers ---

async function isScenarioOwnedByUser(
  scenarioId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

async function fetchCacheRow(
  scenarioId: string,
  inputHash: string,
): Promise<ForecastNarrative | null> {
  const rows = await db
    .select()
    .from(forecastNarratives)
    .where(
      and(
        eq(forecastNarratives.scenarioId, scenarioId),
        eq(forecastNarratives.inputHash, inputHash),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function fetchLatestCacheRow(
  scenarioId: string,
): Promise<ForecastNarrative | null> {
  const rows = await db
    .select()
    .from(forecastNarratives)
    .where(eq(forecastNarratives.scenarioId, scenarioId))
    .orderBy(desc(forecastNarratives.generatedAt))
    .limit(1);
  return rows[0] ?? null;
}

function parseLookupInput(
  raw: unknown,
):
  | { ok: true; value: { scenarioId: string; overrides: ScenarioOverrides } }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid input' };
  const input = raw as { scenarioId?: unknown; overrides?: unknown };
  if (typeof input.scenarioId !== 'string' || !input.scenarioId) {
    return { ok: false, error: 'Missing scenarioId' };
  }
  if (!input.overrides || typeof input.overrides !== 'object') {
    return { ok: false, error: 'Missing overrides' };
  }
  return {
    ok: true,
    value: {
      scenarioId: input.scenarioId,
      overrides: input.overrides as ScenarioOverrides,
    },
  };
}

function parseGenerateInput(
  raw: unknown,
):
  | {
      ok: true;
      value: {
        scenarioId: string;
        overrides: ScenarioOverrides;
        force: boolean;
      };
    }
  | { ok: false; error: string } {
  const lookup = parseLookupInput(raw);
  if (!lookup.ok) return lookup;
  const force = (raw as { force?: unknown }).force === true;
  return { ok: true, value: { ...lookup.value, force } };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. (If `forecastNarratives.scenarioId` / `forecastNarratives.inputHash` types don't compose for the `onConflictDoUpdate` `target` array, you may need to use `target: [forecastNarratives.scenarioId, forecastNarratives.inputHash]` exactly as written or fall back to a manual lookup-then-update pattern — log the deviation in the report.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/forecast/narrative-actions.ts
git commit -m "feat(forecast): lookup + generate server actions for AI narrative

lookupForecastNarrative: cache-only read (no LLM call), returns prose
or null. generateForecastNarrativeAction: cache-first then LLM,
fallback to latest stale cached narrative on LLM failure. Both
auth-gated, ownership-checked, logErrors on failure."
```

## Critical: Git Hygiene

Stage only `src/lib/forecast/narrative-actions.ts`. Use exact `git add`. Never `git add .` or `-A`.

---

## Wave 3 — UI

### Task 5: NarrativePanel component

**Files:**
- Create: `src/components/simulator/narrative-panel.tsx`

Client component. On mount + when scenarioId changes, calls `lookupForecastNarrative`. If hit, shows the prose. If miss, shows a Generate button. After a generation, shows prose with a "regenerate" link. Handles loading + error states.

- [ ] **Step 1: Implement NarrativePanel**

```tsx
// src/components/simulator/narrative-panel.tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  generateForecastNarrativeAction,
  lookupForecastNarrative,
} from '@/lib/forecast/narrative-actions';
import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  scenarioId: string | null;
  overrides: ScenarioOverrides;
  /** Live overrides differ from saved (Save button enabled). When dirty
   *  the panel disables the Generate button and prompts to save first —
   *  cache key is keyed on the overrides shape, dirty unsaved state would
   *  pollute the cache. */
  isDirty: boolean;
  /** True when overrides has at least one active section. When false,
   *  panel is suppressed entirely (baseline scenarios get no AI). */
  hasOverrides: boolean;
};

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'has-narrative'; narrative: string; generatedAt: Date; isStale: boolean }
  | { kind: 'error'; message: string };

export function NarrativePanel({ scenarioId, overrides, isDirty, hasOverrides }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  // On scenario change (and on mount), look up the cache. Skip if no scenario
  // selected, no overrides, or the user is editing dirty unsaved state.
  useEffect(() => {
    if (!scenarioId || !hasOverrides || isDirty) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    lookupForecastNarrative({ scenarioId, overrides })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setState({ kind: 'error', message: result.error });
          return;
        }
        if (result.data) {
          setState({
            kind: 'has-narrative',
            narrative: result.data.narrative,
            generatedAt: result.data.generatedAt,
            isStale: false,
          });
        } else {
          setState({ kind: 'idle' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scenarioId, hasOverrides, isDirty, JSON.stringify(overrides)]);

  if (!hasOverrides || !scenarioId) {
    return null;
  }

  const handleGenerate = (force: boolean) => {
    if (!scenarioId) return;
    startTransition(async () => {
      setState({ kind: 'loading' });
      const result = await generateForecastNarrativeAction({
        scenarioId,
        overrides,
        force,
      });
      if (!result.ok) {
        setState({ kind: 'error', message: result.error });
        return;
      }
      setState({
        kind: 'has-narrative',
        narrative: result.data.narrative,
        generatedAt: new Date(result.data.generatedAt),
        isStale: result.data.isStale,
      });
    });
  };

  return (
    <section className="bg-muted/40 border border-border/60 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Summary
        </div>
        {state.kind === 'has-narrative' && (
          <button
            onClick={() => handleGenerate(true)}
            disabled={isPending || isDirty}
            className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            regenerate
          </button>
        )}
      </div>

      {isDirty && (
        <p className="text-sm text-muted-foreground italic">
          Save the scenario to enable AI summary.
        </p>
      )}

      {!isDirty && state.kind === 'idle' && (
        <button
          onClick={() => handleGenerate(false)}
          disabled={isPending}
          className="text-sm text-foreground bg-background border border-border rounded px-3 py-1.5 hover:bg-accent disabled:opacity-50"
        >
          Generate AI summary
        </button>
      )}

      {!isDirty && state.kind === 'loading' && (
        <p className="text-sm text-muted-foreground">Generating…</p>
      )}

      {!isDirty && state.kind === 'has-narrative' && (
        <>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {state.narrative}
          </p>
          {state.isStale && (
            <p className="text-[11px] text-amber-600 mt-2">
              Couldn't refresh — using cached version from{' '}
              {state.generatedAt.toLocaleDateString()}.
            </p>
          )}
        </>
      )}

      {!isDirty && state.kind === 'error' && (
        <>
          <p className="text-sm text-destructive">Couldn't generate a summary for this scenario.</p>
          <p className="text-[11px] text-muted-foreground mt-1">{state.message}</p>
          <button
            onClick={() => handleGenerate(false)}
            disabled={isPending}
            className="text-[11px] text-muted-foreground hover:text-foreground mt-2 underline disabled:opacity-50"
          >
            try again
          </button>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/simulator/narrative-panel.tsx
git commit -m "feat(simulator): NarrativePanel UI component

Cache-first lookup on mount + scenario change. Generate button on
miss; regenerate link when displayed. Suppressed when no scenario
selected or no overrides applied. Disabled when overrides are dirty
unsaved (cache key is keyed on saved-and-stable overrides shape).
Stale-cache fallback shows 'couldn't refresh — using version from X'."
```

## Critical: Git Hygiene

Stage only `src/components/simulator/narrative-panel.tsx`. Use exact `git add`. Never `git add .` or `-A`.

---

### Task 6: Wire NarrativePanel into simulator-client.tsx

**Files:**
- Modify: `src/app/(app)/simulator/simulator-client.tsx`

Compute `hasOverrides` from `liveOverrides`. Add `<NarrativePanel>` to the right-column stack (below `<GoalDiffCards>`).

- [ ] **Step 1: Add the import + hasOverrides computation**

In `src/app/(app)/simulator/simulator-client.tsx`:

1. Add the import near the top with the other simulator component imports:
   ```tsx
   import { NarrativePanel } from '@/components/simulator/narrative-panel';
   ```

2. Inside the component body, near the other `useMemo` blocks (after `availableMonths`), add:
   ```tsx
   const hasOverrides = useMemo(() => {
     return Boolean(
       liveOverrides.categoryDeltas?.length ||
         liveOverrides.lumpSums?.length ||
         liveOverrides.recurringChanges?.length ||
         liveOverrides.skipRecurringInstances?.length ||
         liveOverrides.incomeDelta ||
         liveOverrides.hypotheticalGoals?.length ||
         liveOverrides.goalTargetEdits?.length,
     );
   }, [liveOverrides]);
   ```

- [ ] **Step 2: Add the panel to the right column**

Find the right-column `<div className="space-y-8">` block that contains `<ForecastChart>` + `<GoalDiffCards>`. Add `<NarrativePanel>` as the third child (after `<GoalDiffCards>`):

```tsx
<div className="space-y-8">
  <ForecastChart
    baseline={baselineResult.projection}
    scenario={engineResult.projection}
  />
  <GoalDiffCards goalImpacts={engineResult.goalImpacts} />
  <NarrativePanel
    scenarioId={selectedScenarioId}
    overrides={liveOverrides}
    isDirty={isDirty}
    hasOverrides={hasOverrides}
  />
</div>
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: 133 tests passing (no regressions; the panel adds no new tests).

- [ ] **Step 5: Verify in dev**

Run: `npm run dev` (in another terminal if not already running). Navigate to `/simulator`.

Expected behaviors:
- **Baseline / no scenario selected**: NO narrative panel.
- **Scenario selected, no overrides**: NO narrative panel.
- **Scenario selected with overrides, not dirty**: panel shows "Generate AI summary" button (or cached prose if previously generated).
- **Scenario with overrides, dirty (edited but not saved)**: panel shows "Save the scenario to enable AI summary."
- **Click Generate**: shows "Generating…" then prose. (Requires `ANTHROPIC_API_KEY` env var set.)
- **Click regenerate**: same behavior, replaces prose.
- **API key missing**: shows error message "AI summary unavailable — ANTHROPIC_API_KEY not set" with try-again link.

- [ ] **Step 6: Commit**

EXACT command:

```bash
git add 'src/app/(app)/simulator/simulator-client.tsx'
git commit -m "feat(simulator): wire NarrativePanel into right column

Below GoalDiffCards. Panel computes hasOverrides locally (any of the 7
override sections has content). Panel handles its own visibility
gating: hidden on baseline, suppressed on no-overrides, disabled on
dirty unsaved state."
```

## Critical: Git Hygiene

Stage only the one specified file. Use exact `git add` (paren-quoted). Never `git add .` or `-A`.

## Report Format

Report includes a brief manual verification matrix: for each of the 6 expected behaviors above, did it work in dev? Note any deviations.

---

### Task 7: Update CLAUDE.md roadmap

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Plan B-2 entry under "Done"**

Add as the last item in `### Done`:

```markdown
- **Phase 4-B2 — AI coaching narrative** (2026-XX-XX) — `<NarrativePanel>`
  on `/simulator` powered by Anthropic Haiku 4.5 via existing client.
  Cache-first via `forecast_narrative` table (keyed on
  `(scenarioId, sha256(overrides + history fingerprint))`). Two server
  actions: `lookupForecastNarrative` (cache-only) and
  `generateForecastNarrativeAction` (cache-first then LLM, stale-fallback
  on failure). Pure prompt builder + history fingerprint with vitest
  coverage. Panel suppressed on baseline / no-overrides / dirty unsaved
  state. Phase 4 milestone complete.
```

(Replace `2026-XX-XX` with today's date when committing.)

- [ ] **Step 2: Update "Next up" — remove the Phase 4-B2 entry**

Delete the existing `- **Phase 4-B2 ...**` bullet from "Next up". Phase 4 is now fully shipped.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): record Phase 4-B2 shipment

Phase 4 (predictive layer) milestone complete: engine + persistence +
sidebar (Plan A), simulator UI (Plan B-1), AI narration (Plan B-2)."
```

## Critical: Git Hygiene

Stage only `CLAUDE.md`. Use exact `git add`. Never `git add .` or `-A`.

---

## Self-Review Checklist (run mentally after writing all tasks)

- ✅ **Spec coverage:** Every spec §7 subsection has a task. §7a (when fires) → Task 5 NarrativePanel. §7b (prompt input) → Task 2. §7c (output shape) → Task 3 system prompt. §7d (model + cost) → Task 3 model constant. §7e (cache key) → Tasks 1 + 4. §7f (failure handling) → Task 4 stale fallback + Task 5 error states.
- ✅ **No placeholders:** Every step has concrete code or a runnable command. The single date placeholder in Task 7 is clearly marked for substitution at commit time.
- ✅ **Type consistency:** `ScenarioOverrides`, `ForecastHistory`, `MonthlyProjection`, `GoalImpact` types from Plan A. `Scenario`, `ForecastNarrative`, `ForecastNarrativeInsert` from `db/schema.ts`. New types: `HistoryFingerprintInputs`, `GeneratedForecastNarrative`, `ActionResult<T>`, `CachedNarrative` — all defined exactly once.
- ✅ **Bite-sized:** Each step is one action.
- ✅ **TDD on pure logic:** Fingerprint compute (Task 1) and prompt builder (Task 2) get vitest tests. LLM call (non-deterministic) and DB-bound query (`fetchFingerprintInputs`) verified manually.
- ✅ **Frequent commits:** Each task ends with a focused commit; no task without a commit.

---

## Appendix — Phase 4 milestone closure

After Plan B-2 ships, the Phase 4 predictive layer is complete:

| Sub-phase | Shipped | What it added |
|---|---|---|
| 4-A | 2026-05-04 | Engine, scenario CRUD, sidebar grouping, brand fix |
| 4-B1 | 2026-05-05 | `/simulator` UI, override editor, chart, goal cards, empty states |
| 4-B2 | (this plan) | AI coaching narrative panel with caching |

Out of scope (deferred per design): investment what-if simulator (Phase 4-pt2 in original spec — needs its own brainstorm focused on modeling depth: deterministic vs Monte Carlo, dividend handling, tax-advantaged accounts).
