# Foothold UI Redesign — Design Spec

**Date:** 2026-05-05
**Status:** Brainstormed, awaiting user review before implementation handoff
**Implementation skill:** `pbakaus/impeccable` (in a fresh session, after install completes)

---

## 1 · Goals & non-goals

### Goals
- Lift Foothold's UI from "competent shadcn-default SaaS" to a **confident, editorial daily-use finance pro-tool**.
- Establish a reusable design system (tokens, primitives, motion language) that the rest of the app can adopt over time.
- Redesign 3 hero surfaces — Dashboard, Transactions, Investments — at both visual and IA levels.
- Add the cross-cutting plumbing the current app lacks: top bar, ⌘K palette, toast system, skeleton loading.

### Non-goals (this phase)
- **Simulator redesign** — explicitly deferred. The user has a future UX rethink queued for `/simulator`; redesigning it now would be wasted work. The system this spec produces must compose cleanly with whatever Simulator becomes, but does not redesign it.
- Drift, Insights, Goals, Recurring, Settings page redesigns — they inherit the new shell and design tokens automatically; per-page IA/visual rework is a follow-on phase.
- Mobile native app, dark-mode polish (dark mode tokens exist; explicit dark-mode QA is follow-on).
- New backend, new schema, new server actions. This is a UI-only phase.

---

## 2 · Locked decisions

| Decision | Choice |
|---|---|
| Surface scope | App shell + Dashboard + Transactions + Investments (4 surfaces total, Simulator excluded) |
| Depth | Both visual refresh + IA restructure |
| Design direction | **Confident & editorial** — Monzo / Ramp / Copilot Money lineage |
| Library posture | Free to add 2–3 well-chosen libs (sonner, cmdk, framer-motion) |
| Per-surface dialect | C (Card Newsfeed) as default · A (Editorial) borrowed for `/insights` later · B (Operator) for Transactions + Investments |

---

## 3 · Per-surface IA

Each subsection lists current section structure (from a fresh codebase scan), the proposed new IA, and the rationale.

### 3.1 Dashboard — Card Newsfeed
**File:** `src/app/(app)/dashboard/page.tsx` (308 lines)
**Current sections (top to bottom):** ReauthBanner · eyebrow + h1 · balances summary · recurring snapshot (top 5 outflows + monthly total) · GoalsStrip · recent transactions list.

**Proposed (7 cards in deliberate order):**
1. **Hero card** — net worth, monthly Δ, sparkline. Gradient background (`--gradient-hero`). Big display number, tabular numerals.
2. **Split card** — Liquid balance (left) · EOM Projected (right). Two paired metrics with sub-text (`"across 4 accounts"`, `"on track for [goal]"`).
3. **Drift flags** *(conditional)* — surfaces only if `/drift` has active flags. Warning-tinted card with quick-link to `/drift`. Hidden when no flags.
4. **Goals strip** — existing `<GoalsStrip>` component (`src/components/goals/goals-strip.tsx`), restyled as a horizontally scrollable card row.
5. **Recurring this week** — next 7 days of recurring outflows, not the monthly total. Pulled from existing `getRecurringStreams()`.
6. **Insight teaser** — single sentence from latest weekly insight (existing `insight` table) + "Read more →" link to `/insights`.
7. **Recent activity** — 5 most recent transactions as compact card rows (NOT a mini-table; the table lives at `/transactions`).

**Why this ordering:** today's dashboard answers "what are my balances?" The redesign answers "what should I look at right now?" — drift flags and weekly insights are surfaced; recurring shifts from "monthly total" (passive number) to "next 7 days" (actionable window).

