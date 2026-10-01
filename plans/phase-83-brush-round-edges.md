# Phase 83 · Brush ROUND: turn sharp edges into curves (bevel)

> Status: **IMPLEMENTED**, shipped as v4.101.0 (2026-10-01); see
> `test-plans/phase-83-brush-round-edges.md`. Proposal and drawings agreed with the
> user: https://claude.ai/artifact/EAKP4okQDZrfjAaqdPCeY4

Pick one or more edges of a face-brush in edge mode and replace each sharp edge with a
curve of thin faces (a bevel). **STEPS** sets how many faces make the curve (1 = a flat
cut-off), **SIZE** how far back from the edge the curve starts on each side. The last
round stays adjustable: changing STEPS or SIZE rebuilds it until DONE.

---

## 1. Scope

**In scope (decided 2026-10-01, user)**

- One edge, or several edges of one brush at once (Shift-click edges), touching or not,
  sharing faces or not: e.g. the two top edges of the two prongs of a U, every upright
  edge of a box, opposite edges.
- 1 step = a flat cut-off, same tool.
- The last round stays live: STEPS / SIZE edits rebuild it from the shape before the
  round, merged into one undo step; DONE (or any other edit / selection change) ends it.

**Later**

- Edges that meet end to end at a corner point (needs a curved corner patch): refused
  with a note.
- Edges on different brushes.

---

## 2. Design

`roundEdges(mesh, edges, size, steps) → { mesh } | { refused }` in `brushOps.ts`, one
edge at a time on the running result, unused corners compacted at the end:

1. Edge (a, b) with faces FA (a→b) and FB (b→a). At each end, the two "rails" are the
   other edges of FA and FB at that corner. New points `p = end + size · unit(rail)`;
   refused when `size` reaches the rail's far corner.
2. The curve at each end: `C = pA + pB − end`, `P(θ) = C + (pA − C) cos θ + (pB − C) sin θ`,
   θ = 0 … 90° in `steps` steps: tangent to both faces (a circular arc on a right
   angle).
3. FA and FB swap the corner for the first / last curve point; one strip quad per step,
   material from FA.
4. The end face: when exactly three faces meet at the corner, its loop takes the curve
   in place of the corner (the cube's top and bottom get a rounded corner). With more
   faces at the corner, the two rail faces take the curve's end points and a new flat
   patch face fills the gap.
5. Refused: an edge not between two faces, two selected edges sharing a corner, a size
   past a rail's end, or a result that fails `validateMesh`.

Selection: `SelectionManager._subEdges` (edge set), Shift-click in edge mode toggles the
nearest edge; `edgeSet` on `object:selected` / `shape:sub-select`; blue tubes on every
edge in the set.

Live round: `BrushEdgeEditor` handles `shape:round-edges` / `shape:round-adjust` /
`shape:round-done`, keeping the pre-round mesh; each rebuild is a transaction with a
`coalesce` key that `HistoryManager.push` merges into the previous entry with the same
key, so the round plus all its adjustments is one undo step. Live ends when the mesh no
longer matches the last result.

Panel (edge mode): STEPS (1 to 64, default 6) and SIZE (m, default 0.25) above a ROUND
button; while live, "ROUNDED n EDGES: change STEPS or SIZE to adjust" with DONE. No hover
preview: the live adjustment covers it.

---

## 3. Checks

- Cube, one upright edge, steps 6, size 0.5: 6 strip faces, top / bottom gain a rounded
  corner, still valid; 1 step = one flat 45° face.
- Opposite edges, both ends of one face, all four upright edges, an upright + a
  non-touching top edge: valid.
- Two edges sharing a corner: refused. Size past the next corner: refused.
- Live: changing STEPS rebuilds from the original; one undo removes the round.
