'use client';

import { DeleteAccountDialog } from './delete-account-dialog';

interface Props {
  userEmail: string;
}

export function DangerZoneSection({ userEmail }: Props) {
  return (
    <section
      className="rounded-lg border shadow-sm p-6 space-y-4"
      style={{
        backgroundColor: 'color-mix(in oklab, var(--semantic-caution) 10%, transparent)',
        borderColor: 'color-mix(in oklab, var(--semantic-caution) 50%, transparent)',
      }}
    >
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold text-foreground">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Actions in this section can&apos;t be undone.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 pt-2">
        <div className="space-y-1 max-w-prose">
          <p className="text-sm font-medium">Delete account</p>
          <p className="text-xs text-muted-foreground">
            Permanently delete your account and all associated data, including
            connected institutions, transactions, goals, and scenarios. This
            action cannot be reversed.
          </p>
        </div>
        <DeleteAccountDialog userEmail={userEmail} />
      </div>
    </section>
  );
}
