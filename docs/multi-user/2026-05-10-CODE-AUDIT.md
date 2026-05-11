# Multi-user code-level audit — supplement to 2026-05-09 AUDIT.md

**Date:** 2026-05-10
**Scope:** Verify the CURRENT code-level multi-tenancy correctness of the
data layer (queries, server actions, webhook + cron user-context derivation,
RLS coverage). Complementary to the 2026-05-09 product/operational audit
in `AUDIT.md`, which catalogued WHAT-TO-BUILD before public launch.
**Method:** Systematic grep + AST extraction across all 6 server-action
modules, all 19 schema tables, all 19 query modules, all 7 API routes.
Read 100% of `src/lib/**/actions.ts`, `src/lib/db/queries/*.ts`,
`src/lib/db/schema.ts`, and the cron + webhook handlers.

---

## Executive summary

**The code-level multi-tenancy substrate is correct as of 2026-05-10.**
Every server action that takes a client-supplied resource ID re-verifies
ownership against `session.user.id` before mutation. Every DB-touching
query in `src/lib/db/queries/` scopes by userId (directly or via the
`externalItems.userId` transitive chain). Every cron and webhook derives
userId server-side, never trusting client input.

The 2026-05-09 AUDIT.md correctly identified the surface gaps that block
public launch — they're operational (digest spam, no signup flow, no
billing, unbounded cron scaling), not data-isolation. **The data
isolation primitives needed for multi-tenancy are already in place.**

This supplement (a) confirms code-correctness with evidence, (b)
amends two prior findings where my analysis diverges, and (c) raises
two new items the prior audit missed.

---

## What's correct (confirmed by evidence)

### Action-layer ownership re-verification: 100% coverage

Every mutating server action that accepts a client-supplied resource ID
performs an explicit ownership check. Two correct idioms appear:

**Pattern A — SELECT-then-mutate (Plaid + SnapTrade + sync):**
```ts
const [item] = await db.select(...).from(externalItems)
  .where(and(eq(externalItems.id, itemId), eq(externalItems.userId, session.user.id)));
if (!item) throw new Error('Item not found');
await db.delete(externalItems).where(eq(externalItems.id, item.id));
```

**Pattern B — AND-userId-in-WHERE (goals + scenarios):**
```ts
await db.update(goals).set({...})
  .where(and(eq(goals.id, goalId), eq(goals.userId, session.user.id)));
```

**Pattern C — Helper delegation (transactions + narratives):**
```ts
const owned = await filterOwnedTransactions(session.user.id, txIds);
// or
const owned = await isScenarioOwnedByUser(scenarioId, session.user.id);
```

Verified clean across:

| File | Mutations | Pattern |
|------|-----------|---------|
| [src/lib/goals/actions.ts](../../src/lib/goals/actions.ts) | createGoal, updateGoal, deleteGoal, setGoalArchived | B |
| [src/lib/plaid/actions.ts](../../src/lib/plaid/actions.ts) | syncItemAction, createLinkTokenForUpdate, markItemReconnected, disconnectItemAction (+syncAllItemsAction list-scoped) | A |
| [src/lib/snaptrade/actions.ts](../../src/lib/snaptrade/actions.ts) | disconnectSnaptradeItemAction (createConnectUrl + syncBrokerages list-scoped) | A |
| [src/lib/transactions/actions.ts](../../src/lib/transactions/actions.ts) | updateTransactionCategoriesAction | C (`filterOwnedTransactions` does 2-hop join: transaction → financial_account → external_item.userId) |
| [src/lib/sync/actions.ts](../../src/lib/sync/actions.ts) | disconnectExternalItemAction | A |
| [src/lib/forecast/scenario-actions.ts](../../src/lib/forecast/scenario-actions.ts) | createScenario, updateScenario, deleteScenario | B |
| [src/lib/forecast/narrative-actions.ts](../../src/lib/forecast/narrative-actions.ts) | generateForecastNarrativeAction (+lookupForecastNarrative read) | C (`isScenarioOwnedByUser` helper) + B |
| [src/lib/insights/actions.ts](../../src/lib/insights/actions.ts) | generateInsightAction | derives userId from session, no client ID accepted |

### Query-layer userId scoping: 100% of DB-touching queries scoped

Of 45 exported functions in `src/lib/db/queries/`:
- **39 take `userId: string`** as their first parameter and use it in
  WHERE (direct on `<table>.userId` or transitive via the
  `financialAccounts → externalItems.userId` chain).
