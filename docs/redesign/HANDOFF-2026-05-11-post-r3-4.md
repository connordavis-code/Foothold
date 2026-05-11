# Session handoff — 2026-05-11 (post R.3.4 ship)

> **R.3.4 Investments shipped on `feat/redesign`** in 14 commits across two
> sessions. Resume the redesign by brainstorming R.3.5 Simulator.
>
> **This file supersedes** `HANDOFF-2026-05-11-mid-r3-4.md`. Delete that
> file after the next session reads this one.

---

## R.3.4 ship summary

14 tasks shipped (T1 + T2 + T3-T13 + README phase-table update). 6 of
them landed in this session (T9-T14); the prior session shipped T1-T8.

| Layer | Commits / files |
|---|---|
| Data | `89b7364` portfolio_snapshot table + RLS · `2f5b8db` walkbackPortfolio · `4a72d74` classifyHolding + buildAllocation · `e23bf40` getPortfolioHistory query · `3fa1aad` recordPortfolioSnapshot + dispatcher integration |
| Components | `56cdafb` InvestmentsPageHeader · `7d5dad4` PortfolioHero · `9cd1e3e` PerformanceChart (client) · `913fb4c` AllocationSection · `14bad61` HoldingsView (client) · `ecb3a1f` InvestmentTxnsTable token swap + date grouping · `a4232cc` MobileInvestments shrink |
| Wiring | `275ea24` page rewrite + delete obsolete components (group-by-toggle, holdings-table, portfolio-summary) + revalidatePath wiring on plaid + snaptrade actions |
| Docs | `023a531` README phase-table update (also backfilled R.3.1, R.3.2, R.3.3) |

| Acceptance | Status |
|---|---|
| Typecheck | Clean (post T13 + post README update) |
| Tests | 611 / 611 |
| Build | `next build` 28 routes compile, no RSC serialization errors, `/investments` 4.2 kB / 204 kB |
| Working tree | Clean (R.3.4 commits only; see "Open items" below for CLAUDE.md note) |

### Plan deviations worth knowing

Every deviation has its rationale in the relevant commit message; this
is a tldr index:

1. **Editorial tokens** (T9, T10, T11, T13 EmptyState) — PLAN repeatedly
   used Tailwind opacity syntax (`/70`, `/12`) on arbitrary-value color
   tokens inside inline `style` or with bare-HSL tokens. CSS rejects
   it, the bg/text just doesn't render. Fixed at every site:
   - `var(--accent)/70` (inline style) → `hsl(var(--accent) / 0.7)`
   - `var(--text-3)/60` (inline style) → `color-mix(in srgb, var(--text-3) 60%, transparent)`
   - `bg-[--accent]/12 text-[--accent]` (Tailwind class) →
     `bg-accent/12 text-accent` (uses the theme-registered named
     color from tailwind.config.ts, which emits proper
     `hsl(var(--accent) / 0.12)`).
2. **`groupTransactionsByDate` generalized** (T11) — was strictly typed
   to `TransactionListRow[]`. Made generic on
   `Row extends {date: string; amount: number}` so investment txns can
   reuse it. Fully backward-compat — `/transactions` consumer still
   infers `Row = TransactionListRow`. Group-by-date test 10/10 green.
3. **Page freshness selector** (T13) — PLAN dereferenced
   `s.byCapability.investments` as a `CapabilityState` discriminated
   union (`cap?.kind === 'tracked' ? cap.lastSuccessAt : null`), but
   `byCapability` returns the `CapabilityClassification` string union.
   Switched to `s.lastInvestmentSyncAt` (canonical timestamp from
   Phase 3 reliability work) + filtered sources by
   `capabilities.includes('investments')` so credit-only Plaid items
   don't pollute the never-synced branch of formatFreshness.
4. **revalidatePath wiring** (T13) — PLAN listed plaid/actions.ts +
   sync/actions.ts. sync/actions.ts only delegates, so the real
   touch-points were plaid/actions.ts (3 sites: syncItemAction,
   syncAllItemsAction, disconnect) + snaptrade/actions.ts (2 sites:
   reconcile + disconnect). Added `/investments` to all 5.
5. **Branch cut skipped** (T14) — per the mid-r3-4 handoff's option B
   recommendation. R.3.4 commits live directly on feat/redesign; the
   merge-commit ceremony added no value once 8 commits had already
   landed there.

### Browser UAT — DEFERRED (manual)

