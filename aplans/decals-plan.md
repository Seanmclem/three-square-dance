# Decals — Implementation Plan

> **Status: IMPLEMENTED** — Stage A shipped as v4.7.0 (`780bc37`, Phase 20), Stage B as
> v4.8.0 (`8bf901d`, Phase 21), both verified in-browser 2026-07-07. See
> `test-plans/phase-20-decals-overlay.md` / `phase-21-decals-surface.md` and the
> WORLD_EDITOR_ARCHITECTURE.md v4.7.0/v4.8.0 entries for as-built details (two notable
> deviations: gizmo anchor re-snap was dropped in favor of predictable free translation,
> and the >4-per-mesh warning is console-only rather than a panel badge).

> Stains, stickers, graffiti, and weathering projected onto world surfaces.
> Two techniques, chosen by what the decal *is*, not where it goes:
>
> - **Overlay decals** (`DecalGeometry` from three/addons) — things applied *on top* of
>   a surface after the fact: stickers, bullet holes, cracks, paint splats, signs.
>   Each is its own mesh with its own material, sitting just above the surface.
> - **Surface-effect decals** (projection / triplanar in the surface's *own* shader via
>   `onBeforeCompile`) — environmental effects that feel *part of* the surface: water
>   damage, stains, weathering, moss. The base normal map stays intact so lighting has
>   no seam; triplanar mode wraps mitered wall corners with no projector direction at all.
>
> Confirmed scope: all static geometry (walls, floors, platforms, stairs — imported
> objects excluded this phase). Click-to-stamp placement with a live ghost preview.
> New decal asset manifest + starter pack of CC0 transparent PNGs.
>
> Shipped in two stages: **Stage A (v4.7.0)** overlay decals end-to-end,
> **Stage B (v4.8.0)** surface-effect shader decals. Each stage is independently
> shippable and verified. All file paths / line anchors below were verified against
> the codebase on 2026-07-06.

---

## 0. Key architectural decisions (read first)

| Decision | Choice | Why |
|---|---|---|
| Decal ↔ surface binding | **Free-floating world-space anchor + normal; no target entity id** | Wall runs merge/split and `RunEntry` meshes are disposed wholesale in `_rebuildWallBatch` — a stored wallId/runId would dangle after every node drag or split. Decals re-project at build time onto whatever static geometry their projector box intersects, so run merges, thickness edits, and undo-driven full reloads all work for free. |
| Who owns decal mesh lifecycle | **ZoneManager**, mirroring `_volumeMeshes` / `_buildTriggerVolumes` | ZoneManager is the only module that reliably knows when meshes are built, rebuilt, and disposed. Trigger volumes are the validated template. |
| Overlay preview | **Oriented quad ghost; real `DecalGeometry` only on commit** | DecalGeometry clips the target mesh's full index buffer — per-mousemove regen on a large merged run is unacceptable. A `PlaneGeometry` ghost updates for free. |
| Surface-effect multi-decal | **MAX_SURFACE_DECALS = 4 per mesh, fixed unrolled samplers** | GLSL ES 3.0 forbids dynamically-indexed sampler arrays. 4 unrolled `sampler2D`s is trivially correct and well under sampler limits (MeshStandardMaterial uses ~6–7). A texture atlas is the documented v2 escape hatch if a level ever hits the cap. |
| Surface-effect material handling | **Clone the base material per mesh, never mutate the shared cache** | `assetManager.getMaterial()` returns one shared cached `MeshStandardMaterial` per `${id}:${quality}`; patching it would decal every wall using that material. The clone is tagged `_ownsMaterial: true` so existing rebuild disposal owns it. |
| Gizmo support | **Translate only** | Roll-around-surface-normal maps badly to the world-Y rotate ring. Rotation edits stay in the panel + scroll-during-placement. |
| Save format | **`zone.decals?: DecalDef[]` optional array — no migration** | Same pattern as `triggerVolumes?` / `checkpoints?`; absent = none. Serialization is automatic via `WorldState.toJSON` zone spread. |