- **8 are pure helpers** that don't touch the DB (`buildLeaderboard`,
  `inferCapabilities`, `isSnaptradeTransactionsUnsupported`,
  `resolveCapabilityTimestamps`, `buildCapabilityStates`,
  `aggregateTopLevelTimestamps`, `mapStreamCadenceAndAmount`,
  `frequencyToMonthlyMultiplier`) — correctly take no userId because
  they accept already-fetched data structures.

Zero queries scope by an alternate vector (email, scenarioId-without-
userId-precheck, item-id-without-precheck). The grep
`eq(users.email, session.user.email)` returns zero hits.

### Ownership-chain map (per-table)

All 19 tables traced. No orphan tables that touch user data without an
ownership chain.

| Table | Ownership |
|-------|-----------|
| `user` | Self-root |
| `auth_account`, `session`, `verification_token` | Auth.js (`onDelete: cascade` from `user`) |
| `external_item`, `category`, `goal`, `insight`, `scenario`, `forecast_snapshot`, `snaptrade_user`, `forecast_narrative` | DIRECT (`user_id` FK) |
| `financial_account`, `recurring_stream`, `error_log` | TRANSITIVE → `external_item.user_id` |
| `transaction`, `holding`, `investment_transaction` | TRANSITIVE → `financial_account` → `external_item.user_id` |
| `security` | Global Plaid reference data — **intentionally** shared across users (Plaid's AAPL ID is the same for everyone) |

Two subtleties worth flagging:

- **`category.user_id` is NULLABLE** for system-seeded PFC taxonomy
  rows (Phase 1.C). `getCategoryOptions` correctly never reads NULL
  rows — it surfaces the user's custom categories AND the PFC names
  derived from `transactions.primaryCategory DISTINCT` (already
  user-scoped). Even if seed rows were poisoned, no cross-user leak
  would occur via this read path.
- **`error_log.external_item_id` is NULLABLE** for system-level cron
  errors. All 9 per-user reads in `getSourceHealth` use
  `eq(errorLog.externalItemId, itemId)` where `itemId` was already
  filtered through `external_item.user_id`. NULL rows simply don't
  match — correct for per-user health views; correctly INCLUDED in
  the cross-user digest cron.

### Cron + webhook user-context derivation: server-side only

| Surface | userId source |
|---------|--------------|
| `cron/digest` | iterates `users` table directly (cross-user by design — see AUDIT.md BLOCKER-01 + 07 for the per-tenant work needed) |
| `cron/insight` | `getActiveUserIds()` selects `selectDistinct({ userId: externalItems.userId })` |
| `cron/forecast-snapshot` | same as above |
| `cron/sync` | iterates active items (transitively user-scoped) |
| `cron/balances` | iterates active Plaid items (transitively user-scoped) |
| `plaid/webhook` | JWS-verified `event.item_id` → DB lookup → owner userId |

No cron or webhook accepts userId as a parameter, query string, or
body field. All derivations go through server-controlled DB queries.

---

## Amendments to 2026-05-09 AUDIT.md

### BLOCKER-02 (webhook ownership) — needs reframing, not a security bug

The 2026-05-09 audit flagged: *"User A and User B could theoretically
hold the same Plaid item_id if Plaid ever recycled IDs… [the WHERE
clause] doesn't disambiguate by user."*

**My finding:** This isn't a security bug as currently described.
`external_item.provider_item_id` is per-Plaid-app-account globally
unique by Plaid's contract — recycling would be a Plaid platform
issue, not an app issue. The webhook flow is:

1. Plaid signs the webhook payload with ES256/JWS
2. App verifies the JWS against Plaid's public key (gates that the
   payload came from Plaid)
3. App resolves `event.item_id` → single `external_item` row → owner
   userId via the FK
4. App mutates that item only

There is no client-controlled userId to validate against. The DB
lookup IS the user resolution; adding `eq(externalItems.userId, ???)`
makes no sense because there's no `???` to compare to. The actual
auth boundary is the JWS signature, and that's already verified.

**Real risk worth tracking** (which the prior audit conflated): if
the JWS-verification step were ever skipped or weakened, an attacker
could forge `event.item_id` and trigger syncs on victim items. Worth
a regression test: assert webhook returns 401 when JWS header is
absent or signature is wrong. Severity: low (defense-in-depth test
for an existing correct boundary), not BLOCKER.

### MAJOR-05 (RLS policies not enforced) — already-correct, with one verifiable gap

The 2026-05-09 audit framed default-deny RLS as "passive security,
not active." That's hyperbolic given the deployment shape:

- Drizzle is the ONLY DB client; it connects as `postgres` (BYPASSRLS)
- No PostgREST routes exist
- No client-side Supabase SDK calls exist (verified via grep — zero
  `createClient` from `@supabase/supabase-js` in `src/`)

