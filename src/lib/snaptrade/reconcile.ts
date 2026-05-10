/**
 * Pure partition logic for SnapTrade Connection Portal reconcile.
 *
 * Lives separately from `actions.ts` (which is `'use server'`) so it
 * can be unit-tested without dragging the auth/db context into the
 * test runner.
 *
 * Input: the brokerage-authorization list returned by SnapTrade plus
 * a snapshot of the user's existing `external_item` rows for SnapTrade.
 * Output: a decision matrix saying which rows to insert vs repair,
 * with a flag per repair indicating whether the status was changed
 * (e.g. login_required → active) so the caller can report a
 * "reconnected" count distinct from incidental metadata refreshes.
 *
 * The "repair existing rows" branch is the load-bearing fix from a
 * code review of `eaca263`: prior reconcile logic only INSERTED new
 * authorizations and skipped any whose providerItemId was already
 * known. That meant the SnapTrade reconnect button (which routes the
 * user through the same Connection Portal as new connections) opened
 * the right flow but never actually repaired the source's status,
 * leaving rows stuck in needs_reconnect even after a successful
 * re-auth.
 */

export type BrokerageAuthShape = {
  id?: string | null;
  brokerage?: {
    name?: string | null;
    slug?: string | null;
  } | null;
};

export type ExistingSnaptradeItem = {
  id: string;
  status: string;
  institutionName: string | null;
  providerInstitutionId: string | null;
};

export type ReconcileDecision = {
  toInsert: Array<{
    providerItemId: string;
    institutionName: string | null;
    providerInstitutionId: string | null;
  }>;
  toRepair: Array<{
    id: string;
    institutionName: string | null;
    providerInstitutionId: string | null;
    /**
     * `true` when this repair flips the row from non-active to
     * active — counts toward the user-facing "reconnected" tally.
     * `false` when the row was already active but metadata changed
     * (institution rename, slug change, etc.) — silent maintenance.
     */
    statusChanged: boolean;
  }>;
};

export function partitionSnaptradeAuthsForReconcile(
  auths: BrokerageAuthShape[],
  existingByProviderId: Map<string, ExistingSnaptradeItem>,
): ReconcileDecision {
  const toInsert: ReconcileDecision['toInsert'] = [];
  const toRepair: ReconcileDecision['toRepair'] = [];

  for (const auth of auths) {
    if (!auth.id) continue;

    const newInstitutionName = auth.brokerage?.name ?? null;
    const newProviderInstitutionId = auth.brokerage?.slug ?? null;
    const known = existingByProviderId.get(auth.id);

    if (!known) {
      toInsert.push({
        providerItemId: auth.id,
        institutionName: newInstitutionName,
        providerInstitutionId: newProviderInstitutionId,
      });
      continue;
    }

    const statusChanged = known.status !== 'active';
    const metadataChanged =
      known.institutionName !== newInstitutionName ||
      known.providerInstitutionId !== newProviderInstitutionId;

    if (statusChanged || metadataChanged) {
      toRepair.push({
        id: known.id,
        institutionName: newInstitutionName,
        providerInstitutionId: newProviderInstitutionId,
        statusChanged,
      });
    }
    // else: already active + metadata current → no-op
  }

  return { toInsert, toRepair };
}
