# R.3.6 Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship R.3.6 Settings on `feat/redesign` — restyle existing 2 cards (Profile, Connected accounts) + build 2 new multi-user features (Data & export transactions CSV, Danger zone account deletion) in a two-column sticky-rail shell per design system §7.

**Architecture:** Two-column shell at md+ (220px sticky rail + body), single-column stacked fallback at <md. Rail uses anchor links + IntersectionObserver active-state tracking (classic GitHub Settings pattern). Server-rendered sections except the rail itself, ProfileSection (form state), and DangerZoneSection (alert-dialog with type-email gate). Transactions CSV downloads via a route handler at `/api/export/transactions`. Status-pill palette migrates from raw Tailwind amber-500 to the Foothold `--semantic-caution` token.

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle ORM, Auth.js v5, shadcn/ui (AlertDialog, Card, Input), Tailwind, Vitest. No new dependencies.

---

## Spec deviation (decided at plan kickoff)

| # | Spec said | Plan does | Why |
|---|---|---|---|
| 1 | Add new column `users.display_name text` | Reuse existing `users.name` column (Auth.js-owned, currently unused for magic-link users) | Schema already has a nullable `text('name')` at line 38 of `schema.ts`. Adding `display_name` would create two display-name columns on the same row. Auth.js will auto-populate `name` from OAuth profile data if we ever add OAuth providers — that aligns with display-name intent. User confirmed at plan kickoff. |

Only one schema column gets added in this plan: `users.timezone text not null default 'UTC'`.

---

## Phase entry checklist (run before T1)

```bash
git rev-parse --abbrev-ref HEAD          # expected: feat/redesign
git status                                # expected: clean
git log --oneline -1                      # expected: ef54b9b SPEC commit at HEAD
npm run typecheck                         # expected: clean
npm run test 2>&1 | tail -3              # expected: 656 passed (R.3.5 baseline)
```

If any expectation fails, STOP. Resolve before proceeding.

---

## File structure (all R.3.6 changes)

**New files**:
- `src/lib/export/csv.ts` — pure helper, RFC 4180 CSV stringification
- `src/lib/export/csv.test.ts` — vitest unit tests for CSV escaping
- `src/lib/format/timezone.ts` — pure helper, IANA timezone validator + curated options
- `src/lib/format/timezone.test.ts` — vitest unit tests
- `src/lib/users/actions.ts` — server actions `updateProfileAction`, `deleteAccountAction`
- `src/lib/users/actions.test.ts` — vitest unit tests for schemas
- `src/app/api/export/transactions/route.ts` — GET route handler streams CSV
- `src/components/settings/settings-rail.tsx` — client, sticky 220px rail + IntersectionObserver
- `src/components/settings/profile-section.tsx` — client, form
- `src/components/settings/connected-accounts-section.tsx` — server, wraps existing SourceHealthRow listing
- `src/components/settings/data-export-section.tsx` — server, anchor button to route handler
- `src/components/settings/danger-zone-section.tsx` — client, amber card + delete dialog mount
- `src/components/settings/delete-account-dialog.tsx` — client, type-email confirmation
- `src/components/sync/source-health-row.test.tsx` — vitest (no jsdom, so testing the pure helper inside); actually we'll test via the pure function the pill embodies — see T7

**Modified files**:
- `src/lib/db/schema.ts` — add `timezone: text('timezone').notNull().default('UTC')` to users table
- `src/components/sync/source-health-row.tsx` — `<StatePill>` palette: `amber-500` Tailwind classes → `var(--semantic-caution)` inline-style references
- `src/app/(app)/settings/page.tsx` — rewrite as two-column shell rendering 4 section components

**Deleted files**: none.

---

## Task list

### T1: Add `timezone` column to users table

**Files**:
- Modify: `src/lib/db/schema.ts:34-43`

- [ ] **Step 1: Edit schema**

Add `timezone` field to the `users` pgTable definition between `image` and `createdAt`:

```ts
export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique().notNull(),
  emailVerified: ts('email_verified'),
  image: text('image'),
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: ts('created_at').defaultNow().notNull(),
});
```

- [ ] **Step 2: Run db:push**

```bash
npm run db:push
```

Expected: prompt asks to add the column with default backfill — confirm. If `strict: true` blocks, follow CLAUDE.md Lessons Learned "Don't feed db:push via stdin when strict: true" — flip `strict: false` in `drizzle.config.ts` temporarily, push, flip back. Do NOT permanently disable.

- [ ] **Step 3: Verify schema applied**

```bash
npm run typecheck
```

Expected: clean (the new `User` type infers the `timezone: string` field).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(r3.6): T1 — add users.timezone column

Add `timezone text not null default 'UTC'` to users table. Reuses
existing users.name for display name per plan kickoff decision.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T2: rowsToCsv pure helper (TDD)

