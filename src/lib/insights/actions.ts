'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import {
  type GenerateInsightResult,
  generateInsightForUser,
} from './generate';

/**
 * Manual "Generate" button on /insights. Auth-checks the session, then
 * delegates to the pure generator. Always overwrites — the button pays
 * for a fresh AI call each time. The weekly cron uses smart-skip; this
 * does not.
 */
export async function generateInsightAction(): Promise<GenerateInsightResult> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const result = await generateInsightForUser(session.user.id);
  revalidatePath('/insights');
  return result;
}

export type { GenerateInsightResult };
