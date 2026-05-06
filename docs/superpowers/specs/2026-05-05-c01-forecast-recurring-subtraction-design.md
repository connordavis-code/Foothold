# C-01 — Forecast recurring-subtraction lifecycle bug

> **Severity:** Critical (originally) → Real bugs are Warning-grade after verification.
> **Related files:** `src/lib/db/queries/forecast.ts`, `src/lib/forecast/baseline.ts`, `src/lib/forecast/engine.ts`, `src/lib/anthropic/forecast-prompt.ts`
> **Source:** `docs/reviews/2026-05-05-REVIEW.md` § C-01

---

## Problem

Two compensating data flows that work in aggregate but bake bugs into per-month numbers:

1. **`getForecastHistory` (`forecast.ts:199-209`)** subtracts each active recurring stream's monthly equivalent from its PFC bucket, identically across all 3 trailing months, with `Math.max(0, …)` floor.
2. **`computeBaseline` (`baseline.ts:69-72`)** then adds `recurringMonthlyOutflow` back on top of the (already-attenuated) `categoryBaseline`.

In aggregate the math reconciles — recurring subtracted at the query layer, recurring re-added at the engine layer — but per-month it produces two real bugs:

**Bug A — lifecycle off-by-one.** A stream that started 2 months ago has its monthly equivalent subtracted from all 3 trailing months including the month before it existed. The pre-existence month's bucket goes negative, gets clipped to 0, and the median over `[0, X, Y]` under-projects by ~33%.

**Bug B — information loss via floor-at-0.** When a stream's monthly equivalent exceeds the PFC bucket's actual spend that month (e.g. user paused the subscription that month, or the bucket conflates two streams sharing one PFC), the clip "consumes" non-recurring spend. The median of clipped buckets under-projects future spend in that category for the rest of the horizon.

Both bugs make `endCash` projections optimistic. Goal ETAs report sooner-than-real. Drift detection misses categories that look quiet only because of clip-to-zero.

---

## Why deferred from auto-fix

The fix is a contract change between `getForecastHistory` (data layer) and `computeBaseline` (engine). It also touches the AI prompt path that surfaces "your recurring spend is $X / month" as a separate signal. A reviewer agent applying this autonomously would either:

- Drop the subtraction and accidentally double-count (per-category PFC buckets already include the recurring transactions Plaid tagged with that PFC).
- Drop the engine's `+recurringMonthlyOutflow` and lose the explicit recurring/non-recurring decomposition the AI prompt may rely on.

Without a thought-through architecture choice, the fix is more dangerous than the bug.

---

## Architecture choice

Three valid architectures handle the recurring/non-recurring split:

| | Where recurring is decomposed | Engine outflow formula | Cleanliness |
|---|---|---|---|
| **A** (current) | Query layer (subtract from PFC) | `recurring + non-recurring residual` | Bugs as described |
| **B** (recommended) | Nowhere — engine consumes raw PFC | `sum(PFC categories)` | Cleanest; loses recurring decomp signal |
| **C** | Engine layer (subtract using stream metadata) | `recurring + (PFC − recurring lifecycle-aware)` | Most accurate; biggest code change |

**Recommendation: Architecture B.** Reasoning:
- PFC totals already include recurring transactions (Plaid categorizes every txn). Summing them gives true total spend.
- Override appliers (`applyRecurringChanges`, `applySkipRecurringInstances`) already subtract the stream's monthly equivalent from `outflows` aggregates — that math is sound under B because the PFC sum already includes the stream's contribution.
- `recurringStreams` data on `ForecastHistory` stays informational for override appliers and the AI prompt, even if `computeBaseline` no longer adds recurring separately.

The trade-off vs C: the AI prompt currently surfaces `recurringMonthlyOutflow` as a distinct line. After B, the prompt builder would compute it inline from `history.recurringStreams` for narrative context. Same data, different consumer.

---

## Implementation steps

Atomic commits, in order.

### Step 1 — drop subtraction at query layer
- `forecast.ts:199-209` — delete the per-stream subtraction loop.
- `forecast.ts:211-219` — delete the recurring-inflow subtraction; rename `nonRecurringIncomeHistory` → `incomeHistory` and update the type in `types.ts`.
- Update the docstring on `getForecastHistory` (lines 65-83) to reflect raw PFC semantics.

### Step 2 — drop recurring re-add at engine layer
- `baseline.ts:48-60` — delete `recurringMonthlyOutflow` / `recurringMonthlyInflow` accumulation.
- `baseline.ts:69-72` — change `outflows = recurringMonthlyOutflow + sum(categoryBaseline)` → `outflows = sum(categoryBaseline)`. Same for inflows.
- Update docstring on `computeBaseline` to reflect "PFC totals are the full spend; recurring streams are surfaced via overrides only".

