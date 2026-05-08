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
4. Any failed AND any success-backed (`fresh` or `stale`) → `degraded`
5. Any failed AND no success-backed (all-failed, OR failed +
   `never_synced` only) → `failed`
6. All applicable fresh → `healthy`
7. Else (some stale or never_synced, no failures) → `stale`

> **Post-review correction (2026-05-07).** Items 4 and 5 were tightened
> after a code review of `54270a9`: the prior rule classified
> `failed + never_synced` as `degraded` even though no capability was
> actually working. `degraded` semantically requires at least one
> success-backed capability. `never_synced` is "no signal," not
> "working." Fail-closed: failed dominates when no working data exists.
> Test coverage at `health.test.ts` § "degraded requires success-backed
> data".

#### Open question for Phase 3+

Plaid's `external_item.status = 'error'` is a catch-all for
`ITEM_ERROR`. It can mean user-actionable (rare reauth-flavored
states) or engineering-actionable (transient provider failure, rate
limit, upstream outage). The classifier currently treats all
non-active statuses identically — `needs_reconnect` with
`requiresUserAction: true`. That's fail-closed but potentially noisy
for error-as-transient. Once Phase 3+ has real `error_log` patterns,
decide whether `error` should split into a separate state with
`requiresUserAction: false`, or whether callers should narrow it
from `lastFailureSummary` content.

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

### Status (2026-05-07): shipped — query layer ready for Phase 4

`src/lib/db/queries/health.ts` + `src/lib/db/queries/health.test.ts`
shipped. 23 pure tests on the three mapping helpers. Composite index
on `error_log(external_item_id, op, occurred_at)` declared in
`schema.ts`; **`npm run db:push` is required after pulling this
change** to apply the index in Postgres.

#### Public surface

- `SourceHealth` type — one row per `external_item`, carries the
  Phase 2 verdict (`state`, `reason`, `requiresUserAction`,
  `byCapability`) plus raw timestamps for "as of when" UI copy
- `getSourceHealth(userId): Promise<SourceHealth[]>` — orderd by
  `external_item.created_at` for stable row order
- Pure helpers exposed for testing + Phase 4 reuse:
  - `inferCapabilities(provider, accountTypes)` — applicability rules
  - `buildCapabilityStates(applicable, raw)` — translate raw timestamps
    into `Record<SyncCapability, CapabilityState>` for Phase 2's classifier
  - `aggregateTopLevelTimestamps(raw)` — top-level lastSuccess/lastFailure

#### Capability inference rules

| Provider × accounts | balances | transactions | investments | recurring |
|---|---|---|---|---|
| Plaid + depository       | ✓ | ✓ |   | ✓ |
| Plaid + credit (e.g. AmEx) | ✓ | ✓ |   | ✓ |
| Plaid + investment-only  |   |   | ✓ |   |
| Plaid + dep+inv          | ✓ | ✓ | ✓ | ✓ |
| Plaid + loan-only / other / empty | (no applicable capabilities) |
| SnapTrade (any account types) |   | ✓ | ✓ |   |

Plaid `balances` rule mirrors Phase 1's `selectRefreshableAccounts`
filter (depository+credit only). Plaid `transactions`/`recurring`
likewise gate on depository/credit because both run off the regular
transactions stream. SnapTrade is fixed-shape — brokerages always
sync activities + holdings; account types are not consulted.

#### Log → CapabilityState mapping

| Capability    | Success signal | Failure signal |
|---------------|----------------|----------------|
| balances      | `op = 'cron.balance_refresh.item' AND level = 'info'` | `op LIKE 'cron.balance_refresh%' AND level = 'error'` |
| transactions (Plaid) | `max(cron.nightly_sync.item info, external_item.lastSyncedAt)` | `op LIKE 'cron.nightly_sync%' AND level = 'error'` |
| investments (Plaid)  | (shares Plaid transactions success) | (shares Plaid transactions failure) |
| recurring (Plaid)    | (shares Plaid transactions success) | (shares Plaid transactions failure) |
| transactions (SnapTrade) | `max(cron.nightly_sync.item info, external_item.lastSyncedAt)` | `max(cron.nightly_sync%, snaptrade.sync.activities) error` |
| investments (SnapTrade)  | (shares SnapTrade transactions success) | `max(cron.nightly_sync%, snaptrade.sync.positions) error` |

