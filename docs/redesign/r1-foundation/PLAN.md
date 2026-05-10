# Phase R.1 — Foundation

**Date**: 2026-05-09
**Depends on**: [docs/redesign/SPEC.md](../SPEC.md) (R.0 spec, all 8 locked decisions)
**Bundle reference**: [claude-design-context/](../../../claude-design-context/) (canonical from Downloads, 2026-05-09)
**Estimate**: 1 week

---

## Goal

Ship the visual foundation that every later phase composes from: design tokens, fonts, brand components (`<FootholdMark>`, `<SignatureFooter>`), top-bar/sidebar visual restyle, page-bg textures. Route mapping, page content, and per-page chrome are **out of scope** — they ship in R.2 (Dashboard) and R.3 (per-page sweep).

After R.1, every existing page will render with new chrome around the old card content. **The app will be visually inconsistent** (new shell, old cards) until R.2 ships. This is intentional — R.1 establishes the palette so per-page restyle phases can adopt tokens without inventing them.

---

## Branching strategy

R.1 lands on a **long-lived feature branch** `feat/redesign` — not main. Reason: the token swap will visually break every page until R.2+ catch up; main must keep shipping the live Foothold UI. Each subsequent phase merges to `feat/redesign`. The full milestone merges to main as a single PR after R.6 polish.

**Optional escape hatch**: a `data-theme="redesign"` HTML attribute toggle, set via env var or query param, that gates the new tokens. Lets the user preview redesign-in-flight on usefoothold.com without blocking real use. **Decision deferred to R.1 kickoff** — see Open questions below.

---

## Tasks

### T1 — Font migration (next/font/google)

**Files touched**:
- [src/app/layout.tsx](../../../src/app/layout.tsx) — replace JetBrains Mono import with IBM Plex Mono; add Inter Tight; remove Geist/current Inter font wiring
- [src/app/globals.css](../../../src/app/globals.css) — update `--font-sans`, `--font-mono`, `--font-display` token bindings to match new fonts
- [tailwind.config.ts](../../../tailwind.config.ts) — `theme.extend.fontFamily` updates

**Subtasks**:
1. Add `IBM_Plex_Mono` and `Inter_Tight` from `next/font/google` with weights 400/500/600/700 (sans), 400/500 (mono), italic variants for both, and `subsets: ['latin', 'latin-ext']` on each (EU-inclusive multi-tenant readiness — locked 2026-05-09)
2. Wire CSS variables: `--font-ui` → Inter Tight, `--font-mono` → IBM Plex Mono, `--font-display` → Fraunces (preserved — already in repo)
3. Remove unused JetBrains Mono import + any `geist` references
4. Set `font-feature-settings: "tnum", "zero", "ss01"` on `.num` / `.mono` utility class for tabular numerals
5. Set `font-display: swap` to avoid layout shift on cold cache

**Acceptance**:
- `npm run build` succeeds with no font-related warnings
- Network tab shows new font files loaded; old font files no longer requested
- Visual: numbers (`$95,955.42`) render in IBM Plex Mono; chrome (nav items, body text) renders in Inter Tight; editorial (Fraunces) preserved
- Lighthouse: no LCP regression vs baseline (font preload should match or beat)

**Tests**: visual smoke only — no unit tests for font wiring.

---

### T2 — Token swap (CSS variables + Tailwind)

**Files touched**:
- [src/app/globals.css](../../../src/app/globals.css) — wholesale token rewrite per [claude-design-context/styles.css](../../../claude-design-context/styles.css) `:root` and `[data-theme="light"]` blocks
- [tailwind.config.ts](../../../tailwind.config.ts) — color tokens map to new CSS vars; chart colors `--chart-1..6` rebuilt against new palette

