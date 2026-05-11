-- Code-quality review follow-up indexes.
-- Mirrors src/lib/db/schema.ts so production can be updated without
-- waiting on a generated Drizzle migration artifact.

CREATE INDEX IF NOT EXISTS external_item_user_status_idx
  ON external_item (user_id, status);

CREATE INDEX IF NOT EXISTS external_item_user_created_at_idx
  ON external_item (user_id, created_at);

CREATE INDEX IF NOT EXISTS financial_account_item_idx
  ON financial_account (item_id);

CREATE INDEX IF NOT EXISTS financial_account_item_type_idx
  ON financial_account (item_id, type);

CREATE INDEX IF NOT EXISTS transaction_account_date_idx
  ON transaction (account_id, date);

CREATE INDEX IF NOT EXISTS goal_user_active_created_at_idx
  ON goal (user_id, is_active, created_at);

CREATE INDEX IF NOT EXISTS recurring_stream_item_idx
  ON recurring_stream (item_id);

CREATE INDEX IF NOT EXISTS recurring_stream_account_idx
  ON recurring_stream (account_id);

CREATE INDEX IF NOT EXISTS recurring_stream_item_active_next_date_idx
  ON recurring_stream (item_id, is_active, predicted_next_date);

CREATE INDEX IF NOT EXISTS error_log_item_level_op_occurred_idx
  ON error_log (external_item_id, level, op, occurred_at);
