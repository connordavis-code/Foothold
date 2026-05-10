# Foothold Redesign — Phase R.0 Spec

**Date locked**: 2026-05-09
**Scope**: Foothold-wide visual + IA redesign per Claude Design bundle delivered 2026-05-09
**Bundle reference**: [claude-design-context/](../../claude-design-context/) — `README.md`, `design-system.html`, `styles.css`, prototype `foothold-*.jsx`
**Status**: Decisions locked, ready for milestone kickoff

---

## North star

> *"Where you stand, mapped honestly."*

Numbers as protagonist. Chrome restrained. Motion purposeful and quiet. Terrain metaphor — the single green dot says "you are here" and that meaning carries everywhere. Editorial moments via Fraunces italic; everything else via tight neutral chrome.

This is a wholesale identity + IA redesign, not a token swap. The bundle README is explicit: *"recreate pixel-perfectly using your codebase's libraries and patterns"* — the prototype is reference, not production code.

## Product context (2026-05-09)

Foothold is being prepared for **multi-user public release**. The user is the only user today, but all redesign work should ship at production quality for a multi-tenant product. **Multi-user readiness is a parallel concern to this redesign** — auth, RLS policies, per-user query scoping, onboarding flows, billing, account deletion, TOS/privacy pages — and is tracked separately. The redesign restyles existing surfaces; new multi-user surfaces (onboarding, pricing, signup) will be specced in their own track. Where they overlap (Settings restyle ↔ account deletion, Settings ↔ billing connection), the redesign phases note the dependency.

---

## Locked decisions (2026-05-09)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Mobile-first work timing | Rebuild after desktop port (Phase R.5) | Bundle has zero mobile thought; preserving current mobile components on top of new desktop visuals would create UX inconsistencies worse than a temporary brand split |
| 2 | Mobile during rebuild window | Mobile keeps current Foothold UI | Functional continuity over brand consistency. Mobile users experience the old Foothold until R.5; desktop ships immediately |
| 3 | `/drift` route | Folded into dashboard module | Drift becomes a horizontal-bar leaderboard on `/dashboard`. Standalone `/drift` deletes. `<ElevatedTile>` drilldowns to `/transactions?category=&from=&to=` are lost |
| 4 | `/insights` route | Folded into dashboard editorial card | Weekly brief renders as a Fraunces-italic card on `/dashboard`. Standalone `/insights` deletes. `?week=YYYY-MM-DD` deep-links lost. AI generation flow + `forecast_narrative` cache survive (server-side) |
| 5 | Receipts grid (currently on `/insights`) | Drop entirely | Quieter product. The grid was a 6.5 IA addition; not load-bearing for the operator's-field-notebook north star |
| 6 | Goals "Moves" feature | Build in goals phase (R.4) | Each goal gets attached actions (cancel sub, reduce category, reroute income) with $/mo deltas. Real product feature, not chrome |
| 7 | Moves data model | Unify with simulator scenarios | A scenario becomes a named bundle of moves. Goals attach moves directly OR reference a scenario. Single override-applier system. Bigger refactor; cleaner long-term |
| 8 | Operator-tier `/transactions` features | Drop all | j/k nav, ⌘↑/⌘↓, `/`, cheatsheet, **bulk re-categorize** all dropped per prototype's conventional table shape. Single-row edits only post-redesign. **User explicitly accepted bulk re-categorize regression.** |

---

## What survives the redesign

**Backend / data layer untouched**:
- AI weekly brief generation (`forecast_narrative` cache, Anthropic Haiku 4.5)
- Drift query (`getDriftAnalysis`)
- Forecast engine (`projectCash`, override appliers)
- Plaid + SnapTrade sync layer
- Reliability Phase 1–5 work (balance refresh, sync health classification, source-health query, settings health panel, dashboard trust strip)
- Crypto layer, encryption, RLS scaffolding, cron infrastructure

