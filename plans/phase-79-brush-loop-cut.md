# Phase 79 · Brush loop cut

> Status: **PLANNED**. Numbered 79 because Phase 78 (isolated brush edit mode) is the
> latest shipped phase; renumber if something else lands first.

A **loop cut** adds a new ring of edges and vertices all the way around a face-brush:
around the middle of a cylinder, or around the four sides of a cube. It is what
Blender calls "Loop Cut and Slide" (Ctrl+R), Maya "Insert Edge Loop", 3ds Max "Swift
Loop". User request (2026-09-29): select a shape "and split all faces in a way that
would like put a new circle of edges and vertexes around a cylinder".

---

## 1. Scope

**In scope**

- One loop cut at a time, always through the **middle** of each face it crosses (the
  same point SPLIT ─ / SPLIT │ cut today).
- Two ways to start it:
  - **Face mode**: `LOOP CUT ─` / `LOOP CUT │` on the selected face: the same cut as
    the matching SPLIT button, continued around the shape.
  - **Edge mode**: `LOOP CUT` on the selected edge: the ring that crosses that edge.
- A hover preview: while the pointer is on a LOOP CUT button, the canvas shows where
  the ring will go and where it stops.
- One undo step for the whole ring. Works in the main editor and the isolated brush
  editor (Phase 78), since both use the same face/edge panels.

**Out of scope (see §9)**

- Sliding the ring off-center, several parallel cuts at once, and selecting or moving
  the new ring as a whole.

---

## 2. Current state

| Piece | Today | This phase |
|---|---|---|
| `splitFaceQuad(mesh, faceIdx, pair)` (`src/editor/brushOps.ts`) | Splits one four-cornered face between the midpoints of one pair of opposite sides; adds the midpoints to neighbouring faces so no crack opens (T-junction splice). Keeps `faceIdx` on one child and **appends** the other. | Reused unchanged as the per-face step. |
| `quadCorners(vertices, loop)` | Finds the 4 real corners of a face, ignoring points that sit straight along a side. | Reused to decide which faces the ring can pass through. |
| `splitEdge(mesh, edge)` | Edge mode SPLIT EDGE, then re-selects the surviving half edge. | Its re-select pattern is copied for edge-mode LOOP CUT. |
| Face panel `ShapeFaceOps` (`src/ui/PropertiesPanel.tsx`) | Rows `SPLIT ─ · SPLIT │ · INSET` and `EXTRUDE · RECESS · FLIP FOLD`. | New row `LOOP CUT ─ · LOOP CUT │` right under the SPLIT row. |
| Edge panel `EdgesList` | One card with `SPLIT EDGE`. | `LOOP CUT` beside it. |
| `BrushFaceHighlighter` | Blue face overlay, edge tube, dashed fold line (v4.93.0). | Draws the ring preview. |
| Selection | One face, one vertex or one edge at a time. | Unchanged (this is why moving the whole ring is out of scope). |

**Spike (2026-09-29, scratch script, not committed)**: chaining `splitFaceQuad` around a
ring already works on today's code.

- Cube, starting from a vertical edge: 4 faces, ring closes, 4 new vertices all at
  half height, passes `validateMesh`, every face still four-sided.
- 16-sided cylinder (from `facesFromCloud`, the Convert to Brush path): sides come out
  as 16 four-sided faces, caps as two 16-sided faces. The ring goes through all 16
  sides, closes, and gives 16 new vertices at half height; the result is valid.
- A second cut crossing the first on the cube (over the top, down the front, under,
  up the back): 6 faces, closes, valid, 6 new vertices.

So the new work is the **walk** (which faces, in what order, where it stops) plus the
UI; the cutting itself is the existing, already-tested SPLIT.

---

## 3. Design: the walk

Terms: the ring crosses a series of four-cornered faces. Inside each face it enters
through one side and leaves through the **opposite** side. Those crossed sides are the
**rails**; each rail gets one new vertex at its middle. (On a cylinder the rails are
the vertical side edges, and the new ring is horizontal.)

`loopCutRing(mesh, start) → { faces: Array<{ faceIdx, pair }>, closed: boolean, stops: StopInfo[] } | null`
(new, pure, in `brushOps.ts`; used by both the cut and the preview)