The plan's T14 Step 2 calls for a manual browser walk through SPEC's
UAT criteria. **This was deferred** — same constraint as Reliability
Phase 4/5 (auth-gated dev server, magic-link login required, agent
can't observe rendered UI). Acceptance evidence collected at the type
+ build layer:

| UAT axis | Verification source |
|---|---|
| Chart seam continuity (dashed→solid) | Visual — pending |
| Capability-aware freshness | Code review: `s.lastInvestmentSyncAt` + cap filter (page.tsx); freshness.ts logic unchanged |
| 1D tab disabled when no closePrice | Visual — pending; covered by T8 prop contract |
| Theme parity (light/dark) | Visual — pending |
| Snapshot table written on sync | Pending — verify after first manual sync: `SELECT user_id, snapshot_date, total_value FROM portfolio_snapshot ORDER BY created_at DESC LIMIT 5;` |
| Allocation bar palette | Visual — palette uses tailwind theme colors + CSS-valid alpha grading; not a typecheck/build risk |
| Empty state on no brokerage | Visual — pending; component exists per code review |

User to walk these axes when restarting `npm run dev`. Fix any issues
with `fix(r3.4): <desc>` commits per plan.

## Open items at handoff

### CLAUDE.md uncommitted edits — NOT MINE

`git status` shows CLAUDE.md modified locally; the diff is prose
compression on the "Multi-aggregator: external_item + dispatcher"
section. **I did not touch this file.** Likely a parallel agent or a
hook auto-tightening prose. The R.3.4 commits explicitly add-by-path
to avoid sweeping it in. Surface this to the user before next push so
they decide whether to keep, revert, or merge with intent.

```bash
git diff CLAUDE.md   # inspect
git restore CLAUDE.md   # if not wanted
git add CLAUDE.md && git commit   # if wanted, with a real message
```

### Dev server

Was running on :3000 at session start. Stopped before T13's build
step per CLAUDE.md > "Don't run `npm run build` while `next dev` is
running." Restart for T14 UAT:

```bash
npm run dev
```

### Push state

`feat/redesign` is **13 commits ahead of origin/feat/redesign**
(8 from the prior session + 5 from this one — T9-T13 + README). Push
when ready:

```bash
git push origin feat/redesign
```

## What's next: R.3.5 Simulator

### Reading list

Order: SPEC.md (milestone) → `claude-design-context/README.md` (design
system contract) → existing `/simulator` codebase for IA pickup. The
simulator surface is significantly larger than R.3.4 in component
count + state-management complexity; expect a longer SPEC + PLAN cycle.

- `docs/redesign/SPEC.md` — milestone-level decisions (R.3.x sub-phases
  are described in row R.3 of the timeline table).
- `claude-design-context/README.md` — token vocabulary, motion, naming.
- `src/app/(app)/simulator/page.tsx` — current entry point.
- `src/components/simulator/` — current override editor, scenario
  components, narrative panel.
- `src/lib/forecast/` — pure functions consumed by simulator; no R.3.5
  changes expected here (data layer is solid post-Phase 4).
- CLAUDE.md > Architecture notes > "Forecast engine consumes raw PFC
  totals" + "override appliers use signed math" — load-bearing
  invariants for any visual change.
- CLAUDE.md > Roadmap > "Phase 4 — Forecast engine + simulator" —
  what shipped, including the cache-keyed narrative panel.

### Likely brainstorm axes for the spec session

These are the choices that probably need locking before plan time:

1. **Override editor IA** — current sticky 7-section accordion. R.3
   moved toward editorial-card patterns elsewhere (recurring's
   category-clustered overview, /investments's section stack). Should
   the override editor stay accordioned, or fold into a single
   continuous scroll with section eyebrows? Tradeoff: scannability
   (continuous) vs. focused editing (accordion).
2. **Scenario-saving UI** — desktop currently uses an inline transform
   on the bar; mobile uses a vaul drawer. R.3.4's `<MobileInvestments>`
   shrinkage suggests asymmetry between desktop/mobile is fine when
   each picks the form factor's natural primitive. Worth confirming.
3. **Forecast chart token swap** — `<ForecastChart>` currently uses
   Recharts with shadcn-default palette. R.3.4 standardized
   `--chart-1..6` brand-tinted earth/green and dual-line conventions
   in `<PerformanceChart>`. R.3.5's chart should align.
4. **Narrative panel placement** — currently a side panel; could
   become a header strip à la R.2's editorial brief card, or stay
   side-panel. Depends on screen real estate after override editor
   restyle.
5. **Compare route** (`/simulator/compare`) — operator-tier diff
   surface. R.3.4 didn't touch it; does R.3.5 sweep it too, or split
   into its own sub-phase?
6. **Goal diff cards** — currently below the chart; R.3 has been
   collapsing such artifacts into single sections. Worth a fresh look.

### Phase entry checklist

Same pattern as R.3.4 entry:

```bash
git fetch origin
git checkout feat/redesign
git status                          # must be clean
git log --oneline -3                # confirm 023a531 README is HEAD
npm run typecheck                   # must be clean
npm run test 2>&1 | tail -3         # must be 611 passed
```

Then invoke `/gsd-spec-phase` or jump straight to brainstorming with
`superpowers:brainstorming` (skill list at session start).

## Memory cues for the next session

User auto-memory should already carry:
- "Foothold Redesign R.3.3 Transactions shipped (2026-05-11)"
- "Plaid Balance approved 2026-05-11"

Worth saving (next agent at session start, if relevant):
- R.3.4 Investments shipped on `feat/redesign` 2026-05-11; resume
  redesign by brainstorming R.3.5 Simulator per this handoff.

---

**Session ends here.** Pick up by reading this file + running the
entry checklist above.
