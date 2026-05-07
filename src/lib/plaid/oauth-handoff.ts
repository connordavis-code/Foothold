/**
 * Persistence helpers for the Plaid OAuth handoff. When the user picks
 * an OAuth-only bank in Plaid Link, Link redirects the browser to the
 * institution and then back to /oauth-redirect. We need to know two
 * things at re-entry: (a) the original link_token (re-instantiating
 * Link with the same token preserves the OAuth state), and (b) what
 * the user was doing — connecting a fresh item vs reconnecting an
 * existing one in update mode.
 *
 * sessionStorage (not localStorage) so the handoff is tab-scoped: a
 * new tab can't accidentally pick up a stale connect intent. Cleared
 * on success or explicit dismiss.
 *
 * Server-side fallback (typeof window === 'undefined') just no-ops so
 * SSR doesn't crash.
 */

const KEY = 'plaid_oauth_handoff';

export type OAuthIntent =
  | { kind: 'connect' }
  | { kind: 'reconnect'; itemId: string };

export type OAuthHandoff = {
  linkToken: string;
  intent: OAuthIntent;
};

export function saveOAuthHandoff(handoff: OAuthHandoff): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch {
    // QuotaExceeded / disabled storage — Link will still work for
    // non-OAuth banks; OAuth banks will fail at re-entry, the user
    // can retry. Swallow rather than crash the connect flow.
  }
}

export function loadOAuthHandoff(): OAuthHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OAuthHandoff;
    if (typeof parsed?.linkToken !== 'string' || !parsed.intent) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearOAuthHandoff(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
