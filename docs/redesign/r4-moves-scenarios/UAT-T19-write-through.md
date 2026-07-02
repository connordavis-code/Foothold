# UAT — T19 scenario_move write-through (by-hand, DB-verified)

> ✅ **PASSED — founder-run, 2026-06.** §2 parentage proven, §3a zero orphans,
> §3b binds to scenario selected at attach time, §3c no-op gestures inert.
> §4 returned **1 non-empty override row** (a lump sum) → T25 KEEPS the
> lump-sum editor; the override stack is NOT deleted. This gate green-lit T22.
> Retained as the write-through verification record; no need to re-run unless
> the attach/scenario-create code path changes.

**Commit under test:** `46ce255` (T19–T21) on `worktree-r4-moves-scenario`
**Author:** by-hand UAT for founder execution. The 799 vitest tests are all
pure helpers — **none exercise the DB write**, so this script is the only thing
that proves write-through parentage.

> ⚠️ **Reachability correction.** There is **no scratch scenario**. A
> `scenario` row is created only by the header **"New scenario" → Create**
> (you type the name). A `scenario_move` row is created only by the drawer's
> **Attach**, and only when a scenario is already selected. "Attach from the
> no-scenario state" is structurally unreachable (the drawer is gated on a
> selected scenario). The write-through parentage check below is unaffected by
> this — once a scenario exists, the `scenario_id` binding is identical.

---

## Preconditions

### P0 — Where to run

The commit is **local-only (not pushed)**, so **no Vercel preview exists yet**.
Two options, same Supabase prod DB either way:
- **Local:** `npm run dev` on the worktree, hit `http://localhost:3000/simulator`.
- **Preview:** green-light a push of `worktree-r4-moves-scenario`; Vercel builds
  a preview from it. (Standing policy = no push without your go-ahead.)

All SQL runs against the **same Supabase** in both cases (no separate dev DB).

### P1 — Tables exist (R.4 migration applied)

```sql
select
  to_regclass('public.scenario')       as scenario,
  to_regclass('public.scenario_move')  as scenario_move,
  to_regclass('public.goal_move')      as goal_move;
```

All three must be non-null. If `scenario_move`/`goal_move` are null, the R.4
`db:push` + RLS step never ran against this DB — stop and apply it first.

### P2 — Your user id (reused by every query below)

```sql
select id, email from "user" where email = 'davis.connor208@gmail.com';
```

`"user"` MUST stay double-quoted (reserved word). Every query below scopes via
the subquery `(select id from "user" where email = 'davis.connor208@gmail.com')`
— call it **:ME**.

### P3 — Pre-state snapshot (baseline counts for the negative checks)

```sql
select
  (select count(*) from scenario      where user_id = :ME) as scenarios,
  (select count(*) from scenario_move where user_id = :ME) as scenario_moves;
```

Record both numbers. Several checks below assert deltas against these.

---

## 1. Reachability pre-check (positive path)

**Click path from a fresh load:**
1. Load `/simulator`. If a scenario is auto-selected (you have saved scenarios),
   open the scenario **picker** and choose **Baseline** so nothing is selected.
   Observe: Moves rail shows the prompt card **"Create a scenario to start
   exploring what-ifs"** (or "Select a scenario…") and **no "Add a Move"
   button**. ← this is the no-scenario state.
2. Click **"New scenario"** (top-right). A dialog opens with a name input.
3. Type exactly **`UAT Probe Alpha`**. Click **Create**.
   - Expect toast **`Created "UAT Probe Alpha"`**; the scenario becomes selected;
     the rail now shows **"No Moves yet…"** and an **"Add a Move"** button.
   - **This Create click is the moment the `scenario` row is born.**
4. Click **"Add a Move"** → drawer opens → pick the **Reduce a category** tile →
   choose any category, enter a delta (e.g. 100), set start month → **Attach**.
   - Expect the drawer to close and the Move to appear in the rail.
   - **This Attach click is the moment the `scenario_move` row is born.**

**SQL — confirm the scenario row was created:**

```sql
select id, name, overrides, created_at
from scenario
where user_id = :ME
order by created_at desc
limit 5;
```

Expect the newest row: `name = 'UAT Probe Alpha'`, `overrides = {}`.

**Trigger summary (your explicit question):** rows come into existence at
**"New scenario" → Create** (scenario) and **drawer → Attach** (scenario_move).
Drawer-open does NOT create either row. First-attach does NOT create a scenario.

---

