# Phase 22 — Parametric Shape Primitives

> Status: **PLANNED** — not yet implemented.
> Target version: next minor after phases 20 (ControlSchemeManager) and 21
> (runtime shell) land — renumber/re-version if ordering changes.
> Written 2026-07-07 against baseline v4.6.0.

**Scope decisions (user-approved):** parametric shapes now, data model designed for a
later vertex-editable brush phase; v1 kinds = cylinder/cone, wedge/ramp, flexible box;
additive only (CSG subtraction deferred).

---

## Answer to "brushes or something new?"

Something new, designed to become brushes. Unreal-style *brushes* are vertex-editable
solids; what was asked for (segment-count cylinders, slopes, tapered cubes) are
*parametric primitives*. Plan: a new top-level entity type **`shape`** — property-driven
like stairs — whose geometry is always generated in **local space** with a separate
`position`/`rotation` transform. That local-space contract is exactly what the
architecture doc's Phase-12 brush stub requires ("do not repeat the world-space storage
pattern from platforms/floors/walls"), so a later brush phase converts a shape by baking
its params into an editable local vertex/face list — same entity, same events, same
colliders.

Hosts rejected: `WorldObject` (hard-wired to GLB `assetId`, no geometry params);
`PlatformDef` (world-space storage, node-backed polygon variant, rotation baked into
nodes, railing fields, no full 3-axis rotation).

All line numbers / APIs below were verified against the working tree at v4.6.0.

## 1. Data model (`src/types.ts`)

One flat interface with a `kind` discriminator (not a discriminated union, not nested
param objects): `WorldState.update*` is shallow `Object.assign` (WorldState.ts:255-262),
so flat scalars merge per-field; `Partial<union>` is awkward for bus events; StairDef's
optional-fields style is the precedent. HistoryManager journaling deep-clones whole
entities, so undo is layout-agnostic.

```ts
export type ShapeKind = "cylinder" | "wedge" | "box";

export interface ShapeDef {
  id:        string;            // "shape_<uuid8>"
  label?:    string;
  kind:      ShapeKind;
  // Transform — the brush-future contract: geometry is ALWAYS generated in
  // LOCAL space (XZ-centered, base at local y=0, matching the platform
  // "position.y = bottom" convention). position/rotation are applied as
  // mesh.position/mesh.rotation and mirrored onto the collider — never baked
  // into vertices.
  position:  Vec3;
  rotation:  Euler3;            // degrees XYZ; gizmo edits Y, panel edits all three
  material:  string;
  materialOverrides?: MaterialOverrides;
  floorLevel?: number;
  groupIds?:   string[];
  // cylinder / cone
  radiusTop?:      number;      // default 1; 0 → cone (no top cap)
  radiusBottom?:   number;      // default 1
  height?:         number;      // cylinder AND box; default 2
  radialSegments?: number;      // 3–64, default 16
  // wedge / ramp
  width?:      number;          // wedge AND box footprint X; default 2
  depth?:      number;          // wedge AND box footprint Z; default 2
  heightLow?:  number;          // default 0.1 (front edge +Z; 0 = true ramp)
  heightHigh?: number;          // default 1.5 (back edge −Z)
  // flexible box extras
  taperX?: number;  taperZ?: number;  // top-face scale factors, default 1, min 0.01
  shearX?: number;  shearZ?: number;  // top-face offset in meters, default 0
}
```

- Defaults + clamping live in an exported `resolveShapeParams(def)` in `ShapeBuilder`
  (segments int-clamped 3–64, radii ≥ 0, heights ≥ 0.05, taper ≥ 0.01) — tool, builder,
  collider, and panel all resolve through it so sparse defs (console-spawned, old saves)
  never crash.
- **Single material for the whole shape in v1** (one mesh, one MatView arm). Cap/side
  split noted as future.
- Script despawn/show/hide is runtime-only by design (never touches WorldState), so no
  persisted `hidden` field.

Other additive `types.ts` edits:

