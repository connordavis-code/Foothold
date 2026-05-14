'use client';

import type { CategoryOption } from '@/lib/db/queries/categories';
import { filterCategoryPickerOptions } from '@/lib/transactions/category-picker-filter';
import { CategoryPicker } from './category-picker';

type Props = {
  options: CategoryOption[];
  onApply: (name: string | null) => void;
  busy?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Write-path wrapper around <CategoryPicker>. Applies
 * filterCategoryPickerOptions so the PFC entries that semantically
 * collide with the transfer-classification affordance (Transfer Out /
 * Transfer In) never reach a code path that writes to
 * `category_override_id`.
 *
 * Every category-write surface — the bulk-action bar's picker, any
 * future inline picker — should mount THIS component, not the bare
 * <CategoryPicker>. The bare component stays presentational; this
 * wrapper owns the write-vs-read semantics in a single place, so a
 * new write surface can't accidentally skip the filter by forgetting
 * to call it at the construction site.
 *
 * Read-side category dropdowns (URL filters on /transactions) read
 * from `primaryCategory` and DO NOT consume `CategoryOption[]`, so
 * they're unaffected.
 */
export function CategoryWritePicker({
  options,
  onApply,
  busy,
  open,
  onOpenChange,
}: Props) {
  return (
    <CategoryPicker
      options={filterCategoryPickerOptions(options)}
      onApply={onApply}
      busy={busy}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
