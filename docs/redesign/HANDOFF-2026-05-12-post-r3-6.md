# Session handoff — 2026-05-12 (post R.3.6 ship)

> **R.3.6 Settings shipped on `feat/redesign`.** 16 implementation tasks
> (T1–T16) + 4 atomic fixes (T3 directive cleanup, T8 HSL-fragment trap,
> Tailwind hairline registration, T4 `'use server'` re-export). **HEAD at
> push: `febb48c` (T4 fix). README marked shipped. Manual browser UAT
> pending.** Resume by browser-UATing R.3.6 in dev (npm run dev →
> /settings), then kicking off R.4 (Goals Moves + scenario unification).
>
> **This file supersedes** `HANDOFF-2026-05-11-post-r3-5.md`. Delete that
> after this one is read.

---

## R.3.6 ship summary

20 commits total: spec (`ef54b9b`) + plan (`d5f5d8e`) + 16 implementation
commits (T1 through T16) + 4 follow-up fixes captured during review.
Execution via `superpowers:subagent-driven-development` per R.3.5
precedent — every task got an implementer + spec compliance review + code
quality review (combined for trivial tasks).

| Commit | Task | Notes |
|---|---|---|
| `0933a43` | T1 | Add `users.timezone` column. db:push surfaced pre-existing schema drift; one strict-mode flip needed. |
| `9f99388` | T2 | `rowsToCsv` pure helper, 9 tests, RFC 4180 escaping (LF terminator — Excel-on-Windows may show blank trailing column; deferred until reported). |
| `dc51a55` | T3 | `isValidIanaTimezone` + `TIMEZONE_OPTIONS`, 9 tests. |
| `5e04dae` | T3 fix | Drop unused `@ts-expect-error` directives (TS2578 caught by T4 review). |
| `58a95eb` | T4 | User actions + zod schemas. **Spec deviation**: schemas extracted to `src/lib/users/schemas.ts` (`'use server'` modules can't be imported by Vitest due to transitive `next-auth` → `next/server`). |
| `8c41743` | T5 | `/api/export/transactions` route handler. Joins through `externalItems.userId` per existing `transactions.ts:117-122` pattern (transactions has no `userId` column of its own). |
| `6e2c922` | T6 | Extract `statePillKind` to pure helper file `state-pill-kind.ts`. 7 restraint-matrix regression tests. **Spec deviation**: helper widened from `SourceHealth['state']` to `SyncHealthState` (full union) so the `syncing` test case is typeable. |
| `db785dc` | T7 | StatePill caution palette: amber-500 Tailwind → `--semantic-caution` token. Destructive branch unchanged. **Minor**: dark-mode contrast at `#b07a2b` on `text-xs` is ~4.1:1 (borderline AA); visual-check in UAT. |
| `b5c0611` | T8 | `<SettingsRail>` IntersectionObserver + sticky 220px rail. |
| `c746d10` | T8 fix | `bg-[var(--accent)]` → `bg-accent` (HSL fragment trap — silent invalid CSS). |
| `c07d6d4` | T9 | `<ProfileSection>` form, useTransition save, sonner toasts. |
| `16bc511` | foundation fix | Register `hairline` + `hairline-strong` as Tailwind color tokens. **Discovered by T9 review**: `border-hairline-strong` was silently broken across 6 R.3.5 simulator components (moves-grid, goal-impacts, forecast-chart, scenario-cards, empty-state-card, simulator-tabs) — class had no Tailwind config mapping. Now resolves correctly. R.3.5 prod healing is a bonus side effect. |
| `9b76f1c` | T10 | `<ConnectedAccountsSection>` server component, content extracted verbatim from prior page, card formula applied. |
| `823038d` | T11 | `<DataExportSection>` server component, anchor + `download` attribute hits T5 route handler. |
| `0c4f2e8` | T12 | `<DeleteAccountDialog>` shadcn AlertDialog + strict-equality email gate. Security gate review verified UI gate sound (no bypass vector), server-side recheck provides defense in depth. |
| `40f496c` | T13 | `<DangerZoneSection>` amber-tinted `<section>` (not Card) wrapping the dialog. |
| `e233c72` | T14 | `settings/page.tsx` full rewrite — two-column shell wiring 4 sections. Sequential DB awaits (could `Promise.all` for one fewer RTT; non-blocking minor). |
| `a48b578` | T15 | Strike-3 RSC boundary grep gate (empty commit, marker for the watch result). |
| `febb48c` | T4 fix | Drop schema re-export from actions.ts. Next.js `'use server'` disallows non-function exports — only caught by `next build`, not by tsc/vitest. T16 acceptance surfaced it. |

| Acceptance | Status |
|---|---|
| Typecheck | Clean |
| Tests | 691 passing (R.3.5 baseline 656 + 35 new from T2/T3/T4/T6) |
| Build | All 28+ routes compile; `/settings` 11.4 kB / 148 kB First Load; new `/api/export/transactions` route handler present |
| RSC boundary grep (T15) | Clean — zero function-prop matches on `src/app/(app)/settings/page.tsx` |
| Strike-3 watch | Held — no new RSC violations in R.3.6 |
| Push state | Pushed to `origin/feat/redesign` at `febb48c` (assuming push completes after handoff commit) |

## Spec deviations worth knowing

1. **`users.display_name` column dropped — reuse existing `users.name`** (decided at plan kickoff via AskUserQuestion). Auth.js-owned `text('name')` was nullable + unused for magic-link users. T1 schema added only `timezone`.
2. **Schemas extracted to `src/lib/users/schemas.ts`** (T4) — `'use server'` modules can't be Vitest-imported. Schema-only file is pure.
3. **`statePillKind` extracted to `state-pill-kind.ts`** (T6) — vitest node env can't transitively parse `.tsx` JSX; pure-helper-in-`.ts` is the codebase convention from R.3.5.
4. **`SyncHealthState` widening** (T6) — plan used `SourceHealth['state']` which `Exclude`s `syncing`; widening lets the 7-state test matrix typecheck.
5. **CSV terminator is `\n`, not RFC 4180 CRLF** (T2 quality review minor) — Excel-on-Windows may show a blank trailing column. Deferred until reported.
6. **Dark-mode `--semantic-caution` contrast on `text-xs`** (T7 quality review minor) — `#b07a2b` on deep-forest is ~4.1:1, borderline AA for small text. Worth a visual UAT check; if weak, add `--semantic-caution: <lighter>` to `.dark` block.
7. **`isDirty` post-save drift on ProfileSection** (T9 quality review observation) — self-corrects via `revalidatePath('/settings')` triggering parent re-render → updated `initialDisplayName` prop → `displayName === (initialDisplayName ?? '')` flips false. No explicit `router.refresh()` needed.

## Foundation fix worth knowing (R.3.5 healing)

`border-hairline-strong` was silently invalid (no Tailwind config mapping)
across 6 R.3.5 simulator components. Discovered during T9 review. Fixed
centrally by registering `hairline` + `hairline-strong` as `theme.extend.colors`
mapped to `var(--hairline)` / `var(--hairline-strong)` (no `hsl()` wrap —
these tokens are complete rgba() values).

**R.3.5 components now render the intended hairline opacity instead of
shadcn's default `--border` token.** Worth a visual diff in dev — the
borders should look slightly more subdued (the `--hairline-strong` rgba
is lower opacity than `--border`'s hsl).

## Manual browser UAT — pending

Run `npm run dev` (if not already running) and walk the following on
http://localhost:3000/settings after sign-in:

### Two-column shell + rail
- [ ] (md+ viewport) Rail visible on the left, sticky as you scroll the body
- [ ] Rail items: Profile, Connected accounts, Data & export, Danger zone
- [ ] Click each rail item → smooth scroll to the section
- [ ] Scroll the body → active rail item updates (position dot moves) via IntersectionObserver
- [ ] Active position dot is brand-green (`--accent`), shows only on the active item
- [ ] (<md viewport, e.g., Chrome devtools mobile) Rail hidden, sections stack vertically

### Profile section
- [ ] Email shows current session email, read-only, mono font
- [ ] Display name input shows current `users.name` value (likely blank for magic-link)
- [ ] Type a name → Save button enables (dirty state)
- [ ] Save → toast success → button re-disables (isDirty flips false via revalidatePath)
- [ ] Refresh → name persists
- [ ] Timezone select shows themed `<Select>` (not native OS dropdown — R.3.5 primitive)
- [ ] Pick a different timezone → Save enables → save persists
- [ ] Discard reverts dirty fields to last saved state

### Connected accounts
- [ ] Card uses elevated surface + hairline-strong border (subtle hairline now that the Tailwind config fix landed)
- [ ] Existing SourceHealthRow content preserved (Plaid · Synced X ago, etc.)
- [ ] StatePill colors: any source in `degraded` / `needs_reconnect` state renders amber **using the `--semantic-caution` token (#b07a2b) — NOT raw Tailwind amber-500**. Compare visually to old screenshot if uncertain.
- [ ] Any `failed` state renders shadcn `destructive` token (unchanged from prior)
- [ ] `healthy` / `stale` / `unknown` / `syncing` show NO pill (silence rule held)
- [ ] Per-account sub-list still renders below each SourceHealthRow

### Data & export
- [ ] Card title "Data & export" with `&` rendered correctly
- [ ] "Download transactions CSV" button visible with Download icon
- [ ] Click button → browser downloads `foothold-transactions-YYYY-MM-DD.csv`
- [ ] Open the CSV in Numbers / Excel / Google Sheets — columns: date, name, merchantName, amount, category, categoryOverride, accountName, pending
- [ ] Spot-check: amounts preserve sign (positive = cash OUT per codebase invariant); override-category column populated for any overridden transactions
- [ ] Excel on Windows specifically: any blank trailing column? (LF terminator deferred minor — flag if seen)

### Danger zone
- [ ] Section has amber border + amber tint (`--semantic-caution` at 10% opacity)
- [ ] "Delete account" button is destructive red
- [ ] Click → dialog opens
- [ ] Cancel button closes dialog
- [ ] Reopen dialog → input is empty (no pre-fill from prior typing — `onOpenChange` reset)
- [ ] Type incorrect email (e.g., misspell) → "Delete account permanently" button stays disabled
- [ ] Type your exact email → button enables
- [ ] **DO NOT actually confirm unless you mean it — cascades fire.** If you want to test the flow end-to-end on a sandbox account, do it; otherwise just verify the gate logic.

### Theme parity
- [ ] Light + dark mode walk — surfaces, hairlines, dot colors, amber tint all read correctly
- [ ] Specifically dark mode `--semantic-caution` (#b07a2b) on the StatePill `text-xs` label — flag if contrast is weak (borderline AA per T7 quality review)

### Regression checks
- [ ] No console errors in browser devtools
- [ ] No Network panel 4xx/5xx unrelated to expected reauth states
- [ ] `/settings` route shape from terminal log matches: 11.4 kB / 148 kB First Load

## What's next: R.4 Goals Moves + scenario unification

Per the milestone SPEC.md, R.4 is the next phase. Its scope is much bigger
than any prior R.3 sub-phase:

- Build the "Moves" feature attached to goals (each goal gets cancel-sub /
  reduce-category / reroute-income actions with $/mo deltas)
- Unify the Moves data model with simulator scenarios (Moves becomes the
  primitive; scenarios become named bundles of Moves)
- Bigger refactor than restyles; touches forecast appliers, simulator
  surface, goals surface

### Reading list for R.4 kickoff

1. `docs/redesign/SPEC.md` — milestone-level locked decisions (especially #6 and #7 on Moves + scenario unification)
2. `claude-design-context/README.md` §3 Goals + §2 Simulator
3. Existing forecast applier system: `src/lib/forecast/apply-overrides.ts`
4. Existing scenario model: `src/lib/db/schema.ts:scenarios` + `src/lib/forecast/scenario-actions.ts`
5. R.3.1 Goals SPEC + the post-R.3.1 coaching pattern (`composeCoaching`)

### Phase entry checklist

Same as R.3.6's entry:

```bash
git fetch origin
git checkout feat/redesign
git status                          # must be clean
git log --oneline -3                # confirm febb48c (or whatever HEAD is) at top
npm run typecheck                   # must be clean
npm run test 2>&1 | grep "Tests "  # must be 691 passed
```

Then `/gsd-spec-phase` or `superpowers:brainstorming` for R.4.

## Memory cues for the next session

Auto-memory should already carry:
- R.3.6 shipped 2026-05-12 (project_redesign_milestone)
- Foothold target: multi-user public release (project_multi_user_target)
- Plaid Balance cutover complete (project_plaid_cutover_inprogress)

Worth saving (if relevant to next session):
- Tailwind config gotcha: register custom complete-color tokens centrally
  to prevent silent class-no-op (the `border-hairline-strong` trap that
  caught 6 R.3.5 files and would have caught more)
- `'use server'` modules cannot re-export non-function values — only
  caught by `next build`, not tsc or vitest

---

**Session ends here.** Pick up by reading this file + running the entry
checklist + walking R.3.6 UAT in dev.
