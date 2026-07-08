# Phase 23 — Face/Vertex Sub-object Editing for Shapes (Blender-style)

> Status: **IN PROGRESS** — approved 2026-07-07 against baseline v4.10.0.
> Target version: v4.11.0.

## Context

Phase 22/22b gave the editor parametric shapes and convex-cloud brushes. The user wants
polygonal modeling on top: Object/Face/Vertex selection modes on the Select tool
(Blender-style; the sub-modes only act on shapes/brushes), face selection that opens the
Geometry screen with that face's row expanded, a 3-axis gizmo to drag a selected face or
vertex anywhere, per-face materials (Materials screen lists every face), and per-face
**Split H / Split V** (quads) + **Extrude**.

**Why this needs a data change:** brush faces today are *derived* (convex hull of a point
cloud) — no identity. Face materials/selection/split/extrude need faces as first-class
data, and split/extrude produce non-convex solids, breaking the hull collider.

**Answer to "big lift?":** yes — ~1.6–1.7× phase 22b (~1650–1800 added lines), and riskier
per line (topology invariants + a 25-site select-gating sweep). M5 (split/extrude) is
cleanly severable if it needs shrinking.

**Locked decisions (AskUserQuestion + follow-up message):**
1. Face-edited brushes get **trimesh colliders** (concave OK) — everything else keeps
   its current collider.
2. **Split = quads only** in v1 (buttons disabled with hint otherwise); Extrude works on
   any face; negative (inward) extrude disallowed in v1.
