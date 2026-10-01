# Test Plan: Phase 81, Brush Face Sets (v4.98.0)

[x] = verified 2026-09-30. Logic: scratch Node script over the real `brushOps`. UI:
headless Playwright (system Chrome) against the running dev shell with real mouse /
keyboard input, on a throwaway 16-sided cylinder at y = 20, removed afterwards; nothing
saved.

## Region ops (`extrudeRegion` / `insetRegion`)

- [x] Cylinder band (16 faces, 32 boundary edges): EXTRUDE moves every face plane
      exactly +0.25 (corners at radius 1.255), RECESS −0.25 (0.745); walls only on the
      rims (34 → 66 faces); valid.
- [x] RECESS deeper than the radius (−1.2): refused "RECESS would turn faces inside out".
- [x] A 1-face set gives byte-identical output to `extrudeFace`.
- [x] 2×2 patch on a cube side: INSET → one border (8 boundary edges, 9 → 17 faces),
      inner patch spans −0.75..0.75 × 0.25..1.75; RECESS after → one window at z 0.75.
- [x] Closed band (all sides): INSET → strips inside both rims (band y 0.25..1.75);
      RECESS after → one groove (radius 0.745); INSET 1.0 on the 2 m band refused.
- [x] Two separate faces (cube front + back) extrude together, valid.

## Selection (running shell)

- [x] FACE LOOP H / V on a cylinder side → "16 FACES SELECTED", 16 blue overlays.
- [x] Plain click a face → that face; Shift-click another → "2 FACES SELECTED"; the
      brush stays the selected object.
- [x] Double-click a face → its 16-face loop.
- [ ] Shift-click a row in the FACES list toggles it.
- [ ] Shift-click doesn't pull a trigger volume into the selection (face-mode guard).

## Set card

- [x] Material for all: every side face → brick_01 in one pick.
- [x] EXTRUDE: 18 → 50 faces, ring radius 1.255; the set stays selected; one Cmd+Z
      restores 18 faces, radius 1.
- [x] RECESS ×3 → radius 0.745 / 0.49 / 0.235; the 4th is refused with "RECESS would
      turn faces inside out; nothing changed." and the mesh is byte-identical.
- [x] INSET on the band: 18 → 50 faces, band now y 0.25..1.75.
- [ ] TILE for all; "(mixed)" shown when materials differ.

## PUSH and DIST (v4.99.0)

- [x] GIZMO PUSH swaps the arrows for a green cube handle at the selection's centre.
- [x] Drag it 50 px right with the 16-face band: every face 0.5 m out (radius 1.51),
      note "Pushed out 0.50 m."; one Cmd+Z restores.
- [x] Drag 200 px left: stops at the last valid distance (−0.90 m), note "Stopped at
      -0.90 m: PUSH would turn faces inside out."
- [x] Escape mid-push restores exactly.
- [x] DIST 0.5 → EXTRUDE moves the band 0.5 m (radius 1.51).
- [ ] PUSH on a single face (moves it along its normal; neighbours stretch).

## Gizmo

- [x] With the 16-face set, dragging the up arrow moves every set corner by the same
      amount (+0.5, snapped).
- [ ] Escape mid-drag restores.
- [ ] Face sets inside Edit Brush (Phase 78), Save keeps the result.