---

## 0.5 Performance & regression posture

**Nothing is added to the per-frame path.** Decals are entirely event-driven: built on
place/load, regenerated on entity rebuild, uniform-updated on edit. No RAF work, no
per-frame raycasts, no allocations in `update()` — the exact traps TESTING.md §7 warns
about are structurally avoided.

Performance decisions baked into the design:

- **Placement ghost is a 2-triangle quad**, not a live DecalGeometry — the expensive
  clip against a merged run's full index buffer happens once, on commit.
- **Rebuild regen is scoped**: only decals whose projector AABB intersects the rebuilt
  entity regenerate, coalesced per microtask — dragging a wall node never touches
  decals elsewhere in the zone.
- **Surface-effect edits never recompile shaders**: move/resize/opacity are uniform
  writes; `customProgramCacheKey` buckets by slot count so all meshes with N decals
  share one program. Recompiles only on 0→1 decals or a count-bucket change (one-frame
  hitch, same cost class as the existing material-swap script action). Surface decals
  add **zero draw calls** — the cost is a few texture samples in an already-running
  fragment shader.
- **Overlay decals cost one draw call each** (small transparent mesh,
  `castShadow: false`). The FPS counter's draw-call/triangle readout is part of
  verification; compare against PROFILING.md §8 baselines.
- Textures flow through the existing `loadTexture` cache — no duplicate GPU uploads,
  and `setQuality` disposal covers them with no new cache to manage.
- (Context from design discussion: for a *flat* surface a raw offset plane is the classic
  cheap trick — the ghost quad IS that. Committed decals still use DecalGeometry because
  editor surfaces are user-built and irregular: CSG-cut walls, mitered corners,
  wall/floor junctions — the case DecalGeometry exists for.)

Regression posture — **the feature is almost purely additive**:

- New files carry the logic (`DecalBuilder`, `surfaceDecals`, `DecalTool`, `DecalBrowser`);
  edits to existing files are new switch cases, new bus events, and a new optional
  `ZoneDef` field. With no decals in a zone, every new code path is a no-op.
- **Save format**: optional array — old files load unchanged, no migration, saves from
  this version still load in older builds (unknown key ignored).
- **Shared material cache is never mutated** — surface effects clone per mesh and
  restore the original when the last decal leaves; the `_ownsMaterial` disposal
  contract is respected on both paths.
