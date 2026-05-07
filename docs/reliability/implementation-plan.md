# Reliability Implementation Plan

**Status:** ready for implementation  
**Primary objective:** make Foothold's data freshness and provider health
explicit, testable, and visible.

## Phase 1: Plaid Balance Refresh Reliability

### Problem

Recent sessions recorded Plaid `cron.balance_refresh` failures with HTTP
400. Balance freshness directly affects the dashboard's headline trust.

### Status (2026-05-07): implementation shipped; production verification pending

**Implementation complete; awaiting next 00:00 UTC cron run for
production verification.**

#### What changed

- new: `src/lib/plaid/balance-refresh.ts` — `selectRefreshableAccounts`
  (depository+credit only) and `buildBalanceUpdate` (per-field null
  guard).
- new: `src/lib/plaid/balance-refresh.test.ts` — 13 pure tests
  (capability filter + null-clobber edges + zero-as-real-value
  regression).
- modified: `src/app/api/cron/balances/route.ts` — pre-fetches per-item
  `financial_account` rows, capability-filters before the Plaid call,
  passes explicit `account_ids`, scopes UPDATE WHERE to `(itemId,
  providerAccountId)` (W-05), writes `cron.balance_refresh.item` info
  row per successful item (Phase 3 health query input), adds
  `skipped` counter.

#### Why the bug class extended past the visible 400

The visible failure was HTTP 400. The hidden failure was that even on
the days the cron returned 200, a "successful" call could write
`balances.current = null` straight back over real values when Plaid
omitted the field — and read surfaces (`dashboard.ts` line 49,
`forecast.ts` line 152, `goals.ts` line 198) treat null as zero.
Silent corruption is worse than a loud 400. `buildBalanceUpdate`
omits any balance field where Plaid returned null, preserving the
prior database value.

#### What remains unverified

- Whether the capability filter alone resolves the 400 across both WF
  (depository) and AmEx (credit-only). The defensive narrowing covers
  the request-shape class of cause; institution/product-capability
  failures specific to AmEx would still 400 even with `account_ids`
  scoped to credit.
- Whether `error_log` actually shows `cron.balance_refresh.item` info
  rows for both items after the next 00:00 UTC cron.

#### Verification protocol

After deploy, after the next 00:00 UTC cron:

1. `node scripts/diagnose-balance-refresh.mjs` — expect
   `cron.balance_refresh.item` info rows for **both** WF + AmEx, with
   non-zero `updatedCount`.
2. Zero new HTTP 400 rows for `cron.balance_refresh*` in `error_log`.
3. WF depository balances + AmEx credit balances updated; investment +
   loan + other types untouched.
4. **If AmEx still 400s** — fall back to the structured Plaid response
   body now captured by `logError` (post-`05c12de`):
   ```sql
   SELECT context->>'httpStatus', context->'responseBody'
   FROM error_log
   WHERE op LIKE 'cron.balance_refresh%' AND level = 'error'
   ORDER BY occurred_at DESC LIMIT 5;
   ```
   Read the Plaid `error_code` / `error_type` and iterate. Phase 1
   then ships the depository-only path; AmEx becomes a Phase 2
   classification problem (capability-degraded rather than failed).

#### Open question for Phase 2

Should `cron.balance_refresh.skipped` rows be the canonical
"balances: not_applicable" signal for items with zero refreshable
accounts (e.g., a hypothetical investment-only Plaid item), or should
Phase 2's `classifyItemHealth` model capability-not-applicable
separately? Today the path is unreachable — both WF and AmEx have
refreshable accounts — so this is a forward-design question, not a
blocker.

### Original Done Criteria — status

- ☑ Balance cron succeeds for refreshable items (pending prod verify).
- ☑ Non-refreshable provider/account cases handled (skipped path).
- ☑ Logs show useful provider error details for remaining failures
  (inherited from `05c12de`).
- ☑ Typecheck passes.
- ☑ Relevant tests pass (296 total; +13 new this phase).
- ☑ `CLAUDE.md` no longer lists this as an active unknown — it lists
  Phase 1 as implemented-pending-verification, which is honest.

## Phase 2: Health Classification Helpers

### Problem