## 2. Write-through parentage (the core check)

```sql
select
  sm.id            as move_id,
  sm.template_key,
  sm.params,
  sm.created_at,
  sm.scenario_id,
  s.name           as scenario_name
from scenario_move sm
join scenario s on s.id = sm.scenario_id
where sm.user_id = :ME
order by sm.created_at desc
limit 10;
```

Expect the newest row: `scenario_name = 'UAT Probe Alpha'`, and `scenario_id`
equal to the id from step 1. Parentage is **read from the join**, not inferred
from the chart. `scenario_move.count` = pre-state + 1.

---

## 3. Negative reachability

### 3a — Baseline is never mutated by an attach

There is no "baseline" row; baseline = the engine run with `overrides:{}` and no
scenario moves. The failure mode to catch is a `scenario_move` that didn't land
on a real owned scenario (orphan / mis-parented write):

```sql
select sm.*
from scenario_move sm
left join scenario s
  on s.id = sm.scenario_id and s.user_id = sm.user_id
where sm.user_id = :ME
  and s.id is null;
```

**Expect 0 rows, always.** Any row = a move that wrote somewhere other than an
owned scenario. (Structural backstop: the picker's "Baseline" = `null` selection
renders no drawer, so it cannot receive a move.)

### 3b — Attach writes to the CURRENTLY selected scenario, not a stale one

The "return to no-scenario then attach" case you described is **unreachable**
(no drawer without a selected scenario), so the meaningful equivalent is: prove
the move binds to whatever is selected *at attach time*, not a prior selection.

Setup:
1. Create a second scenario **`UAT Probe Bravo`** (New scenario → Create).
2. Select **`UAT Probe Alpha`** in the picker → Add a Move → attach Move **m1**.
3. Select **`UAT Probe Bravo`** in the picker → Add a Move → attach Move **m2**.

```sql
select sm.created_at, sm.template_key, s.name as scenario_name
from scenario_move sm
join scenario s on s.id = sm.scenario_id
where sm.user_id = :ME
  and s.name in ('UAT Probe Alpha', 'UAT Probe Bravo')
order by sm.created_at desc
limit 4;
```

Expect: the two most-recent rows show **m2 → `UAT Probe Bravo`**, **m1 →
`UAT Probe Alpha`**. Each move sits on the scenario that was selected when you
attached it. No cross-binding.

### 3c — Only the intended affordance writes

Run the pre-state snapshot query (P3) and record counts. Then perform each of
these **no-op gestures** and re-run P3 — **counts must be unchanged**:
- Hover over the Moves rail and the attached-move rows. (no write)
- Click **"Add a Move"** to open the drawer, then **Cancel / close** it without
  Attach. (no `scenario_move`)
- Click **"New scenario"** to open the dialog, then **Cancel** without Create.
  (no `scenario`)

```sql
select
  (select count(*) from scenario      where user_id = :ME) as scenarios,
  (select count(*) from scenario_move where user_id = :ME) as scenario_moves;
```

Both counts equal the values from immediately before the gestures.

---

## 4. Overrides precondition (decides whether T25 is safe)

One row per non-empty override key across all your scenarios:

```sql
select s.id, s.name, key as override_key, s.overrides -> key as value
from scenario s,
     lateral jsonb_object_keys(s.overrides) as key
where s.user_id = :ME
order by s.name, key;
```

- **Zero rows** → every `scenario.overrides` is `{}`. The unmounted-editor hole
  is harmless; **T25 deletion of the override stack is safe.**
- **Any rows** → 🚩 those scenarios drive the chart via inputs the R.4 UI can no
  longer show or edit (lump sums, hypotheticals, etc.). **Flag before T25.** We
  decide migration vs. keep-an-editor before deleting the stack.

Coarser existence check (same intent):

```sql
select id, name, overrides
from scenario
where user_id = :ME and overrides <> '{}'::jsonb;
```

---

## Teardown (optional)

```sql
-- removes the two probe scenarios + their moves (FK cascade handles moves)
delete from scenario
where user_id = :ME
  and name in ('UAT Probe Alpha', 'UAT Probe Bravo');
```

---

## Pass criteria → green-light T22

- §2 newest `scenario_move` joins to `UAT Probe Alpha` (parentage proven).
- §3a returns 0 rows (no orphan/baseline write).
- §3b binds each move to the scenario selected at attach time.
- §3c no-op gestures move neither count.
- §4 returns zero rows **or** the non-empty rows are reviewed and accepted.
