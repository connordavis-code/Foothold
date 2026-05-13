import { describe, it, expect } from 'vitest';
import { profileSchema, deleteSchema } from './schemas';

describe('profileSchema', () => {
  it('parses valid input', () => {
    const result = profileSchema.safeParse({
      displayName: 'Connor',
      timezone: 'America/Los_Angeles',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe('Connor');
      expect(result.data.timezone).toBe('America/Los_Angeles');
    }
  });

  it('normalizes empty-string displayName to null', () => {
    const result = profileSchema.safeParse({ displayName: '', timezone: 'UTC' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBeNull();
  });

  it('normalizes whitespace-only displayName to null', () => {
    const result = profileSchema.safeParse({ displayName: '   ', timezone: 'UTC' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBeNull();
  });

  it('accepts null displayName', () => {
    const result = profileSchema.safeParse({ displayName: null, timezone: 'UTC' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBeNull();
  });

  it('rejects displayName longer than 120 chars', () => {
    const result = profileSchema.safeParse({
      displayName: 'a'.repeat(121),
      timezone: 'UTC',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid timezone', () => {
    const result = profileSchema.safeParse({
      displayName: 'Connor',
      timezone: 'Not/Real',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing timezone', () => {
    const result = profileSchema.safeParse({ displayName: 'Connor' });
    expect(result.success).toBe(false);
  });
});

describe('deleteSchema', () => {
  it('accepts a valid email', () => {
    const result = deleteSchema.safeParse({ confirmationEmail: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects non-email strings', () => {
    const result = deleteSchema.safeParse({ confirmationEmail: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = deleteSchema.safeParse({ confirmationEmail: '' });
    expect(result.success).toBe(false);
  });
});
