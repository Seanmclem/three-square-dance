# Test Plan: Phase 79, Brush Loop Cut (v4.94.0)

[x] = verified 2026-09-30. Logic: scratch Node script over the real `brushOps`
(esbuild bundle). UI: headless Playwright (system Chrome) against the running dev
shell, on throwaway test brushes that were removed afterwards; no scene saved.

## Ring logic (`loopCutRing` / `loopCut`)

- [x] Cube, from a vertical edge: 4 faces, ring closed, 4 new vertices, valid mesh,
      ring vertices in connected order.
- [x] Cube, face start with pair 0 and pair 1: both close around 4 faces.
- [x] 16-sided cylinder, from a vertical side edge: 16 faces, closed, 16 new
      vertices at half height.
- [x] 16-sided cylinder, from a rim edge: 1 side face cut, stops at both
      16-sided caps (`not-quad(16)`), valid.
- [x] A second cut crossing the first on a cube: 6 faces, closed, valid.
- [x] After an earlier SPLIT on a neighbour: closes when the whole side is the
      rail; stops as "ambiguous" when the ring reaches an existing split point.
- [x] Non-quad start face: `loopCutRing` returns null (button disabled).

## Face mode panel

- [x] LOOP CUT ─ / LOOP CUT │ row under the SPLIT row; disabled on non-quads.
- [x] Hovering LOOP CUT ─ draws a dashed ring around the cylinder; leaving clears it.
- [x] Click on a cylinder side: 18 → 34 faces, all 16 new vertices at y = 1,
      note "Cut 16 faces, ring closed."
- [x] One Cmd+Z restores 18 faces; Cmd+Shift+Z re-applies 34.
- [x] LOOP CUT │ on a side face after the ring: cuts that column's 2 faces, note
      "Cut 2 faces, stopped at a 16-sided face."
- [ ] Red stop dots visible in the preview on a rim-direction cut.

## Edge mode panel

- [x] LOOP CUT beside SPLIT EDGE: cube 6 → 10 faces, note "Cut 4 faces, ring closed."
- [x] The start edge was cut, so the selection moves to its surviving half
      (V1 – V4 → V1 – V9) and the gizmo stays live.

## Help menu (? in the top bar)

- [x] Main editor: CAMERA, WALL TOOL, POLYGON FLOOR TOOL, SELECT TOOL, BRUSH EDITING.
- [x] Brush editor (Edit Brush): only CAMERA and BRUSH EDITING, with a line saying
      the others are hidden until Save or Cancel.
- [x] BRUSH EDITING lists LOOP CUT ─ │, LOOP CUT (edge mode) and FLIP FOLD.
- [ ] The help popup draws above the amber "Editing Brush" bar (top bar raised to
      z-index 35).