**Implementation notes — what exists vs. what's new:**
- `netWorth`, `assets`, `liabilities`, `investments`, `monthSpend`, `hasAnyItem` — **already returned** by `getDashboardSummary()` in `src/lib/db/queries/dashboard.ts`. Use as-is.
- **NEW** `getNetWorthMonthlyDelta(userId)` — diff current `netWorth` vs first-of-month snapshot. Backfill source TBD (could derive from `transactions` aggregate; cheaper as a separate query).
- **NEW** `getNetWorthSparkline(userId, days = 30)` — daily net-worth series for the hero sparkline. Probably 30 points; if too expensive, fall back to weekly (4 points).
- **NEW** `getUpcomingRecurringOutflows(userId, days = 7)` — filter `recurringStreams` to ones with predicted next-occurrence in the window. Existing `getRecurringStreams` returns all streams without next-occurrence filtering.
- **NEW** `getLatestInsight(userId)` — single-row read of newest entry in `insight` table for the teaser. (`/insights` page reads weekly history; this just needs the latest.)
- `getGoalsWithProgress`, `getRecentTransactions`, `getItemsNeedingReauth` — **already exist**, used as today.
- Drift flags: read from existing `/drift` queries (`src/lib/db/queries/drift.ts`); surface count + most-elevated category.

### 3.2 Transactions — Operator
**File:** `src/app/(app)/transactions/page.tsx` (189 lines), `src/components/transactions/filters.tsx` (149 lines), `src/components/transactions/pagination.tsx` (70 lines)
**Current:** filters component above table, paginated rows, standard SaaS shape.

**Proposed:**
- **Top bar (page-level):** title + breadcrumb + ⌘K palette trigger + sync status pill + result count (`"1,247 transactions"`)
- **Inline filter row** above table (no sidebar): date range, account, category, search — operator-styled, tight, command-line-feel
- **Mono table:**
  - JetBrains Mono for date and amount columns
  - Tighter row height (`py-1.5` vs current `py-3`)
  - Sticky header
  - Row hover reveals an inline expand for category override + notes
  - Multi-select via shift-click; selected count surfaces a bulk-action bar (re-categorize)
- **Keyboard nav:** `j` / `k` for prev/next row, `⌘↑` / `⌘↓` for page nav, `/` to focus search

**Rationale:** existing table is functionally fine. The missing layer is *operator ergonomics* — power tools earn loyalty through density + keyboard.

**Implementation notes:**
- Existing query that powers the table — preserve. Filter component (`src/components/transactions/filters.tsx`) needs structural rework, not data changes.
- Multi-select / bulk re-categorize requires **NEW** server action `updateTransactionCategories(userId, txIds, categoryId)` in `src/lib/transactions/actions.ts` (this directory may not exist yet).
- ⌘K palette transaction-search: reuses the existing search query path; no new query needed.

### 3.3 Investments — Operator
**File:** `src/app/(app)/investments/page.tsx` (259 lines)
**Current:** stacked per-account `<Card>`s, each with header (name + mask + subtype + total + gain/loss) and inner `<Table>` of holdings. Account-grouped.

**Proposed:**
- **Top:** portfolio total + day Δ / month Δ / YTD Δ in operator-grid (3-cell mono layout)
- **Holdings master table** — flat across accounts by default:
  - Columns: ticker · qty · price · value · day Δ · total Δ · account
  - Mono numerals, sticky header, sortable
- **Group-by toggle:** account ↔ asset type ↔ flat (default: flat)
- **Recent investment txns** — secondary mono table below (uses same operator pattern as `/transactions`)

**Rationale:** the per-account cards answer "what's in this account?" — a flat-holdings master answers "where am I overexposed?" faster, which is the more valuable question for a power user. Account view stays one click away.

