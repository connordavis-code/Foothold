export type ButtonMode = 'generate' | 'regenerate' | 'back';

type Args = {
  hasDisplayedInsight: boolean;
  isPastWeekView: boolean;
};

/**
 * Decide which mode the /insights GenerateButton should render in.
 *
 *   no insight                   → 'generate'
 *   latest displayed             → 'regenerate'
 *   past week (?week) displayed  → 'back' (Link, no action)
 *
 * The page computes `isPastWeekView` only when ?week resolved AND the
 * displayed insight matches that week (not the silent-fallback case).
 */
export function resolveButtonMode({
  hasDisplayedInsight,
  isPastWeekView,
}: Args): ButtonMode {
  if (!hasDisplayedInsight) return 'generate';
  if (isPastWeekView) return 'back';
  return 'regenerate';
}
