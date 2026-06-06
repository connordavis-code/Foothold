-- Migration: R.4 — add goal_move + scenario_move tables (Moves primitive)
-- Date: 2026-05-13
-- Context: R.4 Moves + scenario unification, Commit C1 prerequisite.
-- See docs/redesign/r4-moves-scenarios/SPEC.md § Architecture > Data model.
--
-- Two new tables make "Moves" a first-class DB primitive instead of a
-- UX-layer abstraction over scenario.overrides JSONB. goal_move holds
-- commitments (rows flow into the global applier on next render);
-- scenario_move holds ephemeral what-if state isolated to /simulator.
--
-- The scenario.overrides JSONB column itself is NOT dropped here — that's
-- the hard-cut migration in Commit C2 (SPEC § Locked decision #8).
--
-- Run BEFORE pushing the matching C1 code commit. drizzle-kit push would
-- emit equivalent DDL but won't add the RLS statements (per CLAUDE.md
-- "RLS on every public.* table — db:push won't add it").
--
-- Apply via Supabase Studio SQL Editor or:
--   node scripts/run-migration.mjs docs/migrations/2026-05-13-r4-moves.sql

BEGIN;

-- 1. goal_move — Move attached to a goal = commitment. Row presence flows
-- into apply-moves.ts engine on next render; deletion undoes the delta.
-- onDelete: CASCADE on both FKs — deleting a user or goal removes its moves.
CREATE TABLE goal_move (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  goal_id text NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  params jsonb NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Composite index for the /goals page query pattern:
-- "fetch all goal_moves for this user, grouped by goal."
CREATE INDEX goal_move_user_goal_idx ON goal_move (user_id, goal_id);

-- 3. scenario_move — Move attached to a scenario = ephemeral. Layered on
-- top of the goal_move-augmented baseline in /simulator only.
-- onDelete: CASCADE — deleting a scenario removes its moves (SPEC #8).
CREATE TABLE scenario_move (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  scenario_id text NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  params jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Composite index for the /simulator scenario-rehydration query pattern.
CREATE INDEX scenario_move_user_scenario_idx ON scenario_move (user_id, scenario_id);

-- 5. RLS — required for every public.* table per CLAUDE.md > Architecture
-- "Database access boundary". No policies attached → default-deny for
-- anon/authenticated through PostgREST; Drizzle bypasses RLS via the
-- postgres superuser so the app is unaffected.
ALTER TABLE goal_move ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_move ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Post-apply verification:
--   \d goal_move
--   \d scenario_move
--   SELECT * FROM goal_move LIMIT 0;       -- columns visible, zero rows
--   SELECT * FROM scenario_move LIMIT 0;
--   SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname IN ('goal_move', 'scenario_move');
--     -- Expect: both rows relrowsecurity = t (true)
--   SELECT indexname FROM pg_indexes WHERE tablename IN ('goal_move', 'scenario_move');
--     -- Expect: goal_move_user_goal_idx, scenario_move_user_scenario_idx,
--     --         plus the PK indexes (goal_move_pkey, scenario_move_pkey)