| Location | Change |
|---|---|
| `ToolId` (~line 94) | add `"shape-cylinder" \| "shape-wedge" \| "shape-box"` |
| `EditorObjectType` (~99) | add `"shape"` |
| `SelectedObjectPayload.data` union | add `ShapeDef` |
| `ZoneDef` (~530) | add `shapes: ShapeDef[]` |
| `BusEvents` | `shape:added` / `shape:updated` / `shape:removed` / `shape:rebuilt` (mirror the platform quartet) |

WorldState + history:
- `addShape/updateShape/removeShape` cloned from the **stair** trio (WorldState.ts:275-298)
  — NOT the platform trio: `removePlatform` calls `_pruneOrphanNodes` (line 269), which
  must not apply (shapes are not node-backed).
- `_zoneArr`: `case "shape": return (zone.shapes ??= []);` (the `triggerVolumes` pattern
  → free old-save tolerance). `_emitChange` + `_findEntity` shape arms.
  `HistoryManager.ts:4-6` `ChangeKind` add `"shape"` — replay is then generic.
- Serialization is automatic once `shapes` is on `ZoneDef`; also `zone.shapes ??= []` in
  the load path and `shapes: []` in every ZoneDef literal (grep `platforms: []` to find
  them: demo-zone creation, ZoneTool, WorldLoader, fixtures).

## 2. Geometry — new `src/builders/ShapeBuilder.ts`

Hand-build all three kinds with the local `pushFace`/`makeGeo` pattern from
`PlatformBuilder.ts:30-53` — not `THREE.CylinderGeometry` (its side UVs are parametric
u = i/segments, not metric; remapping a frustum is more code than emitting rings), plus
one new helper:

```ts
// Quad from 4 CCW corners: face normal + in-plane METRIC UVs
// (uDir = normalize(b−a), vDir = normal × uDir, uv = dot(p−a, dir)/tileScale).
// Covers every wedge/flex-box face; slanted faces keep world-density UVs.
function pushQuadMetric(buf, a, b, c, d, tileScale): void
```

Per-kind local geometry (base y=0, XZ-centered):
- **Cylinder/cone**: two rings (y=0 rBottom, y=height rTop); `radiusTop === 0` → apex +
  triangle sides, no top cap. Side UVs = cylindrical metric unwrap: per-ring
  `u = (i/segments)·ringCircumference/tileScale` (each ring uses its own circumference so
  cones stay metric), `v = slantLength/tileScale`; duplicate the seam vertex. Caps =
  triangle fans with planar XZ metric UVs (same convention as
  `applyProjectedUVs(geo,'xz')`, UVUtils.ts:31-50). **Normals**: flat per-face below
  `FLAT_SHADE_MAX_SEGMENTS = 11` (crisp tri-prism/hex-pillar look), analytic smooth
  radial normals (tilted by cone slope) at ≥ 12.
- **Wedge**: 5–6 `pushQuadMetric` faces — bottom, front (+Z, `heightLow`; omitted when
  0), back (−Z, `heightHigh`), two side trapezoids, sloped top (metric v runs along
  slope length).
- **Flexible box**: bottom corners `(±w/2, 0, ±d/2)`, top corners
  `(±w/2·taperX + shearX, height, ±d/2·taperZ + shearZ)`; all four sides remain planar
  quads (top/bottom edges of each face stay parallel), so 6 `pushQuadMetric` faces.

Builder contract:

```ts
export class ShapeBuilder {
  static buildLocalGeometry(def, tileScale): THREE.BufferGeometry; // mesh + tool ghost
  static localHullPoints(def): Float32Array;                       // collider vert cloud
  static async build(def, zoneId): Promise<ShapeBuildOutput>;      // { mesh, collider }
}
```

`build()` copies PlatformBuilder's material resolution verbatim
(PlatformBuilder.ts:227-235: `getMaterialWithOverrides` → `getMaterial` →
`getDefaultMaterial` fallback; tileScale from override → material def → 1.0), applies
`applyUVOffset` (UVUtils.ts:58), sets `mesh.position` + `mesh.rotation` from the def
(vertices stay local), stamps userData
`{ editorId, editorType: "shape", zoneId, selectable: true, floorLevel, _ownsMaterial }`
— exactly one selectable mesh per entity (project convention), shadows on.

## 3. Colliders — `src/physics/ColliderBuilder.ts`

