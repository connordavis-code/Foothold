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
| R.1 | ✓ planned ([r1-foundation/PLAN.md](r1-foundation/PLAN.md)) — ready to execute on `feat/redesign` branch |
| R.2 | not started |
| R.3 | not started |
| R.4 | not started |
| R.5 | not started |
| R.6 | not started |

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