- `start` is either `{ faceIdx, pair }` (face mode: the face and which SPLIT direction)
  or `{ edge: [a, b] }` (edge mode: the edge is the first rail).
- From the start, walk in **both** directions. Face start: out through each of the
  face's two rails. Edge start: into each of the two faces that share the edge.
- Step into a face across a rail:
  1. Stop if the face is not four-cornered (`quadCorners` is null), e.g. a cylinder cap
     or a triangle. That is an open end of the ring.
  2. Find which of the face's 4 sides the rail belongs to. The rail must be that
     **whole side** (corner to corner, with or without straight-through points on
     it). If the face's side is longer than the rail (the neighbour was split before
     and only half of this side touches it), stop: the ring can't continue without
     a jog.
  3. Record `{ faceIdx, pair }` (`pair` = side index mod 2, the `splitFaceQuad`
     convention).
  4. The next rail is the opposite side. The next face is the one across the segment
     of that side that contains its midpoint. If the midpoint lands exactly on an
     existing point where two neighbours meet, stop (ambiguous).
  5. If the next face is the ring's start face, the ring is **closed**: stop both
     directions. Any other revisited face: stop (odd topology; never loop forever).
- `stops` records each open end (face index + reason) for the preview and the
  panel note.

`loopCut(mesh, start) → BrushMeshData | null`

- Run `loopCutRing`, then apply `splitFaceQuad` to each recorded face in order,
  feeding each result into the next call.
- Face indices stay valid while applying because `splitFaceQuad` keeps the face on
  its index and appends the other half. At apply time, **re-derive `pair`** from the
  entry rail's corner vertices, not the recorded side number: splices from earlier
  splits add points to later faces' loops. (The spike used the recorded number and it
  held, because a splice never lands at loop position 0, but re-deriving costs nothing
  and removes the dependency.)
- Neighbouring midpoints are shared automatically: `splitFaceQuad` reuses a vertex
  already at the midpoint (`addOrReuse`) and splices open ends into the non-quad face
  they stop at, so a stopped ring leaves no crack.
- `validateMesh` on the final mesh; on failure, log and return null (nothing
  committed), same as every other brush op.
- Per-face materials and tile overrides carry over (`splitFaceQuad` already copies
  them); a fold override on a cut face is dropped (already done by `splitFaceQuad`,
  v4.93.0).

---

## 4. Design: panel

**Face mode (`ShapeFaceOps`)**

```
 SPLIT ─      SPLIT │      INSET
 LOOP CUT ─   LOOP CUT │           ← new row
 EXTRUDE      RECESS       FLIP FOLD
```

- Same enable rule as SPLIT (the face needs 4 real corners) and the same ─/│ labelling
  (`pair0IsH`).
- Tooltip: "Split this face and keep going around the shape, until the ring comes back
  round or reaches a face that isn't four-sided."
- After the cut the selected face stays selected (it keeps its index, as with SPLIT).

**Edge mode (`EdgesList`)**: `LOOP CUT` beside `SPLIT EDGE`. Disabled when neither face
sharing the edge is four-cornered. After the cut, re-select the surviving half of the
start edge `[min(a, mid), max(a, mid)]`, exactly like SPLIT EDGE.

**Result note** (one line under the buttons, until the selection changes): "Cut 16
faces, ring closed." or "Cut 3 faces, stopped at a 16-sided face." So the user can see
why a ring didn't go all the way round.

---

## 5. Design: hover preview

- Hovering a LOOP CUT button emits a new bus event `shape:loop-preview { zoneId,
  shapeId, start | null }` (null on mouse leave). No preview on touch; the result note
  covers it.
- `BrushFaceHighlighter` runs `loopCutRing` on the current mesh and draws, for each
  ring face, a line between the midpoints of its two rails, lifted off the surface,
  depthTest off, same white dashed style as the fold line. Faces where the ring stops
  get a short red tick at the stop point.
- Throwaway geometry, rebuilt on each preview event and disposed on clear, like the
  other overlays. No per-frame work.

---

## 6. Events & types