Two non-obvious mapping rules — both arose from review of `118fefd`:

- **`external_item.lastSyncedAt` is a fallback success signal.** Both
  manual sync (`syncItemAction`) and the nightly cron update this
  column, but only the cron writes `cron.nightly_sync.item` info
  rows. Without the fallback, freshly connected sources show
  `unknown`/`never_synced` in health UI right after a successful
  connect — misleading because the sync DID run, just via the manual
  path. The resolution helper takes `max(cron info, lastSyncedAt)`.
- **SnapTrade per-capability errors merge into their respective
  capability.** `syncSnaptradeItem` catches per-account failures and
  logs `snaptrade.sync.positions` (→ investments) and
  `snaptrade.sync.activities` (→ transactions) while the
  orchestrator-level `cron.nightly_sync.item` rolls up as success.
  Without merging, partial SnapTrade failures vanish from health.

`cron.balance_refresh.skipped` rows are NOT read — capability
applicability is already inferred from `account_types`, so an item
that legitimately skips refresh (zero depository/credit accounts)
will already have `balances` classified as `not_applicable` by the
inference. Skipped rows remain in `error_log` for digest visibility.

Webhook failures (`webhook.transactions`, `webhook.signature_verification`,
etc.) are NOT counted as capability failures. Webhook delivery is
supplementary to the cron schedule — a failed webhook doesn't break
the next nightly sync. If observability needs them, they can be
surfaced separately as a "reliability events" feed.

#### Residual limitation (resolved 2026-05-07 post-second-review)

The "partial-failure-then-success" case (SnapTrade per-capability
error fires inside a sync that ultimately rolls up as success) is
now resolved by per-capability success logging in `syncSnaptradeItem`:

- `snaptrade.sync.activities` info row written only when EVERY
  account succeeded for activities. Any per-account error suppresses
  the success info row.
- `snaptrade.sync.positions` info row written under the same rule.
- `resolveCapabilityTimestamps` runs a three-branch resolution per
  SnapTrade capability (corrected after second review of `5790050`):
  1. **info row present** → authoritative success
  2. **info row absent BUT error row present** → success is null.
     **Critically, do NOT fall back to lastSyncedAt or
     `cron.nightly_sync.item`** — the orchestrator updates
     lastSyncedAt at the end of every sync regardless of per-account
     failures. Falling back would set the success timestamp to T2
     (after the failure at T1), which is newer than T1, which means
     `classifyCapability` says `fresh` even though the capability's
     work in this sync demonstrably failed.
  3. **neither signal present** → backward-compat fallback to nightly
     + lastSyncedAt (used by items synced before per-capability info
     logging shipped, until the first post-deploy sync writes the new
     rows).

The branch (2) bug was the real residual issue — branch (1)
authoritativeness alone isn't enough because the absence of an info
row is ambiguous between "post-deploy partial failure" and "pre-
deploy backward-compat." The error column disambiguates.

Backward compatibility: items synced before per-capability info
logging shipped have no info rows AND no per-capability errors
yet → branch (3) → fall back to prior rule. After one full sync
cycle post-deploy, all SnapTrade items have authoritative
per-capability signals.

#### Manual sync failure surfacing (also resolved post-second-review)

`syncExternalItem` (the dispatcher) wraps both providers and logs
`op = 'sync.dispatcher'` on uncaught errors. Previously not read by
Phase 3, so a failed manual sync left the health row showing
"healthy from last cron" — misleading. `resolveCapabilityTimestamps`
now folds dispatcher errors into the nightly-side failure for both
providers (dispatcher errors don't apply to balances — that's a
separate cron).

#### Query shape

1 typed Drizzle query for items + aggregated `financial_account.type[]`
via `ARRAY_AGG(DISTINCT type) FILTER (WHERE type IS NOT NULL)`,
followed by 9 parallel `error_log` lookups per item:
- balance success (`cron.balance_refresh.item` info)
- balance failure (`cron.balance_refresh%` error)
- nightly success (`cron.nightly_sync.item` info)
- nightly failure (`cron.nightly_sync%` error)
- snaptrade activities success (`snaptrade.sync.activities` info)
- snaptrade activities failure (`snaptrade.sync.activities` error)
- snaptrade positions success (`snaptrade.sync.positions` info)
- snaptrade positions failure (`snaptrade.sync.positions` error)
- dispatcher failure (`sync.dispatcher` error)

