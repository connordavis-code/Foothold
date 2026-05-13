---
description: Visual UAT swarm — 3 parallel agents catch invented Tailwind classes, bare HSL tokens, missing mobile parity, and design-system drift before commit.
argument-hint: [scope] optional path glob; defaults to changed .tsx vs main
---

# UAT Swarm — `/uat-fix`

Run a 3-agent parallel audit on visual/structural code quality, targeting the
bug classes from recent R.3.x polish commits (invented `bg-bg-2`, `text-bg`,
raw `<select>`, missing Fraunces on titles, sub-44px tap targets).

You are the orchestrator. Do these steps in order.

## Step 1 — Determine scope

- If `$ARGUMENTS` is non-empty, treat it as a glob/path expression; expand with
  `git ls-files` filtered by the glob.
- Else run `git diff main...HEAD --name-only -- 'src/**/*.tsx'` to get
  changed-vs-main files.
- If the resulting file list is empty, print "no .tsx files in scope, exiting"
  and stop. Do not dispatch agents.
- Print: `Dispatching 3 parallel UAT agents on N files: <comma-separated list>`.

## Step 2 — Ensure report directory

Run `mkdir -p .claude-reports/` (idempotent).

## Step 3 — Dispatch 3 agents IN PARALLEL

Send ONE message containing THREE Agent tool calls. Each uses
`subagent_type: general-purpose`. Do not run them sequentially; the whole
point is concurrency.

For each agent, substitute `<FILES>` with the scope list from Step 1, one
relative path per line.

### Agent A — Token Linter

```
You are the Token Linter — Agent A of the Foothold UAT Swarm.

GOAL: Find Tailwind classes and CSS variable usages in the listed .tsx files
that won't render correctly because the class/variable doesn't exist or is
wrapped wrong.

CRITICAL CONTEXT — Foothold uses a DUAL-TOKEN system in src/app/globals.css:

  TYPE 1 — HSL FRAGMENT tokens (defined as `--name: 240 5% 50%;`):
    Cannot be used as raw `var(--name)` in CSS. MUST be wrapped as
    `hsl(var(--name))` OR mapped through tailwind.config.ts to be reachable
    as a Tailwind className.
    Examples in this repo: --accent, --border, --primary, --surface-paper,
    --positive, --negative, --chart-1..6, --destructive, --muted.

  TYPE 2 — COMPLETE-COLOR tokens (defined as `--name: hsl(...)` or `#hex`):
    Usable as raw `var(--name)` in CSS or `bg-[--name]` arbitrary-value
    syntax in Tailwind. NOT automatically Tailwind classes.
    Examples in this repo: --bg, --bg-2, --paper, --paper-2, --surface,
    --surface-2, --text, --text-2, --text-3, --semantic-success/-caution/
    -danger/-info, --foothold-green, --deep-forest, --hairline, --dot-halo.

  RECENT BUG CLASS (from git log): a TYPE 2 token like `--bg-2` exists in
  CSS, but is NOT mapped through Tailwind, so `bg-bg-2` is an INVALID
  className that compiles to nothing visible. The valid form is
  `bg-[--bg-2]` (arbitrary-value, complete-color is OK raw). Commits
  9ac9e6e and cdae97c both fixed this in the simulator.

GROUND TRUTH — read these files FIRST before scanning:

  1. tailwind.config.ts — extract every key under `theme.extend.colors`
     (recurse nested objects: e.g., `primary.DEFAULT` produces both
     `primary` and `primary-foreground` keys). Also extract keys under
     `borderRadius`, `backgroundImage`, `transitionTimingFunction`,
     `transitionDuration`, `fontFamily`. The union of these is the legal
     Tailwind class universe for color/radius/bg-image/transition/font
     suffixes.

  2. src/app/globals.css — extract every `--*` custom property from
     `:root` AND `.dark` blocks. Classify each:
     - TYPE 1 if value matches `^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?%\s+-?\d+(\.\d+)?%`
     - TYPE 2 if value starts with `hsl(`, `hsla(`, `rgb(`, `rgba(`, `#`,
       or `var(`
     - OTHER otherwise (radius, motion, font names — skip for color checks)

  3. ALSO in globals.css: extract every class selector defined inside
     `@layer utilities { ... }` or `@layer components { ... }` blocks
     (regex: `\.([a-z0-9-]+)\s*[,{]`). These are custom utilities that
     Tailwind will honor even though they're not in theme.extend. Treat
     them as legal in addition to the Tailwind-mapped class universe.
     Examples in this repo: `.text-eyebrow`, `.tabular`, `.num`,
     `.sig-footer`, `.animate-hero-shimmer`.

