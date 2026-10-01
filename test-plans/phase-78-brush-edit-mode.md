# Test Plan — Phase 78: Isolated Brush Edit Mode (v4.91.0)

[x] = verified via Chrome MCP 2026-09-27 on a plain `:7373` tab, demo world,
no project open (`src/editor/BrushEditSession.ts`).

## Enter / exit

- [x] A parametric shape's Geometry screen shows Convert to Brush only; after
      converting, an amber Edit Brush button appears above Revert.
- [x] Edit Brush: the world zone unloads; only the brush renders at the origin
      with rotation zero; the amber "Editing Brush · <id>" bar appears; the
      camera frames the brush.
- [x] The session opens in Face mode: the Geometry screen shows the FACES list
      (6 faces for a box) without pressing 2.
- [x] Save and Cancel both tear down: `__brush_edit__` gone from
      `world.zones`, previous zone reloaded and active, camera pose restored,
      bar gone, tool back to Object select.
- [ ] Edit Brush is hidden while a prefab edit session is active, and the
      Prefabs panel's Edit is refused while a brush session is active.
- [ ] Vertex (3) and Edge (4) modes work inside the session (drag a corner,
      SPLIT EDGE).

## Save / Cancel semantics

- [x] EXTRUDE a face inside the session: the staged clone changes (12 verts /
      10 faces), the original in the world does not (8 / 6).
- [x] Save: the original shape gets the new mesh at its own position/rotation,
      is re-selected, Geometry shows "12 corners".
- [x] One Cmd+Z after Save reverts the whole session's edits (8 / 6); redo
      re-applies (12 / 10).
- [x] Cancel after an EXTRUDE: original unchanged, edits discarded.
- [ ] Changing the cap/side material inside the session comes back on Save.
- [ ] Moving or rotating the clone with the gizmo inside the session has no
      effect on the original after Save (position/rotation are ignored).
- [ ] Deleting the clone inside the session then Save: nothing written, mode
      exits cleanly.

## Contamination guards

- [x] `world.toJSON().zones` excludes `__brush_edit__` while editing.
- [x] Cmd+S while editing: no save (top bar still "Unsaved").
- [x] Play (▶) while editing: no preview starts, bar stays.
- [x] The 60s autosave tick writes nothing while a session is active (the
      tick at 7:52:07 was skipped; ticks before and after ran).
- [ ] Project scene switch and project close no-op while editing (needs a
      project open; not covered on the demo world).

## Known behavior (not bugs)

- INSET on a face narrower than 0.5m is a no-op (`brushOps.insetFace` warns
  "inner loop collapsed"); the margin is fixed at 0.25m.
- World undo history clears on enter and on exit (same tradeoff as prefab
  edit mode).

## v4.99.1 Save / Close (verified 2026-10-01, headless in the running shell)

- [x] Save stays in the session ("✓ saved"); the original is untouched until Close.
- [x] Edits after a save show "● unsaved changes"; Save is greyed out when there's nothing to save.
- [x] Close with unsaved changes asks inline ("Close without saving?"); Keep editing returns.
- [x] Cmd+S saves the brush while the session is open.
- [x] Undoing back to the saved state clears the unsaved marker.
- [x] Discard & close applies only the last save (14 faces, not the unsaved recess); one Cmd+Z after closing restores the original.