New `registerShape(def, localPoints: Float32Array)` (points passed in to avoid a
physics→builders import cycle):

- `RAPIER.ColliderDesc.convexHull(points)` — **verified present** in installed
  `@dimforge/rapier3d-compat@0.19.3` (`geometry/collider.d.ts:704`), plus chainable
  `setTranslation`/`setRotation` (Euler-degrees → quaternion, same XYZ order as the mesh).
- All three v1 kinds are convex by construction, so the hull is exact — and it's exactly
  the collider the future brush phase needs (zero collider changes later). Point clouds
  are ≤ ~130 points; no perf concern.
- Null-tolerant: if `convexHull` returns null (degenerate params, shouldn't happen after
  clamping) the mesh still renders, dev-warn, no collision. Analytic
  `ColliderDesc.cylinder`/`cone` exist as fallbacks but aren't needed.
- Local points × collider translation/rotation mirrors the mesh transform — mesh and
  collider structurally cannot drift (the platform world-space bug class is impossible).
- **Wedge walkability**: KCC max-climb is 45°; steeper wedges aren't climbable —
  expected, matches Unreal; document in COLLIDERS_GUIDE.md, no code change.
- Lifecycle: handle stored in ZoneManager `shapeEntries`; removed + re-registered per
  rebuild (existing platform pattern).

## 4. ZoneManager (`src/world/ZoneManager.ts`)

Clone the platform lifecycle (closest precedent, already race-hardened):
- `ZoneEntry` gains `shapeEntries: Map<id, { mesh, collider }>` + a `shapesGroup`.
- `init()` listeners: `shape:added/updated/removed` → `_addShape/_rebuildShape/_removeShape`
  (copied from ZoneManager.ts:772-843 **including the cancellation-token pattern** —
  `_shapeBuildTokens`, stale-result geometry/material/collider disposal). No
  `node:updated` fan-out and no microtask rebuild coalescing — shapes aren't node-backed.
- `loadZone` builds `zone.shapes ?? []`; unload disposes like platforms.
- `_setEntityHidden` (~974): shape arm — `mesh.visible = v; collider?.setEnabled(v)` →
  script despawn/show/hide works once ScriptEngine resolves shape targets.
- `_applyGroupVisibility` (~1142) + floor-dimming traversal (~1213): shape arms
  (dimming keys off `floorLevel` userData, already stamped).

## 5. Editor integration

**ShapeTool (new `src/editor/ShapeTool.ts`) + toolbar.** One tool class; three ToolIds
(`shape-cylinder|shape-wedge|shape-box`) map to `kind` on `tool:select`. State machine,
GRID = 0.5 snap, MIN_SIZE, Escape/right-click reset, `_getElevation()` — all copied from
PlatformTool. Placement UX:
- Wedge & box: two-click footprint rect (PlatformTool pattern) → width/depth; heights
  from defaults; high edge deterministically on −Z (rotate afterward).
- Cylinder: click center, drag radius (min 0.25, snapped), click commits
  `radiusTop = radiusBottom = r`.
- Ghost preview uses the real `buildLocalGeometry` in translucent MeshBasicMaterial
  (true cone/wedge silhouette), dispose-before-replace on mousemove.
- Commit inside `world.transaction("add shape", …)` + `tool:placed` (PlatformTool
  `_commit` pattern). Register/dispose in App.tsx next to the platform tools (~201-203).
- Toolbar (`Toolbar.tsx:10-20`): one entry with the existing `variants` popover:
  `{ id: "shape-cylinder", label: "Shape", shortcut: "B", variants: [Cylinder, Wedge, Box] }`
  (B is unclaimed — V/F/W/L/T/O/Z/N/U taken). Three `TOOL_ICONS` entries in icons.tsx.
  `TOOL_INFO` in PropertiesPanel.tsx:43 is an exhaustive `Record<ToolId, ToolInfo>` —
  the compiler forces the three new entries.

**SelectionManager.** `PRIORITY` (line 10): insert `"shape"` between `"spawn"` and
`"platform"` (shapes sit on platforms/floors, must win overlapping picks; no existing
content is a shape → zero regression). `_getDataRecord` shape arm; `shape:rebuilt`
re-tint listener mirroring `_onPlatformRebuilt`. Confirm `objectPicking.ts` keys off
`userData.selectable` generically (add `"shape"` if it allow-lists types).