SCAN — for each .tsx file in <FILES>:

  1. Extract every `className="..."` string AND every className value
     inside template literals / `cn(...)` calls / `clsx(...)` calls.
     Split by whitespace into tokens.

  2. For each token shaped like `<prefix>-<X>` where prefix is one of
     `bg | text | border | ring | fill | stroke | from | to | via |
     decoration | divide | placeholder | outline | shadow | accent`:
       - Strip any `dark:`, `hover:`, `focus:`, `md:`, etc. modifiers
         from the front.
       - Verify `<X>` is a leaf key in tailwind.config.ts theme.extend.colors.
       - If not present, AND the token doesn't match a built-in Tailwind
         palette (slate, gray, zinc, neutral, stone, red, orange, amber,
         yellow, lime, green, emerald, teal, cyan, sky, blue, indigo,
         violet, purple, fuchsia, pink, rose) — REPORT as
         INVALID_TAILWIND_CLASS (severity critical).

  3. For each token using arbitrary-value syntax `<prefix>-[<value>]`:
       - If `<value>` contains `var(--name)` or is `--name`:
         - Look up --name in the globals.css classification.
         - If TYPE 1 (HSL fragment) AND value is bare `var(--name)` or
           `--name`, REPORT as BARE_HSL_FRAGMENT (severity critical).
           Correct form: `<prefix>-[hsl(var(--name))]`.
         - If the variable doesn't exist in globals.css at all, REPORT as
           UNKNOWN_CSS_VAR (severity critical).

  4. For each inline style prop `style={{ ... }}` containing
     `var(--name)`:
       - Same TYPE 1 vs TYPE 2 check. TYPE 1 bare in any color-valued
         property (color, backgroundColor, borderColor, fill, stroke) is
         BARE_HSL_FRAGMENT (critical).

  Skip tokens you can't classify safely — false positives are worse than
  missed findings.

OUTPUT — print exactly ONE JSON object on the last line, prefixed by the
literal text `AGENT_A_RESULT:`. Schema:

  {
    "agent": "token-linter",
    "findings": [
      {
        "severity": "critical" | "warn" | "info",
        "category": "INVALID_TAILWIND_CLASS" | "BARE_HSL_FRAGMENT" | "UNKNOWN_CSS_VAR",
        "file": "src/...",
        "line": <number>,
        "snippet": "<offending substring, ~80 chars>",
        "fix": "<one-line suggested replacement>"
      }
    ],
    "stats": { "filesScanned": <N>, "tokensChecked": <N> }
  }

<FILES>
{{SCOPE_FILES}}
</FILES>
```

### Agent B — Mobile / Responsive Parity Checker

```
You are the Mobile/Responsive Parity Checker — Agent B of the Foothold
UAT Swarm.

GOAL: Find interactive elements with sub-44px tap targets, hardcoded colors
that break dark mode, and desktop-only code paths missing mobile counterparts.

CRITICAL CONTEXT:
- Foothold has a mobile-first design phase shipped. All Button + Input
  defaults use h-11 (44px) floor. Custom interactive elements (links,
  divs with onClick) should match.
- CLAUDE.md "Dark mode wiring" audit confirmed the codebase has ZERO
  hardcoded color utilities. New code must preserve this. Exception:
  `text-white` IS valid on `bg-gradient-hero` (dark in both themes by
  design) and inside the email digest (`src/app/api/cron/digest/route.ts`,
  which renders server-side HTML).
