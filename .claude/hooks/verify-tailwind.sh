#!/usr/bin/env bash
# Tailwind validation for Foothold's editorial token system.
#
# WHY: CLAUDE.md > "Foothold Redesign milestone" establishes two
# load-bearing invariants:
#   1. Zero hardcoded color utilities in src/ — every surface routes
#      through editorial tokens
#   2. The dual-token gotcha — HSL-fragment tokens (--accent, --positive,
#      --background, etc.) can't use Tailwind's arbitrary-value `bg-[--x]`
#      syntax. The CSS compiles but is silently invalid.
# This hook catches regressions of either rule before they ship.

set -euo pipefail

INPUT="$(cat)"
FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')"

# Scope: TSX/TS/JSX under src/, skip tests + .d.ts
case "$FILE_PATH" in
  */src/*.tsx|*/src/*.ts|*/src/*.jsx) ;;
  *) exit 0 ;;
esac
case "$FILE_PATH" in
  *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx|*.d.ts) exit 0 ;;
esac

[ -f "$FILE_PATH" ] || exit 0

OUTPUT=""

# Rule 1: hardcoded grayscale/neutral utilities
# Excludes text-white/text-black/bg-white — legitimately used on dark
# gradient surfaces (HeroCard overlays, etc.) per audit
GRAYSCALE=$(grep -nE '\b(bg|text|border|ring|divide|placeholder|caret|outline|decoration|shadow)-(gray|slate|zinc|neutral|stone)(-[0-9]+)?\b' "$FILE_PATH" 2>/dev/null || true)

if [ -n "$GRAYSCALE" ]; then
  OUTPUT="${OUTPUT}

[Hardcoded color utility] — use editorial tokens (var(--surface-*), var(--text-*), var(--semantic-*)) instead. See DESIGN.md.
${GRAYSCALE}"
fi

# Rule 2: HSL-fragment tokens with arbitrary-value syntax
HSL_FRAGS='accent|positive|background|foreground|primary|secondary|destructive|muted|border|ring|card|popover|input|chart-[0-9]+'
ARBITRARY=$(grep -nE "(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|shadow|placeholder)-\[(var\()?--(${HSL_FRAGS})\)?\]" "$FILE_PATH" 2>/dev/null || true)

if [ -n "$ARBITRARY" ]; then
  OUTPUT="${OUTPUT}

[Dual-token gotcha] — HSL-fragment tokens (--accent, --positive, --background, etc.) can't use bg-[--x] arbitrary syntax; produces invalid CSS silently. Use the Tailwind config class (bg-accent, text-foreground) or wrap explicitly: bg-[hsl(var(--accent))]. Complete-color Foothold tokens (--surface-*, --text-*, --semantic-*) ARE fine with arbitrary syntax.
${ARBITRARY}"
fi

if [ -z "$OUTPUT" ]; then
  exit 0
fi

REL_PATH="${FILE_PATH#$PWD/}"

jq -n \
  --arg msg "Tailwind validation flagged issues in $REL_PATH" \
  --arg ctx "Tailwind validation flagged anti-patterns in ${REL_PATH}:${OUTPUT}

Fix these before reporting the task complete. See CLAUDE.md > 'Foothold Redesign milestone' > 'Dual-token gotcha' for the editorial-token system rules." \
  '{
    systemMessage: $msg,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $ctx
    }
  }'

exit 0
