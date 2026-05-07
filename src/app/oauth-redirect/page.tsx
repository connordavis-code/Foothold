import { OAuthRedirectClient } from './oauth-redirect-client';

/**
 * Plaid OAuth re-entry route. The institution (Wells Fargo, AmEx,
 * Fidelity, etc.) redirects the user here after they finish their
 * OAuth flow. The browser already has the link_token persisted in
 * sessionStorage from the original Connect / Reconnect button click;
 * the client island reads it back, re-instantiates Plaid Link with
 * `receivedRedirectUri: window.location.href`, and Plaid finishes
 * the public-token exchange.
 *
 * This route is OUTSIDE the (app) layout so it doesn't redirect
 * unauthenticated users (the user IS authenticated when they click
 * Connect, but the OAuth round-trip can outlive a session in edge
 * cases). The client island handles its own access errors via toast
 * + a fallback link back to /settings.
 */
export default function OAuthRedirectPage() {
  return <OAuthRedirectClient />;
}
