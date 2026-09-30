# Test Plan: Phase 80, Brush Vertex Sets (v4.95.0)

[x] = verified 2026-09-30. Logic: scratch Node scripts over the real `brushOps` and
three.js. UI: headless Playwright (system Chrome) against the running dev shell, real
mouse and keyboard input, on a throwaway 16-sided cylinder brush placed at y = 20
(clear of level_2's geometry and kill floor), removed afterwards; nothing saved.

## Loop select (`edgeLoop`)

- [x] The ring from a Phase 79 loop cut: 16 corners, closed, same set as `ringVerts`.
- [x] A vertical line through a ring corner: top, ring, bottom, then stops (the rim
      corners are 3-way junctions).
- [x] A cube's middle ring after a loop cut: 4 corners, closed.
- [x] A plain cube edge: just its 2 corners (corners are 3-way).

## Selecting

- [x] LOOP CUT ─, then SELECT RING: vertex mode, card "16 CORNERS SELECTED".
- [x] Shift-click three corners after CLEAR SELECTION: set grows 1 → 2 → 3, card
      "3 CORNERS SELECTED"; the brush stays the only selected object.
- [x] Shift-click does not pull a trigger volume behind the corner into the selection
      (was the case before the vertex-mode guard in TriggerVolumeTool).
- [x] Edge mode, double-click a ring edge: switches to vertex mode with the 16 ring
      corners selected.
- [ ] SELECT LOOP button in the edge panel (same code path as double-click).
- [ ] Cyan lines along the set's edges are visible.

## Move / rotate / scale

- [x] S highlights SCALE in the card; dragging the center box outward scales the ring
      evenly (radius 1 → 2.7, snapped to 0.1), heights unchanged, every other corner
      unchanged, no errors.
- [x] One Cmd+Z restores radius 1; Cmd+Shift+Z re-applies.
- [x] T, drag the up arrow: ring moves up in 0.25 steps (y 1 → 1.5), others unchanged.
- [x] Escape mid-drag: the mesh changed during the drag and is restored exactly.
- [x] Rotate math (script, brush yawed 30°, 15° turn about the gizmo's Y): every
      ring corner turns exactly 15°, radius and height unchanged.
- [ ] Rotate by dragging the gizmo ring with the mouse.
- [ ] A drag that turns the brush inside out is undone on release with the panel
      message (hard to trigger with the 0.05 scale floor).
- [ ] Vertex sets inside the isolated brush editor (Phase 78), Save keeps the result.

## Help menu

- [x] BRUSH EDITING lists Shift+LMB corner, Dbl-click edge, T R S for sets, SELECT
      LOOP and SELECT RING.
