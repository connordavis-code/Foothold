# Cost & viability — opening Foothold to multiple users

**Date:** 2026-05-10
**Frame:** Friends-and-family beta scale (5–20 users), modeled as
unit economics for a future PAID product.
**Method:** Codebase API-call inventory + 2026 SaaS pricing research +
per-user data-volume estimate. See sibling docs in `docs/multi-user/`
for the prior product-scaling and code-correctness audits.

---

## TL;DR

- **Fixed costs at 5–20 users are trivial: ~$21/mo** (Vercel Pro for
  the 4 cron jobs + domain). Supabase, Resend, SnapTrade are all in
  free tier at this scale.
- **Plaid Production cost varies sharply with user account mix** —
  ~$50–60/user/mo for credit-only or depository-only items, but
  ~$110/user/mo for users with brokerage accounts in Plaid. The
  ~$50/user/mo gap is the `investments/holdings/get` +
  `investments/transactions/get` daily calls. **Investments gating
  is already implemented** — `syncInvestmentsForItem` early-returns
  when no `account.type === 'investment'` exists (regression-tested
  in [src/lib/plaid/capabilities.test.ts](../src/lib/plaid/capabilities.test.ts)).
  So a credit-only user like AmEx never paid for these calls. Plaid
  pricing is opaque overall — your actual contract may differ ±50%+.
- **Anthropic LLM is a rounding error** (~$5–20/user/month, dropping
  with cache hits). Already aggressively optimized via
  `forecast_narrative.inputHash` dedup + insight `hasNewActivity`
  smart-skip.
- **Viability as a paid product depends on user mix.** At $50/mo for
  credit/depository-only users you're roughly break-even before
  contract negotiation. At $50/mo for brokerage-heavy users you'd
  lose ~$60/user/month. Negotiated Plaid contract is the single
  biggest unlock for either persona.
- **At friends-and-family scale (20 users) you're absorbing $1,000–
  $2,600/month** in Plaid + infra, depending on how many users
  connect brokerages via Plaid (vs SnapTrade, which is free). Your
  personal mix (Wells Fargo + AmEx via Plaid + Fidelity via
  SnapTrade) lands at the bottom of that range — closer to ~$50/mo
  for your one user today.

The single highest-leverage action: **get a real Plaid Production rate
card.** Everything below the Plaid line in this doc inherits the ±50%
uncertainty of the assumed rates.

> **Correction history (2026-05-11):** an earlier version of this doc
> framed the per-user/mo cost as a flat ~$110 across all users. That
> overstated cost for users without Plaid brokerage accounts because
> it failed to account for the investments-gating early-return that
> already existed in `syncInvestmentsForItem`. The current version
> splits the cost by account mix.

---

## Cost shape

### Fixed costs (independent of user count below tier limits)

| Service | Tier | Why required |
|---------|------|--------------|
| Vercel | Pro ($20/mo) | Hobby caps at 1 cron/day; Foothold has 4 (insight, sync, balances 6h, digest) |
| Domain (`usefoothold.com`) | ~$1.25/mo | ~$15/year amortized |
| Supabase | Free | 50K MAU + 500MB DB ceiling — not approached at 20 users |
| Resend | Free | 100/day, 3K/mo cap; ~1.2K/mo at 20 users fits |
| **Total** | **~$21/mo** | |

### Variable costs (per active user per month)

Two reference user mixes. Pick the one that matches your beta cohort.

**Mix A — credit-only or depository-only Plaid items** (e.g.
Wells Fargo checking + savings + AmEx + brokerage on SnapTrade —
your personal mix today):

| Service | $/user/mo (est.) | Notes |
|---------|------------------|-------|
| Plaid Production | ~$50–60 | Investments calls SKIPPED (gating already in place); see breakdown below |
| Anthropic Haiku 4.5 | $5–20 | Cache-optimized; real cost likely closer to $5 |
| SnapTrade | $0 | Free tier — even brokerage holdings + activities are free |
| Resend (per-user) | ~$0 | Magic-link + digest fit free tier |
| **Variable subtotal** | **~$55–80/user/mo** | |

**Mix B — Plaid items WITH brokerage accounts** (e.g. Schwab or
Fidelity connected via Plaid instead of SnapTrade):

| Service | $/user/mo (est.) | Notes |
|---------|------------------|-------|
| Plaid Production | ~$95–110 | Investments calls FIRE daily; +$30–50/mo over Mix A |
| Anthropic Haiku 4.5 | $5–20 | Same as Mix A |
| SnapTrade | $0 | If brokerage is on SnapTrade, that's Mix A; if on Plaid, this row |
| Resend (per-user) | ~$0 | Same as Mix A |
| **Variable subtotal** | **~$100–130/user/mo** | |

**For mixed beta cohorts**, blend proportionally. Your personal
single-user usage today is firmly Mix A (Fidelity is on SnapTrade,
not Plaid).

### Plaid breakdown (the load-bearing line)

