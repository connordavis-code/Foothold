# Session handoff — 2026-05-11 (post R.3.5 ship)

> **R.3.5 Simulator shipped on `feat/redesign`** in 23 commits (T3–T24)
> plus 2 doc commits (spec + plan). Resume the redesign by brainstorming
> R.3.6 Settings.
>
> **This file supersedes** `HANDOFF-2026-05-11-post-r3-4.md`. Delete that
> file after the next session reads this one.

---

## R.3.5 ship summary

25 commits total: spec (`7c95a6d`) + plan (`0f2af01`) + 23 implementation
commits (T3 through T24). Implementation executed via subagent-driven
development per `superpowers:subagent-driven-development` skill — every
task got an implementer + spec compliance review + code quality review.

| Layer | Commits / files |
|---|---|
| Foundation (pure helpers) | `1dbaacb` url-state · `26e80d8`+`3d06cb1` markers (incl. cap-after-sort fix from code-quality review) · `46cc75d` appliers · `ca0ecfa` validators · `8958501` templates |
| Chart rework | `928c604` hand-rolled SVG ForecastChart (369 lines, replaces 195-line Recharts impl; position-dot pulse, goal markers warn/goal tones, range slicing 1Y/2Y, hover crosshair + tooltip) |
| Components | `dce61ff` ScenarioCards + logic-split · `e948f9f` GoalImpacts + logic-split · `fb77acc` ScenarioPicker→Load… dropdown · `feb67b7` ScenarioHeader (with action-name adaptation + handleReset wiring) · `5b5090b` MovesGrid · `6da01c5` MoveTemplateForm · `57fd0b2` MoveTemplateDrawer · `f7638e3` EmptyStateCard · `3e21076` ChartRangeTabs · `6fee74b` SimulatorTabs |
| Wiring | `b9a4043` SimulatorClient rewrite (linchpin — view/range/activeMoveTemplate state, URL mirroring, Moves flow, tab rendering, MobileScenarioSaveBar gated) · `6c7a971` page.tsx URL parsing + freshness wiring via getSourceHealth |
| Sweep | `45254b8` 8 override editors token sweep · `24eafd4` MobileScenarioSaveBar · `828674c` /simulator/compare (reduced to baseline-vs-one — see deviations) |
| Cleanup | `71895f9` 6 files deleted: narrative-panel, goal-diff-cards, goal-diff-matrix, scenario-delta-cards, forecast/comparison + its test |

| Acceptance | Status |
|---|---|
| Typecheck | Clean (zero errors at HEAD `71895f9`) |
| Tests | 656 passed (54 files) — net +40 from baseline 616 (T3 +13, T4 +9 incl. fix test, T5 +14, T6 +11, T9 +4, T10 +7 = 58 added; T24 removed comparison.test.ts = -18; net +40) |
| Build | `next build` 28 routes compile, no RSC serialization errors. `/simulator` 14.5 kB / 146 kB First Load · `/simulator/compare` 1.56 kB / 109 kB |
| RSC boundary grep (P0 acceptance) | `grep -nE "onSelect=|onChange=|onPick=|onSubmit=|render=" src/app/(app)/simulator/page.tsx src/app/(app)/simulator/compare/page.tsx` → zero matches. Strike-3 watch held. |
| Working tree | Clean (R.3.5 commits only) |
| Push state | Pushed to `origin/feat/redesign` at `71895f9` |

### Plan deviations worth knowing

Every deviation has its rationale in the relevant commit message; tldr:

1. **`incomeChange` Move applier error strings** (T6) — plan used capital-first error strings (`'Required'`, `'Format must be YYYY-MM'`) but tests used `/required/` / `/format/` case-sensitive regexes. Implementer correctly lowercased the impl strings to make tests pass. User-facing UI can capitalize at the render boundary if it matters.
2. **Pure-helpers-in-`.ts` pattern** (T9 established, T10 followed) — vitest config has `include: ['src/**/*.test.ts']` and `environment: 'node'`. A `.test.ts` cannot import from a `.tsx` (no JSX transform). Pure helpers split into separate `.ts` files: `scenario-cards-logic.ts` + `scenario-cards.tsx` (JSX re-exports the helpers), same for `goal-impacts-logic.ts` + `goal-impacts.tsx`. This is the **codebase convention** going forward for tested-component-helpers.
3. **Scenario action names** (T12) — plan said `createScenarioAction`/`updateScenarioAction`/`deleteScenarioAction` but actual exports are `createScenario`/`updateScenario`/`deleteScenario` returning `ActionResult<T>` (`{ ok, data, error }`). Implementer adapted to the `{ ok, error }` pattern. ScenarioHeader save/save-as/delete handlers use the correct shape.
4. **`ContourBackdrop` missing** (T16) — plan assumed R.1 shipped it as `@/components/brand/contour-backdrop`; only `<FootholdMark>` was shipped. EmptyStateCard ships without contour backdrop. Visual deferred. Could be added later as a `<ContourBackdrop>` component matching the mockup JSX's pattern.
5. **`/simulator/compare` multi-scenario regression** (T23) — new `<ForecastChart>` (T8) accepts `scenario` singular. The original compare-client overlayed up to 3 scenarios via `selectedIds` + `scenarios=[...]` array prop. **Compare route reduces from "up to 3 saved scenarios overlaid" to "baseline-vs-one scenario detailed view."** URL pattern simplified from `?scenarios=a,b,c` to `?scenario=<id>`. Documented in T23 commit message. If multi-scenario overlay is a needed feature, ForecastChart needs a `scenarios?: ChartScenario[]` overload — defer to a follow-on.
6. **`markers.ts` cap-before-sort fix** (T4 → T4-fix) — code quality reviewer caught that `slice(0, GOAL_ARRIVAL_CAP)` ran before sort, so the cap kept first-3-by-input-order rather than earliest-3-chronologically. Fixed in `3d06cb1` with a new regression test.
7. **`MOVE_TEMPLATES` applier type signature** (T7) — appliers use `Record<string, unknown>` form-input type with casts inside (`v.when as string`). Templates layer's type assertion strategy keeps the per-template applier signatures private; consumers see the uniform `(formValues, current) → next` shape.

### Browser UAT — DEFERRED (manual)

