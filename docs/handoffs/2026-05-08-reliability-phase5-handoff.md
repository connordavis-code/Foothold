# 2026-05-08 Reliability Phase 5 Handoff

## Current repo state

As of this handoff, local `main` is aligned with `origin/main`.

```bash
git status --short --branch
# ## main...origin/main
# ?? AGENTS.md
# ?? docs/handoffs/2026-05-06-plaid-cutover.md
```

Latest tracked commits on `main`:

```text
fdc29a1 fix(reliability): cap verbose reason on dashboard trust strip
89150ff fix(reliability): truncate verbose source-health reasons in /settings UI
cc38167 feat(reliability): Phase 5 dashboard trust strip
1f6b0d1 feat(goals): archive ↔ restore action on goal detail header
102fbc1 feat(goals): close Phase 3-pt3.b deferrals
828ca6a fix(reliability): Phase 4 review-2 — SnapTrade reconcile repairs broken rows
eaca263 fix(reliability): Phase 4 review — provider-aware reconnect + disconnect copy + provider label
```

Only intentional untracked files remain:

- `AGENTS.md`
- `docs/handoffs/2026-05-06-plaid-cutover.md`

Do not assume local work is unpushed before checking `git status --short --branch` and `git log --oneline --decorate -10`.

## Big picture

Foothold is already on Plaid Production. Wells Fargo and AmEx are routed through Plaid Production. Fidelity is routed through SnapTrade, not Plaid, because Plaid does not currently support the needed Fidelity production connection.

The reliability initiative has shipped through Phase 5:

- Phase 1: balance refresh hardening and null-clobber fix.
- Phase 2: pure sync-health classification.
- Phase 3: `getSourceHealth()` DB query and SnapTrade/Plaid capability resolution.
- Phase 4: `/settings` source health panel.
- Phase 5: dashboard trust strip.

Read `CLAUDE.md` first, especially:

- `Plaid Production cutover`
- `Reliability initiative`
- `Phase 4 (Settings health panel)`
- `Phase 5 (Dashboard trust strip)`

The detailed plan/status lives in `docs/reliability/implementation-plan.md`.

## Recent review outcomes

Phase 4 had three review issues and follow-up fixes:

1. SnapTrade reconnect initially routed through Plaid update-mode.
   Fixed by adding a provider branch in `SourceHealthRow` and a SnapTrade reconnect button that opens the SnapTrade Connection Portal.

2. Disconnect copy was Plaid-specific.
   Fixed by passing provider into `DisconnectItemButton` and rendering Plaid vs SnapTrade copy.

3. Provider label was missing from settings rows.
   Fixed by prefixing the secondary line with `Plaid ·` or `SnapTrade ·`.

Then one more Phase 4 issue was found:

- SnapTrade reconnect opened the right portal, but the redirect reconcile was insert-only. Existing broken rows were skipped as "known" and stayed `needs_reconnect`.
- Fixed in `828ca6a` with `partitionSnaptradeAuthsForReconcile()` and a repair path that flips existing non-active SnapTrade rows back to `active`, refreshes metadata, returns `repairedItemIds`, and syncs them on `/snaptrade-redirect`.

Phase 5 dashboard trust strip has also shipped, with follow-up truncation fixes:

- `cc38167 feat(reliability): Phase 5 dashboard trust strip`
- `89150ff fix(reliability): truncate verbose source-health reasons in /settings UI`
- `fdc29a1 fix(reliability): cap verbose reason on dashboard trust strip`

## Known operational reminders

Run this if the composite `error_log` index from reliability Phase 3 has not been applied to the database yet:

```bash
npm run db:push
```

The app remains functional without it, but source-health queries fall back to less targeted indexing.

## Verification status

Recent review passes ran:

```bash
npm run typecheck
npm test
```

The latest observed full-suite count during review was `447/447` passing before the final Phase 5 truncation commits. A fresh session should rerun the suite before making further changes.

Recommended quick restart block:

```bash
git fetch --prune
git status --short --branch
git log --oneline --decorate -10
npm run typecheck
npm test
```

## Browser UAT still worth doing

Browser UAT was not completed by the agents because the app is auth-gated and some flows require real provider redirects.

High-value UAT:

1. `/settings`
   - Confirm Plaid rows show provider label and correct health summary.
   - Confirm SnapTrade rows show provider label and correct health summary.
   - Confirm long health reasons truncate gracefully.
   - Confirm dark mode pills/copy remain legible.

2. SnapTrade reconnect loop
   - Manually flip a SnapTrade row to `login_required`.
   - From `/settings`, click Reconnect on that row.
   - Complete the SnapTrade Connection Portal.
   - On `/snaptrade-redirect`, expect `Reconnected 1 brokerage`, not `No changes`.
   - Return to `/settings`, expect the row to be active/no reconnect pill.

3. `/dashboard`
   - Confirm the Phase 5 trust strip appears near the top.
   - Confirm healthy state is calm and compact.
   - Confirm degraded/failed/reconnect states are visible without overwhelming the page.
   - Confirm long reasons are capped/truncated.

## Suggested next work

The natural next phase is Reliability Phase 6: freshness context on key numbers.

Start from `docs/reliability/implementation-plan.md`, Phase 6. The likely surfaces are:

- dashboard net worth / investments freshness context
- forecast baseline freshness context
- any "as of" copy that should derive from the same `getSourceHealth()` truth model

Before implementing Phase 6, do the UAT above if possible. Phase 6 depends on the same source-health model, so it is better to catch any Phase 4/5 trust-copy issues before spreading that model across more surfaces.
