'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth, signOut } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { profileSchema, deleteSchema } from './schemas';

// Local ActionResult per codebase convention (see narrative-actions.ts,
// scenario-actions.ts). No centralized types file exists.
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export { profileSchema, deleteSchema } from './schemas';

export async function updateProfileAction(
  input: z.input<typeof profileSchema>,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  await db
    .update(users)
    .set({ name: parsed.data.displayName, timezone: parsed.data.timezone })
    .where(eq(users.id, session.user.id));

  revalidatePath('/settings');
  return { ok: true, data: null };
}

export async function deleteAccountAction(
  input: z.input<typeof deleteSchema>,
): Promise<ActionResult<{ redirectTo: string }>> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return { ok: false, error: 'Unauthorized' };
  }

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input' };

  // Defense in depth on top of the UI's email-match gate.
  if (parsed.data.confirmationEmail !== session.user.email) {
    return { ok: false, error: 'Email confirmation mismatch' };
  }

  // Cascades fire across users → external_item → financial_account →
  // transactions / holding / recurring_stream / etc. (all FKs onDelete:cascade).
  await db.delete(users).where(eq(users.id, session.user.id));
  await signOut({ redirect: false });

  return { ok: true, data: { redirectTo: '/login' } };
}
