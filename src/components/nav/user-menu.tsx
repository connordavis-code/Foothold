'use client';

import Link from 'next/link';
import { LogOut, Settings as SettingsIcon, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  email: string;
  signOutAction: () => Promise<void>;
};

/**
 * Avatar dropdown in the top bar. Owns the sign-out action that
 * previously sat at the foot of the sidebar — lifting it here frees
 * sidebar real estate and matches the editorial chrome pattern.
 */
export function UserMenu({ email, signOutAction }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-pill hover:bg-accent/60"
          aria-label="Account menu"
        >
          <Avatar email={email} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-card">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Signed in as</span>
            <span className="truncate text-sm">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <SettingsIcon className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Initials avatar — no third-party fetch, no broken images.
function Avatar({ email }: { email: string }) {
  const initial = email[0]?.toUpperCase() ?? '?';
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-accent text-xs font-medium text-foreground">
      {initial.match(/[A-Z]/) ? initial : <User className="h-4 w-4" />}
    </span>
  );
}
