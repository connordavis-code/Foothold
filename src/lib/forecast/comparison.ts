/**
 * Pure helpers for the multi-scenario comparison view (Phase 1 simulator
 * reorientation, PR 3 of 5). Composes per-scenario projection + goal-impact
 * results into the shapes the chart, delta cards, and goal-diff matrix
 * consume.
 *
 * No engine logic lives here — `projectCash` is invoked at the call site so
 * memoization in client components stays explicit. These helpers operate
 * downstream of that.
 */

import type { GoalImpact, MonthlyProjection } from './types';

/**
 * Cap on simultaneously-compared scenarios. Above 3, the chart turns into
 * spaghetti even with distinct hues — the picker enforces this server-side
 * (slice) and client-side (disabled-on-cap chips).
 */
export const MAX_COMPARE_SCENARIOS = 3;

/**
 * Stable color assignment. Index 0 → --chart-1, index 1 → --chart-2, …
 * Cycles for safety though the picker prevents idx ≥ 6 in practice.
 *
 * Returned as a CSS variable name (caller wraps in `hsl(var(...))`) so the
 * component can adapt to light/dark without re-resolving here.
 */
export function pickScenarioColor(idx: number): string {
  const palette = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'];
  return palette[idx % palette.length];
}

/**
 * Last-month delta of a scenario vs baseline. Used in the delta cards row
 * — "this scenario ends $X above/below baseline at horizon."
 *
 * Returns absolute delta in dollars and signed percent of baseline endCash.
 * Percent is null when baseline endCash is 0 (would be div-by-zero) — the
 * card renders just the absolute in that case.
 */
export function computeEndDelta(
  scenarioProjection: MonthlyProjection[],
  baselineProjection: MonthlyProjection[],
): { absolute: number; percent: number | null } {
  if (scenarioProjection.length === 0 || baselineProjection.length === 0) {
    return { absolute: 0, percent: null };
  }
  // Both projections share the same horizon, so compare matching last index.
  // If lengths drift (shouldn't), use min so we never read past the end.
  const idx = Math.min(scenarioProjection.length, baselineProjection.length) - 1;
  const scenarioEnd = scenarioProjection[idx].endCash;
  const baselineEnd = baselineProjection[idx].endCash;
  const absolute = scenarioEnd - baselineEnd;
  const percent = baselineEnd === 0 ? null : (absolute / Math.abs(baselineEnd)) * 100;
  return { absolute, percent };
}

/**
 * One row of the goal-diff matrix. Each row covers one goal across baseline
 * + every selected scenario.
 *
 *   - `baseline` is the goal's ETA in the no-overrides projection — same
 *     `YYYY-MM | null` shape as `GoalImpact.baselineETA`.
 *   - `scenarios` is a map keyed on scenarioId with that scenario's ETA +
 *     shift-in-months vs baseline. shiftMonths is signed: negative = sooner,
 *     positive = later, 0 = same, null = "unreachable in this scenario."
 *
 * Goal universe = real goals (ids without "hypo:") plus any hypothetical
 * goal (id "hypo:<uuid>") that any selected scenario adds. A scenario that
 * doesn't define a hypothetical from another scenario shows null in that
 * cell — the matrix lights up the asymmetry visually.
 */
export type GoalMatrixRow = {
  goalId: string;
  name: string;
  baseline: string | null;
  scenarios: Record<string, { eta: string | null; shiftMonths: number | null }>;
};

export type ScenarioComparisonInput = {
  /** Scenario id from the `scenario` table (or 'hypo:<uuid>' is rejected — only real ones). */
  id: string;
  name: string;
  goalImpacts: GoalImpact[];
};

/**
 * Build the goal-by-scenario matrix.
 *
 * Algorithm:
 *   1. Collect every (goalId, name) seen across baseline (we use the first
 *      scenario's GoalImpacts for baseline ETAs since they share baseline)
 *      and every scenario's GoalImpacts.
 *   2. For each goalId, emit one row with baseline ETA + per-scenario cells.
 *   3. Real goals appear first (id not starting with "hypo:"), then
 *      hypotheticals — they're scenario-specific so feel like additions.
 *
 * baselineGoalImpacts can come from any scenario's GoalImpacts since the
 * baseline ETA is computed independently of overrides (W-01 cash gate runs
 * on baseline projection). The caller passes the first scenario's impacts
 * to avoid a second projectCash call just to derive baseline ETAs. When
 * zero scenarios are selected, the matrix is empty (caller renders empty
 * state).
 */
export function buildGoalMatrix(
  scenarios: ScenarioComparisonInput[],
): GoalMatrixRow[] {
  if (scenarios.length === 0) return [];

  // Universe of (goalId, name) — name resolution prefers the first scenario
  // that mentions the goal (consistent across renders).
  const universe = new Map<string, string>();
  for (const s of scenarios) {
    for (const g of s.goalImpacts) {
      if (!universe.has(g.goalId)) universe.set(g.goalId, g.name);
    }
  }

  // Baseline ETA per goal: take from any scenario that has the goal (they
  // all share baselineETA per W-01). If no scenario has it, treat as null.
  const baselineByGoal = new Map<string, string | null>();
  for (const s of scenarios) {
    for (const g of s.goalImpacts) {
      if (!baselineByGoal.has(g.goalId)) {
        baselineByGoal.set(g.goalId, g.baselineETA);
      }
    }
  }

  // Real goals first, then hypothetical. Within each group, alpha-sort by
  // name for stable rendering.
  const ids = Array.from(universe.keys()).sort((a, b) => {
    const aHypo = a.startsWith('hypo:');
    const bHypo = b.startsWith('hypo:');
    if (aHypo !== bHypo) return aHypo ? 1 : -1;
    return universe.get(a)!.localeCompare(universe.get(b)!);
  });

  return ids.map((goalId) => {
    const name = universe.get(goalId)!;
    const baseline = baselineByGoal.get(goalId) ?? null;
    const scenariosCol: GoalMatrixRow['scenarios'] = {};
    for (const s of scenarios) {
      const impact = s.goalImpacts.find((g) => g.goalId === goalId);
      if (impact) {
        scenariosCol[s.id] = {
          eta: impact.scenarioETA,
          shiftMonths: impact.scenarioETA === null ? null : impact.shiftMonths,
        };
      } else {
        // This scenario doesn't define this goal (hypothetical from
        // another scenario, or a goal added/removed mid-session).
        scenariosCol[s.id] = { eta: null, shiftMonths: null };
      }
    }
    return { goalId, name, baseline, scenarios: scenariosCol };
  });
}

/**
 * Parse `?scenarios=id1,id2,id3` into a deduped, length-capped id list.
 * Used by both server-side route handlers (validate against user's scenarios)
 * and client-side URL writers (round-trip the picker state).
 *
 * Empty / missing param → empty array. Caller decides empty-state copy.
 */
export function parseScenariosQuery(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of value.split(',')) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= MAX_COMPARE_SCENARIOS) break;
  }
  return out;
}
