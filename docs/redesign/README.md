# Foothold Redesign — milestone

## Why

Single-user finance tool needs a coherent identity to feel like a product, not a project. The shipped Foothold UI is functional but generic; the brand-design pass through Claude Design produced a complete identity (terrain-contour mark, position-dot motif, cartographic voice) that gives the product a north star: *"Where you stand, mapped honestly."*

This milestone replaces the visual + IA layer wholesale while preserving the data layer (sync, classifiers, forecasts, AI brief generation).

## Structure

- [SPEC.md](SPEC.md) — Phase R.0 spec, all 8 locked decisions, phase sequencing
- [claude-design-context/](../../claude-design-context/) — bundle from Claude Design (canonical reference)

## Phase status

| Phase | Status |
|---|---|
| R.0 | ✓ specced ([SPEC.md](SPEC.md)) |
| R.1 Foundation | ✓ shipped — merged to `feat/redesign` (tokens, fonts, FootholdMark, SignatureFooter, sidebar/top-bar restyle, page-bg textures) |
| R.2 Dashboard | ✓ shipped — merged to `feat/redesign` (NetWorthHero w/ trajectory + uncertainty band, KPIs w/ Runway, drift module fold, weekly brief editorial card fold, formatFreshness helper). [r2-dashboard/SPEC.md](r2-dashboard/SPEC.md) + [PLAN.md](r2-dashboard/PLAN.md) |
| R.3.1 Goals | ✓ shipped — merged to `feat/redesign` (sectioned pace leaderboard, archived toggle, restyled forms; T6 form restyle + T7 UAT polish landed). [r3-1-goals/SPEC.md](r3-1-goals/SPEC.md) + [PLAN.md](r3-1-goals/PLAN.md) |
| R.3.2 Recurring | ✓ shipped — merged to `feat/redesign` (layered IA: Hike alerts → PFC-clustered category sections → Inflows → Recently cancelled; merchant drilldown). [r3-2-recurring/SPEC.md](r3-2-recurring/SPEC.md) + [PLAN.md](r3-2-recurring/PLAN.md) |
| R.3.3 Transactions | ✓ shipped — merged to `feat/redesign` (operator-table date grouping, mobile shell, chips, page rewrite, revalidatePath). [r3-3-transactions/SPEC.md](r3-3-transactions/SPEC.md) + [PLAN.md](r3-3-transactions/PLAN.md) |
| R.3.4 Investments | ✓ shipped — on `feat/redesign` (portfolio_snapshot table + walkback chart, wholesale-IA restyle with Allocation/Holdings/Recent-activity sections, capability-aware freshness). [r3-4-investments/SPEC.md](r3-4-investments/SPEC.md) + [PLAN.md](r3-4-investments/PLAN.md) |
| R.3.5 Simulator | ✓ shipped — on `feat/redesign` (URL-state tabs Empty/Moves/Comparison, hand-rolled SVG ForecastChart with position-dot pulse + goal markers + 1Y/2Y range, 8 guided Move template forms abstracting the override editor, scenario cards row + goal impacts cards, narrative panel removed, /simulator/compare reduced to baseline-vs-one). [r3-5-simulator/SPEC.md](r3-5-simulator/SPEC.md) + [PLAN.md](r3-5-simulator/PLAN.md) |
| R.3.6 Settings | ✓ shipped — on `feat/redesign` (two-column sticky 220px rail w/ IntersectionObserver active tracking, Profile editable display name + timezone via users.name + new users.timezone column, Connected accounts restyled + StatePill palette migrated to --semantic-caution token, Data & export route handler streams transactions CSV, Danger zone amber-tinted with type-email-confirmation account delete; +35 vitest tests). [r3-6-settings/SPEC.md](r3-6-settings/SPEC.md) + [PLAN.md](r3-6-settings/PLAN.md) |
| R.4 Goals Moves + scenario unification | not started |
| R.5 Mobile rebuild | not started |
| R.6 Polish | not started |

## Parallel multi-user readiness track

The redesign restyles existing surfaces; **multi-user public release** requires additional work tracked separately at [docs/multi-user/AUDIT.md](../multi-user/AUDIT.md). Some audit findings (BLOCKERS) likely block production launch independent of redesign. Sequencing of the two tracks lands at R.1 kickoff.

## Resuming work

When picking up redesign work after a break, read in this order:
1. [SPEC.md](SPEC.md) for the locked decisions and phase sequencing
2. [claude-design-context/README.md](../../claude-design-context/README.md) for the design system contract
3. The phase-specific spec when starting a phase (created during phase kickoff)

## Locked decisions (one-line summary)

| # | Topic | Choice |
|---|---|---|
| 1 | Mobile timing | Rebuild after desktop port (R.5) |
| 2 | Mobile during gap | Keep current Foothold UI |
| 3 | `/drift` route | Fold into dashboard module |
| 4 | `/insights` route | Fold into dashboard editorial card |
| 5 | Receipts grid | Drop |
| 6 | Goals Moves | Build in goals phase (R.4) |
| 7 | Moves data model | Unify with simulator scenarios |
| 8 | `/transactions` operator features | Drop all (incl. bulk re-categorize) |

See [SPEC.md](SPEC.md) for rationale on each.
