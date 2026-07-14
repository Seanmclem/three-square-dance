# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Always Commit `public/games/**`

**These are user content, and the editor can silently overwrite them.**

Scene files under `public/games/` (`manifest.json`, `game.json`, `scenes/*.json`) are hand-built levels. The editor write-through-saves them via the File System Access API, which truncates on write — an overwritten scene is unrecoverable unless it is in git. This has already destroyed a level (a ladder-test `level-2.json` was overwritten with a blank demo world; no snapshot or backup existed).

So, whenever work touches the editor's save/load, project, or scene paths — or any browser session that opens a project:

- **Before** editing or testing: commit any dirty/untracked files under `public/games/` first, so there is a restore point. Never start a session with `?? public/games/...` in `git status`.
- **After** the app writes to them: commit the resulting changes, so the new state is captured.

Never add `public/games/` to `.gitignore`, and never delete or reset a scene file to "clean up" a working tree. If a scene file's diff looks like content vanished, stop and surface it — do not commit the deletion assuming it was intentional.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
