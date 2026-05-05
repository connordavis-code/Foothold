/**
 * Match `pathname` against a list of public API prefixes using
 * path-segment boundaries. `/api/cron-status` MUST NOT inherit
 * `/api/cron`'s exemption (see CLAUDE.md "Don't add /api/* routes
 * without exempting them in middleware").
 *
 * Edge-safe: pure string ops, no Node-only imports.
 */
export function isPublicApiPath(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
