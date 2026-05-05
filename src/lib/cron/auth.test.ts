import { describe, expect, it } from 'vitest';
import { isAuthorizedCronRequest } from './auth';

// vitest.setup.ts pins CRON_SECRET so env validation passes at module load.
const VALID_SECRET = 'test-cron-secret-must-be-at-least-32-chars';

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/cron/digest', { headers });
}

describe('isAuthorizedCronRequest', () => {
  it('rejects requests with no authorization header', () => {
    expect(isAuthorizedCronRequest(reqWith({}))).toBe(false);
  });

  it('rejects empty authorization header', () => {
    expect(isAuthorizedCronRequest(reqWith({ authorization: '' }))).toBe(false);
  });

  it('rejects shorter-than-expected token (length mismatch short-circuit)', () => {
    expect(
      isAuthorizedCronRequest(reqWith({ authorization: 'Bearer short' })),
    ).toBe(false);
  });

  it('rejects longer-than-expected token', () => {
    expect(
      isAuthorizedCronRequest(
        reqWith({ authorization: `Bearer ${VALID_SECRET}-extra` }),
      ),
    ).toBe(false);
  });

  it('rejects same-length-but-wrong-value token', () => {
    const sameLengthWrong = 'X'.repeat(VALID_SECRET.length);
    expect(
      isAuthorizedCronRequest(
        reqWith({ authorization: `Bearer ${sameLengthWrong}` }),
      ),
    ).toBe(false);
  });

  it('rejects bare token with no Bearer scheme', () => {
    expect(
      isAuthorizedCronRequest(reqWith({ authorization: VALID_SECRET })),
    ).toBe(false);
  });

  it('accepts the exact Bearer token', () => {
    expect(
      isAuthorizedCronRequest(
        reqWith({ authorization: `Bearer ${VALID_SECRET}` }),
      ),
    ).toBe(true);
  });
});
