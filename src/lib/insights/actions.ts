'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  type GenerateInsightResult,
  generateInsightForUser,
} from './generate';

/**
 * Manual "Generate" button on the dashboard brief card. Auth-checks the
 * session, then delegates to the pure generator. Always overwrites — the
 * button pays for a fresh AI call each time. The weekly cron uses
 * smart-skip; this does not. R.2 folded the standalone /insights route
 * into /dashboard, so revalidate targets /dashboard now.
 */
export async function generateInsightAction(): Promise<GenerateInsightResult> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const result = await generateInsightForUser(session.user.id);
  revalidatePath('/dashboard');
  return result;
}

export type { GenerateInsightResult };
