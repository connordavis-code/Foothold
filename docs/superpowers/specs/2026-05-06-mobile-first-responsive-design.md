# Mobile-first responsive design — Design Brief

**Date:** 2026-05-06
**Skill:** superpowers:brainstorming (5 questions, 5 design sections, all approved)
**Status:** awaiting confirmation before craft / implementation
**Companion of:** `2026-05-05-foothold-redesign-design.md` (the desktop redesign this extends to phone)

---

## 1. Feature Summary

Foothold currently *reflows* below 768px but no surface has been
deliberately designed for phone. The desktop sidebar (`hidden md:flex`)
vanishes with no replacement, the operator-tier tables on
`/transactions`, `/investments`, and `/drift` (flag-history) require
horizontal swiping to read 6 columns, and default tap targets sit at
36–40px — below the 44px touch floor. The user has stated that mobile
is the *primary* surface for this app: 80% of phone use is the
"where am I standing financially today" glance, with light editing
(re-categorize a transaction, pause a recurring stream) as a
nice-to-have escape hatch. This brief retrofits a deliberate mobile
shell — bottom-tab navigation, mobile list renders for the operator
tables, vaul half-sheets for edit affordances, and a portrait pass on
`/simulator` — without touching the desktop operator-tier interaction
that the existing redesign earned.

## 2. Primary User Action

**Glance the standing, edit when something looks off.** The user
opens Foothold on their phone to (a) see today's cash position and
balances, (b) verify recent activity, and (c) when a row looks
mis-categorized, tap it to fix. Bulk operations (j/k nav,
multi-select, ⌘K palette, scenario A/B) stay desktop-only by design;
mobile is read-and-react.

## 3. Design Direction

- **Color strategy:** No new hues. The editorial token system
  (`--surface-paper` / `-elevated` / `-sunken`, single-foreground hue
  + amber for elevated state) carries to mobile unchanged. Active
  bottom-tab uses the existing foreground hue + accent dot; no
  brand-color introduction.
- **Theme scene sentence:** *"Operator on a train, glancing at the
  phone for cash + recent moves, tapping a row that looks off,
  swiping the half-sheet closed and putting the phone away — same
  warm-paper canvas, same JetBrains Mono on every figure, just
  reorganized so the thumb does the work."* Light by default; dark
  via the existing parity-mapped tokens.
- **Anchor references:** iOS Mail (bottom-tab + edge-anchored
  sheets), Mercury mobile (operator-feel preserved on phone with
  no pixel concessions to "consumer-friendly" decoration), Linear
  iOS app (hamburger drawer for the long-tail of nav items, primary
  4 always reachable).
- **Visual probes:** Approved via the brainstorming visual companion
  — three nav patterns (chose hybrid), three row densities
  (chose two-line stacked), three tap-to-edit patterns (chose
  vaul half-sheet at ~60%).

## 4. Scope

- **Fidelity:** Production-ready.
- **Breadth:** All 9 surfaces reachable + glanceable on phone. Of
  those, deliberately mobile-designed: `/`, `/recurring`,
  `/investments`, `/transactions` (the bottom-tab primaries) plus
  `/drift` flag-history (reuses the same `<MobileList>`) plus
  `/simulator` (portrait pass — accordion sections, square chart).
  Accept default reflow on `/goals`, `/insights`, `/settings` —
  current layout already works at small widths.
- **Interactivity:** Bottom-tab nav (one tap to primary), hamburger
  drawer (two taps to long-tail), tap-to-edit half-sheet on table
  rows, filter sheet on `/transactions`. No j/k keyboard nav, no
  ⌘K palette trigger, no bulk select on mobile — those stay
  `≥md` only.
- **Time intent:** 3 phases, atomic commits per phase. Phases 1
  and 2 each ship coherent value alone; Phase 3 is opt-in polish.

## 5. Layout Strategy

### Breakpoint behavior

Single seam at the existing `md:` breakpoint (768px).

- **`<md` (mobile):** sidebar hidden (existing). Bottom-tab bar
  appears. Top-bar shows hamburger (left), page title (center),
  sync pill + theme toggle + user menu (right). Command palette
  trigger hidden.
- **`≥md` (tablet/desktop):** sidebar appears (existing). Bottom-tab
  bar hidden. Hamburger hidden. Top-bar identical to today.