- Mobile-vs-desktop split is CSS-only via `hidden md:block` /
  `block md:hidden` (both branches ship — no JS branching). Components
  that render a `<table>` or wide grid should have a counterpart `<MobileList>`
  in the same file.

SCAN — for each .tsx file in <FILES>:

  1. HARDCODED_COLORS (severity warn):
     - className containing any of: `bg-white`, `bg-black`, `text-white`
       (allowed ONLY when sibling/parent has `bg-gradient-hero`),
       `text-black`, `bg-gray-\d+`, `text-gray-\d+`, `bg-slate-\d+`,
       `text-slate-\d+`, `bg-zinc-\d+`, `bg-neutral-\d+`, `border-gray-\d+`.
     - style prop values containing `#[0-9a-fA-F]{3,8}` literals.
     - style prop values containing literal `rgb(` or `hsl(` (with raw
       numbers, not `hsl(var(...))`).
     Report file:line:snippet and a suggested editorial-token replacement.

  2. SUB_44PX_TAP_TARGET (severity warn):
     - <Button>, <button>, <Link>, <a> elements with `h-X` or `min-h-X`
       where X resolves to less than 11 (Tailwind's `h-11` = 44px).
       `h-8` (32px), `h-9` (36px), `h-10` (40px) are all under floor.
     - Same elements with NO height class AND no `size="..."` prop AND
       containing only an icon (lucide-react `<X />` or similar) — MAY
       be intentional toolbar icon; mark severity info, not warn.

  3. MISSING_MOBILE_PATH (severity info, not warn):
     - File imports `@/components/ui/table` (Table, TableHeader, TableBody)
       OR contains a `<thead>` JSX tag.
     - AND the same file does NOT contain `md:hidden` or `hidden md:block`
       or import `<MobileList>` / `MobileTransactionsShell` /
       `RecurringTabs` (known mobile-aware wrappers).
     Could be intentional (admin pages, settings detail) — info severity
     so it surfaces without blocking.

OUTPUT — print exactly ONE JSON object on the last line, prefixed by
`AGENT_B_RESULT:`. Schema:

  {
    "agent": "mobile-parity",
    "findings": [
      {
        "severity": "critical" | "warn" | "info",
        "category": "HARDCODED_COLORS" | "SUB_44PX_TAP_TARGET" | "MISSING_MOBILE_PATH",
        "file": "src/...",
        "line": <number>,
        "snippet": "<~80 chars>",
        "fix": "<one-line suggestion>"
      }
    ],
    "stats": { "filesScanned": <N> }
  }

<FILES>
{{SCOPE_FILES}}
</FILES>
```

### Agent C — Design System Checker

```
You are the Design System Checker — Agent C of the Foothold UAT Swarm.

GOAL: Verify the redesign's design-system rules are applied consistently:
Fraunces page titles, themed Select usage, editorial surface tokens, eyebrow
utility class.

CRITICAL CONTEXT (read CLAUDE.md's "Architecture notes > App shell" and
"Editorial tokens" sections first; if docs/redesign/SPEC.md exists, also
read it for R.0 locked decisions):

  - PAGE TITLES use editorial Fraunces font, often italic. Pattern in the
    redesign: an <h1> inside *PageHeader components uses `font-serif italic`
    or the `font-serif` class. Recent commit 456f6b5 did a whole-app sweep
    making this canonical. New page-header components must follow.

  - FORMS use the themed Select from `@/components/ui/select` (Radix-backed,
    matches the design system), NEVER a raw lowercase `<select>` HTML
    element. Commit 0852b8a fixed 7 simulator files that had raw selects.

  - CARDS / PANELS / SURFACES use editorial tokens:
      bg-surface-paper  (the canvas)
      bg-surface-elevated  (raised cards — preferred for content cards)
      bg-surface-sunken  (inset rows, form input affordance)
    Raw shadcn `bg-card` / `bg-popover` are acceptable for dropdowns and
    popovers (their original semantic) but flatten the editorial layering
    if used for primary content cards. Info severity only.

  - EYEBROW labels (small uppercase letter-spaced labels above titles)
    should use the `.text-eyebrow` utility class defined in globals.css.
    A manual `text-xs uppercase tracking-wider` combo bypasses the
    canonical letter-spacing/size and drifts.

SCAN — for each .tsx file in <FILES>:

  1. PAGE_TITLE_WITHOUT_FRAUNCES (severity warn):
     - File path matches `src/app/(app)/**/page.tsx`,
       `src/components/**/*page-header.tsx`, or
       `src/components/**/*header.tsx` (case-insensitive on filename).
     - Find the first <h1> in the JSX.
     - If its className does NOT include `font-serif` AND no nearby
       wrapper component name ends in `PageHeader` or `PageTitle`,
       REPORT.

  2. RAW_NATIVE_SELECT (severity critical):
     - Any JSX opening tag `<select` (lowercase) — the native HTML
       element — in files NOT under `src/components/ui/`.
     - Note: the themed `<Select>` (capital S) from
       @/components/ui/select is the correct usage and must NOT be
       reported.

  3. RAW_SHADCN_SURFACE (severity info):
     - className contains `bg-card` (not as part of `bg-card-foreground`
       or `text-card-foreground`) on an element that looks like a primary
       content card (file ends in *-card.tsx, or JSX uses <Card>, or the
       element wraps significant content).
     - className contains `bg-popover` outside of a dropdown/popover
       component.

  4. MANUAL_EYEBROW (severity info):
     - className combining `uppercase` AND `tracking-` (any value)
       AND a small-text class (`text-xs`, `text-[10px]`, `text-2xs`) —
       all three on the same element.
     - REPORT as info; suggest replacing with `text-eyebrow`.

OUTPUT — print exactly ONE JSON object on the last line, prefixed by
`AGENT_C_RESULT:`. Schema:

  {
    "agent": "design-system",
    "findings": [
      {
        "severity": "critical" | "warn" | "info",
        "category": "PAGE_TITLE_WITHOUT_FRAUNCES" | "RAW_NATIVE_SELECT" | "RAW_SHADCN_SURFACE" | "MANUAL_EYEBROW",
        "file": "src/...",
        "line": <number>,
        "snippet": "<~80 chars>",
        "fix": "<one-line suggestion>"
      }
    ],
    "stats": { "filesScanned": <N> }
  }

<FILES>
{{SCOPE_FILES}}
</FILES>
```

## Step 4 — Synthesize

After all three agents return:

1. Parse each agent's `AGENT_X_RESULT:` JSON. If any agent failed to
   return valid JSON, note that in the report (don't fail the whole run).
2. Concatenate `findings[]` across all three agents.
3. Sort: severity (critical → warn → info), then by file path, then by
   line number.
4. Write `.claude-reports/visual-uat.md` with this structure:

```markdown
# Visual UAT Report

Generated: <ISO 8601 timestamp>
Branch: <current git branch>
Scope: <N> files

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | <N>   |
| Warn     | <N>   |
| Info     | <N>   |

Agents:
- Token Linter: <agent stats>
- Mobile Parity: <agent stats>
- Design System: <agent stats>

## Critical

<for each critical finding:>
### `src/path/to/file.tsx:LINE` — CATEGORY
```
<snippet>
```
**Fix:** <suggestion>

## Warn

<same shape>

## Info

<same shape>
```

5. Print to the user (terse, no preamble):
   - The report path
   - One-line summary: `Critical: X · Warn: Y · Info: Z`
   - The first 3 critical findings inline (file:line + one-line fix)
     — so the worst stuff is visible without opening the report.
   - If criticals == 0: print "Clean — no critical findings."

## Step 5 — Done

Do NOT auto-fix anything. This command is a read-only audit. The user
decides which findings to address.
