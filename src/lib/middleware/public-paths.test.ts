import { describe, expect, it } from 'vitest';
import { isPublicApiPath } from './public-paths';

const PREFIXES = ['/api/auth', '/api/plaid/webhook', '/api/cron'];

describe('isPublicApiPath', () => {
  it('matches the exact prefix path', () => {
    expect(isPublicApiPath('/api/auth', PREFIXES)).toBe(true);
    expect(isPublicApiPath('/api/cron', PREFIXES)).toBe(true);
  });

  it('matches a child path under the prefix', () => {
    expect(isPublicApiPath('/api/auth/signin', PREFIXES)).toBe(true);
    expect(isPublicApiPath('/api/cron/digest', PREFIXES)).toBe(true);
    expect(isPublicApiPath('/api/plaid/webhook', PREFIXES)).toBe(true);
  });

  // Regression for the boundary bug — a sibling path that shares a prefix
  // string but lives outside the protected segment must NOT inherit the
  // exemption (CLAUDE.md "Don't add /api/* routes without exempting").
  it('does NOT match a sibling path that only shares a prefix string', () => {
    expect(isPublicApiPath('/api/cron-status', PREFIXES)).toBe(false);
    expect(isPublicApiPath('/api/auth-bypass', PREFIXES)).toBe(false);
    expect(isPublicApiPath('/api/cronjob', PREFIXES)).toBe(false);
  });

  it('does not match unrelated paths', () => {
    expect(isPublicApiPath('/api/dashboard', PREFIXES)).toBe(false);
    expect(isPublicApiPath('/dashboard', PREFIXES)).toBe(false);
    expect(isPublicApiPath('/', PREFIXES)).toBe(false);
  });

  it('returns false against an empty prefix list', () => {
    expect(isPublicApiPath('/api/cron', [])).toBe(false);
  });
});
