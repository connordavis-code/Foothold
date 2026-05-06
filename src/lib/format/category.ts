/**
 * Single canonical formatter for Plaid Personal Finance Category (PFC)
 * strings — uppercase, underscore-separated tokens like
 * `FOOD_AND_DRINK` or `BANK_OF_AMERICA`.
 *
 * Renders title case, with the small joiner words `and`, `of`, `the`
 * lowercased UNLESS they appear in the leading position (where standard
 * English title case still capitalizes them).
 *
 * Accepts nullish input so callers can drop their per-site guards over
 * time; returns '' for null / undefined / empty string. Callers that
 * want a placeholder ('—', etc.) should still branch on the null at
 * the call site, not relying on this function to choose one.
 */

const JOINER_WORDS = new Set(['and', 'of', 'the']);

export function humanizeCategory(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .split('_')
    .map((word, i) => {
      if (i > 0 && JOINER_WORDS.has(word)) return word;
      // Empty token (e.g. trailing _) just falls through as ''.
      if (word.length === 0) return word;
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(' ');
}
