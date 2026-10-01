# Phase 81 · Brush face sets: face loop select, one material for many faces, region INSET / EXTRUDE / RECESS

> Status: **PLANNED** (2026-09-30). From `plans/brush-editing-roadmap.md` (face sets
> item), with the user's decisions. Numbered 81 as the next free phase; renumber if
> something else lands first. Drawings of the decided behaviour:
> https://claude.ai/artifact/F3EvgpZtrbniJdmKkJPjke

Face mode selects one face at a time today. This phase lets it hold **several faces**
(Shift-click, or a whole **face loop** in one step) and makes the face buttons act on
them as one piece: one material for all, and INSET / EXTRUDE / RECESS of the whole
region, its faces scaling to stay joined.

---

## 1. Scope

**In scope**

- A **face set** in face mode: click = one face (today); **Shift-click** adds or
  removes a face; clicking empty space or leaving face mode clears it.
- **Face loop select**: FACE LOOP H / FACE LOOP V buttons on the selected face, and
  **double-click** a face, select the ring of faces a loop cut through that face would
  cross (all sides of a cylinder, one band of a cube).
- With **2+ faces** selected:
  - **Material and TILE** apply to every face in the set.
  - **INSET** insets the set as one region: a border only along its outer boundary.
  - **EXTRUDE / RECESS** move the region as one piece; each face's plane moves 0.25 m
    along its own normal and the faces grow or shrink to stay joined; side walls only
    along the outer boundary.
  - The face gizmo moves every face in the set together.
  - An op that would turn faces inside out is **refused** with a note; nothing changes.
- One undo step per op. Works in the main editor and in Edit Brush.

**Decided out (2026-09-30, user)**

- No per-face "INSET EACH": multi-face INSET is region-only.
- AROUND FACE (edge mode) keeps selecting corners/edges, not faces.
- SPLIT, LOOP CUT and FLIP FOLD stay single-face (greyed out with 2+ selected).

---

## 2. Current state

| Piece | Today | This phase |
|---|---|---|
| `SelectionManager` | `_subFace` (one index); `_subVertices` set for corners (Phase 80); additive click in face mode toggles the *object* | Adds `_subFaces: number[]` → `faceSet` on `object:selected` / `shape:sub-select`, clamped and cleared like `vertexSet`. In face mode an additive click on the selected brush toggles the hit face instead of the object. `faceIndex` stays as the active (last-clicked) face. |
| `loopCutRing(mesh, { faceIdx, pair })` | Plans a loop cut: ring faces in order + stops | Reused as-is: its `faces` are the face loop. |
| `extrudeFace` / `insetFace` | One face: dup ring + side quads / miter-offset inner loop + border quads | Region versions beside them (§4, §5); the single-face ones stay for 1-face sets. |
| `BrushFaceEditor` | Translate gizmo at one face's centroid, moves its corners | Moves the union of the set's corners, gizmo at their centroid. |
| `BrushFaceHighlighter` | Blue overlay on the selected face, fainter one on hover | Blue overlay on every face in the set. |
| `FacesList` / `ShapeFaceOps` | Per-face rows; the selected row expands with material, TILE and op buttons | Rows highlight every set member; with 2+ a set card replaces the per-face op block (§6). |
| Validation | `validateMesh` gates every brush op | Same; a failure becomes a visible note instead of only a console warning. |

---

## 3. Design: selecting faces

- **State**: `SelectionManager._subFaces` (selection order). Rules mirror vertex sets:
  plain click on a face → `[that]`; Shift / Cmd / Ctrl click → toggle; empty space,
  another object or a mode change → cleared; clamp drops indices past `faces.length`
  on every emit (undo can remove faces).
- **Payloads**: `SelectedObjectPayload.faceSet?: number[]` (length 1 for a single face,
  so `faceIndex` readers keep working); `shape:sub-select` accepts `faceSet`.
- **Face loop**: `loopCutRing(mesh, { faceIdx, pair }).faces.map(f => f.faceIdx)`,
  emitted as one `shape:sub-select` with `faceSet`. FACE LOOP H / V use the same
  H / V mapping as SPLIT; double-click picks the direction whose ring is longer (a
  cylinder side → round the cylinder, not up to the caps).
- **Highlight**: one overlay mesh per set face (the existing builder), same opacity as
  today's selection; hover keeps its fainter overlay.

---

## 4. Design: region EXTRUDE / RECESS

`extrudeRegion(mesh, faceIdxs, dist) → BrushMeshData | null` (new, `brushOps.ts`)

1. **Region boundary**: directed edges of set faces whose neighbour across is not in the
   set (the same rule as `flatAreaOutline`, without the coplanar flood). Boundary
   corners = corners on those edges; interior corners = the rest of the set's corners.
2. **Offset per corner** (the decided "faces scale to stay joined"): for each corner,
   take the normals `n_i` of the set faces around it and solve `o · n_i = d` for all of
   them: one face → `o = d n`; two → `o = d (n1 + n2) / (1 + n1 · n2)`; more → least
   squares. So every face's plane moves exactly `d` along its own normal; a cylinder
   band becomes a wider (or narrower) ring with every face still joined.
3. **New corners**: boundary corners are duplicated (the unselected faces keep the
   originals); interior corners just move (only set faces use them).
4. **Faces**: set faces are rewritten onto the moved / duplicated corners; one side
   wall `[p, q, q', p']` per boundary edge (the same sign-agnostic winding as
   `extrudeFace`, so RECESS = negative `d` needs no flip). A closed band has two
   boundary loops (top and bottom rims), so it gets two rings of walls.
