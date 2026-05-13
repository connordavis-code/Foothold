import { z } from 'zod';
import { isValidIanaTimezone } from '@/lib/format/timezone';

export const profileSchema = z.object({
  displayName: z
    .union([z.string(), z.null()])
    .nullable()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .pipe(z.string().max(120).nullable()),
  timezone: z.string().refine(isValidIanaTimezone, { message: 'Invalid timezone' }),
});

export const deleteSchema = z.object({
  confirmationEmail: z.string().email(),
});
