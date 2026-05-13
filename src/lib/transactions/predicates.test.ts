import { describe, expect, it } from 'vitest';
import { shouldTreatAsTransfer } from './predicates';

describe('shouldTreatAsTransfer', () => {
  describe('when override is null (no manual override)', () => {
    it('returns true for TRANSFER_OUT', () => {
      expect(
        shouldTreatAsTransfer({
          primaryCategory: 'TRANSFER_OUT',
          isTransferOverride: null,
        }),
      ).toBe(true);
    });

    it('returns true for TRANSFER_IN', () => {
      expect(
        shouldTreatAsTransfer({
          primaryCategory: 'TRANSFER_IN',
          isTransferOverride: null,
        }),
      ).toBe(true);
    });

    it('returns false for LOAN_PAYMENTS (loans are real cash flow)', () => {
      expect(
        shouldTreatAsTransfer({
          primaryCategory: 'LOAN_PAYMENTS',
          isTransferOverride: null,
        }),
      ).toBe(false);
    });

    it('returns false for ordinary categories', () => {
      expect(
        shouldTreatAsTransfer({
          primaryCategory: 'FOOD_AND_DRINK',
          isTransferOverride: null,
        }),
      ).toBe(false);
    });

    it('returns false when category is also null', () => {
      expect(
        shouldTreatAsTransfer({
          primaryCategory: null,
          isTransferOverride: null,
        }),
      ).toBe(false);
    });
  });

  describe('when override is set, override wins', () => {
    it('override=true forces transfer treatment even on a non-transfer PFC', () => {
      expect(
        shouldTreatAsTransfer({
          primaryCategory: 'FOOD_AND_DRINK',
          isTransferOverride: true,
        }),
      ).toBe(true);
    });

    it('override=false un-flags a Plaid-tagged transfer', () => {
      expect(
        shouldTreatAsTransfer({
          primaryCategory: 'TRANSFER_OUT',
          isTransferOverride: false,
        }),
      ).toBe(false);
    });

    it('override=false on an already-non-transfer is still false', () => {
      expect(
        shouldTreatAsTransfer({
          primaryCategory: 'FOOD_AND_DRINK',
          isTransferOverride: false,
        }),
      ).toBe(false);
    });

    it('override=true with null category still forces transfer', () => {
      expect(
        shouldTreatAsTransfer({
          primaryCategory: null,
          isTransferOverride: true,
        }),
      ).toBe(true);
    });
  });
});
