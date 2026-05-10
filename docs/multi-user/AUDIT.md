# Multi-user readiness audit

**Date**: 2026-05-09
**Scope**: Foothold personal finance app; currently single-user, prepared for multi-tenant public release.  
**Stack**: Next.js 14 App Router, TypeScript, Drizzle ORM, Supabase Postgres, Auth.js v5, Plaid + SnapTrade.

---

## Findings

### BLOCKER-01: Cron digest email sends to ALL users, not per-tenant

- **Severity**: BLOCKER
- **Surface**: `src/app/api/cron/digest/route.ts` lines 70–94
- **What's there now**: `await db.select().from(users)` fetches all users. Loop sends digest to each via `user.email`. Works for one user; with N users, each cron run sends N emails per day (combinatorial spam). No per-user filtering.
- **What's missing or wrong**: (1) Cron must be invoked per-tenant or filtered by user context. (2) Email addresses are hardcoded in schema but not filtered. (3) Digest selects errors/runs from ALL users' error_log rows, then sends the same global summary to every user.
- **Fix size**: small (hours) — filter `users` by a tenant context or webhook secret identifying the user; scope error_log query to that user.
- **Line refs**: 70 `db.select().from(users)`, 41–46 error_log query has no user filter

### BLOCKER-02: Plaid webhook handler assumes single item-to-user mapping

- **Severity**: BLOCKER
- **Surface**: `src/lib/plaid/webhook.ts` lines 158–215
- **What's there now**: `handlePlaidWebhook(event)` resolves `event.item_id` (Plaid's provider ID) to a single `external_item.id` via `where(eq(externalItems.providerItemId, event.item_id))`. Updates status, then calls `syncItem(internalId)`. No user_id in the lookup path.
- **What's missing or wrong**: User A and User B could theoretically hold the same Plaid item_id if Plaid ever recycled IDs or if items were shared (unlikely but possible in future architectures). The WHERE clause doesn't disambiguate by user. More critically, webhook doesn't validate the item belongs to a known user before syncing — an attacker with knowledge of another user's item_id could trigger syncs or status updates.
- **Fix size**: small (hours) — add `eq(externalItems.userId, ???)` to the WHERE. Requires establishing user context: either from a signed request header, or from the item's registered user (stored in DB).
- **Line refs**: 173–179 `const [row] = await db.select...`, 185 `syncItem(internalId)` called without user validation

### BLOCKER-03: Insights cron generation doesn't scope by user; sends to all

- **Severity**: BLOCKER
- **Surface**: `src/app/api/cron/insight/route.ts` lines 35–46
- **What's there now**: `getActiveUserIds()` returns ALL users with active items. Loop calls `generateInsightForUser(userId)` for each. With multiple users, each Monday runs N separate generation calls. No per-user trigger or subscription gate.
- **What's missing or wrong**: Insights are user-scoped data (user.id in schema), but the cron has no mechanism to run only for "my" users or subscription tier. On public launch with 1000s of users, this Monday cron becomes an unbounded N × AI-call bill. Needs quotas, subscription gating, or per-user triggers.
- **Fix size**: medium (days) — implement per-user quota tracking or subscription tier checks before calling `generateInsightForUser()`. Alternatively, move to on-demand (user clicks "Generate") instead of scheduled.
- **Line refs**: 35–46 `for (const userId of userIds)` with no filtering

### BLOCKER-04: Forecast snapshot cron upserts ALL users' projections, unbounded

- **Severity**: BLOCKER
- **Surface**: `src/app/api/cron/forecast-snapshot/route.ts` lines 32–60
- **What's there now**: Fetches users with active items, loops each, calls `projectCash(userId)` and upserts to `forecast_snapshots`. No pagination, no quota, no per-user time gating.
- **What's missing or wrong**: Identical scaling issue as insights — with N users, this cron becomes O(N) AI calls. No subscription filtering or rate limits.
- **Fix size**: medium (days) — add subscription tier check, quota enforcement, or per-user scheduling.
- **Line refs**: 32–45 loop over all users; 55 `upsert(...).values({...userId...})` unpaginated