No tablet-specific design. Mobile and desktop share the same data
queries and routes; only the rendering differs.

### Bottom-tab bar (`<MobileTabBar>`)

Fixed-position strip at bottom of viewport. `h-14` (56px) +
`safe-area-inset-bottom` for the iPhone home indicator. Four equal
slots, each ~25vw × 56px (well above 44px floor):

| Slot | Route | Lucide icon | Label |
|---|---|---|---|
| 1 | `/` | `LayoutDashboard` | Home |
| 2 | `/recurring` | `Repeat` | Recurring |
| 3 | `/investments` | `TrendingUp` | Invest |
| 4 | `/transactions` | `ArrowLeftRight` | Activity |

Active tab: foreground hue + accent dot beneath the icon. Inactive:
muted-foreground. `usePathname()` resolves active state. Tap closes
any open sheet and navigates.

### Hamburger drawer (`<MobileNavDrawer>`)

vaul `Sheet` from the left, `w-72`. Triggered by the hamburger
button in the top-bar left slot. Contents: the existing sidebar's
`Today / Plan / Records` nav groups (single source of truth at
`src/components/nav/nav-routes.ts`), all 9 routes. Selecting a route
closes the drawer. Backdrop dismisses; swipe-left dismisses.

### Operator table mobile render

`<md` swap to `<MobileList>` (date-grouped). `≥md` keeps existing
`<OperatorTable>`. Both read the same query result; both renders are
emitted in the HTML and gated by Tailwind's `hidden md:block` /
`block md:hidden` (CSS-only swap — see §12 for the SSR rationale).

Row composition (the **two-line stacked** pattern):

```
[description]                                  [amount]
[category · account]
```

- description: `text-sm` foreground hue, truncate
- amount: `font-mono tabular-nums text-sm`, foreground for outflow,
  positive token for inflow
- category · account: `text-xs text-muted-foreground`, joined with
  ` · `, truncate

Row height: `min-h-[60px]`, full-row tap target. Section headers
above each date group (existing `humanizeDate` formatting). Flat
dividers between rows; no shadows.

### Half-sheet edit (`<TransactionDetailSheet>`)

vaul `Drawer` from bottom, ~60% viewport height by default. Drag
handle visible. Swipe-down dismisses. Backdrop tap dismisses.

Contents:

- Header: merchant + date + account, amount in `text-2xl font-mono`
- Category select (the existing override mechanism; server action
  reuses today's `categoryOverrideId` flow on the
  `transactions.categoryOverrideId` column)
- Notes input — **omitted in v1.** Add when a notes column ships
  on `transactions`. Mocked in the brainstorm visual for shape only.
- Plaid PFC line: informational, muted, `text-xs`

No bulk actions, no checkbox, no kbd shortcuts.

### Filter sheet (`<MobileFilterSheet>`)

vaul `Drawer` from bottom, ~60% height, triggered by a "Filters"
button in the page chrome. Contents: existing FilterRow controls
re-laid as single-column. Apply / Reset at the bottom. Active filter
count as a badge on the trigger button when any filter is set.

### Page-level mobile chrome

Above each operator-table page (`/transactions`, `/investments`),
sticky strip below the top-bar:

```
[search input]                                 [Filters]
[N transactions matching · filtered]
```

Search input full-width minus the Filters button. Result count
muted, `text-xs`. Pagination: defer to implementation between
infinite-scroll and existing prev/next.

### `/simulator` portrait pass

- **Override editor:** vertical accordion stack, one section at a
  time open by default, all collapsed initially. Header per section
  shows active-override count badge ("Income · 2"). Inputs full-row,
  44px equivalent.
- **Chart:** Recharts `aspect-square` on `<md`, `aspect-video` on
  `≥md`. Legend below chart, not inline. Tooltip via tap (Recharts
  `trigger="click"` or equivalent) since hover doesn't exist on
  touch.
- **Goal-diff cards:** `grid-cols-1 md:grid-cols-2` (confirm or set).
- **Save scenario / actions:** sticky bar at the bottom of the page,
  above the bottom-tab bar, so the primary CTA is always
  thumb-reachable while scrolling overrides.
- **`<NarrativePanel>`:** unchanged. Already a vertical text panel.

## 6. Key States

- **Empty / loading:** existing per-route loading and empty states
  preserved. Mobile shell renders around them unchanged.
