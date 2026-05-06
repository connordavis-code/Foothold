# UAT — review-driven fixes (2026-05-05)

> Manual verification checklist for the three deferred fixes that landed
> in C-01 (commit `9cc87a9`), W-04 (`5729b9a` + `74d0100`), and W-09
> (`c2f20d9`). The conservation / commutativity properties live in CI;
> this checklist covers what only a human in a browser can confirm.

**Pre-flight**
- [ ] `npm run dev` is running on `:3000`
- [ ] Signed in (magic link)
- [ ] At least one connected Plaid item exists (sandbox Wells Fargo is fine)
- [ ] Sandbox item has at least one active recurring stream (visit `/recurring` to confirm)

---

## C-01 — Forecast engine consumes raw PFC totals

**What changed:** baseline outflows formula switched from `recurring + non-recurring residual` to `sum(category medians)`. The recurring/non-recurring split is now informational only.

### Steps
1. [ ] Open `/dashboard` — note the current month's projected outflow figure (if surfaced) or the `endCash` projection.
2. [ ] Open `/simulator` — note the baseline projection's first-month `outflows` value (chart tooltip or scenario sidebar).
3. [ ] Sanity-check: the baseline outflow should roughly match your trailing-3-month spending median. If you typically spend ~$X/mo total, baseline should be in the same ballpark.
4. [ ] In the simulator, **pause** an outflow recurring stream you have. Confirm the displayed outflow drops by approximately that stream's monthly cost.
5. [ ] Save the scenario, reload, reopen — projection should be deterministic (same numbers).

### Pass criteria
- Baseline outflow is plausible vs your real spending. No wild over- or under-projection.
- Pausing a recurring stream produces an outflow delta close to its monthly equivalent (within ~5%).
- No console errors.

### If something looks wrong
- Outflows projected too high (>20% over real spending) → likely double-counting somewhere. Open `getForecastHistory` and confirm the subtraction loop is GONE (lines around 199-209 in pre-fix; should now be just the for-loop building `categoryHistory` and `incomeHistory`).
- Outflows projected too low → check `categoryHistory` median calc; the conservation property test in `baseline.test.ts` should have caught this in CI.

---

## W-04 — Plaintext-token window collapse + connect-flow UX

**What changed:** `exchangePublicToken` returns immediately after persisting the encrypted token; the browser separately calls `syncItemAction(itemId)` to do the ~30s backfill. Plaintext access_token in JS heap drops from ~30s to ~50ms.

### Steps — happy path
1. [ ] On `/settings`, click **Connect a bank**.
2. [ ] Plaid Link opens. Choose any sandbox bank, sign in with `user_good` / `pass_good`, complete the flow.
3. [ ] **Watch the button label transition:**
   - First phase (~50ms, often blink-and-miss): `Connecting…`
   - Second phase (~5-30s on sandbox): `Loading your data…`
   - Third phase: button returns to `Connect a bank`
4. [ ] Dashboard / connected-institutions list refreshes; new item appears with data.

### Pass criteria
- Two distinct loading phases visible (or at least the second one — the first is genuinely fast).
- No console errors during exchange or sync.
- Item shows up with synced transactions / accounts after the second phase.

### Steps — failure path (optional but recommended)
This proves the toast-and-recover behavior works. It's invasive — revert after.

1. [ ] Edit `src/lib/plaid/sync.ts`: add `throw new Error('UAT test failure');` at the top of `syncItem` (line ~52, just inside the function).
2. [ ] Save; dev server hot-reloads.
3. [ ] Repeat the connect flow with a different sandbox bank.
4. [ ] **Expected:** "Connecting…" succeeds, then "Loading your data…" fails. Sonner toast appears: `Connected, but initial sync failed. Use Sync now on Settings to retry.`
5. [ ] On `/settings`, the new item exists but has no transactions.
6. [ ] Click the **Sync now** pill on the new item. Sync should succeed (you reverted the throw). Wait for the sync to complete.
7. [ ] **REVERT THE EDIT** in `sync.ts`. Confirm with `git diff src/lib/plaid/sync.ts`.

### Steps — reconnect (update mode, regression check)
The W-04 fix touched `markItemReconnected` indirectly by way of `syncItem`'s try/finally. Verify it still works.

1. [ ] If you have an item in `login_required` / `pending_expiration` state, click **Reconnect**. Otherwise skip.
2. [ ] Plaid Link opens in update mode.
3. [ ] Complete the flow.
4. [ ] Item status flips to `active`; sync runs and completes.

### Pass criteria
- Failure path: toast surfaces; item exists; Sync now recovers.
- Reconnect: flow completes without console errors; item status updates.

---

## W-09 — Signed math through override chain; clamp at display

**What changed:** override appliers no longer clip `inflows` / `outflows` / `byCategory` per step. `clampForDisplay` clips for rendering once at engine output. `startCash` / `endCash` stay unclamped so the cash chain reflects real math.

### Steps — over-pause + lump-sum offset (the review's exact case)
1. [ ] On `/simulator`, build this scenario in any single month within your horizon (e.g. 2 months out):
   - **Pause** an inflow recurring stream (e.g. your salary stream).
   - **Add a lump-sum INFLOW** that's LARGER than the paused stream's monthly equivalent. (e.g. paused salary = $5000, lump sum = +$10,000.)
2. [ ] Inspect the affected month in the chart / scenario detail.
3. [ ] **Expected:** displayed inflows ≈ `lump_sum_amount - paused_monthly_equivalent` (in the example, $5000).
4. [ ] **Old buggy behavior:** displayed inflows would be `lump_sum_amount` ($10,000), because the pause clipped at 0 first.

### Steps — over-cut without offset (display clamp visibility)
1. [ ] Same simulator. Remove the lump sum. Keep only the pause.
2. [ ] If the paused stream's monthly equivalent exceeds your real baseline inflows for that month, you should see:
   - `inflows: $0` (clamped for display)
   - `endCash` reflects the over-cut: lower than `startCash` minus outflows
3. [ ] If your real inflows include other sources (multiple income streams), the pause may not push you into negative territory. To force the case: **add a category outflow delta** larger than your baseline category total. The displayed `byCategory[id]` clamps to 0; the displayed `outflows` clamps to 0; `endCash` stays consistent with the unclamped math.

### Steps — order independence (commutativity)
This is hard to verify by eye since the simulator applies overrides in a fixed order. The 9 commutativity tests in CI cover this exhaustively. Skip the manual check unless you suspect something specific.

### Pass criteria
- Over-pause + lump-sum: displayed inflows match signed math (not the old clip + add).
- Over-cut: `inflows: 0` displayed BUT `endCash` shows the over-cut effect (cash went down by the unclamped amount).
- No NaN or undefined in the chart / table.

---

## Sign-off

When all three sections check out:
- [ ] C-01 verified in `/simulator`
- [ ] W-04 happy path verified in `/settings`
- [ ] W-04 failure path optional verification
- [ ] W-09 over-pause + lump-sum verified

Then push:
```
git push origin main
```

That sends `bb2be08..c2f20d9` (12 commits: 1 docs + 11 fix commits) up to `origin/main`. Vercel will redeploy.

---

## If a UAT fails

1. **Don't push** until the issue is understood.
2. Note the symptom + which UAT step + which fix commit.
3. The relevant spec doc has Risks / Out-of-scope sections that may anticipate the failure mode.
4. Worst case: `git revert <commit-hash>` reverts a single fix without disturbing the others. All 11 fix commits are atomic and independently revertable.