### BLOCKER-05: No signup distinct from login; account auto-creation not documented

- **Severity**: BLOCKER
- **Surface**: `src/app/(auth)/login/page.tsx` and `src/app/(auth)/login/actions.ts`
- **What's there now**: Single login page. User enters email → `signInWithEmail()` calls Auth.js magic-link. Auth.js auto-creates user on first link click if not exists (default DrizzleAdapter behavior). No explicit signup flow, no terms/privacy acceptance capture, no email verification beyond magic-link.
- **What's missing or wrong**: (1) No dedicated signup UI distinct from login — confusing for first-time users ("create account" vs "sign in"). (2) Account creation happens silently on link click with zero consent signaling. (3) No email verification state (users table has `emailVerified` column but it's never set). (4) No terms acceptance, no opt-in to emails, no GDPR consent. (5) No way to change email post-signup (users table has no email_change_token or verification flow).
- **Fix size**: large (week+) — build signup → email-verify-link → terms accept → create account flow. Add email change + verification. Add consent tracking.
- **Line refs**: 56 signup.tsx reads "We'll create your account automatically"; 23 signIn calls Auth.js without email verification check.

### BLOCKER-06: No email verification; account exists before magic-link click

- **Severity**: BLOCKER
- **Surface**: Auth.js v5 + DrizzleAdapter default callback behavior
- **What's there now**: Auth.js creates users table row on `signIn('resend', {email})` if not exists (pre-verification). User then clicks magic-link. If verification fails, row still exists.
- **What's missing or wrong**: Orphan accounts with unverified emails. Typos (eve@company.com vs evel@company.com) both create rows. No way to revoke creation. Should verify email BEFORE creating user row.
- **Fix size**: medium (days) — use verification_tokens table (already in schema) to gate user creation: signIn → send email → user clicks → verify token → create user. Requires custom Auth.js callback.
- **Line refs**: `src/auth.ts` DrizzleAdapter uses default (unverified) flow

### BLOCKER-07: Single-user hardcoded assumption in digest email copy

- **Severity**: BLOCKER
- **Surface**: `src/app/api/cron/digest/route.ts` lines 81–93 and `src/lib/cron/digest-subject.ts`
- **What's there now**: Comment on line 29: "One email per user with a non-null email; v1 has one user so this is one email per day." Loop at line 74 iterates all users but sends SAME global error_log to each.
- **What's missing or wrong**: Email subject + body are built once from global error_log, then sent to all users. Each user receives errors from ALL users' syncs/webhooks. User A sees "SnapTrade activities failed" — but that's User B's item.
- **Fix size**: small (hours) — filter error_log by user before rendering: `where(eq(errorLog.userId, user.id))` or via item→user lookup.
- **Line refs**: 41–46 `select().from(errorLog)` has no user filter; 81 `renderDigest(errors, runs, isMondayUtc)` called once globally

### MAJOR-01: No account deletion flow; GDPR compliance risk

- **Severity**: MAJOR
- **Surface**: Missing `/settings` account deletion UI + action
- **What's there now**: Settings page displays email + user ID but no delete button. Schema has `CASCADE DELETE` on users (cascades to all user-scoped tables) so deletion is _technically_ possible, but no UI/action to trigger it.
- **What's missing or wrong**: (1) No GDPR right-to-be-forgotten UI. (2) No confirmation flow to prevent accidents. (3) No audit trail of deleted accounts. (4) Plaid/SnapTrade items have encrypted secrets — deletion should revoke them first or they become orphaned (won't break anything but security debt).
- **Fix size**: medium (days) — add delete-account action with email confirmation, revoke external items, log the deletion event.
- **Line refs**: settings/page.tsx lines 53–64 show user info but no delete button

### MAJOR-02: No password recovery; magic-link only (works, but UX risk)

