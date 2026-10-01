# Test Plan: Phase 83, Brush ROUND (v4.101.0)

[x] = verified 2026-10-01. Logic: scratch Node script over the real `brushOps`. UI:
headless Playwright (system Chrome) on the throwaway test harness
(`deno task test:harness`) with real mouse / keyboard input, on a 2 m cube brush at
y = 20; nothing reaches `public/games`.

## `roundEdges`

- [x] One upright edge, 6 steps, size 0.5: valid, 12 faces; the top curve's points are all
      0.500 from the arc center; the top face has 10 corners.
- [x] 1 step: one flat cut-off face, valid.
- [x] A opposite edges, B both ends of one face, C all four upright (size 0.5 and 0.99),
      D an upright edge + the back top edge: all valid.
- [x] Refused: all four at size 1.0 (curves meet), size 2.5, two edges sharing a corner.
- [x] A horizontal (top) edge.
- [x] An edge ending at a 4-face corner (after a loop cut): patch face path, valid.
- [x] U shape (bar with two extruded prongs): both prong-top edges together, valid.

## UI (harness)

- [x] Edge mode, click an edge; Shift-click another → "2 EDGES SELECTED", both tubes.
- [x] STEPS 6, SIZE 0.5, ROUND 2 EDGES → 18 faces; live card "ROUNDED 2 EDGES".
- [x] STEPS 3 while live → rebuilt from the original (12 faces).
- [x] SIZE 2.5 while live → refusal note, brush unchanged.
- [x] One Cmd+Z → the plain cube (round + adjustments are one step); redo → rounded.
- [ ] By hand: the curve's texture across the strips reads well; DONE ends the live card.
- [x] (v4.101.1) The object's move gizmo hides in face / vertex / edge mode, so a first
      click where it used to be picks the edge; 1 brings the gizmo back.
