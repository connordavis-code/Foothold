'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TIMEZONE_OPTIONS } from '@/lib/format/timezone';
import { updateProfileAction } from '@/lib/users/actions';

interface Props {
  email: string;
  initialDisplayName: string | null;
  initialTimezone: string;
}

export function ProfileSection({ email, initialDisplayName, initialTimezone }: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '');
  const [timezone, setTimezone] = useState(initialTimezone);
  const [isPending, startTransition] = useTransition();

  const isDirty =
    displayName !== (initialDisplayName ?? '') || timezone !== initialTimezone;

  function onSave() {
    startTransition(async () => {
      const result = await updateProfileAction({
        displayName: displayName.trim() === '' ? null : displayName,
        timezone,
      });
      if (result.ok) {
        toast.success('Profile updated');
      } else {
        toast.error(result.error);
      }
    });
  }

  function onDiscard() {
    setDisplayName(initialDisplayName ?? '');
    setTimezone(initialTimezone);
  }

  return (
    <Card className="rounded-2xl border-[--hairline] bg-[--surface] shadow-none">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your sign-in identity and display preferences.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="profile-email">
            Email
          </label>
          <p
            id="profile-email"
            className="font-mono text-sm text-foreground"
          >
            {email}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="profile-name">
            Display name
          </label>
          <Input
            id="profile-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Add a display name"
            maxLength={120}
            className="bg-surface-sunken"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="profile-tz">
            Timezone
          </label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="profile-tz" className="bg-surface-sunken">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={onSave} disabled={!isDirty || isPending}>
            {isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button variant="outline" onClick={onDiscard} disabled={!isDirty || isPending}>
            Discard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
