'use client';

import { RefreshCw, TrendingDown, Banknote, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MoveTemplateKey } from '@/lib/moves/validation';

// Tile registry — literal references, not function-shaped props from servers.
// Picker imports these by name; RSC never touches this module.
type TileConfig = {
  key: MoveTemplateKey;
  icon: React.ElementType;
  title: string;
  description: string;
};

const GOAL_TILES: TileConfig[] = [
  {
    key: 'adjust-recurring',
    icon: RefreshCw,
    title: 'Adjust recurring',
    description: 'Reduce or pause a recurring bill for a period.',
  },
  {
    key: 'reduce-category',
    icon: TrendingDown,
    title: 'Trim a category',
    description: 'Cut discretionary spend in a category by a fixed amount.',
  },
  {
    key: 'income-event',
    icon: Banknote,
    title: 'Income change',
    description: 'Model a raise, bonus, or temporary pay cut.',
  },
];

const SKIP_ONCE_TILE: TileConfig = {
  key: 'skip-once',
  icon: SkipForward,
  title: 'Skip once',
  description: 'Skip a single recurring charge in a specific month.',
};

type Props = {
  // When true (simulator context) the skip-once tile is shown.
  // Goal context omits it — committing to a single-instance skip
  // is semantically incoherent per SPEC Decision #3.
  allowSkipOnce?: boolean;
  activeKey: MoveTemplateKey | null;
  onSelect: (key: MoveTemplateKey) => void;
};

export function MovePickerTiles({ allowSkipOnce = false, activeKey, onSelect }: Props) {
  const tiles = allowSkipOnce ? [...GOAL_TILES, SKIP_ONCE_TILE] : GOAL_TILES;

  return (
    <div className="flex flex-col gap-2">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const isActive = tile.key === activeKey;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => onSelect(tile.key)}
            className={cn(
              'flex items-center gap-3 rounded-card border p-4 text-left transition-colors duration-fast',
              isActive
                ? 'border-foreground/30 bg-accent/10'
                : 'border-border bg-card hover:border-foreground/20',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
                isActive
                  ? 'border-foreground/20 bg-accent/20 text-foreground'
                  : 'border-border bg-muted text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{tile.title}</span>
              <span className="block text-xs text-muted-foreground">{tile.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