**Routes kept** (all heavily restyled):
- `/dashboard` — gains drift module + weekly brief card
- `/simulator` — restyled; data model refactors with R.4 to share Moves with goals
- `/goals` — restyled; gains Moves feature
- `/recurring` — restyled
- `/transactions` — restyled, conventional shape (loses operator chops)
- `/investments` — restyled
- `/settings` — restyled

**Routes deleted**:
- `/drift` → folded to dashboard module
- `/insights` → folded to dashboard editorial card
- `/insights/[week]` deep-link surface

**Routes redirect** (avoid 404s for any external bookmarks or stale cron content):
- `/drift` → `/dashboard#drift` (anchor)
- `/insights` → `/dashboard#brief` (anchor)
- `/insights/[week]` → `/dashboard?week=YYYY-MM-DD` (param survives, dashboard editorial card honors it)

---

## Brand identity changes

### Mark

New `<FootholdMark>` — terrain-contour SVG with single position dot. Two render modes:
- **Hero**: 5 lines, opacities `[0.4, 0.7, 0.95, 0.7, 0.4]`, dot at (2, -6), r=4.5
- **Simplified**: 3 lines, opacities `[0.55, 1.0, 0.55]`, dot at (2, -4), r=5

Render with `shapeRendering="geometricPrecision"`. Dot is always `--accent`; lines use `currentColor`.

### Wordmark

`foothold` lowercase in IBM Plex Mono OR italic `Foothold` in Fraunces (toggle via tweak; default mono per prototype).

### Voice

Cartographic, calm, observational. Footer signature renders coordinates: `42.3601° N · 71.0589° W · synced 19:42 EDT · v0.4`

### Color palette (incompatible with current — full vocabulary swap)

**Dark theme**:
- `--bg`: deep-forest `#07150F` (was paper-tinted)
- `--surface`: slate `#1f2a26` (was elevated)
- `--accent`: brand green `#6b8a5a` / `#a8c298` hover (was amber)
- `--caution`: signal amber `#c08a4f`
- `--info`: signal blue-gray `#9aacc4`

**Light theme**:
- `--bg`: bone `#f4f1ea`
- `--surface`: paper `#ebe6db`
- `--accent`: brand green `#6b8a5a` / `#4d6c3c` hover

### Typography

- `--font-display`: Fraunces (already in repo, used more strictly — editorial moments only)
- `--font-ui`: Inter Tight or Söhne (verify Inter Tight; fallback to current Inter if unavailable)
- `--font-mono`: IBM Plex Mono (was JetBrains Mono — migrate)

### Position-dot motif

Load-bearing brand vocabulary. Required at least once on every screen:
- Sidebar active item (left edge, pulsing)
- Topbar sync pill
- Hero "you are here" marker on trajectory
- Goal-progress current-position dot
- Signature footer status indicator

### Page bg textures

Filmic grain (~10–13% opacity) + topo contour layer (~7–9% opacity) as fixed-position pseudoelements. Contour pattern is inline SVG data URIs; no PNG assets.

---

## Phase sequencing

| Phase | Scope | Estimate |
|---|---|---|
| **R.0** *(this doc)* | SPEC + decision lock + milestone kickoff | done |
| **R.1** | Foundation: tokens swap, font swap, `<FootholdMark>`, `<SignatureFooter>`, top-bar/sidebar visual restyle (route mapping unchanged), page-bg textures | 1 week |
| **R.2** | Dashboard redesign: hero w/ trajectory + uncertainty band, drift module (folds `/drift`), weekly brief editorial card (folds `/insights`), KPI strip restyle, recent-activity restyle. **Freshness annotation pattern locked here** (folds Reliability Phase 6) | 1 week |
| **R.3** | Per-page sweep, one PR each: Goals (without Moves) → Recurring → Transactions (drop operator features) → Investments → Simulator → Settings | 3–4 weeks |
| **R.4** | Goals Moves feature + scenario unification (Moves becomes the primitive; simulator restructures around it) | 1–2 weeks |
| **R.5** | Mobile rebuild on top of new desktop design (vaul drawers, tab bar, sheet detail — all reapplied with new tokens) | 2–3 weeks |
| **R.6** | Polish: hero count-up motion, position-dot pulse, signature-footer live time, drift transitions, `prefers-reduced-motion` respect | days |

