/**
 * Pull the first sentence from a free-form narrative. Used by the
 * dashboard teaser card and the /insights earlier-weeks list — both
 * want a one-line preview, not the whole body.
 *
 * Boundary order:
 *   1. First "period+space" — keeps "U.S." style abbreviations intact.
 *   2. Else first newline — handles paragraph breaks.
 *   3. Else 200-char truncation — soft cap on prose without punctuation.
 */
export function firstSentence(narrative: string): string | null {
  const trimmed = narrative.trim();
  if (!trimmed) return null;

  const periodIdx = trimmed.indexOf('. ');
  const newlineIdx = trimmed.indexOf('\n');

  let cut = -1;
  if (periodIdx > 0 && (newlineIdx === -1 || periodIdx < newlineIdx)) {
    cut = periodIdx + 1;
  } else if (newlineIdx > 0) {
    cut = newlineIdx;
  }

  if (cut === -1) return trimmed.slice(0, 200);
  return trimmed.slice(0, cut);
}
