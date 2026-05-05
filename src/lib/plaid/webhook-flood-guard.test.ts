import { describe, expect, it } from 'vitest';
import { shouldLogWebhookVerificationFailure } from './webhook-flood-guard';

describe('shouldLogWebhookVerificationFailure', () => {
  // Regression for commit 00093bd — anonymous probes (no JWS header at all)
  // must be silently dropped to keep error_log bounded under DoS flood.
  it('does NOT log when no JWS header is present at all', () => {
    expect(shouldLogWebhookVerificationFailure(null)).toBe(false);
  });

  it('does NOT log when JWS header is the empty string', () => {
    expect(shouldLogWebhookVerificationFailure('')).toBe(false);
  });

  it('logs when a non-empty JWS header is present (real failed verify)', () => {
    expect(
      shouldLogWebhookVerificationFailure('eyJhbGciOiJFUzI1NiJ9.foo.bar'),
    ).toBe(true);
  });
});
