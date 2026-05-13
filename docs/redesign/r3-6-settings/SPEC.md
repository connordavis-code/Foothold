# R.3.6 Settings — Design Spec

**Date locked**: 2026-05-12
**Branch**: `feat/redesign` (per redesign milestone convention)
**Predecessor**: [R.3.5 Simulator](../r3-5-simulator/SPEC.md) shipped 2026-05-11
**Successor**: R.4 Goals Moves + scenario unification
**Bundle reference**: [claude-design-context/README.md §7 Settings](../../../claude-design-context/README.md) + `foothold-settings.jsx` prototype

---

## North star

Settings is the calmest page in the product — operator-tier identity management and connected-source health, no chrome theater. The redesign restyles existing surfaces and ships the multi-user-readiness features that naturally belong here: editable profile, account deletion, transactions export. The mockup specifies 7 sections; R.3.6 ships 4 — three additional sections (Notifications, Preferences, Privacy & security) defer until concrete features need them.

---

## Locked decisions (2026-05-12)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Section scope | Restyle + build multi-user features | 4 sections shipped: Profile, Connected accounts, Data & export, Danger zone. Skipped: Notifications, Preferences, Privacy & security (no concrete features behind them yet). |
| 2 | Shell layout | Two-column sticky 220px side-rail + body | Matches design system §7 literally. Brand-coherent (active rail item gets brand-green position-dot indicator, reinforcing the position-dot motif). One-off page pattern — no other route uses this layout. |
| 3 | Rail navigation behavior | Anchor links + IntersectionObserver active-state tracking | Classic GitHub/Vercel Settings pattern. All sections always rendered; rail is a navigator, not a tab control. Preserves "scan-the-whole-page" semantic. |
| 4 | Profile fields | Display name + timezone (+ email read-only) | Two new nullable/defaulted columns on `users` table. Multi-user value: display name surfaces in future onboarding; timezone matters for week-boundary localization. |
| 5 | Account deletion shape | Hard delete + type-email confirmation | Standard pattern (GitHub, Vercel). Cascades fire via existing `onDelete: 'cascade'` FK rules. Confirmation typing of user's email gates the destructive action. |
| 6 | Data export scope | Transactions CSV only | Single endpoint. Transactions carry irreplaceable user-curated state (category overrides); holdings/balances regenerate from re-sync. JSON snapshot deferred. |
| 7 | Status pill palette | Migrate amber-500 → `--semantic-caution` token | R.3.6's status-pill palette work updates the Reliability Phase 4 `<StatePill>` to consume the Foothold `--semantic-caution` token rather than raw Tailwind `amber-500`. Copy + restraint rules unchanged. |
| 8 | Mobile fallback at <md | Rail hidden, sections stack vertically | R.5 will rebuild mobile chrome holistically; R.3.6 doesn't invent a mobile rail UX. Acceptable degradation. |

---

## Architecture

### Page shape

```
src/app/(app)/settings/page.tsx
├─ <h1>Settings (Fraunces italic, already in place from R.3.5 polish)
└─ <div class="grid md:grid-cols-[220px_minmax(0,1fr)] gap-8">
    ├─ <SettingsRail sections=[...]> ─ client, sticky md+, hidden <md
    │   └─ 4 rail items, hairline-divided, active gets brand-green dot
    └─ <div class="space-y-6"> ─ body
        ├─ <section id="profile"><ProfileSection ... />
        ├─ <section id="connected"><ConnectedAccountsSection ... />
        ├─ <section id="export"><DataExportSection />
        └─ <section id="danger"><DangerZoneSection user-email=... />
```

### RSC boundary

| Component | Type | Why |
|---|---|---|
| `page.tsx` | server | Reads session, fetches `getSourceHealth()`, passes serializable props down |
| `<SettingsRail>` | client | IntersectionObserver to track active section as user scrolls |
| `<ProfileSection>` | client | Form state + save/discard buttons + server action call |
| `<ConnectedAccountsSection>` | server | Renders existing `<SourceHealthRow>` server components (load-bearing — preserves Reliability Phase 4 surface) |
| `<DataExportSection>` | client | "Download CSV" button is a regular `<a>` href to the route handler with `download` attr — could stay server. Marked client only if we add a loading-spinner during download. |
| `<DangerZoneSection>` | client | Mounts the delete-account alert-dialog with controlled input state |
| `<DeleteAccountDialog>` | client | Confirmation pattern: input watches for exact email match, submit gates on it |

