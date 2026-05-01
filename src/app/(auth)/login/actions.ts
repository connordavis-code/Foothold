'use server';

import { signIn } from '@/auth';

/**
 * Server action triggered by the login form. Sends a magic-link email via
 * Resend; on success, NextAuth redirects to the `verifyRequest` page.
 */
export async function signInWithEmail(formData: FormData) {
  const email = formData.get('email');
  if (typeof email !== 'string' || !email) {
    throw new Error('Email is required');
  }

  await signIn('resend', {
    email,
    redirectTo: '/dashboard',
  });
}
