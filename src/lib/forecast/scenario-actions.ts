'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { scenarios } from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import {
  createScenarioInput,
  deleteScenarioInput,
  updateScenarioInput,
} from './scenario-zod';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Zod's default issue message ("Number must be greater than or equal to 0")
// strips the field path, leaving the user no clue *which* field failed.
// Walk the issue's path and prepend a readable hint like
// `recurringChanges[2].amount`.
function formatZodIssue(issue: { path: (string | number)[]; message: string }): string {
  const segments: string[] = [];
  for (const part of issue.path) {
    if (part === 'overrides') continue; // implicit, drop noise
    if (typeof part === 'number') {
      segments[segments.length - 1] = `${segments[segments.length - 1] ?? ''}[${part}]`;
    } else {
      segments.push(part);
    }
  }
  const path = segments.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

export async function createScenario(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = createScenarioInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0] ? formatZodIssue(parsed.error.issues[0]) : "Invalid input" };
  }

  try {
    const [row] = await db
      .insert(scenarios)
      .values({
        userId: session.user.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        overrides: parsed.data.overrides,
      })
      .returning({ id: scenarios.id });
    revalidatePath('/simulator');
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    await logError('scenario.create', err);
    return { ok: false, error: 'Could not save scenario' };
  }
}

export async function updateScenario(
  rawInput: unknown,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = updateScenarioInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0] ? formatZodIssue(parsed.error.issues[0]) : "Invalid input" };
  }

  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.overrides !== undefined) updates.overrides = parsed.data.overrides;

    const result = await db
      .update(scenarios)
      .set(updates)
      .where(and(eq(scenarios.id, parsed.data.id), eq(scenarios.userId, session.user.id)))
      .returning({ id: scenarios.id });

    if (result.length === 0) {
      return { ok: false, error: 'Scenario not found' };
    }
    revalidatePath('/simulator');
    return { ok: true, data: null };
  } catch (err) {
    await logError('scenario.update', err, { scenarioId: parsed.data.id });
    return { ok: false, error: 'Could not update scenario' };
  }
}

export async function deleteScenario(
  rawInput: unknown,
): Promise<ActionResult<null>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = deleteScenarioInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0] ? formatZodIssue(parsed.error.issues[0]) : "Invalid input" };
  }

  try {
    const result = await db
      .delete(scenarios)
      .where(and(eq(scenarios.id, parsed.data.id), eq(scenarios.userId, session.user.id)))
      .returning({ id: scenarios.id });

    if (result.length === 0) {
      return { ok: false, error: 'Scenario not found' };
    }
    revalidatePath('/simulator');
    return { ok: true, data: null };
  } catch (err) {
    await logError('scenario.delete', err, { scenarioId: parsed.data.id });
    return { ok: false, error: 'Could not delete scenario' };
  }
}