**Strike-3 RSC watch**: No function props cross the server→client boundary. Rail receives `{ id, label }[]`; ProfileSection receives flat string values + the server action via direct-import; DangerZone receives string `userEmail` only.

### URL state

- Rail items are `<a href="#profile">` anchors — native browser scroll.
- No `?section=` URL param. The hash IS the URL state.
- IntersectionObserver updates which rail item shows the active dot indicator as the user scrolls; clicking a rail item drives normal anchor scroll and triggers the same active-state update on next observer tick.
- Deep links (`/settings#export`) scroll to the section on initial load (browser native).

---

## Section contents

### 1. Profile

**Card** — surface-elevated + hairline-strong + shadow-sm (R.3.5 card formula).

**Fields**:
- **Email** — read-only, mono-font display (no edit; email is the auth identity). Shows next to a "Sign-in identity" label.
- **Display name** — `<Input>` (surface-sunken bg), max 120 chars. Empty string normalizes to `null` on save.
- **Timezone** — themed `<Select>` (R.3.5 primitive at `src/components/ui/select.tsx`). Options: curated list of common IANA zones (`UTC`, `America/Los_Angeles`, `America/Denver`, `America/Chicago`, `America/New_York`, `Europe/London`, `Europe/Berlin`, `Asia/Tokyo`, `Asia/Singapore`, `Australia/Sydney` — extensible). Default `UTC`. Validator on save accepts any valid IANA zone string for forward-compat.

**Actions**:
- "Save changes" button — disabled until form is dirty
- "Discard" button — resets dirty fields to last-saved server state

**Save behavior**: server action returns `{ ok: true }`, toast success, `revalidatePath('/settings')`.

### 2. Connected accounts

**Card** — same card formula.

**CardHeader**:
- Title: "Connected institutions"
- Description: "Banks and credit cards via Plaid; brokerages via SnapTrade when SnapTrade keys are configured." (preserved verbatim from current code)
- Right slot: `<ConnectAccountButton snaptradeEnabled={...} />` (preserved)

**Body**:
- Empty state ("No institutions connected yet.") — preserved
- Otherwise: `<ul>` of `<SourceHealthRow>` + per-account sub-list (preserved verbatim)

**Restyle scope**: This section is **token-only** — surfaces and borders pick up new tokens, but content/copy/structure is frozen because Reliability Phase 4 + 5 are load-bearing for trustability. The one substantive change happens inside `<SourceHealthRow>` itself: the inline `<StatePill>` function migrates `amber-500/border-amber-500/50/...` → `var(--semantic-caution)` references.

### 3. Data & export

**Card** — same card formula.

**Header**:
- Title: "Data & export"
- Description: "Download your transactions as a CSV file for spreadsheet analysis or backup."

**Body**:
- Single primary button: **"Download transactions CSV"**
- Below: small muted text — "Includes all transactions across all connected accounts, including category overrides. Updates from your most recent sync."

**Behavior**: Button is an `<a href="/api/export/transactions" download>` with `aria-label`. Browser handles the download via the response's `Content-Disposition: attachment` header. No client JS state needed; section stays server-component-eligible.

### 4. Danger zone

**Card** — amber-tinted variant: `border-[--semantic-caution] bg-[--semantic-caution]/10` per design system §7 rule "amber-tinted, never red".

**Header**:
- Title: "Danger zone"
- Description: "Actions in this section can't be undone."

**Body** (currently single action; structure leaves room for future destructive actions):
- "Delete account" — destructive shadcn button variant (asymmetric to amber container, intentional)
- Below: muted text — "Permanently delete your account and all associated data, including connected institutions, transactions, goals, and scenarios. This action cannot be reversed."

**On click**: Opens `<DeleteAccountDialog>`.

### Delete account dialog

shadcn `<AlertDialog>` with custom body:
- Title: "Delete your account?"
- Description: "This will permanently delete your Foothold account and erase all data: transactions, connected institutions, goals, scenarios, and insights. You can't reverse this."
- Input: `<Input>` with placeholder `Type your email to confirm`
- Validation: submit-button disabled until `input.value === session.user.email` (strict equality, case-sensitive)
- Cancel button: regular shadcn variant, closes dialog
- Confirm button: destructive variant labeled "Delete account permanently", disabled until input matches

