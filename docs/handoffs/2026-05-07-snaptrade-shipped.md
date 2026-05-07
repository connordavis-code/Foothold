# Session handoff — 2026-05-07

> Read this first if you're picking up after the multi-aggregator session.
> Pair with `CLAUDE.md` > Architecture > "Multi-aggregator: external_item + dispatcher".

## Where we are

**Multi-aggregator is shipped end-to-end.** Foothold now holds:

| Provider | Institution | Status |
|---|---|---|
| Plaid | Wells Fargo | ✓ Active, syncing |
| Plaid | AmEx Gold (·5) | ✓ Active, syncing |
| Plaid | AmEx Blue Cash (·9) | ✓ Active, syncing |
| SnapTrade | Fidelity (ROTH IRA + Individual) | ✓ Active, syncing |

`/investments` shows real holdings + cost basis + realistic gain/loss math. The multi-aggregator scaffolding (Phase A) means existing surfaces like dashboard, drift, forecast, /goals consume SnapTrade-sourced data without changes — JOINs go through `external_item` with the `provider` discriminator.

## What shipped this session (origin/main, oldest → newest)

```
fb0e421  fix(plaid): products split (transactions required, investments optional) — unblocks AmEx
cebde2d  refactor(schema): plaid_item → external_item with provider discriminator + JSONB providerState
deb1d43  fix(drift): RSC boundary — wrap MobileList in client component
7bb611b  feat(snaptrade): Phase B data layer (client, actions, sync, dispatcher)
d96d6e9  feat(snaptrade): Phase C UI (provider picker, /snaptrade-redirect, unified disconnect)
d925572  docs(claude.md): multi-aggregator architecture + Phase A/B/C + drift RSC fix
a633848  fix(snaptrade): per-account fetch isolation + dispatcher-level logError
b8ebf1d  fix(snaptrade): avg_purchase_price * units (per-share → total cost_basis)
93fd127  chore: cost-basis backfill migration + diagnostic scripts
```

Two SQL migrations applied to prod DB:
1. `docs/migrations/2026-05-06-external-item.sql` — schema rename + columns
2. `docs/migrations/2026-05-07-snaptrade-user.sql` — snaptrade_user table + secret nullable
3. `docs/migrations/2026-05-07-snaptrade-cost-basis-backfill.sql` — one-shot cost_basis * quantity for SnapTrade rows

## Open items, priority order

### Should fix next session

**Plaid `balance_refresh` cron is failing** — `error_log` shows multiple `cron.balance_refresh.item` entries with HTTP 400 from Plaid (latest at 2026-05-07 18:00 UTC, both items failed: 0 refreshed, 2 failed). Started recent. Three plausible root causes: (a) AmEx not supporting `accounts/balance/get` despite the products fix; (b) WF item entered some state where balance/get rejects; (c) Plaid Production rate-limit kicking in. Diagnostic: `node scripts/recent-errors.mjs` to see latest entries; the stack traces point at `accountsBalanceGet`. Likely fix is filtering balance_refresh by account-type=depository OR catching 400s per-item and continuing.

### Polish (when convenient)

**`/snaptrade-redirect` defers initial sync to nightly cron.** The reconcile action `syncSnaptradeBrokeragesAction` doesn't return new item IDs, so the redirect page can't trigger immediate sync. Tweak: have it return the inserted IDs, then loop `syncItemAction(id)` from the client. Means new SnapTrade users see their data on /investments instantly instead of waiting up to 24h.

**Provider-neutral column rename.** SnapTrade reuses `plaid_account_id` / `plaid_security_id` / `plaid_investment_transaction_id` as provider-stable IDs (UUIDs don't collide). Renaming to `provider_*_id` is honest but cosmetic — would require a migration + ~15 file updates. Not load-bearing.

**`refreshBrokerageAuthorization` button** on each SnapTrade /settings item. SnapTrade's free tier serves cached-daily data; the API has a manual-refresh endpoint that pushes the brokerage to re-fetch (rate-limited). Useful when you want to verify against a fresh Fidelity quote.

### Decision needed eventually

**SnapTrade tier.** Currently on free key (5 brokerage connections, cached daily). Upgrade to Pay-as-you-Go (~$2/connected-user/mo) for real-time positions/balances. For a personal app where you check Foothold once a day, free is fine. Worth flipping if you ever want intraday or if a brokerage's cache becomes stale enough to matter.

## Architecture pointers (the load-bearing stuff)

- `external_item.secret` is **nullable** — Plaid sets it (encrypted access_token), SnapTrade leaves NULL (per-user `userSecret` lives on `snaptrade_user`).
- `PlaidExternalItem` type alias in `src/lib/plaid/sync.ts` narrows `secret: string` for Plaid helpers. Plaid actions defensively filter `provider='plaid'` in selects.
- Sync entry: `syncExternalItem(id)` in `src/lib/sync/dispatcher.ts`. Wraps in try/catch that writes to `error_log` before re-throwing — so SyncButton failures don't vanish into Vercel logs.
- Disconnect entry: `disconnectExternalItemAction` in `src/lib/sync/actions.ts` (separate file from dispatcher because `'use server'` modules can only export server actions).
- SnapTrade sign convention: activity amounts flipped at sync boundary so positive = cash OUT (matches Plaid).
- SnapTrade column reuse: `plaid_*_id` columns hold SnapTrade UUIDs for SnapTrade rows. Schema invariant comment on `holdings.cost_basis` warns about per-share vs total convention.
- UI gating: `snaptradeConfigured()` is server-evaluated, passed as `snaptradeEnabled` prop to `<ConnectAccountButton>`. Keys unset → brokerage card hidden in picker.

## Lessons captured (CLAUDE.md > Lessons learned)

- "Don't pass functions across the server→client boundary in config props" — second strike for non-serializable values across RSC. One more occurrence triggers promotion to architecture note or lint rule per three-strike rule.

## Loose ends from prior session (2026-05-06-plaid-cutover.md)

All resolved this session:
- ✓ AmEx connect (products fix)
- ✓ Fidelity (via SnapTrade rather than Plaid)
- ✓ CLAUDE.md > Roadmap > Done updated with OAuth handoff / disconnect button / partial cutover

## Verify on next session start

```bash
# Confirm SnapTrade holdings have correct (total) cost_basis
node scripts/inspect-snaptrade-holdings.mjs

# Check for new error_log entries since last session
node scripts/recent-errors.mjs

# Confirm git is clean
git status
```

Expected: all SnapTrade rows show "total (ok)" or harmless false-positive flags; error_log has the cron.balance_refresh failures noted above as the most recent entries; git is clean (last commit `93fd127`).
