import { describe, expect, it } from 'vitest';
import {
  type BrokerageAuthShape,
  type ExistingSnaptradeItem,
  partitionSnaptradeAuthsForReconcile,
} from './reconcile';

function existing(
  partial: Partial<ExistingSnaptradeItem> & { id: string },
): ExistingSnaptradeItem {
  return {
    id: partial.id,
    status: partial.status ?? 'active',
    institutionName: partial.institutionName ?? null,
    providerInstitutionId: partial.providerInstitutionId ?? null,
  };
}

function existingMap(
  ...items: Array<[string, ExistingSnaptradeItem]>
): Map<string, ExistingSnaptradeItem> {
  return new Map(items);
}

describe('partitionSnaptradeAuthsForReconcile', () => {
  it('auth with no id is skipped (defensive)', () => {
    const out = partitionSnaptradeAuthsForReconcile(
      [{ id: undefined, brokerage: { name: 'X' } }],
      existingMap(),
    );
    expect(out.toInsert).toEqual([]);
    expect(out.toRepair).toEqual([]);
  });

  it('truly new authorization → toInsert (zero existing)', () => {
    const auth: BrokerageAuthShape = {
      id: 'auth-1',
      brokerage: { name: 'Fidelity', slug: 'fidelity' },
    };
    const out = partitionSnaptradeAuthsForReconcile([auth], existingMap());
    expect(out.toInsert).toEqual([
      {
        providerItemId: 'auth-1',
        institutionName: 'Fidelity',
        providerInstitutionId: 'fidelity',
      },
    ]);
    expect(out.toRepair).toEqual([]);
  });

  // Regression for review of eaca263. The exact bug: a row exists in
  // 'login_required' status, the user reconnects via portal, the auth
  // comes back in the list with the same id. Prior logic SKIPPED it,
  // leaving the row stuck. Now: toRepair with statusChanged=true.
  it('existing row in login_required + matching auth → toRepair (statusChanged=true)', () => {
    const auth: BrokerageAuthShape = {
      id: 'auth-1',
      brokerage: { name: 'Fidelity', slug: 'fidelity' },
    };
    const out = partitionSnaptradeAuthsForReconcile(
      [auth],
      existingMap([
        'auth-1',
        existing({
          id: 'item-1',
          status: 'login_required',
          institutionName: 'Fidelity',
          providerInstitutionId: 'fidelity',
        }),
      ]),
    );
    expect(out.toInsert).toEqual([]);
    expect(out.toRepair).toEqual([
      {
        id: 'item-1',
        institutionName: 'Fidelity',
        providerInstitutionId: 'fidelity',
        statusChanged: true,
      },
    ]);
  });

  it('existing row in error status → toRepair (statusChanged=true)', () => {
    const auth: BrokerageAuthShape = {
      id: 'auth-1',
      brokerage: { name: 'Fidelity', slug: 'fidelity' },
    };
    const out = partitionSnaptradeAuthsForReconcile(
      [auth],
      existingMap([
        'auth-1',
        existing({
          id: 'item-1',
          status: 'error',
          institutionName: 'Fidelity',
          providerInstitutionId: 'fidelity',
        }),
      ]),
    );
    expect(out.toRepair).toHaveLength(1);
    expect(out.toRepair[0]?.statusChanged).toBe(true);
  });

  it('existing active row + same metadata → no-op (silent)', () => {
    const auth: BrokerageAuthShape = {
      id: 'auth-1',
      brokerage: { name: 'Fidelity', slug: 'fidelity' },
    };
    const out = partitionSnaptradeAuthsForReconcile(
      [auth],
      existingMap([
        'auth-1',
        existing({
          id: 'item-1',
          status: 'active',
          institutionName: 'Fidelity',
          providerInstitutionId: 'fidelity',
        }),
      ]),
    );
    expect(out.toInsert).toEqual([]);
    expect(out.toRepair).toEqual([]);
  });

  // Metadata refresh — institution renamed at SnapTrade. Don't surface
  // as "reconnected" (statusChanged=false), just quietly update.
  it('existing active row + changed institution name → toRepair (statusChanged=false)', () => {
    const auth: BrokerageAuthShape = {
      id: 'auth-1',
      brokerage: { name: 'Fidelity Investments', slug: 'fidelity' },
    };
    const out = partitionSnaptradeAuthsForReconcile(
      [auth],
      existingMap([
        'auth-1',
        existing({
          id: 'item-1',
          status: 'active',
          institutionName: 'Fidelity', // old name
          providerInstitutionId: 'fidelity',
        }),
      ]),
    );
    expect(out.toRepair).toEqual([
      {
        id: 'item-1',
        institutionName: 'Fidelity Investments',
        providerInstitutionId: 'fidelity',
        statusChanged: false,
      },
    ]);
  });

  it('null brokerage payload → null institutionName + slug', () => {
    const auth: BrokerageAuthShape = { id: 'auth-1', brokerage: null };
    const out = partitionSnaptradeAuthsForReconcile([auth], existingMap());
    expect(out.toInsert[0]).toEqual({
      providerItemId: 'auth-1',
      institutionName: null,
      providerInstitutionId: null,
    });
  });

  it('mixed batch: 1 new + 1 repair + 1 no-op', () => {
    const out = partitionSnaptradeAuthsForReconcile(
      [
        { id: 'a-new', brokerage: { name: 'Schwab', slug: 'schwab' } },
        { id: 'a-repair', brokerage: { name: 'Fidelity', slug: 'fidelity' } },
        { id: 'a-active', brokerage: { name: 'Robinhood', slug: 'robinhood' } },
      ],
      existingMap(
        [
          'a-repair',
          existing({
            id: 'item-repair',
            status: 'login_required',
            institutionName: 'Fidelity',
            providerInstitutionId: 'fidelity',
          }),
        ],
        [
          'a-active',
          existing({
            id: 'item-active',
            status: 'active',
            institutionName: 'Robinhood',
            providerInstitutionId: 'robinhood',
          }),
        ],
      ),
    );
    expect(out.toInsert).toHaveLength(1);
    expect(out.toInsert[0]?.providerItemId).toBe('a-new');
    expect(out.toRepair).toHaveLength(1);
    expect(out.toRepair[0]?.id).toBe('item-repair');
    expect(out.toRepair[0]?.statusChanged).toBe(true);
  });

  it('empty auths list → empty decision', () => {
    const out = partitionSnaptradeAuthsForReconcile([], existingMap());
    expect(out.toInsert).toEqual([]);
    expect(out.toRepair).toEqual([]);
  });
});