**On confirm**:
1. `deleteAccountAction({ confirmationEmail: input.value })`
2. Server: validates email match against `session.user.email` (defense in depth), then `db.delete(users).where(eq(users.id, session.user.id))` (cascades fire), then `signOut({ redirect: false })`
3. Server returns `{ ok: true, redirectTo: '/login' }`
4. Client `router.push('/login')` + toast success: "Account deleted."

---

## Data layer

### Schema additions (`src/lib/db/schema.ts`)

```ts
// users table additions:
displayName: text('display_name'),
timezone: text('timezone').notNull().default('UTC'),
```

Both backward-compatible (nullable or defaulted), no row backfill needed. `npm run db:push` after schema edit applies them.

### Server actions (`src/lib/users/actions.ts`)

```ts
'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth, signOut } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import type { ActionResult } from '@/lib/actions/types';

const profileSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().refine(isValidIanaTimezone, 'Invalid timezone'),
});

export async function updateProfileAction(
  input: z.infer<typeof profileSchema>,
): Promise<ActionResult<void>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Unauthorized' };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const displayName = parsed.data.displayName?.length === 0 ? null : parsed.data.displayName;
  await db
    .update(users)
    .set({ displayName, timezone: parsed.data.timezone })
    .where(eq(users.id, session.user.id));
  revalidatePath('/settings');
  return { ok: true };
}

const deleteSchema = z.object({ confirmationEmail: z.string().email() });

export async function deleteAccountAction(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult<{ redirectTo: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Unauthorized' };
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input' };
  if (parsed.data.confirmationEmail !== session.user.email) {
    return { ok: false, error: 'Email confirmation mismatch' };
  }
  await db.delete(users).where(eq(users.id, session.user.id));
  await signOut({ redirect: false });
  return { ok: true, data: { redirectTo: '/login' } };
}
```

### Route handler (`src/app/api/export/transactions/route.ts`)

```ts
import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { transactions, categories } from '@/lib/db/schema';
import { rowsToCsv } from '@/lib/export/csv';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const rows = await db
    .select({...})
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryOverrideId, categories.id))
    .where(eq(transactions.userId, session.user.id));

  const csv = rowsToCsv(rows);
  const filename = `foothold-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

CSV columns: `date,name,merchantName,amount,category,categoryOverride,accountName,pending`. Amounts stored per the codebase invariant (positive = cash OUT) — documented in a header comment row would break Excel parsing, so the README convention stays implicit.

### No new query helpers

Profile reads piggyback on `auth()` session shape (`session.user.email`, `session.user.id`); display name + timezone need a thin `getUserProfile(userId)` helper or can be loaded via existing `users` table select. Either is fine — decided in plan phase.

---

## Pure helpers (testable)

| Helper | Location | Returns |
|---|---|---|
| `rowsToCsv(rows: TransactionExportRow[]): string` | `src/lib/export/csv.ts` | RFC 4180-compliant CSV string; escapes commas, quotes, newlines |
| `isValidIanaTimezone(tz: string): boolean` | `src/lib/format/timezone.ts` | Validates a string is an IANA-recognized zone via `Intl.DateTimeFormat` constructor probe |
| `TIMEZONE_OPTIONS` | `src/lib/format/timezone.ts` | Curated list of `{ value, label }` for the Profile timezone select |

---

## Components inventory

| File | Type | Role |
|---|---|---|
| `src/app/(app)/settings/page.tsx` | server | Rewritten — two-column shell, fetches session + source health, renders 4 sections |
| `src/components/settings/settings-rail.tsx` | client | 220px sticky rail, IntersectionObserver active tracking, position-dot indicator |
| `src/components/settings/profile-section.tsx` | client | Form: email RO + display name + timezone select, save/discard |
| `src/components/settings/connected-accounts-section.tsx` | server | Wraps existing `<SourceHealthRow>` listing + `<ConnectAccountButton>` |
| `src/components/settings/data-export-section.tsx` | server | Card with download-CSV anchor button |
| `src/components/settings/danger-zone-section.tsx` | client | Amber-tinted card, mounts the delete dialog |
| `src/components/settings/delete-account-dialog.tsx` | client | shadcn AlertDialog + email-match confirmation gate |
| `src/lib/users/actions.ts` | server | `updateProfileAction` + `deleteAccountAction` |
| `src/lib/export/csv.ts` | pure helper | `rowsToCsv` + escaping rules |
| `src/lib/format/timezone.ts` | pure helper | `isValidIanaTimezone` + `TIMEZONE_OPTIONS` |
| `src/app/api/export/transactions/route.ts` | route handler | GET → streams CSV |
| `src/lib/db/schema.ts` | schema | `+displayName text` + `+timezone text not null default 'UTC'` on users table |
| `src/components/sync/source-health-row.tsx` | edit | `<StatePill>` palette migration: amber-500 → `--semantic-caution` |