**Subtasks**:
1. Replace `--bg`, `--bg-2`, `--surface`, `--surface-2`, `--text`, `--text-2`, `--text-3`, `--hairline`, `--hairline-strong`, `--accent`, `--accent-strong`, `--accent-soft` per bundle
2. Add new tokens not in current repo: `--brg`, `--deep-forest`, `--slate`, `--slate-2`, `--foothold-green`, `--bone`, `--paper`, `--paper-2`, `--bone-ink`, `--slate-ink`, `--warm-graphite`, `--mute-graphite`, `--success`, `--caution`, `--danger`, `--info`
3. Update spacing scale tokens (`--s-1` through `--s-9`) and radii (`--r-card: 8px`, `--r-btn: 6px`, `--r-sm: 4px`)
4. Add density modifiers (`[data-density="compact"]` block) — defer wiring to user preference until R.3 Settings phase
5. Remap `--chart-1..6` to use brand palette: `var(--accent)`, `#9aacc4`, `#c08a4f`, plus 3 derivatives. Update Recharts consumers (no code change — they read `hsl(var(--chart-N))`)
6. Verify dark + light parity by toggling `data-theme` attribute manually

**Acceptance**:
- Both themes render readably (no missing tokens, no fallback colors visible)
- Dark mode is default; light mode flip via `<ThemeToggle>` works
- Tailwind classes consuming tokens (`bg-[--surface]`, `text-[--text-2]` etc) still resolve
- No hardcoded hex literals introduced in src/ — grep audit (excluding email digest cron route, which stays hex-literal per CLAUDE.md)
- Recharts in /investments + /simulator render with new chart palette

**Tests**: dark-mode parity audit checklist (manual UAT against the 9 surfaces per CLAUDE.md "Dark mode wiring" note).

**Risk**: This is the most disruptive task. Existing components consuming old tokens will look wrong until R.2+ restyle them. Acceptable on `feat/redesign` branch.

---

### T3 — `<FootholdMark>` component

**Files created**:
- [src/components/brand/foothold-mark.tsx](../../../src/components/brand/foothold-mark.tsx) — new server component

**Reference**: [claude-design-context/foothold-shared.jsx](../../../claude-design-context/foothold-shared.jsx) — `FootholdMark` function

**Subtasks**:
1. Pure-SVG server component, no client interactivity needed at this scope
2. Two render modes via `simplified` prop:
   - Hero (default): 5 lines, opacities `[0.4, 0.7, 0.95, 0.7, 0.4]`, dot at `(2, -6)` r=4.5
   - Simplified: 3 lines, opacities `[0.55, 1.0, 0.55]`, dot at `(2, -4)` r=5
3. Props: `size?: number = 22`, `simplified?: boolean = false`, `withDot?: boolean = true`, `dotColor?: string`, `strokeColor?: string`, `className?: string`
4. Defaults: dot is `var(--accent)`, lines are `currentColor` (so the mark adapts to context)
5. Render with `shapeRendering="geometricPrecision"`
6. Forwarded ref NOT needed (server component, no DOM ref consumers)
7. Add `role="img" aria-label="Foothold"` for a11y

**Acceptance**:
- Component renders both modes at multiple sizes (16px, 22px, 40px, 60px)
- Dot color resolves to `--accent` in both themes
- Stroke color inherits via `currentColor`
- No "use client" directive — verify by checking it's a server component

**Tests** ([src/components/brand/foothold-mark.test.tsx](../../../src/components/brand/foothold-mark.test.tsx)):
- Renders with default props (5 lines + dot)
- `simplified` prop reduces to 3 lines
- `withDot={false}` omits the circle element
- Custom `dotColor` overrides default

**Threat model**: SVG component, low security surface. No user input, no XSS vector.

---

### T4 — `<SignatureFooter>` component

**Files created**:
- [src/components/nav/signature-footer.tsx](../../../src/components/nav/signature-footer.tsx) — client component (live time updates)
- [src/components/nav/signature-footer.test.tsx](../../../src/components/nav/signature-footer.test.tsx) — unit tests

