# W-09 — Override appliers clip at 0 per-step, losing information

> **Severity:** Warning
> **Related files:** `src/lib/forecast/apply-overrides.ts`, `src/lib/forecast/engine.ts`, `src/lib/forecast/types.ts`
> **Source:** `docs/reviews/2026-05-05-REVIEW.md` § W-09

---

## Problem

Each override applier in `apply-overrides.ts` clips its computed `inflows`/`outflows` at 0 before recomputing the cash chain:

| Applier | Clip site |
|---|---|
| `applyCategoryDeltas` | `byCategory[id]` clipped (line 38) |
| `applyIncomeDelta` | `inflows` clipped (line 80) |
| `applyRecurringChanges` | both `inflows` and `outflows` clipped (lines 151-152) |
| `applySkipRecurringInstances` | both clipped (lines 206-207) |
| `applyLumpSums` | NO clip (lines 254-255) — inconsistent |

The `engine.ts:21-22` docstring claims "override application order matters for mental modeling but does NOT cause mathematical conflicts — each step targets a different part of the model." **This is false** because of the clipping. Concrete failure case from the review:

> Pause $7000 salary on a baseline of $5000 inflow:
> - `applyRecurringChanges` computes `inflowDelta = -7000`, `newInflows = max(0, 5000 - 7000) = 0`. Loses 2000 of "negative slack."
>
> Then add $10000 lump sum to the same month:
> - `applyLumpSums` computes `newInflows = 0 + 10000 = 10000`.
>
> Real answer in signed math: `5000 - 7000 + 10000 = 8000`. Engine answer: `10000`. Off by 2000 because the clip ate the over-pause signal.

The same issue applies in the other direction (over-cut a category, then add a lump-sum outflow). Order of appliers matters because each clip discards signed information that later appliers can't recover.

---

## Why deferred from auto-fix

The fix is a multi-applier refactor with cross-cutting test impact. An autonomous agent would either:
- Drop the clips uniformly and break visual semantics ("inflows: -2000" displayed to the user).
- Drop them in some appliers and not others, perpetuating the inconsistency.
- Leave the engine docstring lying about commutativity.

Architecture decisions wanted before code lands.

---

## Architecture

**Recommendation: signed math through the chain, clip only at display.**

The cash chain (`endCash = startCash + inflows - outflows`) is mathematically correct only when `inflows` and `outflows` are signed. Clipping them mid-chain breaks the math. The engine already documents that `endCash` may go negative (engine.ts:27-28); apply the same posture to `inflows` and `outflows`.

Two refinements:

1. **Display-time clamp on `inflows` and `outflows`.** A "negative inflow" makes no semantic sense to display, but it carries information through the chain. UI clamps at 0 for display; the displayed `endCash` is computed from unclamped values, so cash math stays consistent. (The user sees `inflows: 0, outflows: 5000, endCash: -3000` — the discrepancy is the user's signal that something is over-cut.)

2. **`byCategory[id]` semantics.** A category's outflow at -$X means "the user cut more than they spend in this category." The display should clamp to 0 here too, but the aggregate `outflows` total uses the signed value to keep the chain consistent.

---

## Implementation steps

Atomic commits, in order. Tests added alongside each.

### Step 1 — drop in-chain clips
- `apply-overrides.ts:38` — `applyCategoryDeltas`: change `Math.max(0, current + d.monthlyDelta)` → `current + d.monthlyDelta`. Adjust `actualDelta` calc accordingly (no longer need to compare to clipped value).
- `apply-overrides.ts:80` — `applyIncomeDelta`: drop `Math.max(0, ...)`.
- `apply-overrides.ts:151-152` — `applyRecurringChanges`: drop both `Math.max(0, ...)`.
- `apply-overrides.ts:206-207` — `applySkipRecurringInstances`: drop both.
- `apply-overrides.ts:254-255` — `applyLumpSums`: already unclipped (consistent now).

After this step, the projection's `inflows`/`outflows`/`byCategory` may carry negative values. Cash chain math is now correct.

### Step 2 — add display-clamp helper
New function in `apply-overrides.ts` or a new `src/lib/forecast/clamp-display.ts`:

```ts
/**
 * Clamp a projection's display-facing fields (inflows, outflows, byCategory
 * values) at 0 for rendering. Cash chain (startCash, endCash) is preserved
 * unclamped so a user staring at the display can still spot inconsistencies
 * (e.g. inflows=0 but endCash dropped — signals "over-cut" condition).
 */
export function clampForDisplay(projection: MonthlyProjection[]): MonthlyProjection[] {
  return projection.map(m => ({
    ...m,
    inflows: Math.max(0, m.inflows),
    outflows: Math.max(0, m.outflows),
    byCategory: Object.fromEntries(
      Object.entries(m.byCategory).map(([k, v]) => [k, Math.max(0, v)])
    ),
    // startCash and endCash unclamped — cash can be negative.
  }));
}
```

### Step 3 — apply clamp at engine output
`engine.ts`:
```ts
import { clampForDisplay } from './apply-overrides';
// ... in projectCash:
return { projection: clampForDisplay(scenario), goalImpacts };
```

The `goalImpacts` step (Step 7 in engine) reads `month.endCash` for the W-01 cash-gate. Cash is unclamped, so the goal-projection logic stays correct (it sees the real cash trajectory).

### Step 4 — update engine docstring
`engine.ts:21-22` — replace the false "no mathematical conflicts" claim with:

```ts
/**
 * Override application order matters for mental modeling but does NOT
 * cause mathematical conflicts: each applier accumulates SIGNED deltas
 * into the projection, and the final clampForDisplay only clips
 * inflows/outflows/byCategory at 0 for rendering. The cash chain
 * (startCash, endCash) is preserved unclamped, so commutativity holds
 * for any ordering of non-overlapping override types.
 */
```

### Step 5 — add commutativity property tests
File: `src/lib/forecast/apply-overrides-commutativity.test.ts`

```ts
describe('override applier commutativity (regression for W-09)', () => {
  // Build a stable baseline projection.
  const baseline = stableBaseline();

  it('applyCategoryDeltas + applyLumpSums commute', () => {
    const aThenB = applyLumpSums(applyCategoryDeltas(baseline, deltas), lumpSums);
    const bThenA = applyCategoryDeltas(applyLumpSums(baseline, lumpSums), deltas);
    expectProjectionsEqual(aThenB, bThenA);
  });

  it('applyRecurringChanges + applySkipRecurringInstances commute (non-overlapping)', () => {
    // Pause one stream, skip a different one's instance — non-overlapping.
    const aThenB = applySkipRecurringInstances(
      applyRecurringChanges(baseline, streams, [pauseChange]),
      streams,
      [skipDifferent]
    );
    const bThenA = applyRecurringChanges(
      applySkipRecurringInstances(baseline, streams, [skipDifferent]),
      streams,
      [pauseChange]
    );
    expectProjectionsEqual(aThenB, bThenA);
  });

  it('over-pause + lump-sum produces signed-math result', () => {
    // The original review failure case.
    // Baseline inflow $5000. Pause $7000 stream + add $10000 lump sum
    // in the same month → expected unclamped inflow = 5000 - 7000 + 10000 = 8000.
    // Display-clamped inflow = max(0, 8000) = 8000 (no clip needed; was positive).
    // The TEST is whether the engine arrives at 8000, not 10000 (the old bug).
    const inflowAfter = scenario.projection[targetMonthIndex].inflows;
    expect(inflowAfter).toBe(8000);
  });

  it('signed inflow is clamped to 0 for display when truly over-cut', () => {
    // Pause $10000 from $5000 baseline; no lump sum offset.
    // Unclamped: -5000. Display: 0. endCash reflects -5000 inflow.
    const month = scenario.projection[targetMonthIndex];
    expect(month.inflows).toBe(0);  // clamped
    expect(month.endCash).toBe(month.startCash + (-5000) - month.outflows);  // unclamped math
  });
});
```

The last test is the critical one — it asserts the architecture's posture: display clamps, math doesn't.

### Step 6 — verify existing tests still pass
The 22+ existing forecast tests use synthetic baselines that don't trigger negative inflows/outflows (they use sensible deltas relative to baseline). They should pass unchanged. If any test relied on the old clip behavior (e.g. asserting `inflows === 0` after a deliberate over-pause), update it to assert the new signed-math result.

---

## Test plan

- All existing forecast tests pass.
- New commutativity test file (~5-7 cases).
- Manual UAT in /simulator: try the over-pause scenario from the spec, verify the displayed `endCash` reflects the offset rather than the over-pause clip.

---

## Risks / open questions

- **UI display contracts.** Some `<NarrativePanel>` or scenario-summary card may render `formatCurrency(scenario.outflows)` directly. After the change, those reads see clamped values (good — same display contract). Verify by grep for `.outflows` and `.inflows` in `src/components/simulator/`.
- **AI prompt path.** The forecast-prompt builder reads `scenario.projection[i].outflows` to summarize the scenario. Clamped values are what the AI should see — consistent with what the user sees on the chart. No code change.
- **`goalImpacts.findGoalETA` reads unclamped or clamped?** The W-01 cash-gate fix added `month.endCash >= goal.monthlyContribution` — `endCash` is unclamped under the new architecture, which is correct. No change needed.
- **Backwards compatibility.** No persisted state depends on the engine's intermediate signedness. `forecast_narrative` cache keys off override hashes, which don't change. No DB migration.

---

## Out of scope

- **Per-applier signed-delta accumulator pattern.** A "deltas struct on each month" refactor (the agent's option 1) is cleaner but bigger. Step 1 (drop clips, keep current chain shape) achieves the same correctness with smaller blast radius.
- **Surfacing "over-cut" warnings to the user.** The display posture (clamp at 0, show real endCash) makes over-cut visible by inspection. A formal warning UI (e.g. yellow banner: "Your scenario implies negative inflow this month — review your overrides") is a UX enhancement, not part of this fix.
- **Engine `byCategory` aggregate consistency.** After Step 1, `month.byCategory[id]` may be negative while `month.outflows` total reflects signed math. After Step 2 display-clamp, the displayed sum of `byCategory` may not equal `outflows` because some clipped negative values were absorbed. Document this in the spec but don't try to reconcile — it's the same posture as inflows-vs-endCash.

---

## Acceptance criteria

- [ ] All 5 in-chain `Math.max(0, ...)` clips removed from `apply-overrides.ts`.
- [ ] `clampForDisplay` exported and applied at `projectCash` return.
- [ ] Engine docstring updated to describe signed-math + display-clamp posture.
- [ ] New commutativity property tests pass; existing tests pass.
- [ ] Manual UAT: over-pause + lump-sum scenario produces signed-math result.
- [ ] One commit (or two: signed-math change + clamp-helper):
  - `refactor(forecast): signed math through override chain; clamp at display (closes W-09)`