5. **Materials**: walls take the material of the set face they border.
6. `validateMesh` → on failure return null with a reason; the panel shows "RECESS would
   turn faces inside out; nothing changed." (or the extrude equivalent).

A 1-face set calls this too; for one face it reduces to `extrudeFace` exactly
(one normal, all corners on the boundary), which the tests check.

---

## 5. Design: region INSET

`insetRegion(mesh, faceIdxs, margin = 0.25) → BrushMeshData | null` (new)

1. Boundary edges and corners as in §4.
2. **Inner copy of each boundary corner**, moved `margin` into the region:
   - if exactly one set-interior edge leaves the corner into the region (a band's rim
     corner and its seam), slide along that edge by `margin` (keeps seams straight);
   - otherwise use the two boundary edges' in-face perpendiculars and the miter rule
     from `insetFace` (`margin / sin(θ/2)` along the bisector, in the plane of the set
     face at that corner);
   - guards from `insetFace` (spike corners, collapsed edges) → refuse with a reason.
3. **Faces**: set faces swap boundary corners for their inner copies; one border quad
   `[p, q, q', p']` per boundary edge, material from the face it borders.
4. Results the drawings show: a 2×2 wall patch gets one border round it (RECESS after
   = one big window); a closed cylinder band gets a strip inside each rim (RECESS
   after = one groove round the shape).
5. After INSET the set becomes the inner faces (still selected), so EXTRUDE / RECESS
   can follow straight away, as with single-face INSET today.

---

## 6. Design: panel

With **2+ faces** selected, the FACES list shows a set card above the rows:

```
 4 FACES SELECTED
 material [ (shape material) v ]  TILE [   ]     ← applies to all
 [INSET] [EXTRUDE] [RECESS]                      ← region ops, icons as today
 [FACE LOOP H] [FACE LOOP V]  [CLEAR SELECTION]
 note line (e.g. "RECESS would turn faces inside out; nothing changed.")
 Shift-click faces to add or remove; double-click for a face loop.
```

- Rows of set members are highlighted; the per-face op block (SPLIT, LOOP CUT, FLIP
  FOLD) shows only for a single face.
- Material: the picker shows the shared material, or "(mixed)" when they differ;
  picking one writes every face in one `onObjectUpdate`.
- Face mode with 1 face: unchanged, plus the FACE LOOP H / V buttons.

---

## 7. Events & types

| Addition | Where |
|---|---|
| `SelectedObjectPayload.faceSet?: number[]` | `src/types.ts` |
| `"shape:sub-select"` gains `faceSet?: number[]` | EventBus table, `src/types.ts` |
| `extrudeRegion`, `insetRegion`, `regionBoundary` | `src/editor/brushOps.ts` |

No saved-data changes: the selection is editor state; results are ordinary faces.

---

## 8. Edge cases (checklist)

- [ ] Plain click, single-face ops and the single-face gizmo unchanged.
- [ ] Shift-click toggles a face; it never toggles the object or picks a trigger volume.
- [ ] Face loop on a cylinder side: all N sides; on a cube side: the 4-face band.
- [ ] Face loop that stops at a non-four-sided face: just the faces it reached.
- [ ] Material for a set: every face changes; one undo restores all.
- [ ] EXTRUDE a cylinder band: every side face's plane moves exactly 0.25 m out, faces
      wider, corners joined, walls only on the two rims, valid.
- [ ] RECESS the same band: narrower ring; too deep (more than the band can shrink):
      refused, note shown, mesh byte-identical.
- [ ] EXTRUDE / RECESS of 1 face equals today's `extrudeFace` (vertex positions and
      face loops).
- [ ] INSET a 2×2 flat patch: one border; RECESS after: one window.
- [ ] INSET a closed band: a strip inside each rim; RECESS after: one groove.
- [ ] INSET where a corner would collapse (margin wider than the region): refused.
- [ ] Non-contiguous set (two separate faces): each piece gets its own walls / border.
- [ ] Undo after every op restores mesh and keeps a sensible selection.
- [ ] Edit Brush: same behaviour; Save keeps it.

---

## 9. Implementation order (each step → verify)

1. **`regionBoundary` + `extrudeRegion`** in `brushOps.ts`. → Scratch Node script on
   the real `brushOps` (as Phases 79 to 80): cylinder band out / in (face planes moved
   exactly ±0.25, `validateMesh`), 1-face set equals `extrudeFace`, too-deep refused.
2. **`insetRegion`**. → Same script: 2×2 patch (one border, 4 border quads + inner
   faces), closed band (two rim strips), collapse refused.
3. **Selection plumbing**: `_subFaces`, `faceSet` payloads, Shift-click in face mode,
   double-click and FACE LOOP H / V, highlight. → Headless in the running shell: set
   grows by Shift-click; loop selects N faces; overlays per face; object untouched.
4. **Panel set card**: material for all, region ops, notes, clear. → Real clicks:
   material on a band, EXTRUDE / RECESS / INSET on a band and a patch, refusal note,
   undo.
5. **Face gizmo for sets** (`BrushFaceEditor` moves the union of corners). → Drag a
   band up 0.25; Escape restores.
6. **Docs**: help rows, `public/docs/brush-editing.html` + its claude.ai copy,
   architecture doc, `test-plans/phase-81-brush-face-sets.md`, and the roadmap entry
   pointing here.

---

## 10. Open questions (defaults chosen, none blocking)

1. **INSET border width for regions**: *default 0.25 m*, like single INSET.
2. **Double-click direction**: *default the longer ring*; FACE LOOP H / V give the
   other one.
3. **Mixed materials in the picker**: *default "(mixed)"* until one is picked.
