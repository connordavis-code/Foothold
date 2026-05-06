import { describe, expect, it } from 'vitest';
import { escapeIlike } from './ilike-escape';

describe('escapeIlike', () => {
  it('passes plain text through unchanged', () => {
    expect(escapeIlike('starbucks')).toBe('starbucks');
  });

  it('escapes percent — would otherwise match every row', () => {
    expect(escapeIlike('%')).toBe('\\%');
    expect(escapeIlike('a%b')).toBe('a\\%b');
  });

  it('escapes underscore — would otherwise match any single char', () => {
    expect(escapeIlike('_')).toBe('\\_');
    expect(escapeIlike('a_b')).toBe('a\\_b');
  });

  it('escapes backslash so escaping itself is parseable', () => {
    expect(escapeIlike('\\')).toBe('\\\\');
  });

  it('handles all three together', () => {
    expect(escapeIlike('a%_\\b')).toBe('a\\%\\_\\\\b');
  });
});
