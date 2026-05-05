import { describe, expect, it } from 'vitest';
import { firstSentence } from './first-sentence';

describe('firstSentence', () => {
  it('returns null for empty input', () => {
    expect(firstSentence('')).toBeNull();
    expect(firstSentence('   ')).toBeNull();
    expect(firstSentence('\n\n')).toBeNull();
  });

  it('cuts at the first period+space boundary', () => {
    expect(firstSentence('Spending was up. The rest of the week stayed flat.')).toBe(
      'Spending was up.',
    );
  });

  it('cuts at the first newline when no period+space precedes it', () => {
    expect(firstSentence('Top line summary\nThen a second paragraph.')).toBe(
      'Top line summary',
    );
  });

  it('prefers period+space when both period and newline exist', () => {
    expect(firstSentence('Short. Long\ntail.')).toBe('Short.');
  });

  it('prefers newline when newline comes first', () => {
    expect(firstSentence('Top line\nSecond line. Third.')).toBe('Top line');
  });

  it('truncates to 200 chars when no boundary is found', () => {
    const wall = 'a'.repeat(300);
    const result = firstSentence(wall);
    expect(result).toHaveLength(200);
    expect(result).toBe('a'.repeat(200));
  });

  it('trims leading whitespace before measuring', () => {
    expect(firstSentence('  Hello. World.')).toBe('Hello.');
  });
});
