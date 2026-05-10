import { describe, expect, it } from 'vitest';
import { isHttp410 } from './errors';

// Reproduces the SnapTrade SDK's actual error shape from
// node_modules/snaptrade-typescript-sdk/dist/error.js:
//   class SnaptradeError extends Error {
//     this.status = axiosError.response?.status
//     this.responseBody = ...
//   }
// Flat — no `err.response` property on userland errors.
class FakeSnaptradeError extends Error {
  status: number;
  responseBody: unknown;
  constructor(status: number, responseBody: unknown = null) {
    super(`Request failed with status code ${status}\nRESPONSE HEADERS:\n{}`);
    this.name = 'SnaptradeError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

describe('isHttp410', () => {
  it('detects SnaptradeError-shape (flat .status)', () => {
    // Regression: Phase 5 dashboard alarmed on Fidelity-IRA 410 because
    // the prior `err.response?.status === 410` guard never matched on
    // the SDK's flat-shape wrapper.
    expect(isHttp410(new FakeSnaptradeError(410))).toBe(true);
  });

  it('detects raw axios shape (nested .response.status)', () => {
    const axiosLike = Object.assign(new Error('Request failed with status code 410'), {
      response: { status: 410, data: {} },
    });
    expect(isHttp410(axiosLike)).toBe(true);
  });

  it('returns false for non-410 SnaptradeError', () => {
    expect(isHttp410(new FakeSnaptradeError(503))).toBe(false);
    expect(isHttp410(new FakeSnaptradeError(400))).toBe(false);
  });

  it('returns false for non-410 raw axios shape', () => {
    const axiosLike = Object.assign(new Error('boom'), {
      response: { status: 500 },
    });
    expect(isHttp410(axiosLike)).toBe(false);
  });

  it('returns false for plain Error / non-object inputs', () => {
    expect(isHttp410(new Error('boom'))).toBe(false);
    expect(isHttp410(null)).toBe(false);
    expect(isHttp410(undefined)).toBe(false);
    expect(isHttp410('410')).toBe(false);
    expect(isHttp410(410)).toBe(false);
  });

  it('returns false when status is the string "410" (exact-match by design)', () => {
    // Defensive: don't widen to coerce — a stringly-typed status field
    // probably means the error came from a non-HTTP source.
    expect(isHttp410({ status: '410' })).toBe(false);
  });
});
