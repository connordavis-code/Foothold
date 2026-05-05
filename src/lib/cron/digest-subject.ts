/**
 * Build the daily digest email subject line.
 *
 * Subject is the only part guaranteed to surface without an open — silence
 * ≠ success means warnings (NOT SEEN, count short) MUST escape the body
 * and ride the subject too. Pre-fix this returned "all clear" whenever
 * `errorCount === 0`, hiding cron-miss warnings entirely (commit 00093bd).
 */
export function buildDigestSubject(args: {
  errorCount: number;
  warningCount: number;
}): string {
  const parts: string[] = [];
  if (args.errorCount > 0) {
    parts.push(
      `${args.errorCount} error${args.errorCount === 1 ? '' : 's'}`,
    );
  }
  if (args.warningCount > 0) {
    parts.push(
      `${args.warningCount} warning${args.warningCount === 1 ? '' : 's'}`,
    );
  }
  return parts.length > 0
    ? `Foothold digest — ${parts.join(', ')}`
    : 'Foothold digest — all clear';
}
