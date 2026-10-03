# Test Plan: Phase 85, Brush holes (v4.109.0)

[x] = verified 2026-10-02. Logic: scratch Node script over the real `brushOps` (with the
3D print export's `isWatertight` on the result). UI: headless Playwright (system Chrome)
on the throwaway test harness (`deno task test:harness`) with real mouse / keyboard
input, on a 2 × 0.2 × 1 m plate brush at y = 20; nothing reaches `public/games`.

## brushOps

- [x] Round hole (24 sides, 0.5 m) through the middle of the plate: valid, watertight,
      24 walls, 4 faces around the opening on each side.
- [x] `fillHole` → the plain plate again (6 faces, 8 corners), entry face = the top.
- [x] `recutHole` (0.3 m, 8 sides, moved): valid, watertight, same id.
- [x] Square 0.4 × 0.2: 4 walls, watertight.
- [x] Pocket 0.1 m: floor face, watertight; 0.3 m (deeper than the plate): refused.
- [x] Too close to an edge / a corner: refused; a small hole near a corner: fits.
- [x] SIDES 3, 5, 6, 7, 12, 64: all watertight.
- [x] Through an upright side (1 m deep): watertight.
- [x] Top of a plate with its 4 upright edges rounded (28-corner face): cut and fill.
- [x] Slanted far side (wedge): watertight.
- [x] Second hole (a pocket from below) beside the first: two holes listed.

## UI (harness)

- [x] Face mode, pick the top, HOLE → card "NEW HOLE", ghost visible at the middle.
- [x] Moving the mouse moves the ghost (X / Y follow); a click pins it and doesn't pick
      a face; moving away afterwards leaves it.
- [x] Near the edge: the ghost turns red, the card says why, CUT HOLE is disabled.
- [x] CUT HOLE → the hole at the clicked spot, open in HOLES IN THIS BRUSH; clicks pick
      faces again.
- [x] Clicking a ring face opens the hole; SIZE 0.3, SIDES 8, THROUGH off (pocket with
      a floor), THROUGH on: each rebuilds.
- [x] PLACE, click elsewhere, MOVE HERE → moved, settings kept.
- [x] Undo: 1 step for the move, 1 for the cut and its edits; redo both.
- [x] FILL → the plain plate.
- [x] v4.109.2: after the cut, and after clicking one of the hole's faces, there is one
      gizmo, at the hole's centre (no face gizmo); dragging its arrows moves the whole
      hole along the face (same face count, card X / Y follow, gizmo follows); one undo
      puts it back; dragging past the edge leaves it at the last spot that fits; DONE
      removes the gizmo.
- [x] HOLE then Esc → placing cancelled, ghost gone.
- [x] Cmd+S, reload → the hole is still there.
- [ ] By hand: the ghost reads clearly on light and dark materials; the open hole's
      green walls are visible.