The app needs a shared way to say whether a source is healthy, stale,
degraded, failed, or needs reconnect.

### Proposed Module

Create a pure helper module:

- `src/lib/sync/health.ts`
- `src/lib/sync/health.test.ts`

Possible types:

```ts
export type SyncHealthState =
  | "healthy"
  | "syncing"
  | "stale"
  | "degraded"
  | "needs_reconnect"
  | "failed"
  | "unknown";

export type SyncCapability =
  | "accounts"
  | "balances"
  | "transactions"
  | "investments"
  | "recurring";
```

Classification should be data-only and UI-agnostic.

### Inputs To Consider

- provider
- item status
- provider-specific state
- last successful timestamps
- last failure timestamp and category
- account types attached to the item
- whether a sync is currently running, if known
- provider freshness policy

### Done Criteria

- Pure tests cover all health states.
- Plaid and SnapTrade can have different freshness policies.
- Partial failure produces `degraded`, not a blanket `failed`, when
  useful data remains available.
- `needs_reconnect` wins over stale/degraded when user action is required.

### Status (2026-05-07): shipped — pure layer ready for Phase 3

`src/lib/sync/health.ts` + `src/lib/sync/health.test.ts` shipped. 39
pure tests across 7 describe blocks covering the four areas the
product brief called out (provider freshness windows, partial failures,
needs_reconnect precedence, capability-not-applicable) plus
recovery/never_synced edge cases. Full vitest suite at 346/346.

#### Public surface

- `Provider`, `SyncHealthState`, `SyncCapability`,
  `CapabilityClassification`, `CapabilityState`, `ClassifyInput`,
  `ClassifyOutput` types
- `FRESHNESS_POLICY` constant (provider × capability `staleHours` map)
- `classifyItemHealth(input): ClassifyOutput`

#### Design deltas vs the original spec block above

- **Dropped `accounts` from `SyncCapability`.** Account metadata
  refreshes as a side-effect of every sync; there's no separate
  "accounts cron" that can independently go stale. The four meaningful
  capabilities are `balances | transactions | investments | recurring`.
- **`CapabilityState` is a discriminated union**:
  `{ kind: 'not_applicable' }` | `{ kind: 'tracked', lastSuccessAt,
  lastFailureAt, lastFailureSummary? }`. The N/A branch is the
  load-bearing distinction the product brief asked for — it ensures a
  SnapTrade item with no balance refresh path doesn't degrade the
  headline just because balances never refresh.
- **Input shape requires all 4 capabilities** (`Record<SyncCapability,
  CapabilityState>`, not `Partial<...>`). This forces Phase 3 to be
  explicit about applicability per source rather than relying on key
  absence to mean N/A. Adding a 5th capability later is intentionally
  a breaking change so all callers handle the new dimension.
- **Defensive: tracked-but-no-policy is treated as N/A.** If Phase 3
  ever sends a `tracked` state for a (provider, capability) pair
  the policy table doesn't cover (e.g. SnapTrade balances), the
  classifier returns `not_applicable` rather than letting the
  misclassification corrupt aggregate state. Test coverage at
  `health.test.ts` § "SnapTrade balances passed as tracked is
  defensively N/A".
- **Output includes `byCapability` breakdown** so Phase 4 UI
  can render per-row state without recomputing.
- **`syncing` is set by the caller**, never returned by the helper —
  it's a runtime state from in-flight `syncItemAction` calls, not
  derivable from snapshot data. The output type narrows accordingly:
  `state: Exclude<SyncHealthState, 'syncing'>`.

#### Provider freshness windows shipped

