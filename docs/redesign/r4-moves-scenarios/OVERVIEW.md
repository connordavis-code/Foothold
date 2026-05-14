# R.4 — Moves + Scenario Unification (Scope Review)

> Pre-kickoff scope brief. Captures what's currently understood about R.4
> from the milestone SPEC, R.3.x post-ship handoffs, and the existing
> simulator/goals code. Not a locked SPEC — open questions at the bottom
> need answers before the formal `SPEC.md` + `PLAN.md` are written.
>
> **Status:** Not started. R.1 → R.3.6 shipped on `feat/redesign`.
> **Estimated effort:** 1–2 weeks (per milestone SPEC.md:190).
> **Next step:** run phase-kickoff to resolve open questions → write
> `SPEC.md` (locked decisions) → `PLAN.md` (task index).

---

## TL;DR

R.4 has **two interlocking halves** that ship together because they
share the same underlying primitive:

1. **Goals Moves feature** — each goal gets attached actions ("cancel
   sub", "reduce category", "reroute income") with `$/mo` deltas,
   replacing the placeholder coaching sentence R.3.1 ships in the
   Moves slot.
2. **Move data-model unification** — Moves graduate from a UX layer
   over existing override types into a first-class DB primitive.
   Scenarios become *named bundles of moves*; goals and simulator
   share one override-applier path.

R.3.5 deliberately left the data model alone so R.4 could land both
halves coherently. Without R.4, the simulator's "Moves" are still raw
override dicts under the hood, and `/goals` cards have nothing to
actually attach.

---

## What's in scope

### Half 1 — Goals Moves

- Replace R.3.1's `composeCoaching` filler sentence with a real Moves
  surface on each `<GoalCard>`.
- Reuse the simulator's existing 8 Move templates as the starting
  catalog (cancel sub, pause sub, reduce category by %, reroute income,
  one-off lump, skip recurring instance, change recurring amount, goal
  target adjust).
- Persist Move attachments per goal — multiple moves per goal allowed.
- Surface aggregate `$/mo freed` on the goal card; flow that delta into
  the existing pace projection so applying a Move visibly shifts the
  goal's verdict (Behind → On pace).

### Half 2 — Move primitive + scenario unification

- New `move` table (or JSON-on-scenario column — see open question Q2).
  Columns at minimum: `id`, `userId`, `templateKey`, `params` (JSON),
  `attachedTo` (discriminated: `goalId | scenarioId | null`).
- Refactor `src/lib/forecast/apply-overrides.ts` to accept `Move[]`
  instead of the current bag-of-override-types. Existing applier
  invariants stay locked: signed math through the chain,
  `clampForDisplay` only at the render boundary, applier-level dedup
  by natural key (see CLAUDE.md > "Forecast override appliers use
  signed math").
- Migrate `scenarios` table: existing scenarios' raw override dicts
  rehydrate into Move rows during the migration. Scenario record
  becomes `{ id, name, moveIds[] | moves[] }` (shape per Q2).
- Single applier path means a Move attached to a goal and the same
  Move type living inside a scenario produce identical forecast
  effects.

---

## Explicitly out of scope (deferred)

| Item | Where it lives | Why deferred |
|------|----------------|--------------|
| Investment what-if simulator (Phase 4-pt2) | Milestone SPEC.md:211 | Needs its own brainstorm on modeling depth |
| Resurrecting the narrative panel on `/simulator` | r3-5-simulator/SPEC.md:26 | Backend survived R.3.5; conditional resurfacing is its own decision |
| Scenario picker dropdown deletion | r3-5-simulator/SPEC.md:28 | R.3.5 kept it as fallback for >5 scenarios; R.4 revisits based on usage data |
| Multi-user tenancy audit | Milestone SPEC.md:32–33 | Parallel concern, tracked separately |
| LLM-generated Move suggestions | — | Pure-deterministic catalog only in R.4; AI suggestions are post-R.6 territory |

---

## Hard dependencies (all green)

- **R.3.1 Goals shipped** — `<GoalCard>` IA with Moves slot exists and
  is filled by `composeCoaching`. R.4 replaces the slot.
- **R.3.5 Simulator shipped** — Move templates, applier functions,
  scenario cards, goal-impact cards all in place. R.4 promotes the
  underlying data, not the UX.
- **R.3.6 Settings shipped** (2026-05-12) — all foundation tokens,
  fonts, card recipe, eyebrow utilities locked. No design-system
  churn during R.4.
- **Existing forecast applier system** — `src/lib/forecast/` is the
  refactor target, not a new build.
- **Existing scenario model** — `src/lib/db/schema.ts:scenarios` +
  `src/lib/forecast/scenario-actions.ts` are the migration target.

No external blockers (no Plaid / SnapTrade / Resend / Vercel work
required).

---

## Open questions (resolve before SPEC.md)

| # | Question | Why it matters |
|---|----------|----------------|
| Q1 | What's the `move` schema? Standalone table vs. JSON column on `scenario`/`goal`? | Drives migration cost, query shape, and how `moveIds[]` references work |
| Q2 | One-to-many cardinality: does a scenario reference moves by FK, or own them inline? | FK lets a single Move live on both a goal and a scenario; inline avoids orphaning but duplicates definitions |
| Q3 | Conflict policy when two Moves on the same goal target the same stream (e.g., two "cancel sub" on stream X)? Last-wins, idempotent-dedup, or block-at-attach? | R.3.5 SPEC.md:137–140 already mandates applier-level dedup by natural key; need to extend the rule explicitly to goal-attached Moves |
| Q4 | UI: how many Moves per goal in the default visible layout? Inline list, expandable section, or modal? | R.3.1's card has finite vertical budget; >3 Moves needs a disclosure pattern |
| Q5 | Migration: do existing user scenarios silently rehydrate to Moves, or is there a one-time review prompt? | Silent rehydrate is cheaper but risks surprising users whose scenarios suddenly contain "Moves" they didn't author |
| Q6 | Does the goal pace projection re-run on every Move attach/detach, or is there a "Recalculate" trigger? | Re-run-on-change matches the optimistic-UX pattern but may flicker the verdict badge |
| Q7 | Naming: is the user-facing label "Moves" everywhere, or does Goals call them "Actions" / "Plays"? | Simulator already says "Moves"; consistency vs. domain-fit |

---

## Reading list (when phase-kickoff starts)

In order:

1. `docs/redesign/SPEC.md` — locked decisions #6 (Goals Moves) and #7
   (Move data model unification). Lines 34, 190.
2. `docs/redesign/HANDOFF-2026-05-12-post-r3-6.md:135–154` —
   "what's next" + R.4 read list.
3. `docs/redesign/r3-5-simulator/SPEC.md` — full simulator scope,
   especially §137–140 (applier dedup) and §23 (UX-layer note).
4. `docs/redesign/r3-1-goals/SPEC.md:31` — coaching-sentence filler
   pattern (the slot R.4 replaces).
5. `claude-design-context/README.md` §§ 2 (Simulator) and 3 (Goals)
   — prototype visual reference.
6. `src/lib/forecast/apply-overrides.ts` — applier system to refactor.
7. `src/lib/db/schema.ts` — `scenarios` table + `goal` table; migration
   target.
8. `src/lib/forecast/scenario-actions.ts` — server actions to update.
9. `CLAUDE.md` > "Forecast override appliers use signed math" + "Forecast
   engine consumes raw PFC totals" — invariants that must survive the
   refactor.

---

## Per-phase doc convention (so the future SPEC/PLAN match)

Existing R.x folders follow a two-file pattern:

- `SPEC.md` — locked decisions table (`# | Decision | Choice |
  Rationale`), scope/non-scope, architecture, risk notes.
- `PLAN.md` — goal, tech stack, file structure, task index table
  (`# | Task | Wave | Time`), per-task acceptance criteria.

Post-ship, the milestone root gets `HANDOFF-YYYY-MM-DD-post-r4.md`
matching the cadence of R.3.4 / R.3.5 / R.3.6 handoffs.

---

## Suggested kickoff sequence

1. Run `/gsd-discuss-phase r4-moves-scenarios` (or equivalent) to drive
   Q1–Q7 to locked answers.
2. Generate `SPEC.md` from the locked answers.
3. Run `/gsd-plan-phase r4-moves-scenarios` to produce `PLAN.md`.
4. Branch off `feat/redesign` (or a sub-branch like `feat/redesign-r4`)
   and execute task-by-task.
5. On ship, write the handoff doc and merge into `feat/redesign`. The
   milestone PR to `main` still gates on the full R.4 → R.6 chain.
