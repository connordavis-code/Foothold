# Foothold Reliability Initiative

**Date:** 2026-05-07  
**Status:** proposed next workstream  
**Audience:** future agents, future sessions, and implementation planners  
**Pair with:** `CLAUDE.md`, `PRODUCT.md`, `SECURITY.md`

## North Star

Foothold should become trustworthy enough that the user no longer opens
three separate finance apps to answer "where do I stand today?"

The product rule for this workstream:

> Foothold should never show an important financial number without also
> knowing whether the underlying data is fresh, stale, partial, failed, or
> unverifiable.

Reliability is not just backend correctness. It is a visible product
contract. The app should tell the operator what synced, when it synced,
what failed, what is stale, and whether user action is needed.

## Why This Matters Now

Foothold has crossed the threshold from prototype to personal
source-of-truth:

- Plaid production is live for bank and credit-card data.
- SnapTrade is live for Fidelity brokerage holdings.
- Dashboard, transactions, investments, recurring, drift, goals,
  insights, simulator, cron jobs, mobile, and dark mode exist.
- Real financial data is flowing through multiple providers.

The next risk is not "missing pages." The next risk is trust leakage:
stale balances, silent provider failures, unclear sync state, and numbers
whose freshness has to be checked in another app.

## Current State

### Already Finished

- Plaid production connection flow exists.
- SnapTrade brokerage connection flow exists.
- Provider dispatch exists through `syncExternalItem` in
  `src/lib/sync/dispatcher.ts`.
- Unified disconnect action exists in `src/lib/sync/actions.ts`.
- Vercel cron routes exist under `src/app/api/cron/*`.
- `error_log` exists and is used by cron/digest monitoring.
- Logger captures axios-shaped upstream error details, including HTTP
  status and response body, when available.
- Dashboard, settings, and sync button already expose some sync concepts.
- Security baseline exists: encrypted provider secrets, Auth.js
  database sessions, RLS default-deny on public tables.

### Known Reliability Gaps

- Plaid `cron.balance_refresh` HTTP 400s — **Phase 1 implementation
  complete; production verification pending the next 00:00 UTC cron**
  (see Phase 1 below for shipped behavior + verification protocol).
- Sync health is not yet a first-class domain model.
- Freshness is not consistently shown beside important numbers.
- Provider capabilities differ, but the UI does not consistently explain
  those differences. Example: SnapTrade free tier can be cached daily;
  Plaid balance refresh may not work the same way for every institution
  or account type.
- Failures are mostly visible to engineers through logs, not to the user
  through the product.
- The dashboard can still make the user ask, "Do I trust this number?"

## Target Product Behavior

### Dashboard

The dashboard should answer:

- Are all sources healthy?
- When was each source last refreshed?
- Are headline numbers based on complete, fresh data?
- Did anything fail since the last visit?
- Does anything require user action?

Examples:

- "All sources fresh as of 8:14 AM."
- "AmEx transactions synced today; balance refresh failed."
- "Fidelity positions are cached daily by SnapTrade."
- "Monthly projection uses transactions through May 7."

### Settings

Settings should have the detailed source-of-truth view for connected
institutions:

- Provider and institution.
- Connection state.
- Last successful full sync.
- Last successful balance refresh.
- Last transaction sync.
- Last holdings sync.
- Last failure, if any.
- Failure category and plain-language message.
- User action, if needed.
- Manual sync / reconnect / disconnect actions.

### Important Numbers

Headline financial numbers should expose freshness context:

- Net worth: sources included, stale sources, latest balance/holding
  timestamp.
- Cash: bank balance freshness and pending/known transaction coverage.
- Investments: provider freshness and cache behavior.
- Forecast: latest transaction date and whether recurring streams are
  current.
- Goal progress: data window used and whether account/category inputs are
  fresh.

## Health Vocabulary

Use a small, consistent vocabulary across the app:

| State | Meaning |
|---|---|
| `healthy` | Data refreshed within the expected provider window. |
| `syncing` | A sync is currently running or was just requested. |
| `stale` | Last successful refresh is older than expected, but no active user action is required. |
| `degraded` | Some data is available, but one capability failed or is partial. |
| `needs_reconnect` | Provider requires user action to restore access. |
| `failed` | Latest sync failed and the app cannot confidently refresh this source. |
| `unknown` | The app lacks enough metadata to classify health. Avoid this long-term. |

Prefer plain-language UI labels:

- Healthy
- Syncing
- Stale
- Partial
- Needs reconnect
- Failed
- Unknown

## Implementation Phases

### Phase 1: Fix Known Balance Refresh Failure

Status: **implementation shipped 2026-05-07; production verification
pending the next 00:00 UTC cron.** See
`docs/reliability/implementation-plan.md` § Phase 1 for the detailed
status block (what changed, what remains unverified, fallback plan if
AmEx still 400s).

What changed at the code level:

- `src/lib/plaid/balance-refresh.ts` — pure helpers
  `selectRefreshableAccounts` (depository+credit only) and
  `buildBalanceUpdate` (omits any balance field where Plaid returned
  null, preserving prior real values). 13 tests in
  `src/lib/plaid/balance-refresh.test.ts`.
