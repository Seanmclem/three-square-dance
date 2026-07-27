# Phase 50 — Runtime-Only Instanced Rendering for Placed Objects

## Context

Kit-built levels place the same small GLTF tile assets many times. The obby level: 126
Tiled Platform kit tiles from 13 assets × ~3 meshes each → ~390 meshes → **784 draw calls**
with the shadow pass, for only ~14k triangles (known-good baselines run 14–32 calls,
PROFILING.md §8). Draw calls scale linearly with tiles — a 32×32 tiled platform would hit
~6k calls and tank the framerate. Fix: in the **game runtime shell only** (`runtime.html`
→ `RuntimeApp`), group static placed objects by (asset, submesh) into `THREE.InstancedMesh`
pools at scene load. The editor keeps per-object meshes, byte-identical behavior.

User direction on the related "prefab consolidation" idea: for prefab platforms the user
**never** edits/selects individual tiles — the prefab intentionally obscures them. That is
future work (see last section), not this phase.

## Design

- **New module `src/world/InstancedObjectPool.ts`**, constructed only by `RuntimeApp` and
  injected into `ObjectPlacer` via an optional opts arg (the `SceneManager` `{mode}` opts
  pattern). **ZoneManager, ScriptEngine, App.tsx, types.ts: zero changes.**
- **Eligibility = static exclusion, no runtime instance mutation.** Pool an object only if:
  - Asset: GLTF (not `.obj`, not missing), no animation clips, no `SkinnedMesh`, no
    transparent material.
  - Object: no `autoPlayAnimation`, `material` override, `mover?.enabled`, `sound`, or
    `properties.interactable`.
  - Not a script-mutation target: a **container-agnostic deep JSON walk** over the loaded
    level data (zone record + `world.world` + `world.gameUiElements`) collects `targetId`
    from any node whose `type` is a mutating action (`despawn_object`, `move_object`,
    `change_material`, `play_animation`, `start/stop/toggle_mover`, `open/close_door`,
    `spawn_npc`). Covers all `ScriptAction[]` containers (world/zone/object/volume
    ScriptDefs, `DialogueOption.actions`, `UiMenuOption.actions`) and any future one.
    Group targeting matches via `obj.groupIds` (the same static data
    `ScriptEngine._resolveTargets` expands). Over-exclusion is harmless — the object just
    falls back to the clone path.
- **Pool keying:** per `(assetId, submeshIndex)`. Submeshes read off the **cached**
  `gltf.scene` (never cloned): `rel = rootInv × child.matrixWorld` strips the gltf root's
  TRS, matching `build()`'s overwrite of the clone root. Instance matrix =
  `compose(obj TRS) × rel`.
- **Build timing:** `loadZone` builds objects sequentially, so `tryAdd` accumulates
  placements and the pool finalizes exact-count meshes in its **`zone:loaded`** handler.
  After finalize, `tryAdd` declines (late adds → clones). Finalize also sets
  `shadow.needsUpdate = true` on any frozen static-shadow light so pooled tiles appear in
  frozen maps.
- **Proxy Object3D** per pooled object (`_applyTransform` userData + `localAABB` computed
  once per asset + `_instanced` flag), registered in `_meshes` as usual → auto-fit
  colliders (`getLocalAABB`), `_removeObject`, `AudioSystem._findEntityMesh`, and the
  interact scan keep working unchanged.
- **Disposal safety:** pool meshes live in a scene-root group (NOT the zone group), so
  `unloadZone`'s dispose traverse never touches the shared GLTF-cached geometry. Teardown
  rides `ObjectPlacer.remove` → `pool.release`; last id out → remove group +
  `InstancedMesh.dispose()` only (frees instanceMatrix buffers; geometry/materials belong
  to the AssetManager cache).
- **Culling:** `computeBoundingSphere()` per pool mesh, `frustumCulled` stays on.
- DEV guard: `ObjectPlacer`'s despawn/updated handlers warn if a pooled object ever
  receives a runtime mutation (eligibility scan gap should be loud).

## Files

- NEW `src/world/InstancedObjectPool.ts` — the pool (tryAdd/release/dispose + probe,
  deep-walk exclusion scan, zone:loaded finalize).
- `src/preview/ObjectPlacer.ts` — opts arg (type-only import), pooled branch in `build()`,
  `release` in `remove()`, DEV warns.
- `src/runtime/RuntimeApp.tsx` — construct/inject/dispose + `__instancing` DEV global.
- `PROFILING.md` §5, `WORLD_EDITOR_ARCHITECTURE.md` — docs.

## Measured results (2026-07-26, obby level, runtime shell)

- Draw calls **784 → 68** (~11×); triangles unchanged; 35 pool meshes; 130/130 objects
  pooled; colliders identical (135) — player stands on pooled tiles.
- Scene reload ×2: colliders 135→135→135, `info.memory.geometries` 48→48→48 (shared
  geometry survived unload), render identical (68 calls).
- All 7 eligibility branches verified live (material/mover/interactable/script
  target/group target/dialogue target excluded; plain tile pooled).
- Editor smoke: 0 pools/proxies, 130 clone roots, no errors.
- Pre-existing (NOT this phase): `info.memory.textures` grows ~+11 per scene reload —
  orphaned terrain/material GL textures on the transition path; kit tiles are untextured
  and the pool touches no textures.

## Future — prefab consolidation (option 3, unplanned)

For prefab platforms, per-tile selection is explicitly unwanted (the prefab obscures its
members; resizing goes through prefab variables). A later editor-side pass could merge an
idle prefab instance's member meshes render-side (bake-style merge-by-material, reusing
`bakeShapes`' grouping + `normalizeForMerge`) and explode back on edit — no instanced
picking machinery needed. Data model untouched; re-expansion/variables keep working. Reach
for it if editor-viewport draw calls become a real pain; the runtime pool already covers
published games.
