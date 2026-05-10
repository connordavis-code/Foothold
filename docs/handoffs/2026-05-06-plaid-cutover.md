# Session handoff — 2026-05-06 evening

> Read this first if you're picking up Foothold mid-Plaid-cutover.
> Pair with `CLAUDE.md` for general project context.

## Where we are

**Plaid Production is live but only partially working.**

| Bank | Status |
|---|---|
| Wells Fargo | ✓ Connected via real OAuth in production |
| American Express | ✗ Errors during Plaid Link |
| Fidelity | ✗ Errors during Plaid Link |

Vercel env: `PLAID_ENV=production`, `PLAID_SECRET=<production secret>`. Cannot revert to sandbox without losing the WF production item.

## What shipped this session (origin/main)

Eight commits, all live:

1. `a436280` feat(mobile): Phase 2 — operator tables on mobile
2. `d1a6de6` feat(dashboard): tap-to-edit on recent-activity rows (mobile)
3. `3b6153f` fix(dashboard): drilldown on upcoming-recurring rows
4. `0f778d6` feat(mobile): 5-tab bar with More drawer; drop top-bar hamburger
5. `55d542f` docs(claude.md): record mobile Phase 1+2 + follow-ons
6. `a501ebd` feat(mobile): Phase 3 — /simulator portrait pass
7. `479cce3` docs(claude.md): record mobile Phase 3
8. `cca6b0b` feat(plaid): OAuth redirect handoff for production-mode Link
9. `e932f70` fix(plaid): oauth-redirect page auto-routed before user could read error
10. `f7e0630` feat(plaid): disconnect button on /settings

(That's 10. Counting drift between memory note and reality is normal — `git log --oneline a436280..` is canonical.)

## What's blocked on user input

User needs to provide:
1. Screenshot of the exact error Plaid Link shows when picking AmEx or Fidelity
2. Confirm: did AmEx appear in the institution search? Did Fidelity?

These two facts disambiguate two hypotheses:

### Hypothesis 1: Gate-3 per-institution approval (probable)

Plaid Production access is granted per-institution. Wells Fargo cleared in the May 1 submission; AmEx + Fidelity may still be pending. **Fix**: file follow-up production-access requests in Plaid Dashboard → Production access → request specific institutions. Wait days-to-weeks. No code change.

CLAUDE.md > Lessons learned says approval odds 25-35% first-pass, 60-70% with follow-up.

### Hypothesis 2: Multi-product filter (less likely, only explains AmEx)

`linkTokenCreate` requests `products: ['transactions', 'investments']` (default `PLAID_PRODUCTS`). AmEx is credit-card-only with no investments product, so Plaid Link filters it out of search OR fails on connect. Fix:

```ts
// src/lib/plaid/actions.ts (createLinkToken)
products: ['transactions'] as Products[],
additional_consented_products: ['investments'] as Products[],
```

This doesn't explain Fidelity (which DOES have investments). If Fidelity fails with the same error as AmEx, hypothesis 1 wins. If they fail with different errors, the truth is mixed and may need both fixes.

## Architecture pointers

- `src/lib/plaid/oauth-handoff.ts` — sessionStorage helpers for the OAuth round-trip
- `src/app/oauth-redirect/oauth-redirect-client.tsx` — OAuth re-entry; parent/child split prevents the auto-route bug
- `src/lib/plaid/actions.ts` → `disconnectItemAction` — best-effort `itemRemove` + cascade delete via plaid_item DELETE
- `src/components/plaid/disconnect-item-button.tsx` — trash icon + AlertDialog gate

## Loose ends (not blocking)

1. **CLAUDE.md > Roadmap > Done** does NOT yet record the OAuth handoff / disconnect button / partial cutover work. Update at session-end of the *next* session, after AmEx/Fidelity is resolved.
2. **CLAUDE.md > Next up** still lists "Reconnect once Plaid approved" — partially obsolete (WF reconnected; flip remaining institutions waits on Plaid).
3. **W-06 (sparkline phantom-jump on new-account-mid-30d-window)** will fire visibly on the dashboard when new production items are connected. Cosmetic, self-heals after 30 days. Don't be alarmed.

## What to do at session start

1. Read this file.
2. Ask user for the AmEx/Fidelity screenshot if not already provided.
3. Confirm hypothesis based on screenshot wording + search-result behavior.
4. If hypothesis 1: guide user to Plaid Dashboard institution-access request. End of code session.
5. If hypothesis 2 (or mixed): make the products / additional_consented_products edit in `src/lib/plaid/actions.ts`, redeploy, retry.

## Memory pointer

Auto-memory: `project_plaid_cutover_inprogress.md` mirrors this state in 1/5 the size. Already indexed in MEMORY.md.
