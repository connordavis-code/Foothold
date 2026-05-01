'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signIn } from '@/auth';

const Email = z.string().email();

/**
 * Server action triggered by the login form. Validates the email, then asks
 * Auth.js to send a magic-link via Resend. On success the user is redirected
 * to /verify; on send-failure we route them through /error with the
 * Auth.js error type so the message matches what actually went wrong.
 */
export async function signInWithEmail(formData: FormData) {
  const parsed = Email.safeParse(formData.get('email'));
  if (!parsed.success) {
    redirect('/login?error=invalid_email');
  }

  try {
    await signIn('resend', {
      email: parsed.data,
      redirectTo: '/dashboard',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/error?error=${error.type}`);
    }
    // Re-throw NEXT_REDIRECT (and anything else unexpected) so Next can
    // handle it. signIn's success path uses a redirect-as-control-flow,
    // which surfaces here as a non-AuthError throw.
    throw error;
  }
}
