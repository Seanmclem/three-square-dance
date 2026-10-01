# Test Plan: Phase 84, Editable ROUND curves (v4.102.0)

[x] = verified 2026-10-01. Logic: scratch Node script over the real `brushOps`. UI:
headless Playwright (system Chrome) on the throwaway test harness
(`deno task test:harness`) with real mouse / keyboard input, on a 2 m concrete cube at
y = 20; nothing reaches `public/games`.

## brushOps

- [x] Round two edges (id R1): `roundsOf` → one curve, parts [0, 1], 16 faces;
      `roundAt` finds it from a strip, null from a plain face.
- [x] MAKE SHARP → 6 faces, 8 corners, exactly the cube's corners, valid.
- [x] Rebuild (sharp + round 3 steps / 0.3 m) → 12 faces, not edited.
- [x] Nudge one curve corner → `edited`; MAKE SHARP still gives the cube.
- [x] SPLIT ALL → two curves; SPLIT OFF part 1 → R1 + R1.1; sharpen R1.1 alone → R1
      untouched; split of a hand-edited curve stays edited.
- [x] Patch case (corner with 4 faces after a loop cut): MAKE SHARP → back to the
      loop-cut cube exactly.

## UI (harness)

- [x] Click + Shift-click two edges, ROUND → card open (green faces, DONE) and CURVES
      lists "Curve 1 · 2 edges · 6 steps · 0.5 m".
- [x] DONE → green off, EDIT offered.
- [x] Face mode, click a strip → the curve reopens (STEPS shows 6).
- [x] STEPS 3 → 12 faces; one Cmd+Z → back to 6 steps (one step per visit).
- [x] EDIT, SPLIT OFF edge 2 → two curves.
- [x] MAKE SHARP on the open one → 12 faces, one curve left.
- [x] Cmd+S, reload → the remaining curve still listed (saved with the brush).
- [x] Nudge a curve corner → "edited by hand", card note; MAKE SHARP → plain cube.
- [ ] By hand: hover a list row lights the curve; the green reads against materials.