**Files**:
- Create: `src/lib/export/csv.ts`
- Test: `src/lib/export/csv.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/export/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rowsToCsv, type TransactionExportRow } from './csv';

const baseRow: TransactionExportRow = {
  date: '2026-05-10',
  name: 'STARBUCKS',
  merchantName: 'Starbucks',
  amount: '5.50',
  category: 'FOOD_AND_DRINK',
  categoryOverride: null,
  accountName: 'Wells Fargo Checking',
  pending: false,
};

describe('rowsToCsv', () => {
  it('returns header-only for empty rows', () => {
    const csv = rowsToCsv([]);
    expect(csv).toBe('date,name,merchantName,amount,category,categoryOverride,accountName,pending');
  });

  it('renders a single row after the header', () => {
    const csv = rowsToCsv([baseRow]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('2026-05-10,STARBUCKS,Starbucks,5.50,FOOD_AND_DRINK,,Wells Fargo Checking,false');
  });

  it('escapes commas by wrapping in quotes', () => {
    const csv = rowsToCsv([{ ...baseRow, name: 'AMAZON, INC' }]);
    expect(csv).toContain('"AMAZON, INC"');
  });

  it('escapes double quotes by doubling them inside quotes', () => {
    const csv = rowsToCsv([{ ...baseRow, name: 'WHATABURGER "ORIGINAL"' }]);
    expect(csv).toContain('"WHATABURGER ""ORIGINAL"""');
  });

  it('escapes newlines by wrapping in quotes', () => {
    const csv = rowsToCsv([{ ...baseRow, name: 'LINE1\nLINE2' }]);
    expect(csv).toContain('"LINE1\nLINE2"');
  });

  it('renders null fields as empty string', () => {
    const csv = rowsToCsv([{ ...baseRow, merchantName: null, category: null }]);
    const fields = csv.split('\n')[1].split(',');
    expect(fields[2]).toBe(''); // merchantName slot
    expect(fields[4]).toBe(''); // category slot
  });

  it('preserves signed amounts as stored (positive=cash-out invariant)', () => {
    const out = rowsToCsv([{ ...baseRow, amount: '50.00' }]);
    const inflow = rowsToCsv([{ ...baseRow, amount: '-100.00' }]);
    expect(out.split('\n')[1]).toContain(',50.00,');
    expect(inflow.split('\n')[1]).toContain(',-100.00,');
  });

  it('populates categoryOverride column when set', () => {
    const csv = rowsToCsv([{ ...baseRow, categoryOverride: 'Custom Category' }]);
    expect(csv.split('\n')[1].split(',')[5]).toBe('Custom Category');
  });

  it('serializes pending as the literal string true/false', () => {
    const t = rowsToCsv([{ ...baseRow, pending: true }]);
    expect(t.split('\n')[1]).toMatch(/,true$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- src/lib/export/csv.test.ts
```

Expected: FAIL with "Cannot find module './csv'" or similar.

- [ ] **Step 3: Implement the helper**

Create `src/lib/export/csv.ts`:

```ts
export interface TransactionExportRow {
  date: string;
  name: string;
  merchantName: string | null;
  amount: string;
  category: string | null;
  categoryOverride: string | null;
  accountName: string;
  pending: boolean;
}

const HEADERS: ReadonlyArray<keyof TransactionExportRow> = [
  'date',
  'name',
  'merchantName',
  'amount',
  'category',
  'categoryOverride',
  'accountName',
  'pending',
];

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: TransactionExportRow[]): string {
  const lines: string[] = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => escapeCell(row[h])).join(','));
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/lib/export/csv.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/csv.ts src/lib/export/csv.test.ts
git commit -m "$(cat <<'EOF'
feat(r3.6): T2 — rowsToCsv pure helper with RFC 4180 escaping

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T3: isValidIanaTimezone + TIMEZONE_OPTIONS (TDD)

**Files**:
- Create: `src/lib/format/timezone.ts`
- Test: `src/lib/format/timezone.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/format/timezone.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidIanaTimezone, TIMEZONE_OPTIONS } from './timezone';

describe('isValidIanaTimezone', () => {
  it('accepts UTC', () => {
    expect(isValidIanaTimezone('UTC')).toBe(true);
  });

  it('accepts America/Los_Angeles', () => {
    expect(isValidIanaTimezone('America/Los_Angeles')).toBe(true);
  });

  it('accepts Europe/Berlin', () => {
    expect(isValidIanaTimezone('Europe/Berlin')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidIanaTimezone('')).toBe(false);
  });

  it('rejects gibberish', () => {
    expect(isValidIanaTimezone('Not/A_Real_Zone')).toBe(false);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error testing runtime guard
    expect(isValidIanaTimezone(null)).toBe(false);
    // @ts-expect-error testing runtime guard
    expect(isValidIanaTimezone(undefined)).toBe(false);
  });
});

