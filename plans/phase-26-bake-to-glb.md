# Phase 26 — Bake Shapes/Brushes to GLB (reusable assets)

> Status: **PLANNED** — target v4.17.0. (Phase numbering: 24 = control schemes,
> 24b = pause menu, 25 = runtime shell; 26 is the next free slot.)

Turn a selection of shapes/brushes into a single GLB asset: geometry merged by
material (the draw-call win), textures/normal maps/UVs embedded, registered in
the Asset Browser like any imported model, and/or saved to a local `.glb` file.
Placed copies flow through the existing object pipeline unchanged — the feature
is purely additive (one `?? assetDef.colliders` fallback is the only shared-code
edit; every existing asset has no such field and behaves byte-identically).

---

## 1. Why

Repeating a multi-brush structure by duplicating shapes costs a draw call per
material-mesh per copy plus a full editor entity per shape (picking candidate,
undo journal traffic, physics body, save size). Baking collapses a structure to
~one mesh per material, and copies share geometry/materials via the asset cache.
The originals are left untouched (keep them as the editable "source").

## 2. Design

### Bake core — `src/editor/bakeShapes.ts` (new)

`bakeShapes(world, refs) → { glb: ArrayBuffer, group: THREE.Group, colliders: AttachedCollider[] }`

1. Refs → ShapeDefs (shapes only). Per shape `ShapeBuilder.build()` — fresh
   meshes with pristine registry materials (never the selection-tinted scene
   clones) and baked metric UVs; bake each mesh's matrixWorld into cloned geometry.
2. Pivot: combined AABB → origin at (centerX, minY, centerZ) — asset sits on
   surfaces like other assets.
3. Merge by material reference (`BufferGeometryUtils.mergeGeometries`; registry
   materials are shared instances, override materials stay separate groups).
   Normalize attributes to position/normal/uv first.
4. Compound colliders, one box per source shape: yaw-only rotation → exact box
   with `rotationY`; tilted → conservative asset-space AABB (AttachedCollider
   can't express XZ tilt; `"hull"` stays reserved for a later phase).
5. `GLTFExporter.parseAsync(group, { binary: true })`. Return the group for
   thumbnail rendering; caller disposes.

**Material fidelity (settled):** albedo/normal/roughness/metalness/AO + UV
tiling survive; displacement maps have no glTF 2.0 slot and are **dropped**
(visually negligible on low-poly brush geometry — normal maps carry the relief).

### Outputs — `src/ui/BakeDialog.tsx` (new, ZoneNamingDialog idiom)

Name field (slugged) + two checkboxes, both default ON:
- **Add to asset library** — write `<slug>.glb` + `<slug>_thumb.png`
  (`renderModelThumbnail`) into `modelsDir` (`ensureDir` prompts if unset),
  splice `manifest.json` (`category: "Baked"`, `collidable: true`,
  `colliderType: "box"`, new `colliders` field), `handleAssetsReload()`.
  Helper: `src/core/assetLibraryWriter.ts` (new) — replicates
  ModelImporterModal's write pattern; the modal itself is untouched.
- **Save .glb file locally** — `showSaveFilePicker` + writable, anchor-download
  fallback (handleSave pattern). Independent of the library path so baking
  never dead-ends on a missing assets-dir permission.

### Asset-level compound colliders

- `types.ts`: `AssetDef.colliders?: AttachedCollider[]` (asset-local space).
- `ZoneManager.registerObjectColliders`: `obj.colliders ?? def.colliders ??
  (collidable ? [autobox] : [])`. Per-axis object scale already composes via
  `colliderWorldTransform`.
- Colliders screen "Customize" seeds from `def.colliders` when present; summary
  reads `auto (N boxes)`.

### Entry points

- PropertiesPanel multi-select view: **BAKE → GLB** (enabled when ALL selected
  refs are shapes — no silent partial bakes).
- Single-shape Actions section: same button.
- App `handleBakeShapes(refs)` → BakeDialog → bake + chosen outputs. No world
  mutation → nothing to undo (matches import's non-undoable asset ops).

## 3. Files

| File | Change |
|---|---|
| `src/editor/bakeShapes.ts` | new — build/merge/pivot/colliders/export |
| `src/core/assetLibraryWriter.ts` | new — glb+thumb+manifest write |
| `src/ui/BakeDialog.tsx` | new — name + destination checkboxes |
| `src/types.ts` | `AssetDef.colliders?` |
| `src/world/ZoneManager.ts` | def.colliders preference |
| `src/ui/PropertiesPanel.tsx` | bake buttons, Customize seeding |
| `src/App.tsx` | handleBakeShapes, dialog state, save path |

## 4. Milestones

1. **M1 — bake core**: console-verify GLB round-trips through GLTFLoader (mesh
   count == distinct materials, UVs present, base-center pivot; yaw box vs
   tilted AABB collider).
2. **M2 — outputs + integration**: end-to-end in browser — bake → Asset Browser
   thumbnail → place copies → draw-call sanity (`renderer.info`) → preview-walk
   collision against the compound boxes → save/reload → local `.glb` valid.
3. **M3 — docs + version (v4.17.0)**: arch changelog + file sections,
   HUMAN_TESTING workflow, test-plans/phase-26, this doc → IMPLEMENTED.

## 5. Risks

1. Texture embedding re-encodes via canvas — multi-MB glbs acceptable.
2. mergeGeometries attribute mismatch → normalize first, abort with a warn
   rather than emit a corrupt asset.
3. aoMap UV-channel quirks on export → visual check in M2; drop aoMap from the
   bake if it misrenders.
4. Tilted shapes get conservative AABB boxes — documented; exact fit needs the
   reserved `"hull"` collider shape (non-goal here).

## 6. Follow-ups (out of scope)

- "Replace selection with placed baked object" one-click swap.
- `"hull"`/trimesh AttachedColliderShape for exact tilted collision.
- InstancedMesh for many repeats of one asset.
