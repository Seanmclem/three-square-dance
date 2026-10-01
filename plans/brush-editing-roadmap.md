# Brush editing roadmap

> Status: **ROADMAP** (2026-09-30). Six follow-ups to Phases 78 to 80 and v4.97.
> Each section is a seed for its own `plans/phase-NN-*.md`; numbers are given when a
> plan is written, since phase numbers go to whatever ships first.

What exists today (v4.97.0): face, vertex and edge modes on face-brushes; SPLIT,
LOOP CUT (Phase 79), INSET, EXTRUDE / RECESS, SPLIT EDGE, FLIP FOLD; vertex sets with
Shift-click, SELECT LOOP, AROUND FACE and SELECT RING, moved / rotated / scaled by one
gizmo (Phase 80). Selection is one face or one edge at a time, or a set of corners.

## At a glance

| Item | What it adds | Size | Needs first |
|---|---|---|---|
| [Face sets and face loop select](#face-sets-and-face-loop-select) | Several faces selected at once; a whole ring of faces in one click; one material for all; extrude / recess the band as one piece | Large | nothing |
| [Soft falloff](#soft-falloff) | Nearby corners follow a move with a falloff, for smooth bulges | Medium | nothing |
| [Sliding a loop cut](#sliding-a-loop-cut) | Cut at any point along the faces, not only the middle | Medium | nothing |
| [Several parallel loop cuts](#several-parallel-loop-cuts) | 2, 3, 4… evenly spaced rings in one step | Small | best after sliding |
| [Pivot choices for vertex sets](#pivot-choices-for-vertex-sets) | Scale / rotate around the brush's center or one corner | Small | nothing |
| [Box and lasso select](#box-and-lasso-select) | Drag a rectangle or a free shape to pick corners | Medium | nothing |

Suggested order: soft falloff and face sets first (they change what can be built the
most), then sliding + several cuts together, then pivots and box select.

---

## Face sets and face loop select

**What:** face mode selects several faces at once (Shift-click adds or removes), and a
**face loop** selects the whole ring of faces around the shape in one step: the faces a
loop cut would cross, e.g. every side of a cylinder, or one band of a cube.

**Why:** today a ring of faces can be seen (the LOOP CUT preview) and its corners moved
(SELECT RING, T/R/S), but not treated as faces: no one material for all of them, no
extruding the band.

**How it could work**
- `SelectionManager` gains a face set beside the vertex set (`vertexSet` pattern:
  `faceSet` on `object:selected` and `shape:sub-select`, clamped, cleared with the mode).
- Face loop = `loopCutRing(mesh, { faceIdx, pair }).faces`, which already finds exactly
  that ring. Entry points: a FACE LOOP H / V pair of buttons, and double-click a face.
- Highlight: the blue overlay on every face in the set.
- What each op does with several faces (decided 2026-09-30, user):
  - **Material and tile for all:** with 2+ faces selected, the material picker and
    TILE apply to every face in the set.
  - **EXTRUDE / RECESS the band as one piece, faces scaling to stay joined.** The
    selected faces move out (or in) together as a connected region, not as separate
    blocks: side walls are added only along the region's outer boundary (a band's top
    and bottom rims), never between two selected faces. Each face's plane moves
    exactly 0.25 m along its own normal, so the faces stay parallel to where they were
    and grow (extrude) or shrink (recess) to stay joined. On a cylinder band that's a
    thicker ring: every side face pushed straight out, each one wider than before.
    Per corner, the offset `o` satisfies `o · n = d` for the normal `n` of every
    selected face around it (two faces: `o = d (n1 + n2) / (1 + n1 · n2)`; more:
    least squares), the usual "shell" offset; a corner on a flat area just moves `d`
    along the normal.
  - INSET: each face on its own, or the region as a whole; to decide in the plan.
  - SPLIT / LOOP CUT / FLIP FOLD: stay single-face.

**Open questions:** INSET per face or as a region? Should AROUND FACE (edge mode) also
be able to select faces, not corners? Cap how far a recess can shrink faces before it
refuses (a deep recess on a thin band can turn faces inside out; `validateMesh` on
release catches it)?

---

## Soft falloff

**What:** when corners move (a single corner, an edge, a face or a vertex set), nearby
corners move too, less the farther away they are. Blender calls it proportional
editing.

**Why:** a ring scaled with S today makes a sharp ridge. With falloff, the rings above
and below follow part of the way, so a cylinder gets a rounded bulge or waist. The
biggest single step toward organic shapes.

**How it could work**
- A toggle (key O, like Blender, plus a panel button) and a radius in meters, shown as a
  circle or sphere around the pivot while dragging; scroll or [ ] changes the radius
  mid-drag.
- Weight per corner = falloff(distance from the nearest moved corner / radius), with a
  few curve choices (smooth, linear, sharp). Each drag recomputes from the original
  positions, like the set gizmo already does, so it stays one undo step.
- Applies to every drag that moves corners: `BrushVertexEditor`, `BrushEdgeEditor`,
  `BrushFaceEditor`, `BrushSetEditor`. Distance straight through space first; distance
  along the surface later if needed.
- `validateMesh` on release, as vertex sets do.

**Open questions:** straight-line or along-the-surface distance? Remember the radius
per brush or globally?

---

## Sliding a loop cut

**What:** place a loop cut anywhere along the faces it crosses, e.g. 30% of the way
across, not only through the middle.

**Why:** real shapes need rings off-center: a band near the top of a pillar, a lip
near a rim.

**How it could work**
- `loopCut` takes a fraction `t` (0 to 1), 0.5 today. Every rail gets its new corner at
  `t` along it, with all rails pointing the same way round the ring so the cut doesn't
  zigzag (the walk already visits them in ring order; each rail needs a direction).
- UI: a slider or a number (%) under the LOOP CUT buttons, with the dashed preview
  following it; or Blender's way, dragging after the click to slide the new ring before
  it's placed.
- `splitFaceQuad` gets a `t` too, so SPLIT H / V can cut off-center.

**Open questions:** a % field, or drag-to-slide after the click? Should t snap (e.g.
to 10% steps, Alt for free)?

---

## Several parallel loop cuts

**What:** one click adds N evenly spaced rings, e.g. 3 rings dividing a pillar into
4 equal bands.

**Why:** smooth bends and bulges need several rings; one click per ring gives uneven
spacing today, since each new ring halves a band.

**How it could work**
- A "cuts" number (1 to 8) beside the LOOP CUT buttons. The walk runs once; each ring
  face is split N times at `k / (N + 1)`, so it builds on the `t` from sliding.
- The preview shows all N rings; the result note says "3 rings, 48 faces".
- SELECT RING after it selects all the new rings, or offer one button per ring.

**Open questions:** do N cuts and sliding combine (N rings squeezed toward one side)?

---

## Pivot choices for vertex sets

**What:** choose what a vertex set scales and rotates around: the set's center (today),
the brush's center, or the last-clicked corner.

**Why:** scaling a ring around the brush's center keeps it centered on the shape even
when the ring is off to one side; scaling around one corner pins that corner in place.

**How it could work**
- A small PIVOT choice in the vertex-set card (CENTER / BRUSH / ACTIVE); the gizmo moves
  to the chosen point.
- `BrushSetEditor` already scales and rotates around a stored pivot; it only needs a
  different point. Brush center = the mesh bounds' center in shape space; active corner
  = `vertexIndex`.

**Open questions:** remember the choice between sets? Also offer "3D cursor"-style
custom points later?

---

## Box and lasso select

**What:** in vertex mode, drag a rectangle (or draw a free shape) over the brush to
select every corner inside it; Shift adds to the set, Alt removes.

**Why:** Shift-clicking corners one by one is slow on dense brushes, and some groups
don't form a loop (half a cylinder, one end of a shape).

**How it could work**
- A drag on empty space in vertex mode draws the box (today it does nothing); corners
  are projected to the screen and tested against the rectangle or lasso polygon.
- Only corners facing the camera by default, with a toggle to include hidden ones
  (select through).
- Builds the same `vertexSet` as Shift-click, so the set gizmo, pivots and falloff all
  apply.
- Needs care not to fight camera orbit (right drag) and the selection click; the
  gesture only starts on a left drag that doesn't begin on a handle or the gizmo.

**Open questions:** box only first, lasso later? Select hidden corners by default or
not? Same gesture for faces once face sets exist?