**Total estimate**: 7–10 weeks of focused work.

---

## Reliability Phase 6 integration

Phase 6 (freshness annotations on headline numbers) **folds into R.2**. Annotating numbers in old chrome and re-doing them during the restyle is double work. R.2's dashboard hero locks the freshness-annotation pattern; per-page phases (R.3) propagate it to investments summary, forecast baseline, goals pace, recurring monthly total.

`getSourceHealth()` from Phase 3 remains the data source. Phase 4 settings panel + Phase 5 trust strip already speak this language and survive the restyle directly.

---

## Out of scope / explicit non-goals

- **Plaid Production access for Fidelity**: deprioritized indefinitely; SnapTrade is the realistic path
- **AI eval framework**: redesign doesn't touch the AI weekly-brief prompt or its eval coverage
- **New AI features**: redesign is visual + IA only
- **Investment what-if simulator** (Phase 4-pt2): independently deferred; not part of R.4
- **Email digest restyle**: digest stays hex-literal HTML for Resend compatibility (see [CLAUDE.md](../../CLAUDE.md) Dark mode wiring note)

---

## Risks and gotchas

Pulling from architecture notes + recent lessons learned:

- **RSC boundary failures (strike 2 active)**: Functions can't cross server→client boundary. New components shipped during R.1–R.4 must wrap any config-of-functions in client wrappers (cf. `<FlagHistoryList>`). One more instance promotes this from Lesson to architecture-level guard.
- **Plaid Balance product authorization** (Lessons learned 2026-05-07): If R.2's hero adopts intraday balance freshness as a freshness-annotation use case, verify `balance` product is authorized in Plaid Dashboard + `PLAID_PRODUCTS`. Currently using `accountsGet` (Path B) per `c8f49a1`.
- **SnapTrade activities 410 N/A signal**: Self-healing classifier already in place; redesign should preserve this — don't blanket-disable transactions on SnapTrade.
- **Build vs dev simultaneous run**: During R.1+ work, never run `npm run build` while `next dev` is running. Use `typecheck` for verification.
- **Env-gated features**: Set Vercel env vars FIRST, push SECOND.
- **Route deletes are real**: `/drift` and `/insights` route deletes mean their `revalidatePath` calls in server actions need updating. Grep for `/drift` and `/insights` in `src/lib/**/actions.ts` during R.2.

---

## Open questions for R.1

- **Inter Tight vs Söhne vs current Inter**: prototype says "Söhne / Inter" — Söhne is licensed. Decide font shopping in R.1 kickoff.
- **IBM Plex Mono vs JetBrains Mono**: prototype uses IBM Plex Mono; current repo uses JetBrains. Recommendation: migrate to IBM Plex Mono per prototype (open-source, matches typographic spec).
- **Page-bg texture performance**: SVG data URIs at 1080×1080 fixed-position. Measure paint cost on R.1 first-light.
- **`<TweaksPanel>` from prototype**: per bundle README, omit in production unless theming is a real product feature. Default: omit.

---

## Cross-references

- Bundle: [claude-design-context/](../../claude-design-context/)
- Bundle README: [claude-design-context/README.md](../../claude-design-context/README.md)
- Design system reference: [claude-design-context/design-system.html](../../claude-design-context/design-system.html)
- Architecture notes: [CLAUDE.md](../../CLAUDE.md)
- Reliability initiative (in progress): [docs/reliability/implementation-plan.md](../reliability/implementation-plan.md)