**GizmoManager.** Add `"shape"` to `GizmoType`, `_onSelect` allow-list, and the rotate
allow-list (~line 175). Pivot at `position` with y = top of solid + 0.3 (stair
precedent). `_commitTranslate` arm = the object case (position delta →
`updateShape`). `_commitRotate` arm = absolute yaw like trigger-volume **but preserving
rotation.x/z** (panel can set them). **No scale gizmo in v1** — size lives in params
(platform/stair consistency; gizmo scale would fight params or bake scale, which the
brush contract forbids; revisit as drag-handles à la StairCutterResizer if needed).
`shape:rebuilt` → reattach handler (platform precedent, ~108-111); group multi-select
`_refDisplayPos`/`_translateRef` shape arms (position shift only — simplest arms in the
switch).

**PropertiesPanel + App.** `OBJECT_SCREENS["shape"]` = geo + mat. Title arm. New
`ShapeGeoView` (PlatformGeoView pattern: `useFieldDebounce(300)` + commit) with
kind-specific fields — cylinder: radii/height/segments (int 3–64); wedge:
width/depth/heightLow/heightHigh; box: width/depth/height/taper/shear; all: position,
rotation XYZ, label. MatView arm reusing the platform material sub-UI (single material +
overrides). `App.handleObjectUpdate` (~1389-1535): shape arm → `updateShape` in the
existing transaction wrapper. `deleteRefs` (~836) + `handleDelete` (~1061): shape arm →
`removeShape`.

**copyPaste / groups / scripting / test helpers.**
- `copyPaste.ts`: `COPYABLE` + id-prefix + clone + paste arms (structuredClone, offset
  position, remap groupIds — no nodes, simplest arms in the file).
- `groupMembers.ts`: `COLLECTIONS` add `{ type: "shape", key: "shapes" }`;
  `writeGroupIds` is generic after that.
- `ScriptEngine.ts`: `_resolveTargets` `collect(zone.shapes ?? [])` (~385) — makes
  shapes group-targetable; `_resolveObjectPose` shape arm (position + facing =
  rotation.y). Despawn/show/hide then work via §4. `move_object` for shapes routes
  through `updateShape({ position })` (rebuild repositions mesh + collider; local-space
  geometry means a future fast-path can skip the rebuild). `change_material` stays
  object-only (optional future wiring).
- `testHelpers.ts`: `spawnShape({ id, kind, x, z })` mirroring `spawnPlatform`;
  prefix-based `cleanup()` covers it automatically.

## 6. Milestones (each shippable + verifiable)

Verification uses the project harness: dev server on :7373, `window.__world` mutator
driving (TESTING.md §3 "Other lessons"), autosave snapshot protection, typecheck.

- **M1 — Data model + cylinder builder + world/zone wiring (console-driven).**
  types.ts, WorldState, HistoryManager, ZoneManager, ShapeBuilder, ZoneDef-literal
  normalization, spawnShape helper. Verify: typecheck clean;
  `__world.addShape("demo", {...})` → mesh, base at position.y; `updateShape` rebuilds
  live; segments 6 = faceted (24 tris), 32 = smooth; save→reload persists; old scene
  without `shapes` loads; Cmd+Z undoes add + param edit; `__test.cleanup()` removes.
- **M2 — Collider + preview walk (cylinder).** registerShape + rebuild lifecycle.
  Verify: enterPreview, blocked by cylinder, stand on a low one; rotated flat-sided
  prism collides correctly; rapid successive edits leave no orphan colliders, no console
  errors.
- **M3 — Selection, gizmo, panel, delete (cylinder).** SelectionManager, GizmoManager,
  PropertiesPanel, App arms. Verify: click-select + tint; translate/rotate commit and
  collider follows; panel edits debounce-rebuild; material change; Delete removes both;
  undo restores; gizmo survives `shape:rebuilt`.
