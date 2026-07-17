# Phase 39 — Brush inset / edge split / recess (SketchUp-style push-pull)

## Goal

Enable the "sketch on a surface and push/pull" workflow on face-brushes: draw a face
on a face (INSET), push it in (RECESS) or out (EXTRUDE), and add vertices anywhere
on the topology (SPLIT EDGE). This is the real version of the removed-in-v4.32.7
"+ Add corner" idea — instead of appending loose points (meaningless on face-brushes,
whose loops are authoritative), every op rewrites the face loops manifold-correctly.

## Design

All three ops are pure functions in `src/editor/brushOps.ts` returning
`BrushMeshData` (or null with a `console.warn`), gated by `validateMesh`
(edge-pairing === 2, positive volume), committed through the existing
`run() → onObjectUpdate({ mesh: result })` single-transaction path in
PropertiesPanel. **No changes** to ShapeBuilder / ColliderBuilder / WorldState /
ZoneManager / SelectionManager: face-brush rebuild (one mesh per material group +
`faceGroups`), the trimesh collider, undo, and the sub-selection liveness clamp are
all generic over any valid loop set.

### 1. `insetFace(mesh, faceIdx, margin = 0.25)`

Replace `faces[faceIdx]` with a **uniform-width** border ring + inner face:

- Per corner: project the two adjacent edge directions into the face plane
  (Newell normal `n`), take in-plane inward edge normals `m = n × d`, bisector
  `b = normalize(mPrev + mNext)`, miter length `margin / (b·mNext)` where
  `b·mNext = sin(θ/2)` — so the perpendicular distance from the inner loop to
  *both* adjacent edges is exactly `margin` at any corner angle. (A centroid scale
  would give non-uniform borders on elongated faces — the window-on-a-wall case.)
- Inner verts are pushed fresh, never `addOrReuse` (welding an inner vertex onto
  the outer ring would corrupt topology).
- Guards: degenerate normal, zero-length edge, spike corner (`|mPrev+mNext| ≈ 0`),
  near-degenerate corner (`sin(θ/2) < 0.05`), collapsed inner edge (< 1e-3), and
  inverted/degenerate inner loop (raw unnormalized Newell of the inner loop must
  have positive dot with `n` and non-trivial length). Margin-too-large → warn + null.
- The inner face **takes over `faces[faceIdx]`** (keeps material/overrides, stays
  selected — INSET then EXTRUDE/RECESS immediately acts on it). Border quads
  `[p, q, qInner, pInner]` inherit the parent material. Outer ring untouched →
  no T-junction propagation needed. Net: +L verts, +L faces.

### 2. `splitEdge(mesh, edge: [a, b]) → SplitEdgeResult { mesh, mid } | null`

The arbitrary-polygon generalization of `splitFaceQuad`'s edge cut:

- Midpoint via `addOrReuse`; spliced into **both** loops traversing the undirected
  edge by the shared `spliceMidpoint(faces, mid, p, q)` helper (extracted from
  `splitFaceQuad`, which now calls it twice — behavior identical).
- Defensive `count === 2` check: the manifold invariant guarantees exactly two
  loops traverse any edge; also catches the pathological case where `addOrReuse`
  welded onto a vertex already inside an adjacent loop.
- Returns `mid` because the original `[a,b]` pair is **no longer traversed** after
  the split — SelectionManager's liveness clamp drops a stale edge selection, so
  the caller re-selects the surviving sub-edge `[min(a,mid), max(a,mid)]`.

### 3. Negative `extrudeFace` distance (RECESS)

Guard relaxed from `dist <= 0` to `dist === 0 || !Number.isFinite(dist)`. The side
quad winding `[p, q, qd, pd]` is **sign-agnostic by directed-edge pairing**: the
band must supply `p→q` (the untouched neighbor still traverses `q→p`) and `qd→pd`
(the moved cap traverses `pd→qd`) whichever way the dup ring moved; the quad's
geometric normal flips automatically with the sign. Do NOT flip the winding for
negative dist — that would produce a non-orientable surface the undirected edge
count can't detect. (Commented in code.)

## Panel (`src/ui/PropertiesPanel.tsx`)

- `ShapeFaceOps`: two button rows — `SPLIT ─ · SPLIT │ · INSET` and
  `EXTRUDE · RECESS` (both ±0.25; `OP_BTN`/`OP_BTN_OFF` hoisted to module scope).
- New `EdgesList` view: `ShapeGeoView` routes `faceBrush && select-edge` to it
  (previously fell through to the transform view). A single card for the current
  `selected.edgeVerts` (edges have no stored identity) showing endpoint coords +
  **SPLIT EDGE**, which commits and then re-emits `shape:sub-select` with the
  surviving sub-edge so the selection + edge TC gizmo stay live.
- `TOOL_INFO["select-edge"]` copy mentions the panel split.

## Known v1 limits

- Strongly concave inset can self-intersect past the guards (validateMesh catches
  many such cases; the rest the user undoes). Convex faces are the supported target.
- A shallow recess punch-through of a large solid can validate (net signed volume
  still positive) — self-intersecting geometry the user must undo.
- RECESS of a full un-inset face produces a valid but zero-thickness rim where the
  band coincides with the neighbor walls — the button tooltip steers to inset first.
- Split is midpoint-only (t = 0.5); no clicked-point parameterization.
- Fixed 0.25 amounts (matches the extrude precedent + snap grid); adjust by
  dragging the face/edge/vertex gizmos afterward.

## Demo

`demo_p39_carved_wall` (brick, labeled) in the level-2 world at (40, 0, 24):
a 6×1×2.5 wall with a window recess (INSET + RECESS on the front face — uniform
0.25 border on an elongated face), an end boss (INSET + EXTRUDE on the +x end),
and a roof peak (SPLIT EDGE on the top-front edge, midpoint raised to y=3.1).