**Files modified**:
- [src/app/(app)/layout.tsx](../../../src/app/(app)/layout.tsx) — mount `<SignatureFooter>` below page content, above any existing layout chrome

**Reference**: [claude-design-context/foothold-app.jsx](../../../claude-design-context/foothold-app.jsx) — `SignatureFooter` function

**Subtasks**:
1. Client component (`"use client"`) — uses `useState` + `setInterval` for live time updates every 30s
2. Two clusters: left (status indicator + source count) + right (coordinates + sync timestamp + version)
3. **Source count** — pulls from `getSourceHealth()` (already exists from Reliability Phase 3) for the count of active sources. **DEFER** the data wiring to R.2 — for R.1, hardcode "3 sources" and treat the data integration as an R.2 task. Reason: keeps R.1 scope tight; the trust strip in R.2 needs the same data hookup and can land both together.
4. **Coordinates** — derive client-side from `Intl.DateTimeFormat().resolvedOptions().timeZone` mapped via a static IANA-zone → city-coords lookup table (city-center approximation). No network, no server geo, no PII upstream. Lookup falls back to Boston `42.3601° N · 71.0589° W` if zone is unrecognized. (Locked 2026-05-09 — upgraded from R.6 deferral.)
5. **Sync timestamp** — derive from current time, format `HH:MM` in user's local TZ. Real source for "last sync time" lands in R.2 alongside trust strip.
6. **Version** — read from `package.json` at build time via env var `NEXT_PUBLIC_APP_VERSION` or hardcode for R.1
7. Pulsing green dot indicator (`.sig-dot` per styles.css) — animation honors `prefers-reduced-motion`
8. Wraps to two lines on `<720px` viewport

**Acceptance**:
- Footer renders below page content on every protected route in `(app)/`
- Time updates live (verify via DevTools)
- Dot pulse animates at 2.6s loop in both themes
- `prefers-reduced-motion: reduce` disables pulse
- No layout shift on first paint

**Tests**:
- Renders with all required clusters
- Time formatting: HH:MM padded
- `useEffect` cleanup: setInterval cleared on unmount

**Threat model**: Client component, no user input, no PII in footer beyond version + coordinates (which are placeholder). Safe.

---

### T5 — Top-bar visual restyle

**Files modified**:
- [src/components/nav/top-bar.tsx](../../../src/components/nav/top-bar.tsx) — visual restyle only; route mapping + sync pill + ⌘K trigger + theme toggle + avatar all preserved

**Reference**: [claude-design-context/foothold-app.jsx](../../../claude-design-context/foothold-app.jsx) — `Topbar` function; [claude-design-context/styles.css](../../../claude-design-context/styles.css) `.topbar` block

**Subtasks**:
1. Crumb (left): page title from existing `nav-routes.ts` resolution. New typography: 13px `var(--text-2)`.
2. Search pill (center): existing ⌘K trigger, restyled with new tokens. Inline `<Icon name="search">` (preserve current icon usage) + placeholder + `⌘K` chip.
3. Sync pill: existing reliability-Phase-5 trust-strip-aware sync indicator. Restyle to new dot+pill format. Real freshness data integration **stays as-is** from Phase 5 work.
4. Theme toggle: existing `<ThemeToggle>` preserved; restyle wrapper to new `.tb-icon-btn` shape.
5. Avatar: existing user dropdown preserved. Restyle to 32px monogram circle.
6. Backdrop blur: `backdrop-filter: blur(8px)` on the topbar wrapper for sticky-on-scroll polish.

**Acceptance**:
- All existing functionality (nav, ⌘K, theme toggle, sync indicator, user menu) works identically
- Visual matches prototype's `.topbar` styling
- Sticky behavior preserved
- Dark + light mode parity

**Tests**: existing top-bar tests should pass unchanged (interaction surface is the same).

**Threat model**: No new auth surface, no new mutating actions. Avatar dropdown still gates on session.

---

### T6 — Sidebar visual restyle

