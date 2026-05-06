/**
 * Single source of truth for every keyboard shortcut surfaced in the UI.
 * The cheatsheet dialog renders these; future tooltips (e.g. on the ⌘K
 * palette trigger) should read from here too so labels can't drift.
 *
 * Each `keys` entry is one or more visual key labels — a binding with
 * an alt form (e.g. `⌘K` + `Ctrl+K`) lists both. The dialog renders
 * each label as its own pill.
 */
export type KeyBinding = {
  keys: string[];
  action: string;
};

export type BindingGroup = {
  scope: string;
  bindings: KeyBinding[];
};

export const KEYBOARD_BINDINGS: BindingGroup[] = [
  {
    scope: 'Global',
    bindings: [
      { keys: ['⌘K', 'Ctrl+K'], action: 'Open command palette' },
      { keys: ['?'], action: 'Open this cheatsheet' },
    ],
  },
  {
    scope: '/transactions',
    bindings: [
      { keys: ['j'], action: 'Move selection down' },
      { keys: ['k'], action: 'Move selection up' },
      { keys: ['⌘↑', 'Ctrl+↑'], action: 'Previous page' },
      { keys: ['⌘↓', 'Ctrl+↓'], action: 'Next page' },
      { keys: ['/'], action: 'Focus search' },
      { keys: ['Esc'], action: 'Clear row selection' },
      { keys: ['Shift+click'], action: 'Range-select rows' },
      { keys: ['c'], action: 'Open re-categorize (with selection)' },
    ],
  },
  {
    scope: '/simulator',
    bindings: [
      { keys: ['⌘S', 'Ctrl+S'], action: 'Save scenario' },
    ],
  },
];
