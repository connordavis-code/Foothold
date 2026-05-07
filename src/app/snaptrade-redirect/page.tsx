import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SnaptradeRedirectClient } from './snaptrade-redirect-client';

/**
 * Return target for SnapTrade's Connection Portal. SnapTrade
 * redirects the user here after they finish brokerage auth (success
 * or cancel). The client component runs syncSnaptradeBrokeragesAction
 * which reconciles the user's authoritative SnapTrade authorizations
 * against our external_item rows, then triggers the initial sync for
 * any newly-recorded ones.
 *
 * Auth-gated: the route lives outside (app)/ so it doesn't get the
 * full chrome (modal-style return), but the auth() check still
 * enforces session presence.
 */
export default async function SnaptradeRedirectPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/snaptrade-redirect');
  }
  return <SnaptradeRedirectClient />;
}