**Files modified**:
- [src/components/nav/app-sidebar.tsx](../../../src/components/nav/app-sidebar.tsx) — green-dot active indicator, indent-on-hover, group label restyle, brand mount
- [src/components/nav/nav-link.tsx](../../../src/components/nav/nav-link.tsx) (if exists) — active-state visual changes

**Reference**: [claude-design-context/foothold-app.jsx](../../../claude-design-context/foothold-app.jsx) — `Sidebar` + `SidebarBrand`; styles.css `.sb-*` block

**Subtasks**:
1. Mount `<FootholdMark size={40} simplified/>` + lowercase `foothold` wordmark (mono) at top of sidebar
2. Click on brand triggers 600ms pulse animation (`.sb-brand.click .mark > svg` — animation is purely CSS via class toggle)
3. Group labels: smallcaps `var(--text-3)` 10px / 0.16em letter-spacing, hairline above
4. Items: 13px `var(--text-2)` default; hover indents 2px + icon scales 1.05; active state shows pulsing green dot at left edge with 10px additional left padding
5. Active state pulse uses `@keyframes sb-here-pulse` (defined once in globals.css)
6. Settings sits in the bottom footer area, separated by hairline from the main groups (matches prototype)
7. **Route groupings preserved** from `nav-routes.ts` (Today / Plan / Records) — no nav-routes.ts changes in R.1

**Acceptance**:
- Green dot indicator pulses on active route in both themes
- Hover transitions smooth (140ms)
- Brand click animates 600ms then resets
- Routes resolve correctly (`<NavLink>` interaction unchanged)
- `data-density="compact"` shrinks sidebar to 220px (vs default 240px)

**Tests**: existing sidebar tests pass; add visual test for active-state class application.

**Threat model**: Same as top-bar — no new auth surface.

---

### T7 — Page-bg textures

**Files modified**:
- [src/app/globals.css](../../../src/app/globals.css) — add `body::before` and `body::after` pseudo-elements with inline SVG data URIs

**Reference**: [claude-design-context/styles.css](../../../claude-design-context/styles.css) — `body::before` (840×840 contour pattern) and `body::after` (1080×1080 elevation rings); both have light + dark variants

**Subtasks**:
1. Copy the SVG data URIs verbatim from the bundle's styles.css
2. Set `position: fixed; inset: 0; pointer-events: none; z-index: 0;` on both layers
3. Set `opacity: 0.04` (primary) and `opacity: 0.03` (secondary) for dark; `0.05` and `0.04` for light
4. Set `mix-blend-mode: overlay` (dark) or `multiply` (light) for filmic effect
5. Ensure content sits above textures via `z-index: 1` on `.app` / `.topbar`, `z-index: 2` on `.sidebar`
6. Measure paint cost: target <2ms cumulative on first paint; if exceeded, drop secondary layer or reduce opacity

**Acceptance**:
- Textures visible but not competing with content
- No paint-cost regression in DevTools Performance panel (compared against pre-R.1 baseline)
- Light + dark variants both render
- `prefers-reduced-data` respected? Spec doesn't require it — defer to R.6 polish

**Tests**: visual smoke + Lighthouse paint-cost comparison.

**Threat model**: Inline SVG data URI — no fetch, no XSS risk. Static content.

---

## Out of scope (explicit non-goals for R.1)

- Hero card restyle → R.2
- KPI strip restyle → R.2
- Drift module + Weekly Brief card → R.2
- Recent activity restyle → R.2
- Per-page restyle (Goals, Recurring, Transactions, Investments, Simulator, Settings) → R.3
- Goals "Moves" feature + simulator scenario unification → R.4
- Mobile rebuild → R.5
- Hero count-up motion, position-dot pulse polish, signature-footer live coordinates → R.6
- Source health data wiring into `<SignatureFooter>` (deferred to R.2 alongside trust strip data)
- `nav-routes.ts` changes (route deletion of `/drift`, `/insights` happens in R.2 with their fold-in)