- **Severity**: MAJOR
- **Surface**: Auth.js + Resend magic-link only
- **What's there now**: Auth.js providers = [Resend]. No password provider, no OAuth (Google, GitHub, etc.). User loses email access → can't sign in.
- **What's missing or wrong**: (1) No account recovery if email is inaccessible. (2) No way to re-send magic-link if deleted. (3) If Resend is down, no sign-in path. (4) No alternative auth (OAuth providers, passkey) to reduce email dependency.
- **Fix size**: medium (days) — add OAuth providers (Google, GitHub, Apple) for sign-in flexibility. Resend failure recovery via cached fallback (out of scope for MVP, flag as TODO).
- **Line refs**: `src/auth.config.ts` line 15 `Resend({ ... })` is only provider

### MAJOR-03: No email change flow; can't update sign-in email post-account-creation

- **Severity**: MAJOR
- **Surface**: Settings page shows email but no "Change email" button
- **What's there now**: `users.email` is `unique()` and immutable post-creation. No update action, no verification token flow.
- **What's missing or wrong**: User typos email at signup → stuck. User changes emails IRL → no way to update Foothold. Auth.js session holds email; changing it at DB requires session invalidation + re-auth.
- **Fix size**: medium (days) — add email-change action: user enters new email → send verification link to OLD email → verify → update. Requires verification_tokens table (exists but unused).
- **Line refs**: `src/lib/db/schema.ts` line 39 `email: text('email').unique()` with no update action in codebase

### MAJOR-04: No rate limiting on `/api/auth` endpoints

- **Severity**: MAJOR
- **Surface**: `src/app/api/auth/[...nextauth]` (Next.js route)
- **What's there now**: Middleware exempts `/api/auth/*` (line 31 of middleware.ts). Auth.js routes handle signIn, callback, signOut, session. No rate limiting on magic-link send.
- **What's missing or wrong**: Attacker can flood email send: POST /api/auth/signin/resend with 1000 different emails → 1000 Resend calls → $X spam cost. Auth.js doesn't built-in rate limits; common practice is Redis + token bucket at the edge or in middleware.
- **Fix size**: medium (days) — add Upstash/Redis rate limiting: 5 sign-in attempts per email per 15min. Integrate before Auth.js route.
- **Line refs**: middleware.ts line 31 PUBLIC_API_PREFIXES exempts /api/auth; no rate limiter in codebase.

### MAJOR-05: RLS policies not enforced; PostgREST currently bypassed, future risk

- **Severity**: MAJOR
- **Surface**: `src/lib/db/schema.ts` and CLAUDE.md lines 86–96
- **What's there now**: CLAUDE.md documents: "RLS enabled on every table, no policies attached → default-deny for anon/authenticated". Schema exports tables as `public.*`. Drizzle connects as `postgres` with `BYPASSRLS`, so app code is safe. But leaked anon key → unauthorized direct REST API calls fail safely due to default-deny.
- **What's missing or wrong**: (1) No actual RLS policies written (default-deny is passive security, not active). (2) If future feature adds PostgREST routes or direct Supabase client calls, they'll hit the default-deny silently (no helpful error). (3) Audit trail doesn't distinguish "RLS rejected" from "query error". (4) Schema migrations via `drizzle-kit push` don't auto-add RLS — must be done manually per CLAUDE.md, error-prone.
- **Fix size**: large (week+) — write user-scoped RLS policies for each table (`WHERE user_id = auth.uid()`). Test direct Supabase client access. Update migration process to generate policies on new tables.
- **Line refs**: schema.ts is all `public.*` tables; no RLS policies in codebase; drizzle.config.ts doesn't auto-generate them.

### MAJOR-06: Error log doesn't carry user context; digest is global, not per-user

- **Severity**: MAJOR
- **Surface**: `src/lib/db/schema.ts` lines 477–510 (errorLog table)
- **What's there now**: errorLog has `externalItemId` FK but no `userId` column. Support debugging: operator can't filter errors by user. Digest selects global 24h window, sends to all users.
- **What's missing or wrong**: (1) Support team can't query "what went wrong for user X". (2) User-specific cron failures (e.g., their Plaid item 400d) aren't isolated in digest. (3) Error retention policy (e.g., "delete after 30 days") is all-or-nothing, not per-user.
- **Fix size**: medium (days) — add `userId` column to errorLog FK'd to users, propagate via logger calls. Update digest to filter by user.
- **Line refs**: errorLog table lines 477–510 has no userId; error_log queries have no user scoping.

