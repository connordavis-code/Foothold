# Phase R.3.3 — Transactions SPEC

**Goal:** Restyle `/transactions` in Foothold tokens + adopt prototype IA refinements (date-grouped row sections, KPI strip, category chips, freshness strip) **while preserving all shipped operator-tier interactivity** (j/k/⌘↑/⌘↓// keyboard nav, ⌘K palette, tri-state select-all, bulk re-categorize with sonner undo, ⌘K cheatsheet). Third of six R.3 per-page sweep sub-phases.

**Date**: 2026-05-11
**Branch**: `feat/r3-3-transactions` (cut from `feat/redesign` post-R.3.2 merge at `466c31c`)
**Bundle reference**: [claude-design-context/foothold-transactions.jsx](../../../claude-design-context/foothold-transactions.jsx)
**Depends on**: [docs/redesign/SPEC.md](../SPEC.md) (R.0 master), [docs/redesign/r3-2-recurring/SPEC.md](../r3-2-recurring/SPEC.md) (precedent — KPI strip + freshness strip + per-page restyle pattern), [docs/redesign/r3-1-goals/SPEC.md](../r3-1-goals/SPEC.md) (precedent — page-header pattern)
**Estimate**: ~4-5 days

---

## Resumption context (for fresh sessions)

The previous session brainstormed all 6 locked decisions + 2 auto-locks via `AskUserQuestion`, presented all 5 design sections (architecture, data flow, component map, testing, task sequence), and committed this SPEC. **No code is on this branch yet.** To pick up: invoke `superpowers:writing-plans` with this SPEC as the source. The PLAN should mirror the structure of `docs/redesign/r3-1-goals/PLAN.md` and `docs/redesign/r3-2-recurring/PLAN.md`. Expected PLAN length: ~1900-2200 lines (R.3.3 has more files than R.3.2; matches expansion).

---

## Locked decisions

Six high-leverage decisions locked via `AskUserQuestion` during brainstorming. These are immutable for R.3.3; revisiting them requires a new SPEC pass.

1. **Scope**: **Hybrid** — preserve operator-tier interactivity (`OperatorShell` + j/k nav + ⌘K + bulk re-cat + cheatsheet + tri-state select-all), adopt prototype IA refinements (date-grouped sections, KPI strip, category chips, freshness strip). Reject "wholesale prototype IA" (would regress shipped operator features) and reject "restyle-only" (loses prototype's records-ledger framing). Note: this is intentionally DIFFERENT from R.3.1+R.3.2 wholesale-IA precedent because /transactions has shipped operator-tier infrastructure that has user value.
2. **KPI strip**: 4-stat per prototype — Spend / Income / Net / Showing. Mounts above the table chrome. Consumes new `getMonthlyTransactionTotals(userId)` query (single round-trip, mirrors `getDashboardSummary.monthSpend` exclusion list).
3. **Date grouping**: Adopted; `j`/`k` keyboard nav SKIPS group headers (they're non-interactive presentational elements between groups). Group headers render `MAY 11 · SUN ... -$84.27` with day-net signed total.
4. **Category chips**: Adopted, restrained palette per DESIGN.md "restrained-accent floor" rule. Foothold semantic tokens (`--accent-strong` for income/groceries; `--semantic-caution` variants for spend categories; `--text-2`/`--hairline` for transfers/loans). Reject "bold distinct hue per category" (Christmas-tree anti-pattern).
5. **Freshness strip**: Yes — mirror R.3.1 + R.3.2. Right-side of `<TransactionsPageHeader>` consumes `formatFreshness(getSourceHealth(userId))`.
6. **Page eyebrow**: "Records" — locked by `nav-routes.ts:47-49` placement under the Records sidebar group. Matches prototype.

### Auto-locked during design (non-blocking)

- **"Showing X / Y" denominator**: Drop the "/ Y" suffix; render as "Showing X · N filters applied" (or "unfiltered"). Avoids a second COUNT query; for high-row-count users (~10k+), the denominator was more noise than signal.
- **Mobile date grouping**: Add it — `groupTransactionsByDate` is pure + fast; running client-side after each `loadMoreTransactionsAction` append unifies daily-rhythm framing across breakpoints. Mobile shell currently uses sticky date headers in a flat list — this swaps to grouped sections.

---

## North Star

`/transactions` should read as the **records ledger of every charge and credit**, with daily-rhythm framing surfaced through grouped sections + day-net headers, and operator-tier productivity preserved through keyboard nav + bulk re-categorize. The prototype's KPI strip surfaces month-level Spend/Income/Net so operators don't have to scan the whole list to know "where am I this month." Category chips give visual scanability at restraint — a chip's hue codes for a small set of semantic groups (income / spend / structural), not for every distinct PFC.

---

## IA — final layout

```
RECORDS — Transactions                              Synced 5m ago
                                                    (caveat if any)

[ SPEND · MAY     ] [ INCOME · MAY  ] [ NET · MAY      ] [ SHOWING       ]
   $4,287              $5,500             +$1,213           47
   across 47 charges   1 deposit          spending less     12 filters applied
                                          than earned       (or "unfiltered")

[ search merchant, category, raw...  ] [ category v ] [ account v ] [ More ]

═══════════════ DESKTOP (md+) — OperatorShell ═══════════════

MAY 11 · SUN                                              −$84.27
┌──────────────────────────────────────────────────────────────────┐
│ □  May 11  Trader Joe's    [Groceries]    Chase ··4221  -$67.42 │  ← j/k cursor row
│ □  May 11  Sweetgreen      [Food/Drink]   Amex ··1009   -$16.85 │
└──────────────────────────────────────────────────────────────────┘

MAY 10 · SAT                                              −$144.18
┌──────────────────────────────────────────────────────────────────┐
│ □  May 10  Mass Audubon    [Donations]    Chase ··4221  -$50.00 │
│ □  May 10  Star Market     [Groceries]    Chase ··4221  -$94.18 │
└──────────────────────────────────────────────────────────────────┘

[ « previous   page 1 of 12   next » ]                             ← OperatorPagination

[ N selected · Re-categorize · Clear ]                              ← BulkActionBar (sticky bottom, only when selection > 0)

═══════════════ MOBILE (<md) — MobileTransactionsShell ═══════════════

[ Same KPI strip + filters above ]

MAY 11 · SUN                              −$84.27
  Trader Joe's              -$67.42
    [Groceries] · Chase ··4221
  Sweetgreen                -$16.85
    [Food/Drink] · Amex ··1009

MAY 10 · SAT                              −$144.18
  ...

[ infinite scroll via loadMoreTransactionsAction ]
```

### Empty state

Unchanged from current page (`accounts.length === 0`):

```
[Receipt icon]
No accounts connected yet
Once you link a bank or credit card via Plaid, transactions
sync automatically and surface here within minutes.
[Connect an account →]
```

Editorial chrome around the icon may be tweaked in T8 polish; copy is locked.

---

## Final component map

### New (3 components + 2 helper modules + 1 query module = 6 files)

| Path | Type | Purpose |
|---|---|---|
| `src/components/transactions/transactions-page-header.tsx` | server | Eyebrow "Records" + h1 "Transactions" + freshness strip; mirrors `<RecurringPageHeader>`/`<GoalsPageHeader>` |
| `src/components/transactions/transactions-summary-strip.tsx` | server | 4-cell KPI: Spend / Income / Net / Showing |
| `src/components/transactions/category-chip.tsx` | server | Palette-mapped pill, consumed by both desktop `<OperatorTable>` and `<MobileTransactionsShell>` |
| `src/lib/transactions/group-by-date.ts` (+ `.test.ts`) | pure | `groupTransactionsByDate(rows): Array<{dateIso, dayName, dayNet, rows}>`; ~10 vitest cases |
| `src/lib/transactions/category-palette.ts` (+ `.test.ts`) | pure | `categoryToTokens(category: string \| null): { bg, fg }`; ~6 vitest cases |
| `src/lib/db/queries/transaction-totals.ts` | query | `getMonthlyTransactionTotals(userId): { spend, income, net }`; UAT-validated against dashboard parity (no separate test file) |

### Modified (8 files)

| Path | Change |
|---|---|
| `src/app/(app)/transactions/page.tsx` | Wholesale rewrite: editorial header, KPI strip, freshness strip, responsive split mounted around restyled shells. Adds 2 new query calls (`getMonthlyTransactionTotals`, `getSourceHealth`) to the existing `Promise.all`. |
| `src/components/transactions/operator-table.tsx` | Date-grouped rendering (consumes `groups` prop from `groupTransactionsByDate`), `<CategoryChip>` per row, Foothold token swap. **DOM shape change** — see Risks. |
| `src/components/transactions/operator-shell.tsx` | Token-swap restyle; forwards new `groups` prop to `<OperatorTable>`; `selectedIndex` math UNCHANGED (still indexes flat `rows[]`, group headers are non-interactive). |
| `src/components/transactions/filter-row.tsx` | Token-swap restyle (input chrome, select chrome) |
| `src/components/transactions/bulk-action-bar.tsx` | Token-swap restyle (sticky bottom bar background, button chrome) |
| `src/components/transactions/operator-pagination.tsx` | Token-swap restyle (button chrome, page-indicator typography) |
| `src/components/transactions/transaction-detail-sheet.tsx` | Token-swap restyle (vaul drawer chrome, label hierarchy, action buttons) |
| `src/components/transactions/mobile-transactions-shell.tsx` | Token-swap restyle + date grouping (consume `groupTransactionsByDate` after each `loadMoreTransactionsAction` append) |

### Deleted: none

R.3.3 is additive + restyle. No obsolete components.

### Reused unchanged

- `src/components/transactions/category-picker.tsx` — already in shape; its consumer's chrome restyles, not the picker itself
- All server actions: `updateTransactionCategoryAction`, `bulkUpdateCategoriesAction`, `loadMoreTransactionsAction`
- ⌘K cheatsheet dialog component (Phase 6.7 — not in `transactions/` directory)
- `getTransactions`, `getDistinctCategories`, `getUserAccounts`, `getCategoryOptions`, `getSourceHealth`, `formatFreshness`

---

## Data flow

Single page-level `Promise.all`:

```ts
const [accounts, categories, categoryOptions, list, totals, sourceHealth] =
  await Promise.all([
    getUserAccounts(session.user.id),
    getDistinctCategories(session.user.id),
    getCategoryOptions(session.user.id),
    getTransactions(session.user.id, {
      page,
      accountId: searchParams.account,
      category: searchParams.category,
      dateFrom: searchParams.from,
      dateTo: searchParams.to,
      search: searchParams.q,
    }),
    getMonthlyTransactionTotals(session.user.id),
    getSourceHealth(session.user.id),
  ]);
```

Synchronous derivations in `page.tsx`:

```ts
const today = new Date();
const groups = groupTransactionsByDate(list.rows);
const freshness = formatFreshness({
  sources: sourceHealth.map((s) => ({
    name: s.institutionName ?? 'Source',
    lastSyncAt: s.lastSuccessfulSyncAt,
  })),
  now: today,
});
const activeFilterCount = countActiveFilters(searchParams);  // small inline helper
```

Both shells receive both `rows` AND `groups`:

```tsx
<OperatorShell
  rows={list.rows}
  groups={groups}
  accounts={accounts}
  categories={categories}
  categoryOptions={categoryOptions}
  page={list.page}
  totalPages={list.totalPages}
  totalCount={list.totalCount}
/>

<MobileTransactionsShell
  initialRows={list.rows}
  initialGroups={groups}    // NEW: pre-computed for first page
  accounts={accounts}
  categories={categories}
  categoryOptions={categoryOptions}
  initialPage={list.page}
  totalPages={list.totalPages}
  totalCount={list.totalCount}
  filters={{ ... }}
/>
```

`<MobileTransactionsShell>` re-runs `groupTransactionsByDate` client-side after each `loadMoreTransactionsAction` append to keep groups in sync with the appending row list.

### `getMonthlyTransactionTotals(userId)` shape

```ts
export type MonthlyTransactionTotals = {
  spend: number;   // SUM where amount > 0, current month, exclusion list applied
  income: number;  // SUM where amount < 0, current month, exclusion list applied (returned as positive)
  net: number;     // income - spend
};
```

Implementation: single SQL select with `SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS spend` + `SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS income`. Uses `currentMonthRange()` helper from `src/lib/db/queries/dashboard.ts` (or duplicates the inline if not exported). Same `external_items.user_id` scope + same exclusion list as `getDashboardSummary.monthSpend` (`TRANSFER_IN`, `TRANSFER_OUT`, `LOAN_PAYMENTS` excluded; investment-account transactions excluded).

**Load-bearing invariant**: the `spend` value MUST equal `getDashboardSummary().monthSpend` digit-for-digit for the same user at the same wall-clock instant. Any divergence is a bug.

### Drilldown contract preserved

- Desktop: row click in `<OperatorTable>` opens `<TransactionDetailSheet>` via `<OperatorShell>`'s existing handler
- Mobile: row tap in `<MobileTransactionsShell>` opens the same sheet from a bottom-anchored vaul drawer
- Filter URL params: `?account=`, `?category=`, `?from=`, `?to=`, `?q=` — unchanged shape; `<FilterRow>` continues to drive them via Next router
- Bulk re-categorize: `<BulkActionBar>` continues to consume `selectedIds` from `<OperatorShell>`; sonner-with-undo flow preserved

### Mobile responsive

`<MobileTransactionsShell>` remains the mobile path (CSS-only swap via `hidden md:block` / `block md:hidden`). Both shells render under the SAME page header + KPI strip — the responsive split is below the chrome.

---

## Pure-helper specs

### `groupTransactionsByDate(rows): Array<{ dateIso, dayName, dayNet, rows }>`

**Bucketing rules:**
- Group rows by `row.date` (ISO date string `YYYY-MM-DD`)
- `dayName` derived from the date via `Date.UTC()` to avoid timezone drift (e.g., `'2026-05-11'` → `'Sun'`)
- `dayNet` = sum of `row.amount` within group, signed (Plaid convention: positive = outflow, negative = inflow). Display layer flips the sign per existing convention.
- Output sorted by `dateIso` descending (newest day first, matches `getTransactions` order)
- Within each group: rows preserved in input order (caller's responsibility to pre-sort)

**Edge cases:**
- Empty input → empty array
- Single row → array of one group with one row
- All same day → one group
- Multiple days → groups in date-desc order

### `categoryToTokens(category: string | null): { bg: string, fg: string }`

**Mapping policy** (locked):

The function maps every PFC string to one of THREE token classes via a lookup table. PFC strings not in the table fall through to the structural class — this is the safe default that prevents Christmas-tree creep.

| Class | Token mapping | Example PFC strings |
|---|---|---|
| Income | `{ bg: "bg-[--accent-strong]/10", fg: "text-[--accent-strong]" }` | `INCOME`, `INCOME_WAGES`, `INCOME_DIVIDENDS`, `INCOME_INTEREST_EARNED`, any prefix `INCOME_*` |
| Caution | `{ bg: "bg-[--semantic-caution]/10", fg: "text-[--semantic-caution]" }` | `FOOD_AND_DRINK`, `FOOD_AND_DRINK_RESTAURANTS`, `MEDICAL`, `ENTERTAINMENT`, `PERSONAL_CARE` |
| Structural | `{ bg: "bg-[--hairline]", fg: "text-[--text-2]" }` | `TRANSFER_IN`, `TRANSFER_OUT`, `LOAN_PAYMENTS`, `BANK_FEES`, anything not matched above, null, empty string |

**Implementation note**: PLAN T1 step 1.1 enumerates the literal lookup table. The full Plaid PFC list has ~100 categories; the table only needs to enumerate the income + caution classes explicitly (everything else falls through to structural). This keeps the table to ~15-20 entries, reviewable at a glance.

### `getMonthlyTransactionTotals(userId): { spend, income, net }`

See data flow section above. UAT-validated via gate 7 (dashboard parity).

---

## UAT criteria

Walked top-to-bottom during T8 polish reservation:

### Visual chrome
- [ ] Page header reads `Records` (eyebrow) + `Transactions` (h1) + right-side `Synced Xm ago` (or "Sync pending" / "Stale" copy)
- [ ] KPI strip shows 4 cells: Spend / Income / Net / Showing — all using mono numerals + sub-line copy
- [ ] Net cell color: green when positive (`text-positive`), red when negative (`text-destructive`)

### KPI strip parity (gate 7)
- [ ] Open `/dashboard` and `/transactions` side-by-side. Spend cell on KPI strip matches dashboard's `monthSpend` cell digit-for-digit.

### Date grouping
- [ ] Desktop: rows render in groups with `MAY 11 · SUN ... −$84.27` headers
- [ ] Mobile: same grouping after token swap
- [ ] Day-net signed correctly (positive for income-heavy days, negative for spend-heavy days)
- [ ] Group headers are presentational only (cursor doesn't land on them via j/k)
- [ ] Empty groups never render (silent absence)

### Category chips
- [ ] Each row shows a category chip with palette-mapped colors per `categoryToTokens`
- [ ] No "Christmas-tree" effect (max 3-4 distinct hues visible at once)
- [ ] Chip text is legible in both themes
- [ ] Unknown categories fall back to structural-class chip

### Operator-tier features (regression watch — gates 10, 11, 12)
- [ ] **j/k stress test (T8 step explicit):** Press `j` 30× then `k` 30×; verify smooth row-by-row cursor movement crossing group boundaries with no skip / no stuck-on-header / no double-step
- [ ] `⌘↓` lands cursor on the LAST row of the LAST group (not on a header)
- [ ] `⌘↑` lands cursor on the FIRST row of the FIRST group
- [ ] `/` focuses search input; post-filter, cursor resets to first row of new result set
- [ ] `space` on focused row → multi-select toggle works
- [ ] `space` + `j` + `space` → multi-select spans rows correctly across group boundaries
- [ ] Tri-state select-all checkbox in header still toggles correctly (none → all → none, or all → some → all)
- [ ] Bulk re-categorize: select rows → BulkActionBar appears → re-categorize → sonner-with-undo fires
- [ ] ⌘K palette opens
- [ ] ⌘K cheatsheet dialog opens (existing keybinding)

### Filter contract preserved
- [ ] Search input + category select + account select all drive URL params correctly
- [ ] Filter URL params from external links (e.g., from /goals or /recurring drilldown) still resolve correctly with the new chrome
- [ ] "Showing X · N filters applied" displays correct count when filters active
- [ ] "unfiltered" displays when no filters active

### Mobile drilldown
- [ ] Tap row → bottom-sheet detail picker opens with row data
- [ ] Re-categorize from bottom sheet works; row updates after sync

### Drilldown from external pages
- [ ] `/recurring` row click → `/transactions?q=<merchant>&from=<6mo>` lands and filters correctly
- [ ] `/goals` row click → `/transactions?category=<pfc>&from=<monthStart>` lands and filters correctly

### Theme parity
- [ ] Dark mode walk: header + KPI strip + filters + table + chips + day-net headers all readable
- [ ] Light mode walk: same
- [ ] Bulk action bar visible in both themes

### Reactivity
- [ ] Bulk re-categorize updates rows without hard reload
- [ ] Cancel/undo via sonner reverts correctly
- [ ] After a sync (from /settings), new transactions appear without hard reload (`revalidatePath('/transactions')` should already be in `syncItemAction` — verify in T7 commit)

### Build + tests
- [ ] `npm run typecheck` clean
- [ ] `npm run test` passes (~+16 net cases)
- [ ] `npm run build` clean (27/27 pages, no RSC serialization errors)
- [ ] No NEW `'use client'` directives outside the existing operator-tier set

---

## Out of scope (explicit non-goals for R.3.3)

- **Drop operator-tier features** — explicitly rejected in scope decision; preserve all
- **Wholesale prototype IA adoption** — explicitly rejected; hybrid scope is the contract
- **Bulk delete / bulk note / bulk flag actions** — only re-categorize is supported today; no scope expansion
- **Full-row inline editing** (vs the existing TransactionDetailSheet model) — out of scope; bottom-sheet stays
- **Per-row flag glyphs (recurring/transfer/flagged) from prototype** — defer to T8 polish or a follow-on phase; not load-bearing for R.3.3
- **Saved filter views** ("My groceries" persistent filter set) — feature, not chrome; defer
- **Date-range picker UX upgrade** — current `?from=` `?to=` text input behavior preserved; no new picker
- **Other R.3 routes** (Investments, Simulator, Settings) → R.3.4–R.3.6
- **Mobile rebuild** → R.5

---

## Dependencies

**Upstream**:
- R.2 Dashboard shipped on `feat/redesign` (`formatFreshness`, freshness strip pattern)
- R.3.1 Goals shipped on `feat/redesign` (`<GoalsPageHeader>` pattern to mirror)
- R.3.2 Recurring shipped on `feat/redesign` (`<RecurringPageHeader>` + `<RecurringSummaryStrip>` patterns; `getSourceHealth` propagation; `revalidatePath` symmetry)
- Reliability Phase 3 shipped (`getSourceHealth(userId)` query)
- Phase 6.3-6.7 operator-tier infrastructure (`OperatorShell` keyboard nav, ⌘K palette, bulk re-cat with sonner undo, cheatsheet dialog) — preserved unchanged

**Downstream**:
- R.3.4 Investments will likely consume `<CategoryChip>` if it has a per-position categorization concept
- R.3.5 Simulator continues to consume the same forecast layer; no impact

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Date grouping breaks j/k DOM-traversal-based focus management** | **High** | T4 step explicitly verifies `<OperatorTable>` uses index-based (not DOM-query-based) row selection. If DOM-based, refactor `<OperatorTable>` to render group sections as siblings of `<table>` (each group = its own `<table>` with `<thead>` for the date header and `<tbody>` for the rows), so row-index → DOM mapping per-group is straightforward. T8 includes explicit j/k stress test step (gate 10). |
| Bulk re-categorize regressions from token-swap restyle | Medium | T5 commit-message checklist verifies sonner-with-undo + tri-state select-all still fire post-restyle. Touching ONLY chrome classes, never the imperative selection state. |
| KPI strip Spend value diverges from dashboard's `monthSpend` | Medium | T2 step explicitly mirrors `getDashboardSummary.monthSpend` exclusion list (`TRANSFER_IN`/`TRANSFER_OUT`/`LOAN_PAYMENTS`, no investment accounts) verbatim. T8 gate 7 verifies via side-by-side dashboard comparison. |
| Mobile date grouping breaks infinite scroll | Medium | T6 explicitly tests: load page 1 → scroll triggers `loadMoreTransactionsAction` → appended rows merge into existing groups (NOT replace) and group headers remain coherent. The pure helper runs on `[...existingRows, ...newRows]` after each append. |
| Category chip palette becomes "Christmas tree" | Low | Restrained palette (max ~3-4 hues across the entire visible set per scope decision #4). T8 gate 13 confirms visually. |
| `<OperatorTable>`'s DOM shape change breaks horizontal alignment of columns | Low | If using `<table>` semantics, column widths via `<colgroup>` should maintain alignment across grouped sections. If using CSS grid, a single grid wrapper around all groups maintains consistent column widths. T8 manual visual check. |
| `revalidatePath('/transactions')` not wired on sync action (gate from R.3.2) | Low | Already verified during R.3.2 T5 — `syncItemAction` and `syncAllItemsAction` both revalidate `/transactions` (R.3.2 commit `89a4c69` added the symmetric set: `/settings`/`/dashboard`/`/recurring`). Wait — R.3.2 added `/recurring` but did NOT add `/transactions`. Verify in PLAN T7 step that `/transactions` revalidatePath is added to BOTH actions if missing. |

---

## Locked decisions (carried)

1. **Scope**: Hybrid (preserve operator features + add prototype IA)
2. **KPI strip**: 4-stat (Spend / Income / Net / Showing)
3. **Date grouping**: Yes; j/k skips group headers
4. **Category chips**: Yes, restrained palette
5. **Freshness strip**: Yes, mirror R.3.1/R.3.2
6. **Page eyebrow**: "Records" (sidebar source-of-truth)

Auto-locked during design (non-blocking, may be revisited via `fix(r3.3):`):

- "Showing X / Y" denominator dropped — render as "Showing X · N filters applied"
- Mobile date grouping adopted (parity with desktop)
- Category-palette policy locked at SPEC level (3 classes + fallback rule); PLAN T1 enumerates the literal lookup table for known income + caution PFC strings

---

## Test plan summary

| Surface | Type | New cases |
|---|---|---|
| `src/lib/transactions/group-by-date.ts` | Unit (vitest) | ~10 |
| `src/lib/transactions/category-palette.ts` | Unit (vitest) | ~6 |
| `src/lib/db/queries/transaction-totals.ts` | UAT-validated (no separate test) | 0 |
| Component files | UAT only | 0 |

**Net**: +16 cases. Target post-R.3.3: 562 → ~578.

---

## Cross-references

- [docs/redesign/r3-3-transactions/PLAN.md](PLAN.md) — implementation plan (written next via writing-plans skill)
- [docs/redesign/SPEC.md](../SPEC.md) — R.0 master spec
- [docs/redesign/r3-1-goals/SPEC.md](../r3-1-goals/SPEC.md) — page-header pattern precedent
- [docs/redesign/r3-2-recurring/SPEC.md](../r3-2-recurring/SPEC.md) — KPI strip + freshness strip + per-page restyle precedent
- [docs/redesign/r3-2-recurring/PLAN.md](../r3-2-recurring/PLAN.md) — atomic-commit task sequence template
- [claude-design-context/foothold-transactions.jsx](../../../claude-design-context/foothold-transactions.jsx) — prototype reference
- [CLAUDE.md](../../../CLAUDE.md) — project orientation (especially Architecture > Editorial tokens, Lessons learned > server→client function props, Roadmap > Phase 6.3-6.7 operator-tier infrastructure that R.3.3 preserves)