---

## Testing strategy

### Pure helpers — vitest unit tests

| Test file | Cases | Approx count |
|---|---|---|
| `src/lib/export/csv.test.ts` | empty rows → header only; commas/quotes/newlines escaped per RFC 4180; signed amounts preserved; override-category column populated when set; null fields render as empty | 8-10 |
| `src/lib/format/timezone.test.ts` | known zones validated; gibberish rejected; case-sensitivity; UTC always valid; empty string rejected | 5-6 |
| `src/lib/users/actions.test.ts` | profileSchema: empty display name normalizes to null; >120 chars rejected; bad timezone rejected; valid round-trip; deleteSchema: bad email rejected; valid email accepted | 8-10 |
| `src/components/sync/source-health-row.test.ts` | StatePill renders for degraded/needs_reconnect/failed; renders null for healthy/stale/unknown/syncing (restraint matrix regression) | 7 |

**Expected total delta**: ~28-33 new tests.

### Manual browser UAT

(No vitest jsdom for `'use client'` integration; manual walk required.)

- md+ viewport: rail sticky, 4 anchor scroll-tos work, IntersectionObserver updates active dot as you scroll
- Profile save: dirty-state Save button enables/disables correctly; refresh persists
- CSV download: file opens in Excel/Numbers; expected columns present; encoding correct (UTF-8 BOM not needed but acceptable)
- Delete dialog: email match gates submit; non-match keeps button disabled; cancel closes; confirm cascades + redirects to `/login`
- Mobile (<md): rail hidden; sections stack; page is usable
- Dark + light theme parity on all 4 sections

---

## Edge cases

| Case | Handling |
|---|---|
| User has no `display_name` set (DB null) | Profile section input renders empty placeholder "Add a display name" |
| User edits then refreshes without saving | Dirty-state warning? No — keep simple, refresh discards. Plan phase may revisit. |
| Account deletion mid-sync | Cascades fire regardless — sync would complete against now-deleted item rows, hitting FK-already-gone state. Acceptable: sync runs to user-scope DELETE, no orphan rows possible. |
| User deletes account while signed in on another tab | Second tab next request → middleware sees session cookie but `auth()` returns null (user row gone) → redirect to `/login`. Acceptable: brief desync, no data exposure. |
| Transactions CSV is large (10k+ rows) | Single-pass query + in-memory CSV stringify is fine up to ~50k rows. Past that, route handler should stream via `ReadableStream`. Plan as follow-on; current user data nowhere near threshold. |
| Timezone changed but cron schedules don't yet localize | Documented limitation — timezone field is captured but not yet consumed elsewhere. Surfaced in spec, not bug. |
| Reconnect required + delete account | Both Connected accounts and Danger zone work in parallel — user can do either. Order independent. |
| User attempts to download CSV while logged out | Route handler returns 401; browser shows whatever a 401 looks like (no friendly redirect). Acceptable for an export endpoint. |

---

## Out of scope

- **Notifications section** — no toggle features exist; email digest already runs unconditionally
- **Preferences section** — density / currency / date-format / week-start / sync-frequency all defer until concrete config features ship
- **Privacy & security section** — biometric / 2FA / sessions / change password — Auth.js magic-link auth has no password to change, no biometric layer
- **Tax-package export** — single-CSV is enough for MVP
- **JSON snapshot export** — defer; CSV covers spreadsheet use case, JSON is for data-portability (GDPR right-of-access) that's a separate compliance item
- **Soft-delete with grace period** — adds cron + reactivation flow; hard-delete is sufficient for MVP
- **Profile photo / avatar upload** — no storage layer yet; gradient avatar placeholder from mockup omitted
- **Mobile-specific rail UX** — R.5 mobile rebuild owns this; sections stacking at <md is the R.3.6 fallback
- **Custom 38×22px toggle component** — design system §7 spec'd one, but no toggles ship in R.3.6 (Notifications/Preferences skipped); component build deferred to whichever phase first needs toggles

---

## Risks & gotchas

