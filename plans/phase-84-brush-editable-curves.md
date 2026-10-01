# Phase 84 · Editable ROUND curves: reopen, adjust, MAKE SHARP, split

> Status: **IMPLEMENTED**, shipped as v4.102.0 (2026-10-01); see
> `test-plans/phase-84-brush-editable-curves.md`. Ideas page agreed with the user:
> https://claude.ai/artifact/EqhAFqStfB8uwthcbjrWnZ

A ROUND (Phase 83) was one-way: the picked edge disappears, nothing stays selected, and
after DONE STEPS / SIZE were gone. Now a curve remembers how it was made.

## Decided (2026-10-01, user)

- Build all three ideas together: curves remember themselves, a new curve stays
  selected (open) after ROUND, and a CURVES list.
- Edges rounded together are one curve and change together; SPLIT ALL, or SPLIT OFF one
  edge from its list row.
- After a hand-edit, keep offering MAKE SHARP (refused when the result wouldn't be a
  valid brush).

## Design

- **Memory on the faces**: `BrushFace.round = { id, part, steps, size, a, b, patch?, sig }`
  on every face a ROUND creates (strips, and the patch at a 4+ face corner). On the faces,
  not in a side table, so it survives every op that copies faces. `sig` = the curve's
  corner positions at build time; a mismatch = edited by hand.
- **brushOps**: `roundEdges(…, id)` tags; `roundSig`, `roundsOf` (curves in face order,
  with `edited`), `roundAt` (curve of a face or edge), `unroundEdges` (remove the curve's
  faces, merge each end's corners into the surviving original corner or one at the
  remembered position, drop collapsed faces, compact, validate; returns the sharp edges),
  `splitRound` (retag parts; a hand-edited curve stays edited).
- **Rebuild** = `unroundEdges` then `roundEdges` with the same id and the new numbers.
- **BrushRoundController** (new; the Phase 83 code moved out of BrushEdgeEditor): opens
  a curve on ROUND, on a face / edge pick on it, or from the list (`shape:round-open`);
  a pick elsewhere, DONE, deselect or the curve vanishing (undo, MAKE SHARP) closes it.
  Adjustments share one coalesce key per open (one undo step). Emits `shape:round-state`
  and `shape:faces-highlight` (green, channel "round"; list hover uses "hover").
- **Panel**: `RoundEdgesRow` (new rounds, hidden while a curve is open) and `CurvesList`
  (every Geometry mode; the open curve's card: STEPS / SIZE, MAKE SHARP, DONE, SPLIT ALL,
  per-edge SPLIT OFF; an "edited by hand" note locks STEPS / SIZE).

## Not covered

- Curves rounded before v4.102.0 carry no memory.
- Two edges meeting at a corner, and edges on different brushes (Phase 83 limits).