**Implementation notes:**
- Existing `getHoldingsByAccount(userId)` returns `AccountWithHoldings[]` (per-account groups). Keep for the "group by account" toggle.
- **NEW** `getHoldingsFlat(userId)` — flatten across accounts; each row carries `account.name` + `account.mask`. One query, no client-side flattening.
- **NEW** `getPortfolioSummary(userId)` — `{ total, dayDelta, monthDelta, ytdDelta }`. Day/month/YTD deltas need either a price-history table (doesn't exist yet) or a daily snapshot. Cheaper near-term: derive `dayDelta` from `holding.cost_basis` vs `holding.current_value`; defer month/YTD or compute from `investment_transaction` aggregates.
- Recent investment txns: existing `investment_transaction` table — **NEW** `getRecentInvestmentTransactions(userId, limit = 20)` paralleling `getRecentTransactions`.

### 3.4 Shell — App-wide
**Files:** `src/app/(app)/layout.tsx` (25 lines), `src/components/nav/app-sidebar.tsx` (95 lines), `src/app/layout.tsx` (root)

**Sidebar (keep + refine):**
- Today / Plan / Records grouping preserved (commit `7254b23`)
- Active item: soft tinted background using `--accent` over a subtle hover state, with `--radius-card` corners
- Sign-out: removed from sidebar (lifts to top-bar user menu)
- Mobile: collapses to a Sheet drawer (vaul or shadcn `<Sheet>`)

**New top bar (currently nonexistent):**
- Sticky, full-width over content area (sidebar runs floor-to-ceiling beside it)
- Left: page title + breadcrumb
- Center: ⌘K command palette trigger (search-styled input — clicking opens cmdk modal)
- Right: sync status pill (timestamp from `last_sync_at`, click to trigger `/api/sync`) · user avatar dropdown (settings link, sign-out)
- Reauth state: when any Plaid item needs reauth, the sync pill becomes an amber "Reconnect" pill — replaces the current `<ReauthBanner>` which takes too much vertical space

**Brand cleanup:**
- Fix root `<title>` in `src/app/layout.tsx` from `"Finance"` → `"Foothold"` (commit `7254b23` updated the nav but missed metadata)
- Add Foothold favicon if not present
- Consider a wordmark treatment for the sidebar brand (currently just text)

---

## 4 · Design system additions

### 4.1 Tokens (additions to `src/app/globals.css`)

Existing tokens (slate base, positive/negative semantics, dark-mode parity) **stay**. Add:

```css
:root {
  --surface-paper: 60 33% 97%;          /* warm canvas behind card-feed pages */
  --surface-elevated: 0 0% 100%;        /* card on canvas */
  --surface-sunken: 60 20% 94%;         /* nested card / table-row hover */
  --gradient-hero: linear-gradient(135deg, hsl(160 40% 18%) 0%, hsl(160 30% 28%) 100%);
  --radius-card: 0.75rem;
  --radius-pill: 9999px;
  --motion-fast: 100ms;
  --motion-base: 200ms;
  --motion-slow: 400ms;
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-in-out-quart: cubic-bezier(0.76, 0, 0.24, 1);
}

.dark {
  --surface-paper: 224 30% 6%;
  --surface-elevated: 224 30% 9%;
  --surface-sunken: 224 25% 11%;
  --gradient-hero: linear-gradient(135deg, hsl(160 30% 22%) 0%, hsl(160 25% 14%) 100%);
}
```

Wire these into `tailwind.config.ts` `colors` extension as `surface-paper`, `surface-elevated`, `surface-sunken`. Add `borderRadius.card` mapped to `--radius-card`.

### 4.2 Type scale

- **Inter** (already loaded) — UI default
- **JetBrains Mono** (already loaded) — numerals, operator surfaces (Transactions, Investments tables, ⌘K palette)
- **Source Serif 4** (new — Google Fonts) — editorial accents only. Wired via `next/font/google` in `src/app/layout.tsx` as `--font-serif`. Used in `/insights` narrative when that page is later redesigned, plus optional pull-quote treatments. **Not used on Dashboard / Transactions / Investments in this phase.**

Display utilities (Tailwind plugin or inline classes):
- `.text-display-lg` → 48 / 52, weight 600, tracking -0.02em
- `.text-display` → 32 / 36, weight 600, tracking -0.015em
- `.text-eyebrow` → 10 / 14, uppercase, tracking 0.08em, weight 500

### 4.3 Shadcn primitives to install

Run `npx shadcn@latest add` for each. All Radix dependencies are already in `package.json`:

```
dropdown-menu  dialog  tabs  tooltip  skeleton
separator  scroll-area  sheet  command  popover  toast
```

(`button`, `card`, `input`, `label`, `table` already installed — keep.)

### 4.4 New libraries (3)

| Lib | Purpose | Approx size |
|---|---|---|
| `sonner` | Toast system (server-action feedback, sync status, errors) | ~3 KB |
| `cmdk` | Backs the ⌘K command palette (already a shadcn dep, but worth pinning) | ~5 KB |
| `framer-motion` | Page transitions, hero gradient shimmer, card stagger, focus glow | ~50 KB |

`vaul` (mobile drawer) is **optional / deferred** — only add if mobile feels important this phase. shadcn `<Sheet>` covers the basic case.

---

## 5 · Cross-cutting interactions

### 5.1 ⌘K command palette
- Opens via `⌘K` / `Ctrl+K` from anywhere
- Three sections: **Navigate** (jump to any page), **Search** (transactions by merchant / amount), **Actions** (sync now, mark category, generate insight, etc.)
- Lives at top level (mounted in `(app)/layout.tsx`)

### 5.2 Toast system (sonner)
- Global `<Toaster position="bottom-right" />` in `(app)/layout.tsx`
- Server actions trigger via `toast.success()` / `toast.error()` from client wrappers
- Replace any ad-hoc inline status text (e.g., simulator's current `⌘S` save toast) with sonner

### 5.3 Empty states
- Each in-scope surface gets character. Current empty state on `/investments` ("Connect a brokerage…") is functional but generic — feels like an apology, not a moment.
- Pattern: illustration / glyph + headline + sub-copy + primary CTA.

### 5.4 Loading
- Hero card: gradient-shimmer skeleton matching final card shape
- Tables: row skeletons (5–10 rows) with `<Skeleton>` primitive
- Goals strip: card-shaped skeletons in a horizontal row

### 5.5 Errors
- Inline error cards within page flow, with retry CTA
- Reauth banner: replaced by persistent amber pill in top bar (see §3.4)

### 5.6 Page transitions
- framer-motion stagger on card-feed pages (Dashboard primarily)
- Gated on `prefers-reduced-motion: reduce` — fall back to instant
- Subtle: `y: 8 → 0`, `opacity: 0 → 1`, stagger 30ms per card

### 5.7 Focus management
- Visible focus ring on all interactive elements (currently relies on browser default — varies by browser)
- Modal/dialog focus trap (handled by Radix primitives)
- ⌘K palette returns focus to triggering element on close

---

## 6 · Implementation phasing

This is too large for a single PR. Recommended sub-phase breakdown for impeccable to execute:

### Phase 6.1 — Foundation
**Ships:** new tokens, expanded shadcn primitives, new libs added, top bar shell rendered, brand cleanup, sidebar restyle, sync-pill replaces reauth banner.
**Why first:** every other sub-phase depends on these primitives. Top bar is visible immediately as proof of life.

### Phase 6.2 — Dashboard (Card Newsfeed)
**Ships:** rewritten `dashboard/page.tsx` with the 7-card sequence, new hero card component, split card component, drift-flags conditional, restyled goals strip, recurring-this-week computation, insight teaser, recent activity card list.
**Why second:** dashboard is the highest-traffic surface; the card-feed pattern established here cascades to other surfaces in follow-on phases.

### Phase 6.3 — Transactions (Operator)
**Ships:** rewritten table with mono numerals, dense rows, sticky header, inline filter row, multi-select + bulk actions, keyboard nav, ⌘K integration for search.

### Phase 6.4 — Investments (Operator)
**Ships:** flat-holdings master table, group-by toggle, operator-grid summary, recent investment txns table. Reuses Operator patterns from 6.3.

Each sub-phase is independently shippable and live. Atomic commits within each per the project's GSD conventions (CLAUDE.md commit style is `feat(area): description`).

---

## 7 · Success criteria

The redesign is successful when:

1. **Visual:** the app no longer reads as "default shadcn." A blind test against Mercury / Copilot Money / Linear should place it in the same conversation, not several tiers below.
2. **IA:** opening the dashboard answers "what should I look at right now?" within 2 seconds, not "what are my balances?"
3. **Density:** the Transactions table fits ~30% more rows in the same viewport without feeling cramped (mono numerals + tighter row height).
4. **Feedback:** every server action yields a toast within 200ms (sonner). No silent saves.
5. **Keyboard:** a power user can navigate, search, and act without touching the mouse on Dashboard / Transactions / Investments.
6. **Motion:** transitions feel intentional, not gratuitous, and respect `prefers-reduced-motion`.
7. **No regressions:** all 133 existing vitest tests still pass; typecheck + lint clean.

---

## 8 · Out of scope (explicit)

| Item | Why deferred |
|---|---|
| Simulator redesign | UX rethink queued separately; redesigning twice is wasteful |
| `/insights`, `/drift`, `/goals`, `/recurring`, `/settings` redesigns | Inherit new shell + tokens automatically; per-page work is a follow-on phase |
| Dark mode polish | Tokens defined; explicit QA is follow-on |
| Mobile-first redesign | Responsive collapse only; native app patterns deferred |
| Backend / schema / server-action changes | UI-only phase |
| `/auth` (login, verify, error) redesign | Not user-facing daily; leave as-is |
| Vaul drawer | Optional; only if mobile becomes critical mid-phase |

---

## 9 · References

**Files to read first:**
- `src/app/(app)/layout.tsx` — current shell (25 lines, almost empty)
- `src/components/nav/app-sidebar.tsx` — current sidebar with grouping
- `src/app/(app)/dashboard/page.tsx` — current dashboard structure
- `src/app/(app)/transactions/page.tsx` + `src/components/transactions/*` — current transactions
- `src/app/(app)/investments/page.tsx` — current investments
- `src/app/globals.css` — existing tokens (extend, don't replace)
- `tailwind.config.ts` — extend `colors`, `borderRadius`
- `components.json` — shadcn config (`new-york` style, slate base)
- `src/lib/utils.ts` — `formatCurrency`, `formatPercent` helpers
- `CLAUDE.md` — project conventions (commit style, auth split, sign convention, etc.)

**Key project conventions impeccable must respect:**
- Server components by default; `"use client"` only when needed
- Imports use `@/...` alias — no relative imports across `src/`
- Server actions live in `src/lib/<domain>/actions.ts`, called from `<form action={...}>`
- Currency: always `formatCurrency()` from `@/lib/utils`
- Plaid sign convention: `transaction.amount` positive = OUT, negative = IN (flip at display)
- Auth split: import `{ auth }` from `@/auth`, never `auth.config`
- Comments: WHY only, not WHAT
- Vitest tests live alongside source as `.test.ts` siblings

**Recent commits worth scanning** (last 10):
```
64cafb9 feat(simulator): inline annualized impact preview per override
fc783de feat(simulator): zero defaults + placeholders for new override stubs
ff9477a feat(simulator): inline save UX (toast + name editor + ⌘S)
63f68ff fix(simulator): clamp negative numeric inputs + show field path on save error
a18edf5 feat(simulator): denser GoalDiffCards with target/monthly/progress
de21c9a fix(simulator): stack override fields so they fit the 260px column
```

---

## 10 · Handoff

This spec is the input to the **`pbakaus/impeccable`** skill, executed in a **fresh Claude Code session** after the install completes (Claude Code agent must be selected in the picker; current session was started before that selection happened).

Recommended fresh-session prompt:

> Read `docs/superpowers/specs/2026-05-05-foothold-redesign-design.md` and use the `impeccable` skill to execute Phase 6.1 (Foundation). Do not start Phase 6.2+ until 6.1 is reviewed and committed.