- The two behavior-touching edits to existing systems, and their containment:
  1. `input:wheel` payload gains modifier fields — additive; the existing consumer
     destructures `{ delta }` and is unaffected.
  2. `EditorCamera` zoom-lock — a guarded early-return that only fires while a lock is
     held; DecalTool unlocks on deactivate/dispose, and the wheel-gating test verifies
     zoom works normally over empty space. This actually *fixes* an existing conflict
     (TriggerVolumeTool's height-scroll fights camera zoom today).
  3. `SelectionManager.PRIORITY` insertion — changes pick order only when a decal mesh
     is literally under the cursor.
- Riskiest piece = Stage B's `onBeforeCompile` (first in the repo), which is why it's
  isolated in its own file, its own stage, and its own cloned materials — a shader bug
  can only misrender decaled meshes, never untouched geometry.
- Every stage ends with `npm run typecheck`, console-clean check, FPS/draw-call
  comparison, and the standard §7 regression checklist.

---

## 1. Data model (`src/types.ts`)

```ts
export type DecalKind = "overlay" | "surface";

export interface DecalDef {
  id:        string;          // dec_<uuid8>
  label?:    string;
  kind:      DecalKind;
  textureId: string;          // id in the decals manifest registry
  position:  Vec3;            // world-space anchor ON the surface
  normal:    Vec3;            // unit world normal captured at placement
  rotation:  number;          // degrees, roll around normal
  size:      { width: number; height: number };  // meters
  depth?:    number;          // overlay projector depth; default max(w,h)*0.5, min 0.2
  opacity:   number;          // 0..1 (surface kind: blend strength)
  triplanar?: boolean;        // surface kind only — corner-wrapping projection
  roughnessMod?: number;      // surface kind only — roughness where alpha>0 (wet look)
  groupIds?: string[];
}

export interface DecalTexDef {
  id: string; label: string; category?: string;
  path: string;               // /assets/decals/<file>.png (albedo, transparent)
  maps?: { normal?: string; roughness?: string };  // optional PBR maps (overlay kind)
  kinds: DecalKind[];         // which modes this texture supports
  attribution?: string;
}
export interface DecalManifest { version: string; decals: DecalTexDef[] }
```

Type-system touches:

- `ZoneDef` (~line 530): add `decals?: DecalDef[];` next to `checkpoints?`.
- `ToolId` (~94): add `"decal"`. `EditorObjectType` (~99): add `"decal"`.
  `LeftPanelId` (~54): add `"decals"`.
- `SelectedObjectPayload` data union: include `DecalDef`.
- `BusEvents` (lines 119–236), following the `triggervolume:*` naming convention:

```ts
"decal:added":       { zoneId: string; decal: DecalDef };
"decal:updated":     { zoneId: string; id: string; changes: Partial<DecalDef> };
"decal:removed":     { zoneId: string; id: string };
"decal:placed":      { zoneId: string; id: string };
"decaltool:texture": { textureId: string | null; kind: DecalKind };  // picker → tool
"camera:zoom-lock":  { source: string; locked: boolean };            // see §3.7
```

Edge case encoded in the model: if geometry moves away from a decal's projector,
the build yields 0 triangles — **keep the def, skip the mesh** (`console.info`),
the same way missing-file materials are hidden but preserved.

---

## 2. Assets — decal manifest + starter pack

- `public/assets/decals/manifest.json` — `{ "version": "1.0", "decals": DecalTexDef[] }`,
  parallel to the textures manifest shape. No `{quality}` tiers in v1 (decal PNGs are small).
- Starter pack (~6–8 transparent PNGs, CC0 from ambientCG / Poly Haven decal sets):
  - Overlay: `crack_01`, `crack_02`, `bullet_holes_01`, `paint_splat_01`,
    `graffiti_arrow_01`, `sign_exit_01`.
  - Surface (Stage B): `leak_stain_01`, `moss_patch_01`, `grime_01`.
  - Fallback if sourcing stalls: canvas-generated placeholder PNGs so the whole
    pipeline is verifiable; swap real assets in later.
- `AssetManager.ts` (`src/core/AssetManager.ts`):
  - `initDecals(): Promise<DecalTexDef[]>` — fetch the manifest into a new
    `_decalRegistry: Record<string, DecalTexDef>`; `getDecalDef(id)`, `getDecalList()`.
  - Decal textures load through the **existing** `loadTexture(path, THREE.SRGBColorSpace)`
    cache (~line 149) — so `setQuality`'s cache disposal covers them automatically.
  - Bootstrap: call `initDecals()` next to `initMaterials()` in `App.tsx`.

---

## 3. Stage A — Overlay decals end-to-end (v4.7.0)

Implementation order follows the repo's validated new-entity checklist
(trigger volumes are the template throughout).

### 3.1 WorldState (`src/world/WorldState.ts`)

`addDecal / updateDecal / removeDecal(zoneId, ...)` mirroring the trigger-volume trio
(~lines 343–368): lazily init `zone.decals ??= []`, call `this._touch("decal", zoneId, id)`
**before** mutating, `Object.assign` for updates, emit `decal:*`.

- `_zoneArr` (~516): `case "decal": return (zone.decals ??= []);`
- `_emitChange` (~428): `case "decal"` re-emitting `decal:added/removed/updated` for undo/redo.
- `HistoryManager.ts:4`: add `"decal"` to `ChangeKind`.
- Serialization: **automatic** (`toJSON` spreads zones). No `WorldLoader` migration —
  new optional array, exactly like `triggerVolumes?` was introduced.

### 3.2 DecalBuilder (`src/world/decals/DecalBuilder.ts`, new)

Pure functions — keeps the heavy lifting out of ZoneManager:

```ts
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function decalOrientation(normal: Vec3, rollDeg: number): THREE.Euler;
export function decalProjectorBox(def: DecalDef): THREE.Box3;   // world AABB of projector
export function buildOverlayDecalMesh(
  def: DecalDef, targets: THREE.Mesh[], texture: THREE.Texture, zoneId: string,
): THREE.Mesh | null;   // null when zero triangles clipped
```

`buildOverlayDecalMesh` runs `DecalGeometry` against **every** target whose world AABB
intersects the projector box and merges the results — the multi-target merge is what lets
one stamp wrap a mitered corner shared by two separate runs, or bridge a wall/floor junction.

Overlay mesh recipe:

- Material: `MeshStandardMaterial { map, transparent: true, opacity: def.opacity,
  depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  roughness: 0.9, metalness: 0 }`. `-4` beats the wall-liner meshes' `-1/-1`
  (`WallBuilder.ts:396–398`) so decals draw over CSG passage liners too.
  MeshStandardMaterial inherits FogExp2 + ACES tone mapping automatically
  (unlike `volumeFillMaterial`, which skips fog — don't repeat that gap).
- If the manifest entry has `maps.normal` / `maps.roughness`, assign `normalMap` /
  `roughnessMap` (loaded `NoColorSpace`, per the AssetManager data-map convention) —
  cracks/bullet holes read as genuinely recessed under moving light. Note the decal's
  normals *override* the wall's in its footprint (they don't blend) — acceptable for
  overlay kind; blending is exactly what the surface-effect kind is for. Starter pack
  ships albedo-only; the field is there for asset upgrades.
- `renderOrder = 10 + indexInZone` — stable ordering between overlapping decals.
- `castShadow = false; receiveShadow = true`.
- `userData = { editorId: def.id, editorType: "decal", zoneId, selectable: true,
  _ownsMaterial: true }` — `_ownsMaterial: true` makes existing ZoneManager disposal and
  SelectionManager tint/restore work unmodified.

Note on wall meshes: run geometry is baked in **world XZ**, the mesh sits at
`(0, elevation, 0)` — DecalGeometry works in the target's local space, so this is fine
as long as targets are passed as live scene meshes (they are).

### 3.3 ZoneManager (`src/world/ZoneManager.ts`)

- `private readonly _decalMeshes = new Map<string, Map<string, THREE.Mesh>>()`
  (zoneId → decalId → mesh). Meshes parent into the zone `entry.group`.
- `_buildDecals(zoneId, zone, group)` called from `loadZone` next to
  `_buildTriggerVolumes` (~483). Disposal in `unloadZone` mirrors `_volumeMeshes`.
- Target collection: traverse `entry.group` for meshes with
  `userData.selectable && editorType ∈ {wall, floor, platform, stair}`
  (excludes liner trims, ghost picks, objects, volumes).
- Bus handlers next to the triggervolume block (~284–292):
  `decal:added → _addDecal`, `decal:updated → _rebuildDecal`, `decal:removed → _removeDecal`.
- **Rebuild survival** (the critical bit): subscribe `wall:rebuilt`, `floor:rebuilt`,
  `platform:rebuilt`, `stair:rebuilt`. Coalesce a per-zone *dirty decal* set per microtask
  (copy the `_queueRebuild` pattern, ~335): a decal is dirty iff `decalProjectorBox(def)`
  intersects the rebuilt entity's world AABB — cheap, and avoids regenerating every decal
  on every wall drag. Wall-triggered regen runs through the existing `_wallOpChain`
  (`_enqueueWallOp`) so it can never observe a half-rebuilt run.
- `quality:changed`: `AssetManager.setQuality` disposed the texture cache — regenerate
  decal materials (re-`loadTexture`, which re-caches) in the same hook.
- Dispose pattern: geometry + material always (decals are `_ownsMaterial: true`);
  textures live in the AssetManager cache and are **never** disposed here.

### 3.4 DecalTool (`src/editor/DecalTool.ts`, new)

`TriggerVolumeTool` is the template: plain class, `init()/dispose()`, `_unsubs[]`,
self-gates on `bus.on("tool:select", ...)`, state union `"IDLE" | "ARMED"`.

- Listens `decaltool:texture` (from the browser panel) to arm with a texture + kind.
- **Does its own raycast** per `input:mousemove` — filtered to scene meshes with
  `editorType ∈ {wall, floor, platform, stair}` — and converts `hit.face.normal` to world
  space via the hit object's normal matrix. (This sidesteps InputManager's lack of a
  surface normal in `input:*` payloads; no `_computePositions` change needed.)
  Call `scene.updateMatrixWorld(true)` before manual raycasts (TESTING.md §3 gotcha).
