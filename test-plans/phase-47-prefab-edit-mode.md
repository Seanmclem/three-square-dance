# Test Plan — Phase 47: Isolated Prefab Edit Mode (v4.41.0)

[x] = verified via Chrome MCP 2026-07-21 (`plans/phase-47-prefab-edit-mode.md`).

## Enter / exit

- [x] Prefabs panel shows an amber Edit button on snapshot prefabs only
      (generators: none).
- [x] Edit → the world zone unloads; only the prefab's members render at the
      origin; the amber "Editing Prefab" bar appears; camera frames the origin.
- [x] Save and Cancel both tear down: staging zone deleted from WorldState,
      previous zone reloaded and active, camera pose restored, bar gone.
- [ ] Editing tools work in the staging zone (gizmo move, add an object, delete
      a member) and undo works within the edit session.
- [ ] Re-entering edit mode after a save shows the updated template.

## Contamination guards

- [x] beforeunload dispatched mid-edit → `worldeditor_autosave` byte-identical
      (writeAutosave gate).
- [x] `world.toJSON().zones` excludes `__prefab_edit__` while editing.
- [ ] Save button (top bar), Play/New Game, project scene switcher, and project
      close all no-op during edit mode.
- [ ] Wait 60s mid-edit → autosave tick writes nothing.

## Propagation

- [x] Move a member, Save → prefab version bumps; EVERY open-scene instance
      re-expands (member at instance-origin + new local offset); records adopt
      the new version.
- [x] ONE Cmd+Z reverts the whole propagation (all instances' members + record
      versions); redo re-applies.
- [x] Cancel after edits → template and world untouched (def version unchanged).
- [ ] Project with a second scene containing instances: after Save + scene
      switch, the stale scene re-expands on load (phase-45 staleness sweep) and
      marks dirty.

## Regressions

- [x] `npm run typecheck` → 0 errors.
- [x] Cleanup left only the user's entities; autosave restored byte-identical.
- [ ] Normal (non-edit-mode) autosave still works after a session (gate
      releases).

### v4.79.46 — Save to prefab

1. Place two copies of a snapshot prefab; rotate one copy 90° when placing (R).
2. On the rotated copy: move one piece, rename it, delete another piece.
3. Header ⋯ → **Save to prefab** (also in the Prefab section, amber). The
   confirm names the prefab, v(n) → v(n+1), the piece count, "the 1 other
   placed instance", and "1 piece you deleted here will be removed…".
4. Confirm: the OTHER copy's matching piece moves the same amount relative to
   its own origin (rotation accounted for), takes the rename, and its deleted
   piece disappears — with the same entity ids as before (selection/groups
   intact). The source copy doesn't visibly change. Selection survives.
5. Cmd+Z: both copies' pieces revert (the library stays on the new version);
   Cmd+Shift+Z re-applies.
6. A generator (ƒ) instance shows no Save to prefab entry.
