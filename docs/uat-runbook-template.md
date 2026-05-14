# UAT Runbook Template

> Required for every PR that ships a feature with a DB write OR a
> user-visible interaction. **Author this before implementation** — or
> have a different author write it — so the test plan is independent
> of the feature author's mental model.

---

## Why this exists

PR #16 (2026-05-13) shipped a "Mark as transfer" affordance that the
forecast filter never honored. The action code was correct. The UI
component was correct. The component just wasn't mounted on the
desktop `/transactions` surface — so users on desktop had no way to
reach the affordance, reached for the visually-adjacent (and
unrelated) bulk recategorize bar instead, and got a "success" toast
for an operation that wrote to the wrong column.

The UAT plan in the PR description said *"open a transaction in
/transactions."* That instruction had no available path on desktop.
The plan was written by the same author as the feature, against the
same mental model — and the model assumed reachability that didn't
exist in the rendered UI. Adding DB-state checks would have caught
the wrong-column write, but the deeper meta-failure is that the
author-as-UAT-planner pattern lets shared blind spots survive.

This template encodes the discipline that would have caught the bug.

---

## Required structure for every UAT step

Every step in the test plan has three sections. **None are optional.**

### 1. Reachability pre-check

The literal click path, from a fresh page load, naming the visible
control at each step:

> From `https://usefoothold.com/transactions` on desktop, click the
> description text of any row in the table. The transaction detail
> sheet opens as a half-sheet from the bottom of the viewport.
> Scroll the sheet to the "Transfer classification" section.

NOT: "Open a transaction."

NOT: "Navigate to the detail view."

NOT: "Mark as transfer."

**If you cannot describe the click path because the affordance is
invisible, hidden, or undefined — STOP.** The feature is unreachable.
Fix the entry point before continuing UAT.

### 2. Action + UI assertion

The click. The button text expected to appear. The toast wording
expected. The visual state expected to change.

> Click the **"Mark as transfer"** button in the Transfer
> classification section. Expected toast: `"Marked as transfer."`
> The status line above the buttons flips from
> `"Not a transfer · included in cash forecast"` to
> `"Treated as transfer · excluded from cash forecast"` with an
> italic `"manual override"` tag.

NOT: "The override is applied."

NOT: "The UI updates."

### 3. DB-state SELECT verification

The literal SQL that confirms the DB row matches the UI claim:

```sql
SELECT is_transfer_override, category_override_id, updated_at
FROM transaction
WHERE id = '<row-id>';
```

Expected:
- `is_transfer_override = true`
- `category_override_id` unchanged from pre-state
- `updated_at` within the last 60 seconds

**If the SQL returns unexpected values, the UI is lying.** UI-only
verification (toast appearance, caption changes) is insufficient
because the toast and the caption can fire from optimistic local
state OR from a different action path than intended.

---

## Idempotency check

For any feature where the same input should produce the same
outcome, add a step: trigger the action twice. Confirm the second
run is either a no-op OR produces equivalent state. This catches:

- Bulk operations that double-count
- `UPDATE` statements with weak `WHERE` clauses
- Heuristics that miscount already-flagged rows
- Race conditions in optimistic UI

---

## Negative reachability check

For any single-target affordance on a multi-column or multi-control
surface, add a step that confirms **the affordance fires ONLY from
its intended trigger** — not from adjacent controls that share the
same visual neighborhood.

> After confirming the description click opens the detail sheet,
> click each other column on the same row in turn — checkbox cell,
> category cell, account cell, amount cell. Confirm none of those
> open the sheet. Only the description should be the click target.

What this catches:
- **Whole-row click handlers** that bleed beyond the intended cell —
  passes the positive reachability check (description click opens
  the sheet) but undermines keyboard nav or bulk-select gestures
  on the other columns
- **Misplaced `onClick`** at the `<tr>` level instead of the
  intended `<td>` / `<button>` child
- **Event-bubbling regressions** where a future refactor adds a
  parent handler that propagates into adjacent cells

**Generalizable rule**: every UAT step that confirms "clicking X
opens Y" should be paired with "clicking not-X does NOT open Y."
Without the paired check, "X opens Y" only proves *X is sufficient*
— not that *X is exclusive*. The exclusivity property is usually
what users actually rely on.

---

## Authorship rule

The UAT plan **should not be written by the same person/agent who
wrote the feature**, against the same mental model. In solo-dev
contexts where that's not always possible:

1. **Write the UAT plan BEFORE implementation.** The plan becomes a
   spec the implementation must satisfy.
2. **Or have a different agent / reviewer pass over the UAT plan
   independently**, confirming reachability assumptions are valid.
3. **At minimum**: when you as the author write the UAT plan, force
   yourself through the literal click-path discipline. The act of
   writing *"click here, then here, then here"* exposes gaps that
   *"open a transaction"* papers over.

---

## Example: a complete UAT step

### Test A1: Mark a Plaid-tagged transfer as "Not a transfer"

**Reachability pre-check:**
From `/transactions` on desktop, find a transaction with PFC
`Transfer Out`. Click its description cell. The half-sheet drawer
opens. Scroll to "Transfer classification" — observe the status line
reading `"Treated as transfer · excluded from cash forecast."` The
two override buttons "Mark as transfer" (showing a check mark) and
"Mark as not a transfer" are visible below.

**Action + UI assertion:**
Click **"Mark as not a transfer."** Expected toast:
`"Marked as not a transfer."` with an **Undo** button. Status line
flips to `"Not a transfer · included in cash forecast"` with italic
`"manual override"` tag.

**DB-state SELECT verification:**
```sql
SELECT id, is_transfer_override, category_override_id,
       primary_category, updated_at
FROM transaction
WHERE id = '<row-id>';
```
Expected:
- `is_transfer_override = false`
- `category_override_id` unchanged from pre-state (typically `NULL`)
- `primary_category = 'TRANSFER_OUT'` (Plaid's classification is
  untouched — only the override flips)
- `updated_at` within last 60 seconds

---

## Anti-patterns the template guards against

| Anti-pattern | What goes wrong | Fix |
|---|---|---|
| "Open a transaction in /transactions" | Surface-specific reachability gap goes unchecked | Spell out the click path |
| "Toast says success" as sole verification | Toast can fire on the wrong code path | Add the SELECT query |
| "The UI updates" as sole verification | Optimistic local state hides server failure | Add the SELECT query |
| UAT plan written after implementation | Plan reflects author's mental model, not the product | Write before, or have a different author |
| Only happy-path covered | Idempotency / re-entry bugs surface in prod | Add explicit idempotency step |
