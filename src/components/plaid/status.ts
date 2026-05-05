/**
 * Human-readable label for plaid_item.status. UI copy lives here, not in
 * the schema — schema cares about machine values. Used by /settings and
 * any future surface that lists item state.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'login_required':
      return 'Login required';
    case 'pending_expiration':
      return 'Expiring soon';
    case 'permission_revoked':
      return 'Access revoked';
    case 'error':
      return 'Connection error';
    case 'active':
      return 'Active';
    default:
      return status;
  }
}
