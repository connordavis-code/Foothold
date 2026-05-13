---
name: phase-handoff
description: Produce a structured phase-handoff document for any phased workflow (redesigns, migrations, feature rollouts, refactors, multi-step implementations) so the next session can start cold. Use whenever the user signals a body of work has just shipped or wants to prepare for /clear — phrases like "wrap up the phase", "handoff doc", "prep for clear", "session handoff", "phase complete", "milestone shipped", "we're done with R.x", "close out this sprint". Also use on explicit `/phase-handoff` invocation, with or without a phase identifier. Don't wait for the user to say the exact word "handoff" — any signal that a body of work is done AND the next session needs a cold start is enough. The skill enforces gate checks (tests passing, git clean, branch confirmed) before writing — a handoff for half-done work is worse than no handoff because it lies to future-you.
---

# Phase Handoff

At the end of a phase of work, produce a structured handoff doc and prepare for `/clear` so the next session can start cold.

This skill is for any phased workflow: redesigns, migrations, feature rollouts, refactors, multi-step implementations. The skill is agnostic to the phase naming scheme.

## Steps

1. **Determine the phase identifier:**
   - Check if the user provided one in their invocation (e.g., `/phase-handoff R.3.6` or `/phase-handoff auth-migration-M2`)
   - If not, look for clues in recent conversation, PLAN.md, or commit messages
   - If still ambiguous, ask the user before proceeding

2. **Confirm the phase is actually complete:**
   - All tasks from the phase's PLAN (if one exists) checked off
   - Full test suite passing — run the project's test command
   - All changes committed (git status clean)
   - Note the current branch (don't assume which one is "right")

   If any check fails, halt and report what's incomplete. Don't write a handoff for half-done work.

3. **Gather context:**
   - Read SPEC.md and PLAN.md for this phase if they exist
   - Get the commit log since the previous handoff (find the most recent file in the handoff directory, use its commit date as the cutoff; if none exists, ask the user for a starting point)
   - Identify decisions or deviations from the original plan
   - List open questions, deferred work, and known follow-ups

4. **Write the handoff doc to `<handoff_dir>/<phase>-<YYYY-MM-DD>.md`.**
   Default `handoff_dir` is `docs/handoffs/` — check if the project uses a different convention by looking for an existing handoff directory first.

   Structure:
   - **Phase**: identifier
   - **Status**: shipped / partial / blocked (with reason if not shipped)
   - **Branch**: current branch name
   - **What shipped**: bulleted commits with one-line descriptions, grouped by area if there are many
   - **Decisions made**: anything that deviated from SPEC or required judgment, with reasoning
   - **Known issues**: bugs deferred, tech debt accepted, follow-ups for later
   - **Next phase setup**: what the next session needs to know to start cold — context, dependencies, gotchas to watch for
   - **Gotchas encountered**: things that surprised us this phase (tool quirks, environment issues, false leads) — write these for future-you who will have forgotten

5. **Commit the handoff doc:**
   - Message: `docs: handoff for <phase>`
   - Confirm the commit succeeded

6. **Report:**
   - Handoff path
   - Commit SHA
   - "Safe to /clear"

## What not to do

- Do not run `/clear` automatically. The user runs it after reviewing.
- Do not skip the gate checks in step 2 even if the user pushes back. A handoff for incomplete work is worse than no handoff because it lies to future-you.
- Do not invent phase numbers or assume the next phase. If unclear what comes next, write "see ROADMAP" or ask.