- **No transactions matching filter** *(mobile)*: existing empty
  string ("No transactions match…") renders in the list slot;
  Filters button shows active badge so user can dismiss filters
  without scrolling.
- **Drawer open while navigating:** drawer closes on route change.
- **Half-sheet open while syncing:** the syncPill in the top-bar
  shows status as today; sheet stays open. Re-categorize action's
  `revalidatePath()` still fires; the underlying list updates
  behind the open sheet so closing it shows the new state.
- **Reauth banner:** continues to render at the existing position
  in the layout. Mobile shell does not re-position it.

## 7. Interaction Model

### New components

- `<MobileTabBar>` — `src/components/nav/mobile-tab-bar.tsx`. Client
  component (`"use client"`), reads `usePathname()` for active state.
  Mounts in `(app)/layout.tsx` after `<main>`, before the closing
  body. Hidden at `≥md` via Tailwind.
- `<MobileNavDrawer>` — `src/components/nav/mobile-nav-drawer.tsx`.
  Client component owning open state, vaul Sheet wrapper, reuses
  the same `nav-routes.ts` data. Trigger lives in the top-bar.
- `<MobileList>` — `src/components/operator/mobile-list.tsx`. Generic
  date-grouped list primitive. Field config object: how to render
  the top-line description, the muted second line, and the right
  amount. Used by transactions, investments holdings/txns, and
  drift flag-history.
- `<TransactionDetailSheet>` — `src/components/transactions/`. Owns
  the half-sheet UI + the category-override server action wiring.
- `<MobileFilterSheet>` — generic enough to share between
  `/transactions` and `/investments` if the existing FilterRow
  generalizes; otherwise per-surface.

### Component edits

- `<TopBar>` — add hamburger button at left for `<md`; existing
  contents shift to "page-title center, controls right" at `<md`.
- `<Button>` — `size="default"` from `h-10` to `h-11`. Audit all
  usages for visual impact (most of the codebase uses defaults; the
  uplift adds 4px to button height globally, which is acceptable
  inside the editorial spacing system).
- `(app)/layout.tsx` — mounts `<MobileTabBar>` after `<main>`.
  `<main>` gets `pb-14 md:pb-0` so content doesn't hide behind
  the tab bar.
- `<OperatorTable>` consumers — render both `<OperatorTable>` and
  `<MobileList>` in the same page, gated by `hidden md:block` /
  `block md:hidden`. CSS-only swap; no JS media query, no hydration
  mismatch risk. Cost is one extra hidden subtree in the HTML — fine
  given how table HTML is structured.

### Existing patterns preserved

- `categoryOverride` server action — unchanged, the half-sheet
  reuses it.
- Plaid sync flow, error states, sync pill — unchanged.
- Auth split (edge-safe `auth.config.ts` vs Node `auth.ts`) —
  unchanged.
- Editorial tokens, dark mode, and `humanizeCategory` formatting —
  unchanged.

### Removed on mobile (deliberate)

- j/k keyboard nav (kbd shortcut HUD, the `?` cheatsheet)
- ⌘K palette (trigger hidden at `<md`; the palette code stays)
- Bulk select / bulk re-categorize / bulk delete
- Filter row inline (replaced by the filter sheet)

These are operator-tier features that are user-tested at desktop;
the mobile design is the read+react surface, not a touch port of
desktop.

## 8. Content Requirements

### Tab labels

Concise, single word where possible. The decided four:

