# W-04 — Plaid plaintext access_token in JS heap during initial backfill

> **Severity:** Warning
> **Related files:** `src/lib/plaid/actions.ts`, `src/lib/plaid/sync.ts`, `src/components/plaid/*` (Link UX)
> **Source:** `docs/reviews/2026-05-05-REVIEW.md` § W-04

---

## Problem

`exchangePublicToken` in `actions.ts:46-78` does three things in one server action:

1. Calls `plaid.itemPublicTokenExchange` — receives plaintext `access_token` in `exchange.data.access_token`.
2. Persists the **encrypted** token via `db.insert(plaidItems)` with `encryptToken(...)`.
3. Calls `await syncItem(inserted.id)` — which decrypts the token in `sync.ts:56` (`item.accessToken = decryptToken(item.accessToken)`) and runs the full backfill (~30s for a real institution).

The plaintext token is held in JavaScript closures for the entire ~30s window:
- `exchange.data.access_token` is referenced from `exchangePublicToken`'s scope.
- `item.accessToken` (post-decrypt) is referenced from `syncItem`'s scope and from `accs`/`item` references inside every helper (`syncAccountsForItem`, `syncTransactionsForItem`, `syncInvestmentsForItem`, `syncRecurringForItem`).

`SECURITY.md`'s threat model covers at-rest leaks (DB dump). Heap-dump-via-crash isn't mainline but is realistic on serverless platforms that snapshot state for cold-start optimization or post-mortem analysis. Vercel function timeout is 30-60s on this app's plan, which sits right at the boundary of "sync completes" vs "function aborted mid-sync with state still in memory".

---

## Why deferred from auto-fix

The fix is a UX restructure, not a code patch. After it lands:
- `exchangePublicToken` returns immediately (no backfill data yet).
- The user sees an empty dashboard for the few seconds the deferred sync takes.
- The Plaid Link onSuccess callback in the browser must trigger the deferred sync and surface its progress.

This is a UX decision worth making explicitly, not auto-applying.

---

## Architecture

**Two parts, applied in order. Part A is the real defense; Part B is hygiene.**

### Part A — defer the inline sync

Current flow (browser → server):
```
PlaidLink onSuccess → exchangePublicToken(publicToken)  [holds plaintext 30s]
                       ├── itemPublicTokenExchange (plaid)
                       ├── insert plaid_item (encrypted)
                       └── syncItem(itemId) [decrypt, full backfill]
                       returns
PlaidLink onSuccess → router.refresh() → user sees data
```

New flow:
```
PlaidLink onSuccess → exchangePublicToken(publicToken)  [holds plaintext ~50ms]
                       ├── itemPublicTokenExchange (plaid)
                       └── insert plaid_item (encrypted)
                       returns { itemId }
PlaidLink onSuccess → syncItemAction(itemId)  [holds plaintext 30s, but token re-decrypted from DB, never on the way in]
                       └── full backfill
                       returns
PlaidLink onSuccess → router.refresh() → user sees data
```

Key win: the `exchange.data.access_token` reference is gone before the long-running work. The sync still holds plaintext during its run, but the **first-time-seen** plaintext window collapses from ~30s to ~50ms.

`syncItemAction` already exists (`actions.ts:84-101`). Reuse it.

### Part B — null accessToken in syncItem finally

Mechanical hygiene. In `sync.ts:syncItem`, wrap the body in try/finally:

```ts
export async function syncItem(itemId: string): Promise<SyncSummary> {
  const [item] = await db.select().from(plaidItems).where(...);
  if (!item) throw new Error(...);
  item.accessToken = decryptToken(item.accessToken);
  try {
    const accountsResult = await syncAccountsForItem(item);
    // ... rest of body
    return { ... };
  } finally {
    item.accessToken = '';
  }
}
```

This drops the strong reference so V8's GC can reclaim sooner. It does NOT zero the previous heap allocation (V8 buffer arenas don't expose that); it just removes one of the live references. In practice this is cosmetic, but it costs nothing and the `finally` guarantees execution even on throw.

---

## Implementation steps

Atomic commits.

### Step 1 — instrument the browser-side onSuccess (read-only investigation)
Find the Plaid Link integration component. Likely at `src/components/plaid/link-button.tsx` or similar. Document the current onSuccess flow; identify where `exchangePublicToken` is called.

### Step 2 — change `exchangePublicToken` return type
`actions.ts:46-78`:
- Drop `await syncItem(inserted.id)` (line 77).
- Change return type from `Promise<void>` → `Promise<{ itemId: string }>`.
- Return `{ itemId: inserted.id }`.