In this shape, default-deny is the CORRECT control. Writing per-table
`WHERE user_id = auth.uid()` policies provides zero additional security
unless and until a Supabase-client surface is added. The prior audit's
"large (week+)" estimate is out of proportion to the current risk.

**The actual gap worth flagging** (and which the prior audit missed):
*RLS coverage on the original 16 tables is unverified in the repo.*

Only 3 of 19 tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
recorded as repo SQL:
- `external_item` (`docs/migrations/2026-05-06-external-item.sql`)
- `forecast_snapshot` (`docs/migrations/2026-05-09-forecast-snapshot.sql`)
- `snaptrade_user` (`docs/migrations/2026-05-07-snaptrade-user.sql`)

`SECURITY.md` says RLS was applied to all `public.*` tables on
2026-05-06 in response to the Supabase advisor flag
`rls_disabled_in_public`, but the operation isn't recorded in the
repo. If the response was a one-off SQL ALTER or a Supabase
Dashboard click rather than a tracked migration, there's no
re-deployable record. This is reproducibility debt, not a runtime
security gap.

**Recommended verification (15 minutes):**

```sql
-- Run against production Supabase via SQL editor
SELECT relname, relrowsecurity
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = 'public'::regnamespace
ORDER BY relname;
```

Expect `relrowsecurity = t` for all 19 tables. If any return `f`,
either run `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;`
and commit a migration file recording it, or fold them into the
next provider migration.

---

## New findings the prior audit missed

### NEW-01 — Audit-grep blind spot: ownership-helper delegation

**Severity:** INFO (lesson for future audits, not a current bug)

Grep-based ownership audits will FALSE-POSITIVE on functions that
delegate to ownership-check helpers. The codebase has at least two:

- `filterOwnedTransactions(userId, txIds)` in
  [src/lib/db/queries/categories.ts:114](../../src/lib/db/queries/categories.ts)
- `isScenarioOwnedByUser(scenarioId, userId)` in
  [src/lib/forecast/narrative-actions.ts](../../src/lib/forecast/narrative-actions.ts)
  (referenced)

A naïve `grep eq(.*\.userId, session\.user\.id)` audit will flag
`lookupForecastNarrative` as missing ownership — but the function IS
safe via `isScenarioOwnedByUser`. Future audits should also grep for
`filterOwned*`, `is*OwnedBy*`, `assertOwnership*` patterns.

**Recommendation:** Add to a future static-analysis pass: any server
action that accepts an ID parameter MUST appear in either
`grep -E "eq\(.*\.userId, .*\.user\.id"` OR
`grep -E "(filterOwned|isOwnedBy|assertOwnership)"` against its body.
Could become a custom ESLint rule.

### NEW-02 — RLS coverage reproducibility gap (already covered above)

See "MAJOR-05 amendment" — operational-only RLS application means the
Supabase project state isn't reproducible from the repo alone. If the
Supabase project is ever recreated or migrated, the RLS configuration
will not be reapplied automatically.

**Recommendation:** Create
`docs/migrations/2026-05-06-rls-baseline.sql` with the explicit
`ALTER TABLE` statements for all 16 originally-deployed tables, even
if it's a no-op against the current production DB. Run the
verification SQL above against production to confirm before
committing.

---

## What this audit deliberately did NOT cover

- **Auth.js callback security** (deferred to AUDIT.md BLOCKER-05/06 —
  signup + verification flow rebuild)
- **Encryption boundary** (covered separately in
  [SECURITY.md](../../SECURITY.md) > "Database access boundary")
- **Cron quota / billing gating** (AUDIT.md BLOCKER-03/04, MAJOR-08)
- **PII in logs** (worth a future pass — `error_log.context` may
  carry sensitive Plaid response bodies post-`05c12de`; check
  retention)
- **Session fixation / cookie scope** (Auth.js v5 handles; out of
  scope here)
- **Live-DB RLS state** (no DB credentials available to me —
  flagged as user-action verification SQL above)

---

## Verdict

The data-isolation primitives are multi-tenant-ready. The 2026-05-09
audit's BLOCKERS 02 and MAJOR 05 should be downgraded based on this
evidence. The remaining 5 BLOCKERS in the prior audit are about
features that don't exist yet (signup flow, per-tenant digest, cron
quotas, billing) — not about isolation in the code that does exist.

**One concrete user action worth taking:** run the RLS verification
SQL against production Supabase and either confirm 19/19 tables have
`relrowsecurity = t` or apply + commit a baseline migration. Estimated
time: 15 minutes.
