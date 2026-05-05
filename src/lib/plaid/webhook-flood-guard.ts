/**
 * Whether a failed-verification request should be logged to error_log.
 *
 * The webhook endpoint is intentionally exempt from the session gate
 * (Plaid signs each call), so it accepts anonymous POSTs from anywhere.
 * Logging every probe lets a flood balloon error_log unbounded and OOM
 * the digest function (commit 00093bd). Skip rows with no JWS header
 * at all — that's the dominant anonymous-probe shape.
 */
export function shouldLogWebhookVerificationFailure(
  jwt: string | null,
): boolean {
  return jwt !== null && jwt.length > 0;
}