Total: `1 + 9N` queries for `N` sources. The composite index keeps
each lookup at an index seek + LIMIT 1; for typical N=2–5 the
round-trip is negligible. SnapTrade-specific queries run for Plaid
items too (returning empty) — branching to skip saves at most 4
queries × N items, not worth the conditional complexity.

#### Security

`external_item.secret` (encrypted access token / userSecret) is never
selected. Query is scoped on `external_item.user_id = $1` at the
SQL level so cross-user data exposure isn't possible at the query
boundary.

#### Pending follow-up

- **`npm run db:push`** must be run after this commit to apply the
  composite index. Drizzle's strict-prompt issue (CLAUDE.md > Lessons
  learned > "Don't feed db:push via stdin") still applies; toggle
  `strict: false` temporarily if the prompt hangs.
- No UI wired (per scope). Phase 4 (Settings panel) and Phase 5
  (Dashboard trust strip) are the consumers.

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

### Status (2026-05-07): shipped — first UI consumer of getSourceHealth

`src/app/(app)/settings/page.tsx` rewired to fetch `getSourceHealth()`
instead of joining `external_item` + `financial_account` inline. Per-
institution header now rendered by new `<SourceHealthRow>`; the
existing per-account sub-list stays as-is (separate concern).

#### Files

- new: `src/components/sync/source-health-row.tsx` — server
  component, single responsive layout (flex column on `<sm`, row on
  `sm+`). State pill + secondary line + action buttons.
- new: `src/lib/sync/health-summary.ts` — pure helper
  `summarizeSourceHealth(source, now)` produces the secondary line
  ("Synced 5m ago" for healthy; classifier `reason` verbatim for
  elevated states).
- new: `src/lib/sync/health-summary.test.ts` — 7 tests covering all
  states + null lastSuccessfulSyncAt edge.
- updated: `src/lib/format/date.ts` — `formatRelative` promoted from
  the inline helper at `settings/page.tsx`. Now used by settings,
  source-health-row, and any future "as of X" annotations
  (Phase 6 surfaces).
- updated: `src/lib/format/date.test.ts` — 11 new tests for
  `formatRelative` covering minute/hour/day boundaries + clock-skew
  defensive return.
- updated: `src/app/(app)/settings/page.tsx` — replaces inline rows
  with `<SourceHealthRow>`. Per-account list preserved.

#### Visual restraint (DESIGN.md "Single-Hue Elevated Rule")

State pill shows ONLY for `degraded` (amber "Partial"),
`needs_reconnect` (amber "Reconnect"), and `failed` (destructive
"Failed"). `healthy` / `syncing` / `stale` / `unknown` render with no
pill — the secondary line carries enough signal. Earns the
attention budget for color only when state genuinely demands action.

Action picker driven by `requiresUserAction` (not raw `itemStatus`):
true → ReconnectButton; false → SyncButton. DisconnectItemButton
always present. Wires to existing client-component buttons unchanged.

#### Mobile pattern note

Locked decision was "MobileList field-config (existing pattern)".
Implementation deviates: SourceHealthRow is a single responsive
component without literal MobileList. Reasoning: MobileList's design
is for dense scrolling lists with date grouping (transactions,
holdings, drift); rows are single-tap-target with `rowHref` OR
`onRowTap` exclusively, not multi-button. Settings has 2–5
institution rows max with multiple action buttons per row —
forcing MobileList would require a vaul drawer for actions, which
is interaction overhead the use case doesn't justify. The single
responsive component honors operator-tier visual conventions
(restrained color, monospace numerals via existing buttons,
44px+ tap targets) without the literal primitive.

#### Verification

- typecheck clean
- 26 new pure tests (formatRelative + summarizeSourceHealth) — full
  vitest 428/428
- **Browser UAT not performed** in this agent session — the dev
  server requires authenticated access (magic-link flow) which the
  agent can't complete. Manual UAT recommended at the next session
  (live /settings page; verify pill rendering across all sources
  and dark mode parity).

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