### Step 3 — verify override appliers still subtract correctly
Walk through each of the 5 appliers in `apply-overrides.ts`:
- `applyRecurringChanges` (pause): `outflowDelta -= monthlyEquivalent(stream)`. Under B, this subtracts from a bucket that already includes the stream — correct.
- `applyRecurringChanges` (edit): `outflowDelta -= orig + outflowDelta += new`. Correct.
- `applyRecurringChanges` (add): adds to outflows. The stream doesn't yet exist in PFC totals, so adding is correct.
- `applySkipRecurringInstances`: subtracts stream's monthly equivalent from one month's bucket. Correct under B.
- `applyCategoryDeltas`, `applyIncomeDelta`, `applyLumpSums`: untouched (don't reason about recurring decomposition).

No code change needed in step 3; this is verification of correctness in the new contract. Note in commit message.

### Step 4 — update AI prompt path
- `forecast-prompt.ts` (read first): if it references `history.nonRecurringIncomeHistory` directly, update to `history.incomeHistory`.
- If the prompt narratively surfaces "recurring spend $X / month", compute it inline:
  ```ts
  const recurringMonthlyOutflow = history.recurringStreams
    .filter(s => s.direction === 'outflow')
    .reduce((sum, s) => sum + monthlyEquivalent(s.amount, s.cadence), 0);
  ```

### Step 5 — add property test
File: `src/lib/forecast/baseline.test.ts` (or add to existing engine.test.ts).

```ts
describe('baseline outflow conservation (regression for C-01)', () => {
  it('projects total outflows within ±5% of trailing-3mo median × horizon', () => {
    const history = stableHistory({
      categoryHistory: {
        FOOD: [800, 850, 820],          // ~$823/mo median
        RENT: [2000, 2000, 2000],       // $2000/mo median
        SUBSCRIPTIONS: [80, 80, 80],    // $80/mo median, also a recurring stream
      },
      incomeHistory: [5000, 5100, 4900],
      recurringStreams: [
        { id: 's1', direction: 'outflow', amount: 80, cadence: 'monthly', /* ... */ },
      ],
    });
    const result = projectCash({ history, overrides: {}, currentMonth: '2026-05' });
    const totalOutflows = result.projection.reduce((s, m) => s + m.outflows, 0);
    const expected = 12 * (823 + 2000 + 80);
    expect(Math.abs(totalOutflows - expected) / expected).toBeLessThan(0.05);
  });

  it('does not double-count subscription that is also a recurring stream', () => {
    // Same as above but the subscription appears in BOTH history and streams.
    // Under Architecture B, summing PFC gives the right answer; recurring
    // is informational, not additive.
  });
});
```

### Step 6 — update CLAUDE.md
Append to "Architecture notes":
> ### Forecast engine consumes raw PFC totals
> `computeBaseline` projects outflows as `sum(median(PFC trailing 3mo))`, not `recurring + non-recurring residual`. The recurring/non-recurring split is recovered when needed (override appliers, AI prompt) by computing from `history.recurringStreams` directly. Dropping the query-layer subtraction loop in `getForecastHistory` was the fix in commit `<hash>` — closed C-01 in `docs/reviews/2026-05-05-REVIEW.md`.

---

## Test plan

- All 22 existing forecast-engine tests must still pass. The architecture change is mathematically equivalent in aggregate; per-month numbers will change in cases the old code had bugs.
- Snapshot test of one stable history (real prod-like data) before/after to quantify the per-month change.
- New property test (Step 5).
- Run the simulator UI manually after the change. Verify a known scenario (e.g. pause a subscription) produces the expected delta in displayed outflows.

---

## Risks / open questions

- **The AI prompt may rely on `nonRecurringIncomeHistory` semantics.** Read `forecast-prompt.ts` end-to-end before merging step 1. If the prompt explicitly says "your non-recurring income" and that distinction matters narratively, keep the residual separately or compute it inline.
- **Snapshot tests in CI may need regeneration.** If any deterministic projection tests assert specific dollar values per month, those will shift. Update fixtures, don't suppress.
- **Fingerprint cache for `forecast_narrative`.** The `history-fingerprint.ts` likely SHA's the raw history. If the shape changes (`nonRecurringIncomeHistory` → `incomeHistory`), every cached narrative invalidates on next save. Acceptable one-time miss; document in commit message.

---

## Out of scope

- **Stream-aware lifecycle subtraction (Architecture C).** The accuracy gain over B is small (PFC summing is already correct in aggregate; the bug was only the bad per-month subtraction). C costs a multi-day refactor with stream-creation-date tracking and is overkill given B's cleaner posture.
- **Multi-stream-per-PFC handling.** If a user has two subscriptions sharing PFC `RENT_AND_UTILITIES`, the override appliers double-subtract on `pause-both`. Not a bug introduced by this change; same behavior pre/post. File a follow-up if it surfaces.

---

## Acceptance criteria

- [ ] `getForecastHistory` returns raw PFC totals (no subtraction loop).
- [ ] `computeBaseline` outflows = sum(category medians) only.
- [ ] All 22 existing forecast tests pass + new conservation property test.
- [ ] Simulator manual walkthrough: pause-recurring scenario produces expected outflow delta.
- [ ] AI prompt path reviewed; surfaces recurring-vs-residual signal if needed.
- [ ] CLAUDE.md architecture note added.
- [ ] One commit: `fix(forecast): drop recurring subtraction at query layer; engine consumes raw PFC (closes C-01)`