3. **Mode UI = Select-button variants + 1/2/3 hotkeys.**
4. **Performant:** no per-frame work; face meshes grouped by material (single-material
   brush ≈ 1 draw call); overlays transient; picking = O(#faces) range lookup on an
   already-cast hit.
5. **Additive/opt-in:** `faces` is optional — shapes/cloud-brushes that never enter face
   mode run the exact current code paths. Plain Select must stay behaviorally identical.

## Data model (`src/types.ts`)

```ts
export interface BrushFace {
  verts: number[];                       // ≥3, indices into vertices, CCW viewed from OUTSIDE
  material?: string;                     // absent → shape.material
  materialOverrides?: MaterialOverrides;
}
export interface ShapeBrushMesh { vertices: Vec3[]; faces?: BrushFace[] }  // faces absent = legacy cloud
```
- `ToolId` += `"select-face" | "select-vertex"`; new `src/editor/selectMode.ts` with
  `isSelectMode(t)`.
- `SelectedObjectPayload` += `faceIndex?: number; vertexIndex?: number`.
- `MeshUserData` += `faceGroups?: { start; count; faceIndex }[]` (triangle-range → face).
- BusEvents += `"shape:sub-select" { zoneId, shapeId, faceIndex|null, vertexIndex|null }`
  (SelectionManager is the sink; it re-emits object:selected with the fields — one channel
  for panel/gizmo/highlighter) and `"shape:face-hover" { zoneId, shapeId, faceIndex|null }`.

**Hard rule (top risk):** `updateShape` shallow-merges, so `changes.mesh` REPLACES the
whole ShapeBrushMesh — every writer must send `{ mesh: { ...shape.mesh, vertices, faces } }`
complete. Add a dev-mode warn in `updateShape` when `changes.mesh` has vertices but drops
existing faces. Fix BrushVertexEditor's three existing writes.

## New pure module `src/editor/brushOps.ts` (~300 lines)

- **`facesFromCloud(cloud, seed)`** — hull→faces conversion: ConvexGeometry → dedupe
  verts (1e-4) → per-tri normals → BFS coplanar merge (normal dot > 1−1e-6 AND plane
  distance < 1e-4) → boundary-loop extraction from unpaired directed edges (winding stays
  CCW-outward by construction) → collinear-vertex cleanup → drop unreferenced verts.
  Material seeding preserves today's look: |n.y| ≥ 0.5 → inherit shape.material;
  else face.material = sideMaterial (+overrides). Box → 6 quads, cyl-16 → 16 quads + 2 n-gons.
- **`splitFaceQuad(mesh, faceIdx, pair 0|1)`** — midpoints of opposite edges (reuse
  existing vertex within 1e-4), face → two quads (selection stays on child A), then
  **T-junction propagation**: every other face traversing a split edge gets the midpoint
  spliced into its loop (else cracks). Neighbor quads become pentagons → their split
  buttons self-disable. Panel labels ─ / │ from the world direction of the cut line.
- **`extrudeFace(mesh, faceIdx, dist=0.25)`** — duplicate loop verts offset along the
  Newell normal (fresh verts, no reuse), retarget the face (faceIdx stays selected on the
  moved cap), add a side quad per edge `[p, q, q', p']` inheriting the cap material.
- Helpers: `newellNormal`, `faceCentroid`, `addOrReuse`, **`validateMesh`** (every
  undirected edge in exactly 2 loops; total fan volume > 0) — gates every op commit;
  abort + warn instead of writing corrupt topology. All ops return fresh arrays.

## Builder + physics

- `ShapeBuilder`: `isFaceBrush(def)` (brush + faces ≥ 4). New face-brush path in
  `build()`: group faces by `(face.material ?? shape.material) + overrides-key` → one
  mesh per group (fan-triangulated, flat Newell normals — non-planar quads fold, shade
  flat, acceptable v1; per-face metric UVs reuse the existing normal-basis fn), record
  `userData.faceGroups` per mesh. Cap/side split does not apply to face-brushes.
  `localTrimesh(def)` → flat verts + fan indices. `buildLocalGeometrySplit` gets a
  face-brush branch (ghost/tests). Cloud + parametric paths byte-identical to today.
- `ColliderBuilder.registerShapeTrimesh(shape, verts, indices)` =
  `ColliderDesc.trimesh(verts, indices, TriMeshFlags.FIX_INTERNAL_EDGES)` (=144, includes
  ORIENTED|MERGE_DUPLICATE_VERTICES — verified in installed typings; stops the KCC
  catching on interior edges) + the same translation/rotation mirroring as registerShape;
  try/catch → convexHull fallback + warn.

## Selection modes

- Toolbar Select gains variants (◇ Object (1) / ▣ Face (2) / • Vertex (3)) + `TOOL_ICONS`
  entries; App hotkeys Digit1/2/3 in the existing onKeyDown effect (typing-guarded,
  no modifiers). App's six force-resets to `"select"` stay as-is (reset to object mode).
- **`isSelectMode` sweep** (mechanical; face/vertex modes behave exactly like select for
  all non-shape machinery): SelectionManager.ts:107,206 · ColliderEditor.ts:103,243 ·
  ShapeResizer.ts:68,124 · StairCutterResizer.ts:73,132 · TriggerVolumeResizer.ts:63,120 ·
  NodeDragger.ts (11 sites) · WallSplitter.ts:56 · OpeningDragHandler.ts:176,179 ·
  DecalTool.ts:75 · TriggerVolumeTool.ts:99. (BrushVertexEditor NOT swept — gets
  mode-specific gating.)
- SelectionManager: in face mode, a shape hit resolves `hit.faceIndex` → faceGroups →
  logical face; `_select` allows same-root re-click when the face differs; `_emitSelected`
  adds faceIndex/vertexIndex with a **validity clamp on every emit** (index ≥ faces.length
  → null; covers ops/undo shrinking the list). Listens to `shape:sub-select` and re-emits.
  Cloud-brush/parametric hits in face mode = plain object select.

## Gizmos + highlight (ColliderEditor TransformControls-proxy pattern verbatim)

- **`src/editor/BrushFaceEditor.ts`** (new, ~280): active when tool=select-face + face
  selected on a face-brush → translate-only TC at the face centroid, snap 0.25 (Alt free);
  `dragging-changed` wraps begin/commit transaction + gizmo:dragging; `objectChange` maps
  the world delta through the inverse shape rotation and moves all face verts live.
  Suspends the entity gizmo via `gizmo:suspend { source: "face-mode" }`. Also owns the
  **legacy-cloud auto-bake**: first face/vertex-mode selection of a cloud brush runs
  `facesFromCloud` in one labeled transaction (visually identical, undoable). Parametric
  shapes are NOT auto-converted (panel hint instead).
- **BrushVertexEditor**: handles show only in select-vertex mode now; handle mousedown
  emits `shape:sub-select` (click=select, drag=select+move); adds a TC proxy on the
  selected vertex (3-axis) alongside the camera-plane drag; full-mesh writes; right-click
  delete + add-corner early-return on face-brushes (v1 — split/extrude are the topology
  tools); `gizmo:suspend { source: "vertex-mode" }`.
- **`src/editor/BrushFaceHighlighter.ts`** (new, ~130): SegmentHighlighter idiom —
  throwaway overlay mesh of the face's fan triangles offset +0.01 along the normal,
  0x4d8cff transparent (0.55 selected / 0.35 hover), cleared on deselect/tool change;
  rebuilds from data on shape:updated/rebuilt.

## Panel (`src/ui/PropertiesPanel.tsx`, ~450 lines)

- `ShapeGeoView`: face mode + face-brush → **FacesList** (row per face: `FACE n · m
  corners · material`; hover → shape:face-hover; click → shape:sub-select; the
  `selected.faceIndex` row auto-expands: corner readout, inline material select + TILE
  (WallSegmentRow pattern), SPLIT ─ / SPLIT │ (quads only, else disabled + hint),
  EXTRUDE). Vertex mode → **VerticesList** (selected row expands to debounced X/Y/Z
  inputs, full-mesh commits). Object mode unchanged; face-brushes hide `+ Add corner`.
  Ops call brushOps and commit via `onObjectUpdate({ mesh })` (rides the existing shape
  transaction in App.handleObjectUpdate).
- `convertToBrush` now emits faces via `facesFromCloud` (seeded materials keep visuals).
- `ShapeMatView`: face-brush → per-face **FaceMaterialRow** list (replaces TOP/BOTTOM +
  SIDES; rows hover-highlight); others unchanged. `summaryFor` face-brush strings.
- Sub-object UI renders for single selections only (multi-select re-emits are suppressed
  upstream — explicit guard).

## Unchanged (verified)

ZoneManager (ShapeEntry.meshes[] is count-agnostic), WorldState/serialization/copy-paste
(`faces` rides inside `mesh` through Object.assign/structuredClone/JSON).

## Milestones (each browser-verified per TESTING.md: autosave snapshot, __world driving, real clicks/drags, cleanup, straight-to-main commits)

0. Write `plans/phase-23-face-vertex-editing.md` (repo convention) — condensed from this plan.
1. **M1 — data + builder + trimesh (no UI):** types, facesFromCloud, ShapeBuilder face
   path + faceGroups, registerShapeTrimesh, Convert-to-Brush emits faces, vertex-editor
   full-mesh writes + face-brush guards. Verify: convert box → 6 faces, visuals
   identical; console-author a concave L-mesh → renders concave, preview-walk onto the
   inner step (hull would fill it); undo cycles clean.
2. **M2 — modes + picking + highlight:** ToolIds, variants, 1/2/3, isSelectMode sweep,
   face resolution + payload + sub-select event, highlighter. Verify: press 2, click each
   face → overlay tracks; walls/others still object-select; press 1 → v4.10-identical
   regression pass (node drag, collider handles, decal tool, wall split, volume resize).
3. **M3 — face/vertex gizmos:** BrushFaceEditor (+auto-bake), vertex TC + sub-select,
   suspension sources. Verify: face drag moves 4 verts live + collider follows (preview
   walk), one undo step, Escape restores; cloud brush face-mode select → one "bake brush
   faces" undo entry; entity gizmo suspended in sub-modes and restored on mode 1.
4. **M4 — panel lists + per-face materials:** FacesList/VerticesList/FaceMaterialRow,
   face-hover, summaries. Verify: canvas click ↔ expanded row sync both ways; one face's
   material change re-textures only that face (mesh count +1 group); vertex row Y edit
   moves mesh+handles+collider.
5. **M5 — split + extrude:** brushOps ops + panel buttons + validity clamps. Verify:
   split box face → 7 faces, neighbors gain the midpoint corner (no lighting crack at the
   seam), pentagon's split disabled; extrude → cap+4 sides, selection stays on cap, gizmo
   re-centers; extrude an alcove and walk into it; 10× undo → pristine box (validateMesh
   clean); save/reload identical.
6. **M6 — docs + version:** WORLD_EDITOR_ARCHITECTURE.md changelog (v4.11.0) + per-file
   sections (PLAN_UPDATE_GUIDE), HUMAN_TESTING shapes workflow, test-plans/phase-23
   additions, plans/phase-23 status flip, COLLIDERS_GUIDE trimesh note.

## Risks (top 5 of 8 — full list goes in the repo plan doc)

1. Silent face loss via mesh replacement → full-mesh write rule + dev warn in updateShape.
2. Split propagation misses a shared edge → cracks; validateMesh gates every op commit.
3. Winding flips (bottom-face extrude, degenerate Newell) → dev asserts, no negative extrude.
4. faceIndex invalidation across ops/undo → clamp on every emit; ops keep index on the
   primary child; residual index-reuse retargeting accepted for v1.
5. Select-gating regressions across 25 sites / gizmo:suspend source leaks → M2 regression
   pass exercises every swept module; both editors clear their suspend source on tool
   change, deselect, dispose, preview:start.
Trimesh caveats (no interior — thin walls can tunnel at speed; spawn-inside not
depenetrated) documented in COLLIDERS_GUIDE.

## Verification

Per-milestone in-browser checks above via Chrome MCP (TESTING.md golden path: reuse
:7373, tag tab, snapshot/protect autosave, drive `__world.updateShape` + real
clicks/drags, clean test entities, close tab). `npm run typecheck` after every
milestone; commits straight to main per project convention.
