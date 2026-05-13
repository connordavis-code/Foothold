import type { SyncHealthState } from '@/lib/sync/health';

export type StatePillKind = 'caution' | 'destructive' | null;

/**
 * Pure helper: maps a SyncHealthState to the pill variant it should render.
 *
 * Silence rule (per DESIGN.md "Single-Hue Elevated Rule"):
 * - healthy / stale / unknown / syncing → null (no pill)
 * - degraded / needs_reconnect          → 'caution' (amber)
 * - failed                              → 'destructive'
 *
 * Accepts the full SyncHealthState union (including 'syncing', which
 * classifyItemHealth excludes from its return type but callers set externally
 * during in-flight syncs) so the silence rule is complete.
 */
export function statePillKind(state: SyncHealthState): StatePillKind {
  if (state === 'degraded' || state === 'needs_reconnect') return 'caution';
  if (state === 'failed') return 'destructive';
  return null;
}