---

## Dependencies

- None upstream — R.1 is the foundation phase
- Downstream: R.2+ all depend on R.1 tokens, fonts, mark, footer, shell

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Token swap breaks every page visually until R.2+ restyles | High | Long-lived `feat/redesign` branch; never merge to main until milestone done |
| Font loading regresses LCP | Medium | `font-display: swap`; preload critical fonts; Lighthouse before-after compare |
| Page-bg textures hit paint cost on slower devices | Low | Measure during T7 acceptance; drop secondary layer if regression observed |
| RSC boundary failure on `<FootholdMark>` (passing across server→client boundary in some context) | Medium | Mark is a pure server component — verify with grep that no client component receives it as prop; if it does, wrap render in client component (see CLAUDE.md "strike 2" lesson) |
| Existing tests break on token-class refactor | Medium | Run full vitest suite after each task; expect some snapshot/visual tests to need updates |

---

## Acceptance gates (full phase)

R.1 ships when:

1. ✅ All 7 tasks pass their per-task acceptance criteria
2. ✅ `npm run typecheck` passes
3. ✅ `npm run lint` passes
4. ✅ `npm run test` passes (with snapshot updates committed if applicable)
5. ✅ `npm run build` produces a green build
6. ✅ `npm run dev` renders the app on localhost:3000 without console errors
7. ✅ Manual UAT walking all 9 protected routes in both light + dark mode — verify shell renders new chrome, page content renders existing styles (intentionally inconsistent until R.2+)
8. ✅ Lighthouse audit on `/dashboard` shows no LCP / CLS / TBT regression vs baseline
9. ✅ Commit history on `feat/redesign` branch is clean (atomic per-task commits, no fixup noise)

---

## Locked decisions (2026-05-09 kickoff)

1. **Branch strategy**: `feat/redesign` long-lived branch off `main`. Each subsequent R.x phase merges into it; full milestone single-PRs to `main` after R.6 polish. Rejected the `data-theme="redesign"` runtime toggle — runtime branching for marginal preview benefit, dual-token CSS bloat.
2. **Font subset**: `['latin', 'latin-ext']` on both `IBM_Plex_Mono` and `Inter_Tight`. Adds accented EU character coverage (`ą`, `ł`, `č`) for multi-tenant rollout; payload cost ~10-15% over latin-only, acceptable under HTTP/2 multiplexing.
3. **`<SignatureFooter>` mount**: directly in `(app)/layout.tsx`. Rejected pre-emptive `<AppShell>` wrapper as YAGNI — refactor to wrapper if R.2 reveals shared shell logic worth extracting.
4. **Coordinates**: browser-tz-derived via static IANA-zone → city-coords lookup. Upgraded from R.6 deferral to R.1 inclusion — moves the footer from decorative placeholder to real-feeling signal day-one without server geo or PII concerns.

---

## Test plan summary

- **Unit**: new components (`<FootholdMark>`, `<SignatureFooter>`) get unit tests covering props + render branches + a11y attributes
- **Visual**: manual UAT against bundle's `design-system.html` reference for tokens/type/spacing; manual walk of 9 routes for shell visual regression
- **Performance**: Lighthouse before/after on `/dashboard` for LCP, CLS, TBT
- **A11y**: `prefers-reduced-motion` honored on dot pulse + brand pulse animations

---

## Cross-references

- [docs/redesign/SPEC.md](../SPEC.md) — milestone spec, locked decisions
- [docs/redesign/README.md](../README.md) — milestone orientation
- [claude-design-context/](../../../claude-design-context/) — bundle (canonical reference)
- [claude-design-context/styles.css](../../../claude-design-context/styles.css) — token + component CSS to translate
- [claude-design-context/design-system.html](../../../claude-design-context/design-system.html) — visual reference doc
- [CLAUDE.md](../../../CLAUDE.md) — architecture notes (especially "Auth split", "Dark mode wiring", RSC boundary lessons)
