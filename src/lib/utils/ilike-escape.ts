/**
 * Escape user input for safe interpolation into a Postgres ILIKE
 * pattern. Without this, `%` and `_` in the input act as SQL
 * wildcards — so a user typing `%` in a search box matches every row,
 * which is a self-DoS (full index scan) and makes "starts-with" queries
 * non-deterministic.
 *
 * The pattern's surrounding `%...%` is the caller's responsibility.
 */
export function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