- **Home** (not "Dashboard" — the brand verb is "where am I
  standing", which is "home")
- **Recurring** (not "Subs" or "Bills" — the existing surface name)
- **Invest** (truncated from "Investments" to fit the tab; alternative:
  keep full word at smaller font, decide during craft)
- **Activity** (not "Txns" — friendlier without losing precision;
  matches the dashboard's "Recent activity" framing). Final call
  is craft-time A/B between "Activity" and "Txns".

### Drawer items

The existing `nav-routes.ts` `Today / Plan / Records` group structure
is preserved. Drawer surfaces: Goals, Insights, Drift, Simulator,
Settings (the surfaces not in the bottom tabs). Group headings
match desktop sidebar copy.

### Half-sheet copy

- Title region: `[merchant]` + `[date · account]`
- Amount: standalone, mono, large
- Section labels: `.text-eyebrow` recipe — "Category", "Note",
  "Plaid PFC"
- Save state: implicit (category change persists on select via
  server action; no Save button needed for v1)

## 9. Phasing & rollout

Three commits / PRs / sub-phases, in order. Each shippable alone.

### Phase 1 — Foundation + nav shell

- Install `vaul` (`npm install vaul`).
- `<Button size="default">` from `h-10` to `h-11`. Audit usages for
  visual side effects.
- New components: `<MobileTabBar>`, `<MobileNavDrawer>`, hamburger
  trigger inside `<TopBar>`.
- Mount `<MobileTabBar>` in `(app)/layout.tsx`. Add `pb-14 md:pb-0`
  to the `<main>` content slot.
- Acceptance: every existing page reachable via tabs + drawer at
  `<md`; `≥md` looks identical to today.

### Phase 2 — Operator tables on mobile

- New components: `<MobileList>`, `<TransactionDetailSheet>`,
  `<MobileFilterSheet>`, plus the breakpoint switch on the three
  affected pages.
- Wire `<md` rendering on `/transactions`, `/investments`,
  `/drift` flag-history.
- Wire half-sheet edit through existing `categoryOverride` server
  action.
- Acceptance: full glance + light-edit loop works on a phone for
  the three table surfaces. Filter sheet opens, applies, dismisses.
  No horizontal scroll on any operator-tier table.

### Phase 3 — `/simulator` mobile pass

- Override editor → accordion stack with active-count badges.
- Recharts chart `aspect-square` on `<md`; legend below; tooltip on
  tap.
- Sticky save bar at bottom (above the tab bar).
- Acceptance: scenario edit + run + save all work on touch.

## 10. Open items for craft

These are deliberately deferred to implementation (impeccable's
design ethos pass):

- **Active tab indicator style:** dot vs underline vs background tint
  — pick during craft based on which holds up at the smallest icon
  size in the editorial token system.
- **Tab 4 label:** "Activity" vs "Txns" — A/B at real-data render.
- **Pagination on mobile `/transactions`:** infinite-scroll (matches
  glance-mode UX) vs preserved prev/next (matches desktop). Both
  defensible.
- **`<MobileList>` field config shape:** generic config object vs
  separate components per surface. Decide based on whether
  Investments holdings + Drift flags actually share enough.
- **Drawer animation:** vaul defaults vs framer-motion override. Vaul
  is the safer floor.

## 11. Test plan

Most of this work is UI/component — Vitest predicates only carry
where there's a clean "given X, output Y" shape.

- **Predicate tests (Vitest):** `<MobileList>` field-extraction logic
  if abstracted; bottom-tab active-state derivation if the
  pathname-matching logic is non-trivial. No tests for raw rendering.
- **Lighthouse mobile** on `/`, `/recurring`, `/investments`,
  `/transactions` after each phase. Targets: tap targets ≥44px,
  no horizontal scroll, viewport meta correct, contrast ratios pass.
- **Manual UAT on real iPhone** at end of each phase. Golden path:
  open app → glance dashboard → tap Activity tab → tap a row →
  change category → swipe sheet closed → return to Home.
- **Dark mode UAT** (deferred from /recurring shipping) lands
  alongside Phase 1 since the mobile shell touches every surface.

Test count target: +5 to +10 vitest regressions (predicates only),
final count visible after Phase 1.

## 12. Risks / non-obvious

- **Vaul + Radix Dialog stacking.** vaul mounts via portal like
  Radix Dialog; if the half-sheet ever overlaps with the existing
  AlertDialog (the goals/simulator delete confirms), z-index needs
  audit. Likely fine since they don't co-occur on mobile primaries.
- **Button h-10 → h-11 ripple.** Anywhere a button is composed into
  a tight horizontal layout (filter row toolbars, table cell
  actions) gets 4px taller. Visual sweep required during Phase 1
  to catch any layout misfires; most of the codebase uses defaults
  inside generous grid spacing.
- **`useMediaQuery` SSR mismatch.** If the mobile/desktop swap uses
  a JS media query, hydration mismatches are likely. Prefer
  Tailwind's `hidden md:block` / `block md:hidden` pattern (CSS-only
  swap, both renders ship to the client; the wrong one is hidden).
  This costs ~one extra render in HTML but no JS-runtime branch.
- **Plaid Production approval is gating other work** — this brief
  is independent and ships value with sandbox data; not blocked.
