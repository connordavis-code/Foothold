# Product

## Register

product

## Users

A single, financially-fluent operator using Foothold daily as their personal
finance source-of-truth. Comfortable with Mercury, Linear, Raycast, Notion;
expects keyboard-driven workflows, dense data, and tooling that respects
their hands. Currently the developer themselves; the system is designed for
single-user but the patterns should generalize.

Sessions are short and bursty: morning check-in (what changed overnight),
mid-week scan (am I on pace?), end-of-month reckoning (where did the money
actually go?). Most sessions are 2–5 minutes; sustained sessions on
`/simulator` and `/transactions` go longer.

Job to be done: turn raw Plaid signal into a confident read on net worth,
spending drift, recurring outflows, and goal progress — without the user
having to assemble it themselves in a spreadsheet.

## Product Purpose

Foothold is a personal finance pro-tool. Plaid syncs accounts; Foothold
shapes the signal into surfaces that each answer one specific question:

- `/dashboard` — what should I look at right now?
- `/insights` — what did last week mean?
- `/transactions` — what did I spend on, and can I re-categorize at speed?
- `/investments` — where am I overexposed?
- `/drift` — what's running hot?
- `/goals` — am I on pace?
- `/recurring` — what's quietly draining me?
- `/simulator` — what if?

Success is measured in trust and retention: does the user open it daily,
and do they trust the numbers without double-checking elsewhere?

## Brand Personality

**Confident, editorial, restrained.**

Foothold has taste — Mercury / Copilot Money / Ramp lineage. Warm paper
canvas under elevated cards. JetBrains Mono on every numeral. Source Serif
on `/insights` narrative only. Deep-green hero gradient (`160` hue), never
navy. The interface should disappear into the task, but the moments where
it asserts itself (the hero card, the receipts grid, the operator table)
should feel quietly premium.

Voice in copy: direct, specific, unflinching about what the numbers mean.
"No change yet this month" beats "↑$0.00." "21 transactions match" beats
"Filtered to 21 results." Show your work — drift baselines are explained
inline, not buried in a tooltip.

## Anti-references

What Foothold should NOT look like:

- **Default shadcn / SaaS-cream.** The "every modern app" reflex. White
  cards on white, Inter everywhere, slate-zinc-blue palette, no opinion.
  Foothold's warm-paper canvas + JetBrains Mono numerals + 160-hue
  gradient exist precisely to refuse this lane.
- **Mint / Personal Capital / pie-chart dashboards.** Donut charts,
  spending wheels, and gauge widgets are old-school personal finance —
  the domain reflex. Foothold's editorial register and structured tiles
  refuse it.
- **Boilerplate AI-feature treatments.** Sparkle icons on every AI
  surface, gradient-text "AI Insight" headlines, glowing borders on LLM
  output. Foothold uses Sparkles sparingly (the Generate action only),
  prefers structured receipts to magical glow, and presents Claude's
  narrative as a serif article rather than a sci-fi panel.
- **Robinhood / consumer trading aesthetics.** Aggressive red/green on
  every cell, gamified animations, candy colors. Foothold reserves
  `text-destructive` for genuine over-state and `text-positive` for
  unusual income; everything else stays neutral.
- **Crypto-bro maximalism.** Dark-by-default, neon-on-black, terminal-
  green textures. Foothold's dark mode is parity-mapped from the same
  warm-paper system — never a costume.

## Design Principles

1. **Editorial over functional cliché.**
   Type, rhythm, and warm canvas earn the daily-use loyalty that grids and
   gauges don't. Eyebrow + display number + supporting copy on
   `bg-surface-elevated` is the canonical recipe.

2. **Operator ergonomics are first-class.**
   Keyboard, density, and the ⌘K palette ship alongside the visual
   register, never bolted on after. j/k + shift-click + ⌘↑/⌘↓ + `/` on
   `/transactions` is the standard, not the exception.

3. **Honest cells beat fake numbers.**
   "—" with a reason beats $0.00. The hero card's `FLAT_THRESHOLD` and
   the portfolio summary's `emptyLabel="No cost basis from Plaid yet"`
   are canonical. Refuse fabricated precision.

4. **AI is a co-pilot with receipts.**
   Claude's narrative leads on `/insights`, but every claim is backed by
   a structured tile (Spending / Drift / Goals / Recurring) that links
   to where the user can verify. No magical glow, no Sparkle inflation.

5. **One canvas, one rhythm, one vocabulary.**
   Warm-paper surface (`--surface-paper`), JetBrains Mono on numerals,
   the eyebrow recipe (`.text-eyebrow`) on every page. Consistency is
   the affordance — operators navigate faster when structure is expected.

## Accessibility & Inclusion

Target WCAG AA throughout. Specific commitments:

- **Reduced motion.** All framer-motion + custom animations gate on
  `prefers-reduced-motion: reduce` and fall back to instant. Already
  honored by `<MotionStack>` and `.animate-hero-shimmer`; new motion
  must follow.
- **Color blindness.** Semantic state never relies on color alone.
  Positive/negative cells include glyph (↑ ↓) or text label. Tone pills
  use shape + label + color, never color alone.
- **Keyboard.** Every interactive element reachable via Tab. `?` is the
  documentation surface for power-user shortcuts.
- **Focus rings.** All interactive elements show a visible focus ring
  (not the browser default — varies by browser). Use
  `focus-visible:ring-2 focus-visible:ring-ring`.
- **Plain-language errors.** Error messages name the problem and suggest
  the fix. No error codes, no "something went wrong."