- **M4 — ShapeTool + toolbar + wedge & flexible box.** Tool, Toolbar variants, icons,
  TOOL_INFO, remaining geometry, kind-specific panel fields. Verify: placement UX per
  kind with live ghost; walk up a ~27° wedge; a 60° wedge is not climbable (expected);
  taper/shear box shows metric UV density on slanted faces (compare a wall of the same
  material); Escape/RMB cancels.
- **M5 — Integration sweep.** copyPaste, groups, ScriptEngine, hidden/group-visibility/
  dimming arms, gizmo group-translate. Verify: copy/paste single + mixed multi-select;
  group hide/show/translate/delete; `__test.runAction` despawn/show + move_object on a
  shape and on a group containing shapes; floor dimming; multi-floor placement.
- **M6 — Docs + test plan + version bump.** WORLD_EDITOR_ARCHITECTURE.md new phase
  section AND per-file sections (PLAN_UPDATE_GUIDE.md rule), point the Phase-12 brush
  stub at ShapeDef; HUMAN_TESTING.md; TESTING.md spawnShape recipe;
  test-plans/phase-22-parametric-shapes.md; COLLIDERS_GUIDE.md (convexHull + 45° note).
  Version → next minor (vX.Y.0) in doc header + commit subject. Commits straight to
  main per project convention.

## 7. Phase 2 sketch — vertex-editable brush (future, not built now)

- **Data**: optional `mesh?: { vertices: Vec3[]; faces: number[][] }` on ShapeDef
  (local space, CCW polygon faces). When present it supersedes kind params; `kind` kept
  as provenance. "Convert to Brush" = bake the kind generator's rings/corners into
  `mesh` in one transaction (undoable via the existing journal).
- **Builder**: one new branch in `buildLocalGeometry` — fan-triangulate faces, reuse the
  per-face metric UV math generalized to n-gons. Transform + userData identical.
- **Collider**: unchanged — `convexHull(vertices)`. Non-convex editing out of scope
  until a convex-decomposition vs `trimesh` decision (trimesh also verified available).
- **Editor**: a `BrushVertexEditor` modeled on NodeDragger/StairCutterResizer —
  per-vertex drag handles in local space transformed by the mesh matrix, grid snap,
  one `updateShape({ mesh })` transaction on release; panel gains "Convert to Brush".
  Selection/gizmo/copy-paste/scripting need **zero** changes — the payoff of the
  local-space + transform contract.
- Also future: subtractive shapes via the existing `three-bvh-csg` path (stair-cutter
  precedent), cap/side material split, sphere/dome/torus kinds.

## 8. Risks & how the plan avoids them

| Risk | Mitigation |
|---|---|
| Missing one of ~20 hand-wired touchpoints (no entity registry exists) | Every change is additive (new switch arm / map entry); §5 enumerates all sites; `grep -n '"platform"' src` is the review checklist; two sites are compiler-enforced (`Record<ToolId,…>`, `ChangeKind`). |
| Old saves lack `zone.shapes` | `??= []` in loadFromJSON AND inside `_zoneArr` (triggerVolumes precedent); `shapes: []` added to all ZoneDef literals. |
| Cloning `removePlatform` brings `_pruneOrphanNodes` along | Clone the stair trio instead; shapes never touch `zone.nodes`. |
| PRIORITY insertion changes pick order | Inserted before `"platform"` only; no existing content is a shape → existing scenes pick identically. |
| StrictMode double-mount listener leaks | All listeners go through the existing `_unsubs.push(bus.on(...))` + `dispose()` module pattern. |
| Stale async rebuild swaps on rapid edits | Copy the `_platformBuildTokens` cancellation pattern verbatim incl. disposal. |
| Degenerate params → null hull / broken geo | `resolveShapeParams` clamps everything; collider path null-tolerant (render without collision + dev warning). |
| Mesh/collider drift | Both derive from the same local verts + position/Euler; nothing is baked world-space — the platform bug class is structurally impossible. |
| Gizmo yaw commit wiping panel-set rotation.x/z | Shape `_commitRotate` arm preserves x/z explicitly. |
| Stair-cutter CSG / wall-run / floor-fill cross-talk | Shapes share none of those code paths. |
| Wrong UV density on slanted/curved faces | Per-face in-plane metric projection + per-ring arc-length unwrap; visual check in M4 against a wall of the same material. |