| Addition | Where |
|---|---|
| `"shape:loop-preview": { zoneId: string; shapeId: string; start: LoopCutStart \| null }` | EventBus table in `src/types.ts` |
| `type LoopCutStart = { faceIdx: number; pair: 0 \| 1 } \| { edge: [number, number] }` | `src/editor/brushOps.ts` (exported) |

No change to `BrushFace`, `ShapeDef` or saved scene data: a loop cut only produces
ordinary faces and vertices.

---

## 7. Edge cases (checklist)

- [ ] Cube, any side edge or side face: 4 faces, closed.
- [ ] Cylinder, vertical side edge or side face with LOOP CUT ─: all N sides, closed;
      caps untouched (the ring never reaches them).
- [ ] Cylinder, a rim edge (side face + cap): the cap stops one direction immediately;
      the other goes down one side face to the bottom cap. Result: one side face split
      vertically, both caps gain a straight-through point. Matches Blender.
- [ ] Start face or both start-edge faces not four-cornered: buttons disabled.
- [ ] Ring reaches a face with a straight-through point on the entry side (from an
      earlier SPLIT next door): continues when the whole side is the rail; stops when
      only part of the side touches the rail.
- [ ] A second loop cut crossing an earlier one (spike case): closes, valid.
- [ ] Two parallel cuts in a row (cut, then cut one of the halves): works like SPLIT
      twice.
- [ ] Bent (non-planar) faces on the ring: still four-cornered, cut at side midpoints;
      their fold override is dropped with the split.
- [ ] Ring would revisit a face other than the start: stops, never loops forever.
- [ ] `validateMesh` fails: nothing committed, warning logged, panel unchanged.
- [ ] Undo: one step restores the whole ring; redo re-applies it.
- [ ] Isolated brush editor (Phase 78): same buttons, Save writes the cut brush back.
- [ ] Edge mode: selection lands on the surviving half of the start edge, gizmo still
      live.

---

## 8. Implementation order (each step → verify)

1. **`loopCutRing` walk** in `brushOps.ts`. → Verify with a scratch Node script
   (esbuild bundle of the real `brushOps`, as in the spike): cube, 16-sided cylinder
   (side and rim starts), the crossing cut, the user's 4-way-split face, and a
   partial-side stop. Check face counts, `closed`, and stop reasons.
2. **`loopCut` apply.** → Same script: `validateMesh` passes, new vertex count equals
   the number of rails, every new vertex sits at its rail's midpoint, no face gained
   a crack (every edge still used by exactly two faces).
3. **Panel buttons** (face row + edge button + result note). → In the running app
   (Chrome extension, or headless Playwright against the shell per TESTING.md): cube
   and cylinder, both modes, disabled states, one undo step, edge re-select.
4. **Hover preview.** → Screenshot the preview on a cylinder (closed ring) and on a
   rim edge (stop ticks); confirm it clears on mouse leave and on selection change.
5. **Docs.** → `HelpButton` rows for both buttons, `TOOL_INFO` copy for face/edge
   modes, architecture doc (changelog + brushOps / PropertiesPanel /
   BrushFaceHighlighter sections), `test-plans/phase-79-brush-loop-cut.md`, and a
   labelled demo brush in a level (a cylinder with two loop cuts, middle ring pulled
   out by hand).

---

## 9. Open questions (defaults chosen, none blocking)

1. **Moving the new ring as a whole.** After a loop cut around a cylinder, making a
   bulge or a waist means moving each new vertex one at a time, because the editor
   selects one vertex/edge/face at a time. Blender solves this with loop select plus
   move/scale. *Default: separate phase*, since it needs multi-vertex selection in
   `SelectionManager` and the gizmo, which is a bigger change than the cut. Worth
   doing next if loop cuts get used for shaping rather than for adding detail.
2. **Position along the ring (slide).** *Default: middle only*, matching SPLIT. A later
   `%` field could cut every face at the same fraction along its rails (rails need a
   consistent direction around the ring; doable in the walk).
3. **Several cuts at once** (Blender's "number of cuts"). *Default: one*; press again
   to add more.
4. **Both entry points?** *Default: yes.* Face mode is where splitting happens today;
   edge mode is where Blender users will look. Both are thin wrappers over the same
   `loopCut`.