### Step 3 — update browser onSuccess to chain deferred sync
In the Plaid Link component:
```tsx
const onSuccess = async (publicToken: string, metadata: any) => {
  setStatus('exchanging');
  const { itemId } = await exchangePublicToken(publicToken, {
    institution_id: metadata.institution.institution_id,
    institution_name: metadata.institution.name,
  });
  setStatus('syncing');
  try {
    await syncItemAction(itemId);
  } catch {
    // Sync failed; the item is connected but data is empty. Surface a
    // toast and let the user retry via the sync pill on /settings.
    toast.error('Connected, but initial sync failed. Use Sync now on /settings.');
  }
  setStatus('done');
  router.refresh();
};
```

Loading-state UX:
- "Connecting…" while exchange runs (~50ms — barely visible).
- "Loading your data…" while sync runs (~30s).
- Sonner toast on completion.

### Step 4 — add try/finally + null in syncItem
`sync.ts:47-82`:
- Wrap body lines 58-81 in try block.
- Add `finally { item.accessToken = ''; }`.

### Step 5 — same treatment for markItemReconnected and syncItemAction
Both call `syncItem` and reuse the same code path. After Step 4, they inherit the protection — no additional changes needed.

But: `createLinkTokenForUpdate` in `actions.ts:149-175` decrypts the access_token in JS scope to pass into `linkTokenCreate`. Apply the same try/finally null-out:
```ts
const decrypted = decryptToken(item.accessToken);
let response;
try {
  response = await plaid.linkTokenCreate({
    // ...
    access_token: decrypted,
    // ...
  });
} finally {
  // Mutating a const string just creates a new binding; the original
  // is still referenced inside Plaid's SDK call. There's no way to
  // zero the original from userland — the best we can do is not hold
  // an extra reference past the call. This is hygiene, not defense.
}
return response.data.link_token;
```

(Honest comment: there isn't an effective null-out here because the SDK retains its own reference. Leave the call shape as-is, document the limitation.)

---

## Test plan

- Existing tests should still pass; this is a sequencing change, not a math change.
- Manual UAT: connect a sandbox Plaid item, verify:
  - Exchange completes within ~1s (was ~30s).
  - Sync runs visibly in a separate phase with its own loading state.
  - Dashboard renders with sync'd data after the sync phase.
- Failure UAT: simulate sync failure (e.g. throw in syncItem inside a try block during dev). Verify the user sees the toast and can retry via /settings.

---

## Risks / open questions

- **Two server-action round-trips instead of one.** Adds ~100ms latency to the post-Link flow. Worth it for the ~30s reduction in plaintext window.
- **Race condition on item-not-yet-active.** `syncItemAction` requires `plaid_item.status = 'active'`. New items insert with status='active' by default — verify in `db/schema.ts`. If status defaults to something else, sync will throw "item not found or not active" and the user will see an empty dashboard until next manual sync.
- **Rollback affordance.** If exchange succeeds but the user closes the tab before sync triggers, the item exists with no data. The sync pill on /settings will pick it up next time (it iterates active items). Acceptable failure mode.
- **Webhook race.** Plaid may fire `SYNC_UPDATES_AVAILABLE` between exchange and sync. The webhook handler calls `syncItem` itself, so concurrent syncs could collide. Either accept the race (idempotent upserts) or guard with a "sync in progress" flag on plaid_item. Not a regression — same race exists today between sync and webhook.

---

## Out of scope

- **Background-job queue for sync.** A proper queue (Inngest, Trigger.dev, BullMQ) is overkill for a single-user app and adds infrastructure dependencies. Keep the sync inline-from-action; just decouple it from the exchange.
- **Encrypting in-memory.** No portable way to do this in V8; even Buffer.allocUnsafe leaks via the same heap. Threat model accepts.
- **Vercel function isolation hardening.** Out of app-layer scope.

---

## Acceptance criteria

- [ ] `exchangePublicToken` returns `{ itemId }` without inline sync.
- [ ] Browser onSuccess explicitly calls `syncItemAction(itemId)` after exchange.
- [ ] `syncItem` body wrapped in try/finally; `item.accessToken` nulled in finally.
- [ ] UAT: sandbox connect → data appears within ~30s with two visible phases.
- [ ] UAT: sync failure → toast + dashboard usable + retry path via /settings.
- [ ] Two commits:
  - `refactor(plaid): defer inline sync from exchangePublicToken (closes W-04 part A)`
  - `chore(plaid/sync): null accessToken reference in syncItem finally (closes W-04 part B)`