### MAJOR-07: No logging/audit trail for sensitive operations (disconnect, delete, etc.)

- **Severity**: MAJOR
- **Surface**: Codebase-wide; actions.ts files
- **What's there now**: Disconnect actions (`disconnectExternalItemAction`) call DB updates but log nothing. Settings page doesn't log who viewed it or made changes. Insights generation logs to error_log but no "user X generated insight" trail.
- **What's missing or wrong**: (1) Compliance: no audit log for financial data access/deletion. (2) Support: can't track "when did user delete their Plaid item?" (3) Security: no abnormal-activity detection (e.g., "user disconnected 5 items in 10 seconds").
- **Fix size**: medium (days) — add audit_log table (user_id, action, resource, timestamp, context). Log disconnect, delete, settings view, sync trigger.
- **Line refs**: sync/actions.ts line 7 `disconnectExternalItemAction` calls DB update with no logging.

### MAJOR-08: No billing/subscription handling; public launch will need it

- **Severity**: MAJOR
- **Surface**: Entire codebase
- **What's there now**: Schema has no subscriptions, plans, or payment tables. No Stripe/payment integration. Crons run for all users without quota.
- **What's missing or wrong**: (1) Can't gate features by tier (e.g., "insights" for Pro only). (2) No billing flow (sign up → add card → pay → usage tracking). (3) No trial period. (4) Crons scale unbounded with user count.
- **Fix size**: large (week+) — integrate Stripe; add subscriptions table; tier-gate crons and features; implement usage metering.
- **Line refs**: schema.ts has no subscription/plan/billing tables.

### MINOR-01: Insights generate action lacks per-user error context

- **Severity**: MINOR
- **Surface**: `src/lib/insights/actions.ts` (not shown but referenced)
- **What's there now**: `generateInsightForUser(userId)` is called from cron. Action logs `logError('cron.insight.failed', err, {userId})` to error_log.
- **What's missing or wrong**: If generation fails, error doesn't carry which week/date was attempted. Hard to reconstruct context on retry.
- **Fix size**: small (hours) — add `week` to error context: `{userId, weekStart, ...}`.

### MINOR-02: Balance refresh cron logs are Plaid-only; doesn't scale to SnapTrade

- **Severity**: MINOR
- **Surface**: `src/app/api/cron/balances/route.ts` lines 51–61
- **What's there now**: Filters `where(eq(externalItems.provider, 'plaid'))`. SnapTrade balances refresh in-sync (async during sync orchestrator). Works, but cron logs only surface Plaid health.
- **What's missing or wrong**: Digest reports "balance refresh" = Plaid only. SnapTrade balance staleness is invisible. With multiple providers, digest should report per-provider.
- **Fix size**: small (hours) — extend cron or add separate SnapTrade balance health log.

### MINOR-03: Transaction override category FK is nullable; orphan safety check missing

- **Severity**: MINOR
- **Surface**: `src/lib/db/schema.ts` line 219 (`categoryOverrideId`)
- **What's there now**: `categoryOverrideId: text('category_override_id').references(() => categories.id, { onDelete: 'set null' })`. If user deletes a category, overrides revert to NULL gracefully.
- **What's missing or wrong**: Display code assumes `categoryOverrideId` NULL means "use raw Plaid PFC". But if category lookup fails elsewhere, doesn't error loudly. Minor: no data loss, but silent fallback could hide a bug.
- **Fix size**: trivial (minutes) — add test asserting override reverts on category delete.

### MINOR-04: No analytics/telemetry for product insights

- **Severity**: MINOR
- **Surface**: Entire codebase
- **What's there now**: No usage tracking (page views, feature clicks, cohort analysis). error_log is operational (errors/crons) only.
- **What's missing or wrong**: Can't answer "what % of users connect Plaid vs SnapTrade?" or "do users with 2+ items churn less?". Product decisions blind.
- **Fix size**: large (week+) — integrate PostHog or similar; track signup, feature adoption, sync frequency; build dashboards.
- **Line refs**: N/A, entirely missing.

### MINOR-05: SnapTrade reconcile partition logic doesn't log "reconnect" count

