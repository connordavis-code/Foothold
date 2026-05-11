import { describe, expect, it } from 'vitest';
import { categoryToTokens } from './category-palette';

const INCOME = {
  bg: 'bg-[--accent-strong]/10',
  fg: 'text-[--accent-strong]',
};
const CAUTION = {
  bg: 'bg-[--semantic-caution]/10',
  fg: 'text-[--semantic-caution]',
};
const STRUCTURAL = {
  bg: 'bg-[--hairline]',
  fg: 'text-[--text-2]',
};

describe('categoryToTokens', () => {
  it('maps income PFCs to the income class', () => {
    expect(categoryToTokens('INCOME')).toEqual(INCOME);
    expect(categoryToTokens('INCOME_WAGES')).toEqual(INCOME);
    expect(categoryToTokens('INCOME_DIVIDENDS')).toEqual(INCOME);
    expect(categoryToTokens('INCOME_INTEREST_EARNED')).toEqual(INCOME);
  });

  it('maps caution PFCs to the caution class', () => {
    expect(categoryToTokens('FOOD_AND_DRINK')).toEqual(CAUTION);
    expect(categoryToTokens('FOOD_AND_DRINK_RESTAURANTS')).toEqual(CAUTION);
    expect(categoryToTokens('ENTERTAINMENT')).toEqual(CAUTION);
    expect(categoryToTokens('PERSONAL_CARE')).toEqual(CAUTION);
    expect(categoryToTokens('MEDICAL')).toEqual(CAUTION);
  });

  it('maps transfer / loan / fee PFCs to the structural class', () => {
    expect(categoryToTokens('TRANSFER_IN')).toEqual(STRUCTURAL);
    expect(categoryToTokens('TRANSFER_OUT')).toEqual(STRUCTURAL);
    expect(categoryToTokens('LOAN_PAYMENTS')).toEqual(STRUCTURAL);
    expect(categoryToTokens('BANK_FEES')).toEqual(STRUCTURAL);
  });

  it('falls through to structural for unknown PFCs', () => {
    // Plaid has ~100 PFCs; the table only enumerates income + caution.
    // Anything not matched falls through to structural rather than
    // inventing a fresh hue per category (Christmas-tree anti-pattern).
    expect(categoryToTokens('GENERAL_MERCHANDISE')).toEqual(STRUCTURAL);
    expect(categoryToTokens('TRAVEL')).toEqual(STRUCTURAL);
    expect(categoryToTokens('HOME_IMPROVEMENT')).toEqual(STRUCTURAL);
  });

  it('handles null + empty string as structural', () => {
    expect(categoryToTokens(null)).toEqual(STRUCTURAL);
    expect(categoryToTokens('')).toEqual(STRUCTURAL);
  });

  it('treats casing case-insensitively (Plaid PFCs are upper-snake but defensive)', () => {
    // PFC strings should ALWAYS arrive upper-snake from `getTransactions`,
    // but a user-override category name might land here too. Both shapes
    // should still classify correctly — income remains income.
    expect(categoryToTokens('income')).toEqual(INCOME);
    expect(categoryToTokens('Food_And_Drink')).toEqual(CAUTION);
  });
});
