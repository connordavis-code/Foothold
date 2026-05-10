/**
 * Pure helpers for the daily baseline-forecast snapshot cron
 * (Phase 1 simulator reorientation, PR 2 of 5).
 *
 * Vercel crons run in UTC. Anchoring snapshot keys in UTC means a user
 * in PT taking the snapshot at 4pm local sees a `snapshotDate` matching
 * their local "today", but a 5pm PT cron run (= midnight UTC) would
 * roll the date to "tomorrow" UTC. That's the right anchor — the data
 * pipeline is UTC-native and we want consecutive snapshots to be
 * exactly 24 hours apart, not "whenever-the-user-was-awake-yesterday".
 */
export function deriveSnapshotKeys(now: Date): {
  /** YYYY-MM, the input shape `projectCash` expects. */
  currentMonth: string;
  /** YYYY-MM-DD, the natural cache key for `forecast_snapshot.snapshot_date`. */
  snapshotDate: string;
} {
  const iso = now.toISOString();
  return {
    currentMonth: iso.slice(0, 7),
    snapshotDate: iso.slice(0, 10),
  };
}