Per-user/month estimates from Agent 1's call-site inventory, applying
assumed Plaid Production per-call rates. Each line is `(calls per
item per cycle) × (items) × (cycles per month) × (assumed rate)`.

| Plaid endpoint | Trigger | Mix A ($/user/mo) | Mix B ($/user/mo) |
|----------------|---------|-------------------|-------------------|
| `transactions/sync` | nightly cron, paginated cursor (~2.5 pages/item/day for 50 txn/week) | $37.50 | $37.50 |
| `accounts/get` | nightly per item | $6–15 | $6–15 |
| `investments/holdings/get` | nightly per item — **SKIPPED for items with no investment account; gating in [src/lib/plaid/sync.ts](../src/lib/plaid/sync.ts)** | **$0** | $15.00 |
| `investments/transactions/get` | nightly per item — **SKIPPED for items with no investment account** | **$0** | $15.00 |
| `accounts/balance/get` | every 6h (currently `accountsGet` per Path B fallback; reverts to `accountsBalanceGet` on Path A) | $0–12 | $0–12 |
| `recurring_transactions/get` + others | weekly + ad-hoc | $5–15 | $5–15 |
| **Total Plaid/user/mo** | | **~$50–80** | **~$80–110** |

The rates assumed (~$0.10/call for live endpoints, less for cached)
are typical Plaid Production list prices. **Your actual rates depend
on your contract** — if you have one, plug them in and re-run the
math. The qualitative shape (Plaid dominates) holds either way; the
absolute number can swing ±50%+.

---

## Total monthly burn at three reference points

**Mix A** (credit/depository-only Plaid items + brokerage on SnapTrade):

| Users | Fixed | Variable | **Total** | Per-user blended |
|-------|-------|----------|-----------|------------------|
| 5 | $21 | $275–400 | **~$300–420/mo** | ~$60–84/user |
| 10 | $21 | $550–800 | **~$570–820/mo** | ~$57–82/user |
| 20 | $21 | $1,100–1,600 | **~$1,120–1,620/mo** | ~$56–81/user |

**Mix B** (brokerage on Plaid):

| Users | Fixed | Variable | **Total** | Per-user blended |
|-------|-------|----------|-----------|------------------|
| 5 | $21 | $500–650 | **~$520–670/mo** | ~$104–134/user |
| 10 | $21 | $1,000–1,300 | **~$1,020–1,320/mo** | ~$102–132/user |
| 20 | $21 | $2,000–2,600 | **~$2,020–2,620/mo** | ~$101–131/user |

Per-user blended cost flattens fast because fixed costs amortize
quickly — the curve is essentially flat at variable cost from user
~10 onward, regardless of mix.

---

## Unit economics for a paid product

What you'd need to charge to break even on direct variable cost (no
salary, no marketing, no infra cushion). Mix A column = ~$60-80
cost/user; Mix B column = ~$100-130 cost/user.

| Price point | Mix A margin | Mix B margin | Verdict |
|-------------|--------------|--------------|---------|
| **$20/mo** (consumer SaaS norm) | −$40 to −$60 | −$80 to −$110 | ❌ Loss either way |
| **$50/mo** (premium consumer) | **−$10 to +$5** | −$50 to −$80 | ⚠ Mix A near break-even; Mix B loses |
| **$75/mo** (boutique tool) | **+$15 to +$30** | −$25 to −$55 | ✓ Mix A profitable; Mix B still loses |
| **$100/mo** (prosumer / pro tools) | **+$40 to +$55** | **−$0 to −$30** | ✓ Mix A clear margin; Mix B near break-even |
| **$150/mo** (FP&A / wealth tier) | +$90 to +$105 | **+$20 to +$50** | ✓ Both profitable |
| **$250/mo** (enterprise / family-office) | +$190 to +$205 | +$120 to +$150 | ✓ Viable margin, but tiny market |

**Verdict varies by user mix.**

If your beta cohort is mostly Mix A (depository/credit + brokerage on
SnapTrade), $50/mo is roughly viable today and $75/mo gives breathing
room. If your beta is mostly Mix B (brokerage on Plaid), pricing
needs to be $100+/mo — OR you need to migrate Plaid-brokerage users
to SnapTrade, OR you need a Plaid contract.

The qualitative shape: today's cost structure can support a
prosumer-tier paid product without contract negotiation, but consumer-
tier pricing ($20/mo Mint-class) requires either a Plaid contract OR
a SnapTrade-first connection model.

---

## Things that change the picture

### Already done

**Per-product gating** is implemented at
[src/lib/plaid/sync.ts](../src/lib/plaid/sync.ts) via the
`hasInvestmentAccounts` predicate in
[src/lib/plaid/capabilities.ts](../src/lib/plaid/capabilities.ts).
Items with zero `account.type === 'investment'` accounts skip the
two paid investments calls entirely. This is the difference between
Mix A and Mix B in the tables above. Regression-tested.