| Risk | Mitigation |
|---|---|
| Schema additions require `npm run db:push` | Plan includes explicit task; verify before merge |
| Drizzle `strict: true` blocks db:push via stdin | CLAUDE.md Lessons learned — manual prompt flip; same approach |
| RSC boundary trap (strike-3 watch) | All props crossing server→client are serializable — `{ id, label }[]`, plain strings, no functions. Plan includes grep acceptance like R.3.5's T25 |
| `<StatePill>` palette change is load-bearing for trustability | Add restraint-matrix regression test BEFORE editing colors so we can't accidentally make pills appear for healthy/stale |
| Route handler middleware behavior | `/api/export/transactions` is NOT in `PUBLIC_API_PREFIXES` — middleware checks cookie presence, route handler calls `auth()` for real session check. Verify logged-out request → 401 from handler (not middleware JSON shape) |
| CSV escaping bugs | RFC 4180 compliance covered by 8-10 dedicated tests; codepath isolated in pure helper |
| Account deletion irreversibility | Defense in depth: UI gates on email-match → server re-validates email-match → cascades fire only after both gates pass |
| Timezone whitelist becomes stale | `isValidIanaTimezone` does runtime probe via `Intl.DateTimeFormat`; new zones pass automatically. Curated `TIMEZONE_OPTIONS` is for select UX only |

---

## Open items for plan phase

1. **`<DataExportSection>` server vs client**: simplest path is plain `<a href="..." download>` (server component). If we want a loading spinner or success toast for the download, it becomes client. Decision: stay server unless the UX feels worse than no feedback.
2. **`<ConnectedAccountsSection>` extraction**: current `/settings/page.tsx` inlines the connected-institutions card. Extract into its own component for symmetry with the other 3 sections, even though it doesn't have its own state? **Recommendation: yes** — symmetric IA is worth the file.
3. **Sticky rail offset for top-bar**: top-bar is `h-14` (56px) sticky. Rail `top` offset should match plus padding. Confirm value in plan.
4. **IntersectionObserver root margin**: tuning the trigger zone (e.g., `-30% 0px -60% 0px` so the active item changes when a section is in the middle-third of viewport). Settled in implementation.
5. **`getUserProfile(userId)` query helper**: extract to `src/lib/db/queries/users.ts` or read inline in page.tsx. Either fine.
6. **`session.user` shape** after Auth.js v5 + DrizzleAdapter: confirm that updating `users.displayName` propagates to subsequent `auth()` calls (the adapter caches via session lookups, but the database session strategy fetches user fresh per request — should just work).
7. **R.5 mobile rebuild dependency**: R.3.6 ships `md+` only for the rail; R.5 will add mobile chrome. No explicit handoff needed beyond noting the stacked fallback.

---

## Cross-references

- **Predecessor**: [R.3.5 Simulator SPEC](../r3-5-simulator/SPEC.md) — established themed `<Select>` primitive, card formula, Fraunces h1 sweep, pure-helpers-in-`.ts` convention
- **R.3.5 polish-round handoff**: [HANDOFF-2026-05-11-post-r3-5.md](../HANDOFF-2026-05-11-post-r3-5.md) — entry conditions, brainstorm axes
- **Design system §7 Settings**: [claude-design-context/README.md](../../../claude-design-context/README.md) line 276 onward
- **Reliability Phase 4 surface**: [src/components/sync/source-health-row.tsx](../../../src/components/sync/source-health-row.tsx) — load-bearing; restyle preserves copy + restraint rules
- **Reliability Phase 5 surface**: [src/components/sync/trust-strip.tsx](../../../src/components/sync/trust-strip.tsx) — dashboard mirror; R.3.6 status-pill palette migration cascades here implicitly via shared design tokens
- **CLAUDE.md**: Architecture notes (App shell, RSC discipline, `db:push` constraints), Lessons learned (forwardRef/functions across RSC — strike 2 active)
- **SPEC.md (milestone)**: [docs/redesign/SPEC.md](../SPEC.md) — locked decisions for whole redesign

---

## Phase entry checklist (run before plan phase)

```bash
git rev-parse --abbrev-ref HEAD          # must be feat/redesign
git status                                # clean
git log --oneline -3                      # confirm HEAD includes R.3.5 polish commits
npm run typecheck                         # clean
npm run test 2>&1 | grep "Tests "        # confirm baseline (656 from R.3.5)
```

Phase exit (before merge to feat/redesign): see "Acceptance checklist" in design — applied by plan phase task gates.