describe('TIMEZONE_OPTIONS', () => {
  it('includes UTC as the first option', () => {
    expect(TIMEZONE_OPTIONS[0]).toEqual({ value: 'UTC', label: 'UTC' });
  });

  it('every option has a value that passes isValidIanaTimezone', () => {
    for (const opt of TIMEZONE_OPTIONS) {
      expect(isValidIanaTimezone(opt.value)).toBe(true);
    }
  });

  it('every option has a non-empty label', () => {
    for (const opt of TIMEZONE_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- src/lib/format/timezone.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/format/timezone.ts`:

```ts
export function isValidIanaTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/lib/format/timezone.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/timezone.ts src/lib/format/timezone.test.ts
git commit -m "$(cat <<'EOF'
feat(r3.6): T3 — isValidIanaTimezone + TIMEZONE_OPTIONS curated list

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T4: User-actions zod schemas + actions (TDD on schemas)

**Files**:
- Create: `src/lib/users/actions.ts`
- Test: `src/lib/users/actions.test.ts`

- [ ] **Step 1: Write the failing schema tests**

Create `src/lib/users/actions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { profileSchema, deleteSchema } from './actions';

describe('profileSchema', () => {
  it('parses valid input', () => {
    const result = profileSchema.safeParse({
      displayName: 'Connor',
      timezone: 'America/Los_Angeles',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe('Connor');
      expect(result.data.timezone).toBe('America/Los_Angeles');
    }
  });

  it('normalizes empty-string displayName to null', () => {
    const result = profileSchema.safeParse({ displayName: '', timezone: 'UTC' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBeNull();
  });

  it('normalizes whitespace-only displayName to null', () => {
    const result = profileSchema.safeParse({ displayName: '   ', timezone: 'UTC' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBeNull();
  });

  it('accepts null displayName', () => {
    const result = profileSchema.safeParse({ displayName: null, timezone: 'UTC' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBeNull();
  });

  it('rejects displayName longer than 120 chars', () => {
    const result = profileSchema.safeParse({
      displayName: 'a'.repeat(121),
      timezone: 'UTC',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid timezone', () => {
    const result = profileSchema.safeParse({
      displayName: 'Connor',
      timezone: 'Not/Real',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing timezone', () => {
    const result = profileSchema.safeParse({ displayName: 'Connor' });
    expect(result.success).toBe(false);
  });
});

describe('deleteSchema', () => {
  it('accepts a valid email', () => {
    const result = deleteSchema.safeParse({ confirmationEmail: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects non-email strings', () => {
    const result = deleteSchema.safeParse({ confirmationEmail: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = deleteSchema.safeParse({ confirmationEmail: '' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- src/lib/users/actions.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the actions**

Create `src/lib/users/actions.ts`:

```ts
'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth, signOut } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { isValidIanaTimezone } from '@/lib/format/timezone';

// Local ActionResult per codebase convention (see narrative-actions.ts,
// scenario-actions.ts). No centralized types file exists.
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const profileSchema = z.object({
  displayName: z
    .union([z.string(), z.null()])
    .nullable()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .pipe(z.string().max(120).nullable()),
  timezone: z.string().refine(isValidIanaTimezone, { message: 'Invalid timezone' }),
});

export const deleteSchema = z.object({
  confirmationEmail: z.string().email(),
});

export async function updateProfileAction(
  input: z.input<typeof profileSchema>,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  await db
    .update(users)
    .set({ name: parsed.data.displayName, timezone: parsed.data.timezone })
    .where(eq(users.id, session.user.id));

  revalidatePath('/settings');
  return { ok: true, data: null };
}

export async function deleteAccountAction(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult<{ redirectTo: string }>> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return { ok: false, error: 'Unauthorized' };
  }

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input' };

  // Defense in depth on top of the UI's email-match gate.
  if (parsed.data.confirmationEmail !== session.user.email) {
    return { ok: false, error: 'Email confirmation mismatch' };
  }

  // Cascades fire across users → external_item → financial_account →
  // transactions / holding / recurring_stream / etc. (all FKs onDelete:cascade).
  await db.delete(users).where(eq(users.id, session.user.id));
  await signOut({ redirect: false });

  return { ok: true, data: { redirectTo: '/login' } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/lib/users/actions.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/users/actions.ts src/lib/users/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(r3.6): T4 — updateProfileAction + deleteAccountAction with zod schemas

Profile writes to users.name (Auth.js-owned but unused for magic-link).
Delete cascades via existing FK rules; defense-in-depth email match
re-checked server-side.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T5: Transactions CSV route handler

**Files**:
- Create: `src/app/api/export/transactions/route.ts`

- [ ] **Step 1: Write the route handler**

User-scoping for transactions joins through `financialAccounts → externalItems.userId` per the existing pattern in `src/lib/db/queries/transactions.ts:117-122`. Transactions has no `userId` column of its own.

Create `src/app/api/export/transactions/route.ts`:

```ts
import { eq, desc } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { rowsToCsv, type TransactionExportRow } from '@/lib/export/csv';
import {
  categories,
  externalItems,
  financialAccounts,
  transactions,
} from '@/lib/db/schema';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const rawRows = await db
    .select({
      date: transactions.date,
      name: transactions.name,
      merchantName: transactions.merchantName,
      amount: transactions.amount,
      category: transactions.primaryCategory,
      categoryOverride: categories.name,
      accountName: financialAccounts.name,
      pending: transactions.pending,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .leftJoin(categories, eq(transactions.categoryOverrideId, categories.id))
    .where(eq(externalItems.userId, session.user.id))
    .orderBy(desc(transactions.date));

  const exportRows: TransactionExportRow[] = rawRows.map((r) => ({
    date: r.date,
    name: r.name,
    merchantName: r.merchantName,
    amount: r.amount,
    category: r.category,
    categoryOverride: r.categoryOverride,
    accountName: r.accountName ?? '',
    pending: r.pending,
  }));

  const csv = rowsToCsv(exportRows);
  const filename = `foothold-transactions-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 2: Typecheck the route handler**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Verify middleware lets the route through**

```bash
grep -nE "PUBLIC_API_PREFIXES|api/export" src/middleware.ts
```

Confirm `/api/export` is NOT in `PUBLIC_API_PREFIXES` — middleware then applies cookie-presence check, and the handler does the real `auth()` check. This is the correct shape for a user-authenticated download.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/export/transactions/route.ts
git commit -m "$(cat <<'EOF'
feat(r3.6): T5 — /api/export/transactions route handler streams CSV

GET → 200 with text/csv body and Content-Disposition attachment, or
401 if no session. Joins categories + financial_accounts for override
name and account name. Orders by date desc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T6: StatePill restraint-matrix regression test (BEFORE palette edit)

**Files**:
- Create: `src/components/sync/source-health-row.test.tsx`

Tests render `<SourceHealthRow>` and assert on the rendered pill or its absence. Since vitest config is node-env (no jsdom), we test the pure decision logic by extracting a tiny helper.

- [ ] **Step 1: Extract `statePillKind` pure helper**

Modify `src/components/sync/source-health-row.tsx`. Above the current `<StatePill>` definition, add:

```ts
export type StatePillKind = 'caution' | 'destructive' | null;

export function statePillKind(state: SourceHealth['state']): StatePillKind {
  if (state === 'degraded' || state === 'needs_reconnect') return 'caution';
  if (state === 'failed') return 'destructive';
  return null;
}
```

Update the inline `<StatePill>` function to use it (no behavior change yet):

```tsx
function StatePill({ state }: { state: SourceHealth['state'] }) {
  const kind = statePillKind(state);
  if (kind === 'caution') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full',
          'border border-amber-500/50 bg-amber-500/10',
          'px-2 py-0.5 text-xs font-medium',
          'text-amber-700 dark:text-amber-400',
        )}
      >
        {state === 'degraded' ? 'Partial' : 'Reconnect'}
      </span>
    );
  }
  if (kind === 'destructive') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full',
          'border border-destructive/50 bg-destructive/10',
          'px-2 py-0.5 text-xs font-medium',
          'text-destructive',
        )}
      >
        Failed
      </span>
    );
  }
  return null;
}
```

- [ ] **Step 2: Write the restraint-matrix tests**

Create `src/components/sync/source-health-row.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { statePillKind } from './source-health-row';

describe('statePillKind — restraint matrix', () => {
  it('returns caution for degraded', () => {
    expect(statePillKind('degraded')).toBe('caution');
  });

  it('returns caution for needs_reconnect', () => {
    expect(statePillKind('needs_reconnect')).toBe('caution');
  });

  it('returns destructive for failed', () => {
    expect(statePillKind('failed')).toBe('destructive');
  });

  it('returns null for healthy (silence rule)', () => {
    expect(statePillKind('healthy')).toBe(null);
  });

  it('returns null for stale (silence rule)', () => {
    expect(statePillKind('stale')).toBe(null);
  });

  it('returns null for unknown (silence rule)', () => {
    expect(statePillKind('unknown')).toBe(null);
  });

  it('returns null for syncing (silence rule)', () => {
    expect(statePillKind('syncing')).toBe(null);
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
npm run test -- src/components/sync/source-health-row.test.tsx
```

Expected: 7 passed. These are the regression tests that lock the silence rule before we change pill colors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sync/source-health-row.tsx src/components/sync/source-health-row.test.tsx
git commit -m "$(cat <<'EOF'
test(r3.6): T6 — StatePill restraint-matrix regression tests

Extract statePillKind() pure helper from inline StatePill component.
Lock the silence rule (no pill for healthy/stale/unknown/syncing)
before the palette migration in T7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T7: StatePill palette migration (amber-500 → --semantic-caution)

**Files**:
- Modify: `src/components/sync/source-health-row.tsx` (the `<StatePill>` function only)

- [ ] **Step 1: Verify --semantic-caution token exists in tailwind config**

```bash
grep -nE "semantic-caution|semantic:" tailwind.config.ts src/app/globals.css
```

Confirm the token is defined in globals.css (R.1 foundation shipped this). The token is a complete-color value (not an HSL fragment), so the arbitrary-value Tailwind syntax `bg-[var(--semantic-caution)]` works (per R.3.5 polish-round lesson).

- [ ] **Step 2: Migrate the caution-state classes**

In the `<StatePill>` function (kind === 'caution' branch), replace the amber-500 Tailwind classes with `--semantic-caution`:

```tsx
if (kind === 'caution') {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full',
        'border bg-[var(--semantic-caution)]/10',
        'px-2 py-0.5 text-xs font-medium',
        'text-[var(--semantic-caution)]',
      )}
      style={{ borderColor: 'color-mix(in oklab, var(--semantic-caution) 50%, transparent)' }}
    >
      {state === 'degraded' ? 'Partial' : 'Reconnect'}
    </span>
  );
}
```

The `style` prop carries the border because `border-[color-mix(...)]/50` Tailwind arbitrary syntax with color-mix is fragile.

- [ ] **Step 3: Leave the destructive branch unchanged**

The `destructive` branch uses shadcn's `destructive` token, which is already a Foothold-mapped HSL fragment via `tailwind.config.ts`. No edit needed.

- [ ] **Step 4: Run regression tests to confirm matrix unchanged**

```bash
npm run test -- src/components/sync/source-health-row.test.tsx
```

Expected: 7 passed (palette change doesn't affect `statePillKind` logic).

- [ ] **Step 5: Manual visual check via npm run dev**

Skip if dev server is already running. Otherwise:

```bash
npm run dev
```

Open http://localhost:3000/settings (after sign-in). For any source row in `degraded` or `needs_reconnect` state, the pill should render with the calmer signal-amber `#c08a4f` instead of the raw Tailwind amber-500. If no rows are in elevated states, this check is visual-only on staging post-merge — flag in the commit body.

- [ ] **Step 6: Commit**

```bash
git add src/components/sync/source-health-row.tsx
git commit -m "$(cat <<'EOF'
fix(r3.6): T7 — StatePill caution palette uses --semantic-caution token

Migrate Partial/Reconnect pill from Tailwind amber-500 to the Foothold
signal-amber token (#c08a4f). Destructive Failed pill kept on shadcn
destructive (already token-mapped). Copy + restraint rules unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T8: SettingsRail client component

**Files**:
- Create: `src/components/settings/settings-rail.tsx`

- [ ] **Step 1: Write the rail component**

Create `src/components/settings/settings-rail.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface RailSection {
  id: string;
  label: string;
}

interface Props {
  sections: ReadonlyArray<RailSection>;
}

export function SettingsRail({ sections }: Props) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observers: IntersectionObserver[] = [];
    const visible = new Map<string, number>();

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (!el) continue;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visible.set(section.id, entry.intersectionRatio);
          }
          // Pick the section with the highest visibility ratio.
          let bestId = activeId;
          let bestRatio = 0;
          for (const [id, ratio] of visible.entries()) {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestId = id;
            }
          }
          if (bestRatio > 0) setActiveId(bestId);
        },
        { rootMargin: '-30% 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => {
      for (const o of observers) o.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  return (
    <nav className="hidden md:block sticky top-20 self-start w-[220px] shrink-0">
      <ul className="divide-y divide-[color:var(--hairline)] border-y border-[color:var(--hairline)]">
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 text-sm',
                  'transition-colors duration-150',
                  isActive
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-current={isActive ? 'true' : undefined}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                    'transition-all duration-200',
                    isActive
                      ? 'bg-[var(--accent)] scale-100 opacity-100'
                      : 'bg-transparent scale-50 opacity-0',
                  )}
                />
                <span>{section.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/settings-rail.tsx
git commit -m "$(cat <<'EOF'
feat(r3.6): T8 — SettingsRail with IntersectionObserver active tracking

Sticky 220px rail at md+, hidden below. Active section indicated by
brand-green position dot to the left of the label. Anchor links drive
native scroll; observer updates active state as user scrolls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T9: ProfileSection client component

**Files**:
- Create: `src/components/settings/profile-section.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/settings/profile-section.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TIMEZONE_OPTIONS } from '@/lib/format/timezone';
import { updateProfileAction } from '@/lib/users/actions';

interface Props {
  email: string;
  initialDisplayName: string | null;
  initialTimezone: string;
}

export function ProfileSection({ email, initialDisplayName, initialTimezone }: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '');
  const [timezone, setTimezone] = useState(initialTimezone);
  const [isPending, startTransition] = useTransition();

  const isDirty =
    displayName !== (initialDisplayName ?? '') || timezone !== initialTimezone;

  function onSave() {
    startTransition(async () => {
      const result = await updateProfileAction({
        displayName: displayName.trim() === '' ? null : displayName,
        timezone,
      });
      if (result.ok) {
        toast.success('Profile updated');
      } else {
        toast.error(result.error);
      }
    });
  }

  function onDiscard() {
    setDisplayName(initialDisplayName ?? '');
    setTimezone(initialTimezone);
  }

  return (
    <Card className="bg-surface-elevated border-hairline-strong shadow-sm">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your sign-in identity and display preferences.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="profile-email">
            Email
          </label>
          <p
            id="profile-email"
            className="font-mono text-sm text-foreground"
          >
            {email}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="profile-name">
            Display name
          </label>
          <Input
            id="profile-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Add a display name"
            maxLength={120}
            className="bg-surface-sunken"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="profile-tz">
            Timezone
          </label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="profile-tz" className="bg-surface-sunken">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={onSave} disabled={!isDirty || isPending}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button variant="outline" onClick={onDiscard} disabled={!isDirty || isPending}>
            Discard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/profile-section.tsx
git commit -m "$(cat <<'EOF'
feat(r3.6): T9 — ProfileSection form (email RO + display name + timezone)

Save button gated on dirty state; useTransition for pending UX; sonner
toast on result. Writes to users.name + users.timezone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T10: ConnectedAccountsSection server component (extract + restyle)

**Files**:
- Create: `src/components/settings/connected-accounts-section.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/settings/connected-accounts-section.tsx`:

```tsx
import { ConnectAccountButton } from '@/components/connect/connect-account-button';
import { SourceHealthRow } from '@/components/sync/source-health-row';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { SourceHealth } from '@/lib/db/queries/health';
import { formatCurrency } from '@/lib/utils';

interface FinancialAccountRow {
  id: string;
  itemId: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  currentBalance: string | null;
}

interface Props {
  sources: ReadonlyArray<SourceHealth>;
  accountsByItem: ReadonlyMap<string, ReadonlyArray<FinancialAccountRow>>;
  snaptradeEnabled: boolean;
}

export function ConnectedAccountsSection({ sources, accountsByItem, snaptradeEnabled }: Props) {
  return (
    <Card className="bg-surface-elevated border-hairline-strong shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Connected institutions</CardTitle>
          <CardDescription>
            Banks and credit cards via Plaid; brokerages via SnapTrade when SnapTrade keys are configured.
          </CardDescription>
        </div>
        <ConnectAccountButton snaptradeEnabled={snaptradeEnabled} />
      </CardHeader>
      <CardContent>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No institutions connected yet.</p>
        ) : (
          <ul className="space-y-6">
            {sources.map((source) => {
              const itemAccounts = accountsByItem.get(source.itemId) ?? [];
              return (
                <li key={source.itemId} className="space-y-3">
                  <SourceHealthRow source={source} />
                  {itemAccounts.length > 0 && (
                    <ul className="rounded-md border border-border divide-y divide-border text-sm">
                      {itemAccounts.map((a) => (
                        <li
                          key={a.id}
                          className="px-3 py-2 flex items-center justify-between"
                        >
                          <div>
                            <p>
                              {a.name}
                              {a.mask && (
                                <span className="text-muted-foreground"> ····{a.mask}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {a.subtype ?? a.type}
                            </p>
                          </div>
                          <p className="tabular text-sm">
                            {a.currentBalance != null
                              ? formatCurrency(Number(a.currentBalance))
                              : '—'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/connected-accounts-section.tsx
git commit -m "$(cat <<'EOF'
feat(r3.6): T10 — ConnectedAccountsSection extracted from settings/page.tsx

Server component. Content preserved verbatim from existing page; only
card surface tokens migrated (R.3.5 card formula). SourceHealthRow +
ConnectAccountButton unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T11: DataExportSection server component

**Files**:
- Create: `src/components/settings/data-export-section.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/settings/data-export-section.tsx`:

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function DataExportSection() {
  return (
    <Card className="bg-surface-elevated border-hairline-strong shadow-sm">
      <CardHeader>
        <CardTitle>Data &amp; export</CardTitle>
        <CardDescription>
          Download your transactions as a CSV file for spreadsheet analysis or backup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild>
          <a href="/api/export/transactions" download>
            <Download className="size-4 mr-2" aria-hidden />
            Download transactions CSV
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Includes all transactions across all connected accounts, including
          category overrides. Reflects your most recent sync.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/data-export-section.tsx
git commit -m "$(cat <<'EOF'
feat(r3.6): T11 — DataExportSection with download-CSV anchor

Plain anchor with the `download` attribute hits /api/export/transactions
and lets the browser handle the file save via Content-Disposition.
Server component — no client JS needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T12: DeleteAccountDialog client component

**Files**:
- Create: `src/components/settings/delete-account-dialog.tsx`

- [ ] **Step 1: Write the dialog**

Create `src/components/settings/delete-account-dialog.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteAccountAction } from '@/lib/users/actions';

interface Props {
  userEmail: string;
}

export function DeleteAccountDialog({ userEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const matches = confirmInput === userEmail;

  function onConfirm() {
    startTransition(async () => {
      const result = await deleteAccountAction({ confirmationEmail: confirmInput });
      if (result.ok) {
        toast.success('Account deleted.');
        router.push(result.data.redirectTo);
      } else {
        toast.error(result.error);
        setOpen(false);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmInput('');
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete your Foothold account and erase all
            data: transactions, connected institutions, goals, scenarios, and
            insights. You can&apos;t reverse this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 pt-2">
          <label className="text-xs text-muted-foreground" htmlFor="delete-confirm">
            Type your email to confirm:{' '}
            <span className="font-mono text-foreground">{userEmail}</span>
          </label>
          <Input
            id="delete-confirm"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={userEmail}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!matches || isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'Deleting…' : 'Delete account permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean. If `<AlertDialog>` primitives are not available in `src/components/ui/`, install via shadcn CLI: `npx shadcn@latest add alert-dialog`. Verify with `ls src/components/ui/alert-dialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/delete-account-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(r3.6): T12 — DeleteAccountDialog with type-email confirmation

shadcn AlertDialog. Confirm button gated on strict equality between
input value and session.user.email. Server-side recheck in
deleteAccountAction provides defense in depth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T13: DangerZoneSection client component

**Files**:
- Create: `src/components/settings/danger-zone-section.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/settings/danger-zone-section.tsx`:

```tsx
'use client';

import { DeleteAccountDialog } from './delete-account-dialog';

interface Props {
  userEmail: string;
}

export function DangerZoneSection({ userEmail }: Props) {
  return (
    <section
      className="rounded-lg border bg-[var(--semantic-caution)]/10 shadow-sm p-6 space-y-4"
      style={{
        borderColor: 'color-mix(in oklab, var(--semantic-caution) 50%, transparent)',
      }}
    >
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold text-foreground">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Actions in this section can&apos;t be undone.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 pt-2">
        <div className="space-y-1 max-w-prose">
          <p className="text-sm font-medium">Delete account</p>
          <p className="text-xs text-muted-foreground">
            Permanently delete your account and all associated data, including
            connected institutions, transactions, goals, and scenarios. This
            action cannot be reversed.
          </p>
        </div>
        <DeleteAccountDialog userEmail={userEmail} />
      </div>
    </section>
  );
}
```

Note: not wrapping in `<Card>` because the amber border replaces the standard hairline. Plain `<section>` with the amber-tinted treatment per design system §7.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/danger-zone-section.tsx
git commit -m "$(cat <<'EOF'
feat(r3.6): T13 — DangerZoneSection amber-tinted card

Amber border + amber tint per design system rule 'amber-tinted, never
red'. Destructive button asymmetric to container — calm container,
unambiguous CTA.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T14: settings/page.tsx rewrite (two-column shell wiring)

**Files**:
- Modify: `src/app/(app)/settings/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/(app)/settings/page.tsx`:

```tsx
import { eq, inArray } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { financialAccounts, users } from '@/lib/db/schema';
import { getSourceHealth } from '@/lib/db/queries/health';
import { snaptradeConfigured } from '@/lib/snaptrade/client';
import { ConnectedAccountsSection } from '@/components/settings/connected-accounts-section';
import { DangerZoneSection } from '@/components/settings/danger-zone-section';
import { DataExportSection } from '@/components/settings/data-export-section';
import { ProfileSection } from '@/components/settings/profile-section';
import { SettingsRail, type RailSection } from '@/components/settings/settings-rail';

const RAIL_SECTIONS: ReadonlyArray<RailSection> = [
  { id: 'profile', label: 'Profile' },
  { id: 'connected', label: 'Connected accounts' },
  { id: 'export', label: 'Data & export' },
  { id: 'danger', label: 'Danger zone' },
];

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  const [profileRow] = await db
    .select({ name: users.name, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const sources = await getSourceHealth(session.user.id);

  const accounts = sources.length
    ? await db
        .select()
        .from(financialAccounts)
        .where(
          inArray(
            financialAccounts.itemId,
            sources.map((s) => s.itemId),
          ),
        )
    : [];

  const accountsByItem = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const list = accountsByItem.get(a.itemId) ?? [];
    list.push(a);
    accountsByItem.set(a.itemId, list);
  }

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-8">
      <h1
        className="font-display italic text-3xl text-foreground md:text-4xl"
        style={{ letterSpacing: '-0.02em' }}
      >
        Settings
      </h1>

      <div className="flex gap-8">
        <SettingsRail sections={RAIL_SECTIONS} />

        <div className="flex-1 min-w-0 space-y-6">
          <section id="profile">
            <ProfileSection
              email={session.user.email}
              initialDisplayName={profileRow?.name ?? null}
              initialTimezone={profileRow?.timezone ?? 'UTC'}
            />
          </section>

          <section id="connected">
            <ConnectedAccountsSection
              sources={sources}
              accountsByItem={accountsByItem}
              snaptradeEnabled={snaptradeConfigured()}
            />
          </section>

          <section id="export">
            <DataExportSection />
          </section>

          <section id="danger">
            <DangerZoneSection userEmail={session.user.email} />
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Run full test suite**

```bash
npm run test 2>&1 | tail -3
```

Expected: 656 + 35 (T2 9 + T3 9 + T4 10 + T6 7) = ~691 passed. Confirm net delta is +35.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/settings/page.tsx
git commit -m "$(cat <<'EOF'
feat(r3.6): T14 — settings/page.tsx two-column shell wiring

Rewrite as 220px sticky rail (md+) + body with 4 sections: Profile,
Connected accounts, Data & export, Danger zone. Anchor links drive
scroll; IntersectionObserver tracks active section. Mobile fallback
stacks sections vertically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T15: RSC boundary grep acceptance (strike-3 watch)

**Files**: read-only check.

- [ ] **Step 1: Run the function-props grep on the page file**

```bash
grep -nE "onSelect=|onChange=|onPick=|onSubmit=|render=" src/app/\(app\)/settings/page.tsx
```

Expected: **zero matches**. The page is server-rendered; any function props would cross the RSC boundary and trip "Functions cannot be passed directly to Client Components" at render time.

If there are matches, find what's leaking and fix it (likely by extending a client wrapper around the offending prop config). Do not proceed to T16 until grep is clean.

- [ ] **Step 2: Document the clean grep in commit**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(r3.6): T15 — RSC boundary grep clean (strike-3 watch held)

grep -nE "onSelect=|onChange=|onPick=|onSubmit=|render=" \
  src/app/(app)/settings/page.tsx → 0 matches

Strike-3 RSC boundary watch (per CLAUDE.md Lessons learned) held for
R.3.6. All function props confined to 'use client' components.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### T16: Final acceptance gate (typecheck + tests + build)

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 2: Full test suite**

```bash
npm run test 2>&1 | tail -5
```

Expected: ~691 passed (656 R.3.5 baseline + 35 new R.3.6 tests). If any tests fail that weren't failing before, fix before proceeding.

- [ ] **Step 3: Production build**

```bash
npm run build 2>&1 | tail -30
```

Expected: 28+ routes compile (new `/api/export/transactions` route handler counts as a server endpoint, not a page route). No "Functions cannot be passed directly to Client Components" errors. No new build warnings beyond R.3.5 baseline.

- [ ] **Step 4: Verify dev runs**

If dev server isn't running:

```bash
npm run dev
```

Verify http://localhost:3000/settings loads after sign-in. Spot-check:
- (md+) rail visible, sticky, 4 items
- click each rail item → smooth scroll to section
- scroll body → active dot tracks
- Profile form: edit display name, Save enables, click Save → toast success
- CSV download button → file downloads, opens in spreadsheet app, columns present
- Delete dialog: open → input → Delete button stays disabled → type your email exactly → button enables → cancel closes safely
- (<md viewport) rail hidden, sections stack
- (light + dark) both themes pass parity walk

DO NOT actually confirm the delete unless you mean it — it cascades.

- [ ] **Step 5: Push to feat/redesign**

```bash
test "$(git rev-parse --abbrev-ref HEAD)" = "feat/redesign" && git push origin feat/redesign
```

Expected: push succeeds.

- [ ] **Step 6: Update redesign README phase status**

Modify `docs/redesign/README.md` line 26 (R.3.6 row):

```markdown
| R.3.6 Settings | ✓ shipped — on `feat/redesign` (two-column sticky rail, Profile editable name+timezone, Connected accounts restyled, Transactions CSV export, Danger zone account delete with type-email confirmation). [r3-6-settings/SPEC.md](r3-6-settings/SPEC.md) + [PLAN.md](r3-6-settings/PLAN.md) |
```

- [ ] **Step 7: Commit README + write handoff stub**

```bash
git add docs/redesign/README.md
git commit -m "$(cat <<'EOF'
docs(r3.6): T16 — mark R.3.6 Settings shipped in redesign README

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin feat/redesign
```

Then write a `docs/redesign/HANDOFF-YYYY-MM-DD-post-r3-6.md` mirroring the post-r3-5 handoff format. Capture: ship summary table, acceptance status, UAT axes confirmed/pending, plan deviations, open items at handoff, what's next (R.4).

---

## Spec coverage check (self-review)

| Spec section | Tasks |
|---|---|
| § 1 Locked decisions / Section IA — 4 sections | T9, T10, T11, T12, T13, T14 |
| § 2 Architecture — two-column sticky rail | T8, T14 |
| § 2 Architecture — IntersectionObserver active tracking | T8 |
| § 2 Architecture — RSC boundary discipline | T15 |
| § 3 Section contents — Profile fields (email RO + name + tz) | T9, T14 |
| § 3 Section contents — Connected accounts (token-only restyle) | T7, T10 |
| § 3 Section contents — Data & export anchor button | T11 |
| § 3 Section contents — Danger zone amber-tinted card | T13 |
| § 3 Section contents — Delete dialog type-email gate | T12 |
| § 4 Data layer — schema columns (timezone only per deviation #1) | T1 |
| § 4 Data layer — updateProfileAction + deleteAccountAction | T4 |
| § 4 Data layer — /api/export/transactions route handler | T5 |
| § 5 Pure helpers — rowsToCsv | T2 |
| § 5 Pure helpers — isValidIanaTimezone + TIMEZONE_OPTIONS | T3 |
| § 6 Testing strategy — pure helper tests | T2, T3, T4 |
| § 6 Testing strategy — StatePill restraint matrix | T6 |
| § 6 Testing strategy — manual UAT | T16 step 4 |
| § Edge cases — null display name placeholder | T9 (`placeholder="Add a display name"`) |
| § Risks — schema additions require db:push | T1 step 2 |
| § Risks — strike-3 RSC boundary | T15 |
| § Risks — StatePill regression before color edit | T6 → T7 ordering |
| § Risks — route handler middleware | T5 step 4 |
| § Open items — query helper extraction | settled inline in T14 (no separate `getUserProfile()` — page selects directly) |
| § Open items — DataExportSection server vs client | settled in T11 (server) |
| § Open items — IntersectionObserver root margin | settled in T8 (`-30% 0px -60% 0px`) |

All spec sections have task coverage. The 7 spec-listed "Open items for plan phase" all resolve in plan tasks or settle inline.

---

## Cross-references

- **Spec**: [SPEC.md](SPEC.md) — committed at `ef54b9b`
- **R.3.5 plan precedent**: [docs/redesign/r3-5-simulator/PLAN.md](../r3-5-simulator/PLAN.md) — T-numbering convention, atomic commit cadence
- **R.3.5 handoff**: [HANDOFF-2026-05-11-post-r3-5.md](../HANDOFF-2026-05-11-post-r3-5.md) — phase entry checklist pattern
- **Design system §7 Settings**: [claude-design-context/README.md](../../../claude-design-context/README.md) line 276 onward
- **CLAUDE.md**: RSC boundary lessons (strike-2 active), db:push strict-mode workaround, dev/build mutual exclusion
