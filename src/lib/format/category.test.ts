import { describe, expect, it } from 'vitest';
import { humanizeCategory } from './category';

describe('humanizeCategory', () => {
  it('title-cases a single-token PFC', () => {
    expect(humanizeCategory('TRAVEL')).toBe('Travel');
  });

  it('title-cases multi-token PFC', () => {
    expect(humanizeCategory('GENERAL_MERCHANDISE')).toBe('General Merchandise');
  });

  it('lowercases "and" when not the first word', () => {
    expect(humanizeCategory('FOOD_AND_DRINK')).toBe('Food and Drink');
    expect(humanizeCategory('RENT_AND_UTILITIES')).toBe('Rent and Utilities');
  });

  it('lowercases "of" when not the first word', () => {
    expect(humanizeCategory('BANK_OF_AMERICA')).toBe('Bank of America');
  });

  it('lowercases "the" when not the first word', () => {
    expect(humanizeCategory('SOMETHING_THE_THING')).toBe('Something the Thing');
  });

  it('capitalizes joiner words when leading', () => {
    expect(humanizeCategory('THE_HOME_DEPOT')).toBe('The Home Depot');
    expect(humanizeCategory('AND_THEN')).toBe('And Then');
    expect(humanizeCategory('OF_COURSE')).toBe('Of Course');
  });

  it('handles UNCATEGORIZED via the standard path', () => {
    expect(humanizeCategory('UNCATEGORIZED')).toBe('Uncategorized');
  });

  it('returns empty string for nullish input', () => {
    expect(humanizeCategory(null)).toBe('');
    expect(humanizeCategory(undefined)).toBe('');
    expect(humanizeCategory('')).toBe('');
  });

  it('handles already-lowercase input by re-casing', () => {
    expect(humanizeCategory('food_and_drink')).toBe('Food and Drink');
  });

  it('handles trailing underscores without crashing', () => {
    expect(humanizeCategory('FOO_')).toBe('Foo ');
  });
});