- Ghost preview: `PlaneGeometry(1,1)` + `MeshBasicMaterial { map, transparent,
  opacity: 0.8, depthWrite: false, polygonOffset: true, factor/units: -4 }` at
  `hit.point + normal * 0.01`, quaternion from `decalOrientation(normal, roll)`,
  scaled to current size. Marked `editorOnly`, never selectable.
- Controls: **scroll = size** (clamped 0.1–8 m, aspect preserved),
  **shift+scroll = rotate**, `[` / `]` = rotate ±15° keyboard fallback.
- Click commits inside `world.transaction("place decal", () => world.addDecal(...))`;
  emits `tool:placed` so SelectionManager auto-selects; tool **stays armed** for repeat
  stamping. Escape clears texture first, then exits to Select.
- Instantiate + `init()` in `App.tsx` (~198–264 block), add to the dispose list.

### 3.5 InputManager wheel payload (`src/core/InputManager.ts:179`)

Extend `input:wheel` payload from `{ delta }` to
`{ delta, shift, ctrl, alt, meta }` (read off the WheelEvent). Update the
`BusEvents` entry (types.ts:202). Existing consumer (`TriggerVolumeTool.ts:134`)
destructures `{ delta }` — unaffected.

### 3.6 EditorCamera zoom lock (`src/editor/EditorCamera.ts`)

