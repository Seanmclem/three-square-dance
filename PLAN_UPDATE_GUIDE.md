# Plan Update Guide

Rules for updating `WORLD_EDITOR_ARCHITECTURE.md` (and any similar architecture/plan docs).

---

## Always update in two places

When changes are documented, they must appear **both**:

1. **In the new phase/changelog section** at the bottom — what changed and why, with code snippets.
2. **In the existing file-level section** for each affected file — so the per-file reference stays accurate and doesn't drift from reality.

Never add a phase section without also finding and updating the existing sections for every file that section touches.

---

## Checklist for each changed file

For each file modified:

- [ ] Find its section in the doc (`grep -n "## FileName\|### FileName"`)
- [ ] Update the section to reflect the new behavior — correct stale descriptions, add new patterns, fix wrong defaults
- [ ] If the section has a code snippet that is now wrong, update the snippet
- [ ] If the section doesn't exist yet, add it under the appropriate module heading

---

## Version header

- Bump `Version X.Y.0` in the header
- Update `last updated YYYY-MM-DD`
- Add a one-line entry to the changelog list at the top describing what the new version covers

---

## Common mistakes to avoid

- Adding a phase section but leaving the file-level section with the old (wrong) behavior documented
- Documenting a default value in the phase section without correcting the same default in the state-machine or implementation section
- Forgetting to update the phase/feature section that originally introduced a file when that file's behavior changes significantly
- Only updating the changelog line without adding the actual phase section body

---

## Elevation defaults example (what "both places" means)

A floor elevation default changed from `activeFloor.elevation` to `activeLevel * 3.0`.

**Phase section added** (Phase 6.6 — Floor Fixes):
> FloorTool and PolygonFloorTool now always use `activeLevel * 3.0`...

**File-level section also updated** (§ FloorTool.ts state machine):
> `elevation: activeLevel * 3.0` — corrected from old `activeFloor.elevation` reference

Both must happen. The phase section explains the change; the file section is the authoritative reference going forward.