- **Severity**: MINOR
- **Surface**: `src/lib/snaptrade/actions.ts` (lines ~100 in full file)
- **What's there now**: `partitionSnaptradeAuthsForReconcile` returns insert/repair/no-op partition. Parent action logs total count but not the "reconnected" subset for user messaging.
- **What's missing or wrong**: /snaptrade-redirect page shows "X items synced" but not "Y items reconnected" — loses user signal that a broken auth was fixed.
- **Fix size**: small (hours) — return repair count from partition helper, pass to page/action logging.

---

## Summary

**Total: 7 BLOCKERS, 8 MAJORS, 5 MINORS**

### Top 5 blockers (in priority order)

1. **BLOCKER-01: Digest email sends to ALL users** — Fix immediately or disable cron on public launch. Scope digest query and recipient loop to per-user.

2. **BLOCKER-05: No signup distinct from login** — Accounts auto-created silently without consent. Build signup → email-verify → terms-accept flow before launch.

3. **BLOCKER-04 + BLOCKER-03: Unbounded cron scaling (forecast + insights)** — Every new user multiplies cron cost. Add subscription tier checks and quotas before enabling for >100 users.

4. **BLOCKER-02: Webhook doesn't validate item ownership** — Attacker can trigger syncs on other users' items via item_id. Add user_id to webhook lookup.

5. **BLOCKER-06: No email verification** — Orphan accounts with typo emails. Implement verification token flow before creating user row.

### Launch-blocking fixes (do before public beta)

- [ ] Digest: scope by user, send per-tenant email
- [ ] Auth: distinct signup flow with email verification
- [ ] Webhook: validate item ownership by user
- [ ] Cron: add subscription tier gating to insights/forecast-snapshot
- [ ] Account: add email verification on signup before row creation

### High-priority post-MVP (within 1–2 sprints)

- [ ] Account deletion UI + cascade revoke of external items
- [ ] Email change flow (with verification)
- [ ] Rate limiting on /api/auth
- [ ] RLS policies (not just default-deny)
- [ ] Error log user_id column + per-user filtering
- [ ] Audit log for sensitive operations
- [ ] Billing/subscription table + Stripe integration

---

## Appendix: Table-by-table RLS checklist

| Table | User-scoped? | Needs RLS policy? | Status |
|-------|---|---|---|
| users | N/A (auth table) | Default-deny | ✓ Safe |
| auth_account | Yes (FK: user_id) | `WHERE user_id = auth.uid()` | ❌ TODO |
| external_item | Yes (user_id) | `WHERE user_id = auth.uid()` | ❌ TODO |
| financial_account | Yes (via item→user) | `WHERE item.user_id = auth.uid()` | ❌ TODO |
| transaction | Yes (via account→item→user) | Transitive | ❌ TODO |
| category | Yes (nullable user_id) | `WHERE user_id IS NULL OR user_id = auth.uid()` | ❌ TODO |
| goal | Yes (user_id) | `WHERE user_id = auth.uid()` | ❌ TODO |
| insight | Yes (user_id) | `WHERE user_id = auth.uid()` | ❌ TODO |
| scenario | Yes (user_id) | `WHERE user_id = auth.uid()` | ❌ TODO |
| forecast_narrative | Yes (user_id) | `WHERE user_id = auth.uid()` | ❌ TODO |
| forecast_snapshot | Yes (user_id) | `WHERE user_id = auth.uid()` | ❌ TODO |
| error_log | No user_id (MAJOR-06) | Add user_id, then policy | ❌ TODO |
| security | N/A (global reference) | N/A (shared) | ✓ Safe |
| holding | Yes (via account→item→user) | Transitive | ❌ TODO |
| investment_transaction | Yes (via account→item→user) | Transitive | ❌ TODO |
| recurring_stream | Yes (via account→item→user) | Transitive | ❌ TODO |
| snaptrade_user | Yes (user_id) | `WHERE user_id = auth.uid()` | ❌ TODO |
| session | N/A (auth table) | Default-deny | ✓ Safe |
| verification_token | N/A (auth table) | N/A | ✓ Safe |

