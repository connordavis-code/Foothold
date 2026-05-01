import { signOut } from '@/auth';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Sign-out button. Submits a server action that clears the session cookie
 * and redirects to /login.
 */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/login' });
      }}
    >
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </form>
  );
}