EditorCamera attaches its **own DOM wheel listener** (line 49 → `_handleWheel`) and always
zooms — TriggerVolumeTool's height-scroll already fights it today. Fix generally:

- New bus event `camera:zoom-lock { source, locked }`.
- EditorCamera keeps a `Set<string>` of active lock sources; `_handleWheel` early-returns
  (still `preventDefault`) while non-empty.
- DecalTool emits `{ source: "decal-tool", locked: true }` whenever it is active AND the
  ghost is over a surface; unlocks otherwise and on deactivate/dispose.
- (Follow-up, optional: migrate TriggerVolumeTool's scroll to the same lock.)

### 3.7 UI

- **`src/ui/DecalBrowser.tsx`** (new; MaterialBrowser/AssetBrowser template):
  thumbnail grid using the PNGs directly as `<img>` swatches, category pills
  (reuse the `MaterialCategoryPills` idiom from `src/ui/materialCategories.tsx`),
  Overlay/Surface kind toggle — **Surface disabled until Stage B**.
  Picking a tile emits `decaltool:texture` and activates the decal tool.
- `LeftPanel.tsx`: route for `"decals"`.
- `Toolbar.tsx:10`: `{ id: "decal", label: "Decal", shortcut: "K" }` (K verified free;
  V/F/W/L/T/O/Z/N/U taken) + auto-open the decals panel on tool select
  (trigger-volume pattern at Toolbar.tsx:57).
- `icons.tsx` (~112/119): `IconDecal` + `TOOL_ICONS` entry.
- `PropertiesPanel.tsx:43` `TOOL_INFO`:
  `desc: "Pick a decal, hover a surface, scroll = size, shift+scroll = rotate, click to stamp."`,
  `hint: "Select a decal texture in the Decals panel first."`

### 3.8 Selection (`src/editor/SelectionManager.ts`)

- `PRIORITY` (line 10): insert `"decal"` **before** `platform/wall/floor` — decals lie
  coplanar with them, so priority must break the raycast distance tie:
  `["opening", "object", "checkpoint", "spawn", "decal", "platform", "wall", "floor"]`.
- `_getDataRecord` (~467): `case "decal": return zone.decals?.find(d => d.id === editorId) ?? null;`
- Emissive-tint highlight works as-is (standard material, `_ownsMaterial: true`).

### 3.9 PropertiesPanel (`src/ui/PropertiesPanel.tsx`)

Custom view route at ~476 (`TriggerVolumeView` ~3214 is the model, `CheckpointView`
~3127 the minimal skeleton): **`DecalView`** with label, kind badge, texture-swap mini
grid (reuse the DecalBrowser tile renderer), position XYZ, rotation, width/height,
opacity, depth, Delete button. All inputs via `useFieldDebounce(300)` (:112) with the
local-string-mirror + resync-on-gizmo-drag pattern. Title case (~272): `"DECAL"`.

### 3.10 App wiring (`src/App.tsx`)

- `handleObjectUpdate` (~1516): `else if (selected.type === "decal")` →
  `world.transaction("update decal", ...)` + `syncHistory()` + merged `setSelected`.
- Delete: multi-select switch (~844–859) `case "decal": world.removeDecal(...)`;
  Delete/Backspace key path likewise.

### 3.11 GizmoManager (`src/editor/GizmoManager.ts`)

- `GizmoType` (:10) + `_onSelect` allow-list (~222): add `"decal"`.
- Pivot seed (~246–319): `decal.position + normal * 0.3`.
- **Do NOT** add to the KeyR/KeyS lists (~175–179) — translate-only.
- `_commitTranslate` (~826): `case "decal"` → `world.updateDecal(zoneId, id, { position })`.
  On rebuild, ZoneManager **re-snaps** the anchor: raycast ±0.5 m along the stored normal
  from the new position and clamp back onto the surface.
- Re-attach on `decal:updated` (`_reattachMeshes` pattern, ~684–732; mesh tracked by
  `userData.editorId`). Multi-select: `case "decal"` in `_refDisplayPos` (~392) and
  `_translateRef` (~511).

### 3.12 Stage A edge cases (encode in tests)

- Undo/redo of place / move / delete — journal + `_emitChange` handles it;
  `history:restore` full reload rebuilds decals via `loadZone`.
- Zone switch disposes meshes but not defs; reload rebuilds.
- Decal orphaned by deleting its wall: def kept, mesh skipped, no error.
- Overlapping decals: stable draw order via `renderOrder`.
- Preview/game mode shows decals (no `editorOnly` flag on committed meshes).
- Save/load + autosave roundtrip automatic.
- **Out of scope for A:** copy/paste, group bulk operations (note in test plan).

---

## 4. Stage B — Surface-effect shader decals (v4.8.0)

### 4.1 `src/world/decals/surfaceDecals.ts` (new)

```ts
export interface SurfaceDecalSlot {
  texture: THREE.Texture;
  projMatrix: THREE.Matrix4;              // world → decal UV space
  params: THREE.Vector4;                  // (opacity, triplanar?1:0, roughnessMod, pad)
  normal: THREE.Vector3;
}
export const MAX_SURFACE_DECALS = 4;

// Clones `base`, injects decal sampling via onBeforeCompile, returns the patched clone.
export function makeSurfaceDecalMaterial(
  base: THREE.MeshStandardMaterial, slots: SurfaceDecalSlot[],
): THREE.MeshStandardMaterial;

// Updates uniforms in place (move/resize/opacity) — NO recompile.
export function updateSurfaceDecalUniforms(
  mat: THREE.MeshStandardMaterial, slots: SurfaceDecalSlot[],
): void;
```

Shader injection (this is the repo's **first** `onBeforeCompile` — keep it contained here):

- **Vertex**, after `#include <worldpos_vertex>`:
  `vSdWorldPos = worldPosition.xyz;` and
  `vSdWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
  (safe: wall/floor meshes carry no non-uniform scale — identity/elevation transforms only).
- **Fragment**, after `#include <map_fragment>` — unrolled `SD_SAMPLE(0)`…`SD_SAMPLE(3)`
  guarded by `uSdCount`:
  - *Planar path*: `uv = (uSdProj[i] * vec4(vSdWorldPos, 1.0)).xy + 0.5`, clip to [0,1]
    with a `smoothstep` edge fade, and multiply alpha by
    `max(dot(vSdWorldNormal, uSdNormal[i]), 0.0)` — **the normal-dot fade is what stops a
    planar projector painting the far side of a thick wall.**
  - *Triplanar path* (per-slot flag): three world-axis projections centered on the decal
    anchor, weighted by `pow(abs(vSdWorldNormal), vec3(4.0))`, radial falloff from the
    anchor — ignores projector direction entirely, so it wraps mitered corners seamlessly.
  - Blend: `diffuseColor.rgb = mix(diffuseColor.rgb, sdColor.rgb, a * opacity);`
- **Fragment**, after `#include <roughnessmap_fragment>`:
  `roughnessFactor = mix(roughnessFactor, uSdParams[i].z, a);` — wet/stain look.
  The base normal map is untouched, so lighting continuity is perfect (zero seam).
- **Program cache**: `mat.customProgramCacheKey = () => "surfdecals:" + slotCount` —
  meshes with the same slot count share one compiled program. Moving/resizing a decal is
  a uniform update only. Recompiles happen only when a mesh goes 0→1 decals or changes
  count bucket (one-frame hitch, same cost class as a material swap).
  Gotcha: `onBeforeCompile` runs on first render — seed the uniform objects *before*
  assignment (stash on `mat.userData._sdUniforms`) and reference them from the hook.

### 4.2 ZoneManager integration

- `_surfacePatches = Map<zoneId, Map<meshUuid, { mesh, original: THREE.Material,
  decalIds: string[] }>>`.
- `kind === "surface"` decals route to **patch/unpatch** instead of mesh build. Target
  resolution reuses the same projector-AABB intersection as overlays, resolved per mesh.
- Patched mesh: `mesh.material = clone; mesh.userData._ownsMaterial = true`.
  When the **last** surface decal leaves a mesh: restore `original`, dispose the clone,
  reset `_ownsMaterial` to its prior value — the shared cache instance is back in play.
- After `wall:rebuilt` etc. the patch record is stale (new mesh, fresh material) — the
  same dirty-decal microtask re-resolves and re-patches. Same for `quality:changed`.
- Per-mesh cap: drop excess beyond `MAX_SURFACE_DECALS` with `console.warn`; surface the
  count to the panel for the ">4 on this surface" warning.

### 4.3 UI + selection

- DecalBrowser: enable the Surface kind toggle; stain/moss/grime manifest entries with
  `kinds: ["surface"]`.
- `DecalView`: triplanar toggle, roughnessMod slider, over-cap warning.
- Selection (no mesh to raycast): analytic ray-vs-projector-rectangle test in the tool
  (TriggerVolumeTool `_findVolumeAt` pattern), active for Select + Decal tools; emits
  `object:selected` with `type: "decal"`. Highlight = editor-only wireframe rectangle
  helper (`editorOnly: true`), SegmentHighlighter-style.
- Polish folded into B: `groupIds` support in GroupPanel listing.

---

## 5. Documentation & process (per repo convention — do not skip)

After **each** stage:

1. Update `WORLD_EDITOR_ARCHITECTURE.md` — **both** a new phase section (Phase 20:
   Overlay Decals / Phase 21: Surface-Effect Decals) **and** the existing file-level
   sections touched (types, EventBus table, WorldState, ZoneManager, SelectionManager,
   GizmoManager, PropertiesPanel, AssetManager, Toolbar). See `PLAN_UPDATE_GUIDE.md`.
2. Write the test plan: `test-plans/phase-20-decals-overlay.md`,
   `test-plans/phase-21-decals-surface.md` (phase-19 is currently the latest).
3. Update `HUMAN_TESTING.md` with click-by-click walkthroughs.
4. Commit directly to main: `feat(decals): overlay decals — DecalGeometry stamping (v4.7.0)`,
   `feat(decals): surface-effect shader decals (v4.8.0)`.

---

## 6. Verification (TESTING.md idioms)

Every step: `npm run typecheck` clean, no vite-checker overlay, no console errors,
FPS counter unregressed (surface decals add uniform sampling only; overlay decals add
one draw call each — check draw-call count in the perf readout).

Chrome-MCP session (dev globals; **localStorage autosave snapshot per TESTING.md §3
before any mutation**, chunked dump):

| Check | How | Expected |
|---|---|---|
| Stamp | Real clicks: Decal tool + texture tile, hover wall, click | Ghost visible pre-click (screenshot); after: exactly one `editorType === "decal"` mesh in `__scene`, one def in `__world.toJSON().zones[].decals` |
| Rebuild survival | Drag a wall node of the target run | Decal mesh regenerated (new uuid, still exactly one, no orphans in zone group); re-projected onto moved surface (raycast from `position` along `-normal` hits wall < 2 cm) |
| Undo/redo | Cmd+Z / Cmd+Shift+Z after place, move, delete | Mesh + def removed/restored together |
| Wheel gating | Record `__editorCamera.spherical.radius`; scroll with ghost over surface, then over sky | Radius unchanged over surface (ghost resizes); radius changes over sky |
| Save/load | `__world.toJSON()` roundtrip via SaveLoad | `zones[].decals` present; reload re-renders decal |
| Quality toggle | Switch quality | Decal texture reloads, mesh still textured |
| Panel path | Edit width/opacity in DecalView | Debounced commit; mesh rebuilds; JSON updated |
| B: corner wrap | Triplanar stain on a mitered two-wall run; frame side view via `__editorCamera` | Screenshot: continuous wrap across corner; no bleed on reverse face |
| B: material hygiene | Inspect run `mesh.material` while decaled / after delete | ≠ shared `assetManager` cache instance while decaled (`_ownsMaterial` true); reverts to shared instance after last decal removed |
| B: no recompile on move | Move a stain; compare `material.uuid` before/after | Same uuid (uniform-only update) |

---

## 7. File inventory

**New files**
- `src/world/decals/DecalBuilder.ts`
- `src/world/decals/surfaceDecals.ts` (Stage B)
- `src/editor/DecalTool.ts`
- `src/ui/DecalBrowser.tsx`
- `public/assets/decals/manifest.json` + starter PNGs
- `test-plans/phase-20-decals-overlay.md`, `test-plans/phase-21-decals-surface.md`

**Modified**
- `src/types.ts` — DecalDef, ZoneDef, ToolId, EditorObjectType, LeftPanelId, BusEvents
- `src/world/WorldState.ts`, `src/editor/HistoryManager.ts`
- `src/world/ZoneManager.ts`
- `src/core/AssetManager.ts`, `src/core/InputManager.ts`
- `src/editor/EditorCamera.ts` (zoom lock), `src/editor/SelectionManager.ts`,
  `src/editor/GizmoManager.ts`
- `src/ui/PropertiesPanel.tsx`, `src/ui/Toolbar.tsx`, `src/ui/LeftPanel.tsx`,
  `src/ui/icons.tsx`
- `src/App.tsx`
- `WORLD_EDITOR_ARCHITECTURE.md`, `HUMAN_TESTING.md`