Same constraint as Reliability Phase 4/5 and R.3.4 (auth-gated dev server,
magic-link login required, agent can't observe rendered UI). Acceptance
evidence collected at the type + build + RSC-boundary layer:

| UAT axis | Verification source |
|---|---|
| Tab routing (Empty/Moves/Comparison) + URL `?view=` | Code review: `pushUrl` in SimulatorClient (b9a4043), parsers in url-state.ts. Visual — pending. |
| 8 Move drawer forms emit correct override + auto-expand accordion section | Pure-helper coverage: 14 applier tests + 11 validator tests + per-template `targetSection` config (T5/T6/T7). Visual + interaction — pending. |
| Chart position-dot pulse at today's anchor | Code review: SVG `<animate>` elements (r=5→10→5, opacity=0.28→0.05→0.28, 2.6s, indefinite). Visual — pending. |
| Chart goal markers (warn tone for runwayDepleted, goal tone for goalArrival) | Pure: 9 deriveChartMarkers tests covering both kinds. Render: T8 chart code review. Visual — pending. |
| Range tabs 1Y/2Y URL-mirrored, slices projection correctly | Code review: ChartRangeTabs + projection.slice(0, range==='1Y'?12:24). Visual — pending. |
| Scenario cards row: Baseline first, switching scenarios reloads liveOverrides | Code review: pickActiveCard helper + 4 tests + ScenarioCards click handlers. Visual — pending. |
| GoalImpacts cards: 4-card cap + status pill colors (faster/same/slower) + arrival date format | Pure: formatGoalImpact + sortGoalImpacts (7 tests). Visual — pending. |
| Empty state: FootholdMark + CTA routes to Moves | Code review: EmptyStateCard onPickMove → setView('moves'). Visual — pending. |
| MobileScenarioSaveBar visible on Comparison only | Code review: `{view === 'comparison' && <MobileScenarioSaveBar />}`. Visual — pending. |
| Move conflict notice (incomeDelta overwrite) | Code review: `template.conflictsWith` in templates.ts; rendered in MoveTemplateForm. Visual — pending. |
| `/simulator/compare` restyle to new tokens | Code review: T23 commit. Visual — pending. |
| Theme parity (light + dark) | Token mapping audited per Foothold dual-token gotcha in every component. Visual — pending. |
| RSC boundary discipline | T25 grep: zero matches in server pages. ✅ |

User to walk these axes when restarting `npm run dev`. Fix any issues
with `fix(r3.5): <desc>` commits per R.3.4 pattern.

## Open items at handoff

### `<ContourBackdrop>` not yet built

T16 EmptyStateCard's plan referenced `@/components/brand/contour-backdrop`
but the file doesn't exist. The mockup's JSX shows a contour-terrain SVG
backdrop behind the FootholdMark on the Empty state. R.1 didn't ship it
as a separate component — only `<FootholdMark>` was shipped.

**Options:** (a) build `<ContourBackdrop>` as part of R.6 polish; (b)
incorporate the terrain visual into a future `<FootholdMark>` variant; (c)
leave Empty state with just the mark (current state). Decision pending.

### `/simulator/compare` multi-scenario regression

Per Plan deviation #5, compare route reduced from 3-scenario overlay to
baseline-vs-one. If the operator-tier 3-way scenario comparison is needed
back, options:

- Add `scenarios?: ChartScenario[]` overload to `<ForecastChart>` and
  re-introduce multi-line rendering in the SVG
- Build a separate `<ComparisonChart>` component just for the compare
  route
- Accept the regression permanently (compare becomes a "view a saved
  scenario in detail" surface; the main /simulator already does
  baseline-vs-current well)

User direction needed.

### `<MoveTemplateDrawer>` not yet runtime-exercised

T15 wired the vaul drawer + form renderer. Submit handler is fully tested
at the applier layer, but the **full Move flow** (open drawer → fill form
→ submit → override emitted → tab flips → accordion expands) hasn't been
exercised in a live browser. Browser UAT will catch any wiring issues.

### Dev server

Not currently running. Restart for UAT:

```bash
npm run dev
```

### Push state

`feat/redesign` pushed to origin at `71895f9`. **25 commits ahead** of the
prior R.3.4 ship state (`388e09f`).

```bash
# Already pushed; this is just for reference
git log --oneline origin/main..feat/redesign | head -30
```

## What's next: R.3.6 Settings

R.3.5 was the largest R.3 sub-phase. R.3.6 Settings is the final R.3 sweep
before the milestone-level work moves to R.4 (Moves data unification +
Goals-Moves attachment) and R.5 (mobile rebuild).

### Reading list

Order: [SPEC.md](SPEC.md) (milestone-level decisions) →
[claude-design-context/README.md](../../claude-design-context/README.md)
> Section 7 Settings (design system contract for Settings page) →
existing `/settings` codebase for IA pickup.

- `docs/redesign/SPEC.md` — milestone decisions, including the Settings
  restyle scope (no IA changes, token sweep + Fraunces moments + new
  status-pill palette)
- `claude-design-context/README.md` — Section 7 Settings page spec
- `src/app/(app)/settings/page.tsx` — current entry point
- `src/components/sync/source-health-row.tsx` — Reliability Phase 4
  shipped here, restyle target
- `src/components/sync/state-pill.tsx` — restyle target
- CLAUDE.md > Architecture notes > "App shell — where chrome lives" + R.1
  foundation patterns for header
- The 7 Settings sections per the mockup: Profile · Connected accounts ·
  Notifications · Preferences · Privacy & security · Data & export ·
  Danger zone

### Likely brainstorm axes

1. **Two-column shell vs single-column** — mockup is sticky 220px side-rail
   + body content. Single-column may be simpler; sticky rail is the
   established R.3 pattern.
2. **Section anchors via `#hash`** — should each side-rail click `scrollIntoView`
   or `?section=` URL param? Like R.3.5's `?view=`?
3. **Danger zone treatment** — mockup explicitly says "amber-tinted, never
   red" (per design system rule). Confirm.
4. **Notifications toggles** — design system spec has a custom toggle
   component (38×22px pill). Build it new or use shadcn Switch?
5. **Data & export** — CSV/JSON exports are real features. Are they wired
   in /settings currently or new in R.3.6?
6. **Connected accounts** — already Reliability Phase 4 surface. Restyle
   carefully — the source-health-row + state-pill are load-bearing for
   the trustability initiative.

### Phase entry checklist

Same pattern as R.3.5 entry:

```bash
git fetch origin
git checkout feat/redesign
git status                          # must be clean
git log --oneline -3                # confirm 71895f9 is HEAD
npm run typecheck                   # must be clean
npm run test 2>&1 | grep -E "Tests "  # must be 656 passed
```

Then invoke `/gsd-spec-phase` or jump straight to brainstorming with
`superpowers:brainstorming` (skill list at session start).

## Memory cues for the next session

User auto-memory should already carry:
- "Foothold Redesign R.3.3 Transactions shipped (2026-05-11)"
- "Plaid Balance approved 2026-05-11"
- "Foothold Redesign R.3.4 Investments shipped (2026-05-11)"

Worth saving (next agent at session start, if relevant):
- R.3.5 Simulator shipped on `feat/redesign` 2026-05-11 per this handoff
- 8 guided Move templates abstract the override editor; pure-helpers-in-`.ts` + JSX-in-`.tsx` is the codebase convention for tested-component helpers
- `/simulator/compare` reduced from multi-scenario overlay to baseline-vs-one (regression worth tracking)

---

**Session ends here.** Pick up by reading this file + running the
entry checklist above + restarting `npm run dev` for browser UAT of R.3.5.