| Capability    | Plaid (staleHours) | SnapTrade (staleHours) |
|---------------|-------------------:|-----------------------:|
| balances      | 12                 | N/A (no separate path) |
| transactions  | 36                 | 36                     |
| investments   | 36                 | 36                     |
| recurring     | 36                 | N/A (brokerages don't have recurring streams) |

Plaid balances uses 12h to allow one missed 6h cron + slack. The
nightly windows include slack for one missed nightly run.

#### Classification priority (high → low)

1. `itemStatus !== 'active'` → `needs_reconnect` (`requiresUserAction:
   true`); reason carries the raw status flavor
2. Zero applicable capabilities → `unknown`
3. All applicable capabilities `never_synced` → `unknown`
   ("no signal" is more honest than "old signal")
4. Any failed + any non-failed → `degraded`
5. All applicable failed → `failed`
6. All applicable fresh → `healthy`
7. Else (some stale or never_synced, no failures) → `stale`

#### What's still pending (Phase 3+)

- **Phase 3 query** (`src/lib/db/queries/health.ts` + composite index
  on `error_log`) is still TODO. That layer reads `external_item +
  financial_account.type[] + error_log` and produces the
  `Record<SyncCapability, CapabilityState>` per-item input that this
  helper consumes.
- **No UI wired yet**, per scope: Phases 4–6 will consume the helper
  via the Phase 3 query.

## Phase 3: Health Query

### Problem

UI needs a single query shape for source health instead of each page
joining provider tables differently.

### Proposed Module

- `src/lib/db/queries/health.ts`

### Query Output

Return one row per connected source:

```ts
type SourceHealth = {
  itemId: string;
  provider: "plaid" | "snaptrade";
  displayName: string;
  institutionName: string | null;
  state: SyncHealthState;
  capabilities: SyncCapability[];
  lastSuccessfulSyncAt: Date | null;
  lastBalanceRefreshAt: Date | null;
  lastTransactionSyncAt: Date | null;
  lastInvestmentSyncAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureSummary: string | null;
  requiresUserAction: boolean;
};
```

Adjust names to match local schema conventions.

### Done Criteria

- Settings can render connected-source health without custom joins.
- Dashboard can summarize all-source health from the same query.
- Query is scoped to the authenticated user.
- No secrets are exposed.

## Phase 4: Settings Health Panel

### Problem

The detailed reliability view should live where connected accounts are
managed.

### Files

- `src/app/(app)/settings/page.tsx`
- Existing connect/disconnect components under `src/components/connect/`
- New component location to choose based on nearby patterns.

### UI Requirements

- One row/card per source.
- Show provider, institution, freshness state, last successful sync, and
  last failure if present.
- Show manual actions only where useful.
- Use direct copy:
  - "Fresh today"
  - "Balance refresh failed"
  - "Needs reconnect"
  - "Fidelity positions cached daily"
- Avoid verbose explanatory blocks.

### Done Criteria

- User can tell which source is stale or broken without reading logs.
- Manual sync/reconnect paths remain available.
- Mobile layout works.

## Phase 5: Dashboard Trust Strip

### Problem

The dashboard is the primary "can I trust this?" moment.

### Files

- `src/app/(app)/dashboard/page.tsx`
- `src/lib/db/queries/dashboard.ts`
- New dashboard component if needed.

### UI Requirements

- Compact, above or near the headline financial summary.
- Aggregates source health into a single readable sentence.
- Allows drilldown to settings when attention is needed.

Examples:

- "All sources fresh as of 8:14 AM."
- "1 source needs attention: AmEx balance refresh failed."
- "Fidelity positions are current for SnapTrade's daily cache."

### Done Criteria

- User gets immediate confidence or warning.
- No major layout churn.
- No hidden failure state when a connected item is degraded.

## Phase 6: Freshness Context On Numbers

### Problem

Important numbers should carry freshness context.

### Candidate Surfaces

- Dashboard hero/net worth.
- Investments summary.
- Forecast/simulator baseline.
- Goals pace.
- Recurring monthly total.

### Done Criteria

- At least the dashboard and investments summary explain source
  freshness.
- Stale or partial source data is visible near affected numbers.
- Labels remain concise.

## Testing Strategy

Use tests where logic is pure:

- health state classification
- provider freshness windows
- partial failure aggregation
- dashboard summary sentence builder, if extracted
- settings row view-model builder, if extracted

Use manual UAT for:

- actual Plaid/SnapTrade provider states
- mobile settings health panel
- dashboard trust strip layout
- reconnect and manual sync behavior

## Session Checklist

At the end of each reliability session:

- Update `docs/reliability/README.md` current state.
- Update this implementation plan phase statuses.
- Update `CLAUDE.md` Roadmap / In progress / Next up.
- Run `npm run typecheck`.
- Run focused tests, or `npm run test` if the change touched shared
  forecast/sync/query behavior.