- `src/app/api/cron/balances/route.ts` — pre-fetches per-item
  `financial_account` rows, capability-filters before the Plaid call,
  passes explicit `account_ids`, scopes the UPDATE WHERE to
  `(itemId, providerAccountId)` (W-05), writes `cron.balance_refresh.item`
  info row per successful item (Phase 3 health query input), tracks a
  `skipped` counter alongside `refreshed`/`failed` in the aggregate log.

Original "expected outputs" status:

- ☐ Root cause documented — partially. Defensive narrowing applied;
  if AmEx still 400s, read `error_log.context.responseBody` (post-
  `05c12de` axios capture) to nail the institution/product-specific
  cause and iterate.
- ☑ Balance refresh handles provider/account limitations gracefully.
- ☑ Per-item failure does not hide other successful refreshes
  (existing per-item try/catch preserved).
- ☑ Error logging preserves upstream provider details
  (`05c12de` predates this work).
- ☑ Database writes are scoped to the correct `external_item` (W-05).
- ☑ Pure predicates cover the behavior (`balance-refresh.test.ts`).

### Phase 2: Add Sync Health Domain Model

Goal: centralize health classification instead of scattering sync status
math across pages.

Likely shape:

- Add a query/helper module such as `src/lib/db/queries/health.ts`.
- Add pure classification helpers such as `src/lib/sync/health.ts`.
- Compute health from existing data first before adding schema.
- Add schema only if existing timestamps/logs cannot answer the product
  questions cleanly.

Minimum data to expose per item:

- provider
- institution/name
- connection status
- last successful sync
- last successful balance refresh
- last successful transaction sync
- last successful investment/holding sync
- last failure time
- last failure summary
- freshness state
- user action required flag

Testing:

- Unit-test health classification thresholds.
- Include provider-specific expectations for Plaid and SnapTrade.
- Include degraded partial-success cases.

### Phase 3: Surface Health In Settings

Goal: settings becomes the detailed trust console.

Likely files:

- `src/app/(app)/settings/page.tsx`
- `src/components/connect/*`
- `src/components/nav/sync-pill.tsx` if relevant
- New components under `src/components/settings/` or
  `src/components/sync/`

UI expectations:

- Dense, operator-grade rows.
- No marketing copy.
- State labels use text plus restrained color.
- Failed/degraded rows include a plain-language reason.
- Manual action is obvious only when needed.

### Phase 4: Add Dashboard Trust Strip

Status: **shipped 2026-05-07.** See
`docs/reliability/implementation-plan.md` § Phase 5 for the detailed
status block. (README and implementation-plan use different phase
numbering — README Phase 4 = plan Phase 5. The plan is canonical.)

What landed:

- `<TrustStrip>` above the hero card in `/dashboard`.
- Pure helper `summarizeTrustStrip` reduces `SourceHealth[]` into one
  of three view-models: `healthy` (muted "Fresh X ago" line),
  `no_signal` (muted "Sync pending" line), `elevated` (amber-bordered
  block with sentence-at-N=1 / mini-list-at-N≥2 + "Open settings"
  CTA). Stale and unknown per-source states are intentionally silent —
  same restraint rule as the `<StatePill>` in `<SourceHealthRow>`.
- 10 new pure tests (`trust-strip.test.ts`); full vitest 447/447.
- Browser UAT pending — agent-session constraint (dev server needs
  authenticated magic-link).

### Phase 5: Annotate Headline Numbers

Goal: connect important numbers to data freshness.

Candidates:

- Dashboard net worth / cash hero.
- Investments summary.
- Forecast baseline / simulator.
- Goals pace summary.
- Recurring monthly total.

Each annotation should answer one of:

- "as of when?"
- "from which sources?"
- "is anything missing?"
- "is this provider cached or live?"

## Design Guidance

Follow `PRODUCT.md` and `DESIGN.md`.

- Editorial, restrained, direct.
- JetBrains Mono for numerals.
- No generic SaaS health dashboard treatment.
- No sparkles, glowing alerts, or noisy status colors.
- Use amber/destructive only when the state genuinely demands attention.
- Prefer honest labels over fake precision.
- "Unknown" is acceptable only as a transitional engineering state; do
  not let it become a product norm.

## Open Questions

- Should sync health be persisted as a snapshot table, or computed from
  existing source tables and `error_log`?
- What freshness windows should apply by provider and data type?
  Example: Plaid transactions may be fresh daily; SnapTrade free-tier
  holdings may be cached daily by design.
- Should balance refresh failures on credit-only institutions be
  degraded, ignored, or provider-capability annotated?
- Should the dashboard block or visually de-emphasize numbers with stale
  sources?
- Should the digest email include reliability status once this model
  exists?

## Agent Handoff Rules

When working on this initiative:

1. Read `CLAUDE.md` first.
2. Read this folder second.
3. Start with the highest-priority incomplete phase.
4. Preserve the existing provider dispatch architecture.
5. Do not invent a separate API layer for app-internal mutations.
6. Add pure tests for classification logic before wiring UI around it.
7. Update this folder and `CLAUDE.md` at the end of the session.

## Immediate Next Step

Start with `docs/reliability/implementation-plan.md`, Phase 1.