### Two remaining optimizations, in order of leverage

#### 1. Negotiated Plaid contract (highest leverage)

Plaid's published per-call rates are list price. Volume contracts
often cut 50–80% — because Plaid doesn't actually want to be billing
$0.10 per `accounts/get` call when the underlying cost is sub-cent.
At a negotiated $30/user/mo Plaid (instead of $50–110), $50/mo
pricing works comfortably for both mixes.

Even friends-and-family scale (20 users → ~$50–100/mo committed item-
spend) might get a quote — Plaid sales talks to anyone with a
Production app already approved. Action: email `sales@plaid.com`
referencing your Production app, ask for the rate card and any
volume tiers.

#### 2. Sync cadence reduction (medium leverage, Mix B only)

Current code calls `transactions/sync` + `investments/holdings/get` +
`investments/transactions/get` daily per item, plus
`accounts/balance/get` every 6h. Two honest reductions:

- **Investments holdings + transactions to weekly** (only matters
  for Mix B users — Mix A already skips them). Most retail brokerage
  users don't change holdings daily; weekly is honest. ~70% cut on
  the two investments-product lines.
- **Balance refresh from 6h to daily.** "Balance every 6h" is a
  comfort feature, not a need. Most users would accept once-daily
  for the same UI labels. Cuts `accountsBalanceGet` (Path A) bill by
  4× — but only matters if Path A is restored (currently Path B uses
  cached `accountsGet`, which is much cheaper).

Both can be implemented as gating inside `syncItem` based on
day-of-week and a UI toggle for power users who want more frequent
refresh.

#### 3. Steer brokerages to SnapTrade

If your beta cohort wants to connect Schwab/Fidelity/etc., route them
through SnapTrade rather than Plaid (where supported). SnapTrade's
free tier covers all per-call costs for those connections, while
Plaid charges per-call. Effectively converts a Mix B user into a
Mix A user. UI choice already in place at
[src/components/connect/connect-account-button.tsx](../src/components/connect/connect-account-button.tsx).
Worth surfacing the cost-side guidance in onboarding copy ("for
brokerages, prefer the brokerage option").

---

## Other facts worth knowing

- **error_log grows unbounded.** At 1000 users this hits 418 MB/year
  (already in [docs/multi-user/AUDIT.md](multi-user/AUDIT.md) as
  MAJOR-06). At 5–20 users it's a few MB/year — not urgent, but
  worth a 30-day rolling DELETE in the digest cron when you scale up.
- **Anthropic cost is not the threat anyone fears.** Even at full
  list price without caching, weekly insight is fractions of a cent
  per user. Forecast narrative is the bigger of the two but has
  aggressive cache-first dedup. Anthropic is a rounding error — don't
  spend optimization effort here.
- **Supabase, Vercel, Resend, SnapTrade are not your problem at this
  scale.** Supabase free tier supports 50K MAU. Resend free tier
  supports ~50 users at current email volume. SnapTrade free tier is
  open-ended. Vercel Pro is already paid.
- **Path A (live balance fetch) makes Plaid bill bigger, not
  smaller.** Currently failing in production due to Plaid Balance
  product approval pending; once approved, the 4×-daily live fetch
  via `accounts/balance/get` adds the $12/user/month line. Worth
  reconsidering: do users actually need 6h-fresh balances, or would
  daily be enough?

---

## Verification (how to falsify this analysis)

The Plaid line is the load-bearing assumption. Verify it before
acting on anything in this doc:

1. **Pull your actual Plaid Production rate card** from Plaid
   Dashboard → Billing → Pricing, or email `sales@plaid.com`
   referencing your already-approved Production app. Compare to the
   $0.10/call rate used in the estimate. If your contract is
   materially different, re-run the per-user math.

2. **Inspect actual Anthropic spend** at `console.anthropic.com` →
   Usage. Filter to your API key. Confirm the ~$5–20/user/mo
   estimate. If the cache hit rate is higher than assumed, the line
   drops further.

3. **Pull Vercel Function & Bandwidth usage** from
   `vercel.com/dashboard` → your project → Usage. Confirm you're not
   approaching the Pro tier's 1M function invocations / 1TB
   bandwidth cap. (At 1 user today you're nowhere near it.)

If after step 1 your Plaid bill estimate changes by >50%, the
unit-economics table needs to be regenerated. The qualitative
conclusion ("Plaid dominates; consumer pricing requires aggressive
optimization") will likely hold either direction.

---

## Companion docs

- [docs/multi-user/AUDIT.md](multi-user/AUDIT.md) — product/operational
  scaling audit (signup flow, billing, per-tenant digest, cron
  quotas). Different question than cost.
- [docs/multi-user/2026-05-10-CODE-AUDIT.md](multi-user/2026-05-10-CODE-AUDIT.md)
  — code-correctness audit (data isolation, ownership re-verification,
  RLS coverage). Confirms the data layer is multi-tenant-ready.
