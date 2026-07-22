# Phase 44 — Prefab Core: Expansion Pipeline + Generator Framework + Tiled Platform

> Slice 2 of the prefab plan (see `plans/phase-43-platformer-tiles.md` for the user
> request and decisions). This phase ships the data model, the one shared
> instantiation pipeline, the generator framework, and the first generator — the
> DynamicPlatform reimplementation — with placement UI. Re-expansion/variables UI,
> snapshot capture, and isolated edit mode land in phases 45–47.

## Architecture: expanded-entity model

Scenes always store **fully-expanded entities** plus light link metadata:

- Each member entity carries `prefab?: PrefabStamp { prefabId, instanceId, memberKey }`.
- Each zone carries `prefabInstances?: PrefabInstanceRecord[]` — the durable link:
  `{ id: "pfi_..", prefabId, version, variables, origin { position, rotationY } }`.
  Keyed by `id` (not `instanceId`) so WorldState's generic by-id journal machinery
  (`_zoneArr`/`_findEntity`/`_setEntity`) applies unchanged.
- The **runtime needs zero changes**: members are plain entities; the metadata is
  inert; generator code never runs at runtime.

`PrefabDef` (`pfb_..`): `kind: "snapshot" | "generator"`, `version` (staleness check
for cross-scene propagation, phase 47), `variables: PrefabVariableDef[]`
(number/boolean/choice with min/max/step/options), `template?` (snapshot only),
`generatorId?` (generator only).

**PREFABABLE** member types v1: object, trigger-volume, shape, stair, ladder
(position-anchored). Node-backed types (wall/floor/platform) are deferred — shared-
node diffing across re-expansion is real complexity for little v1 value.

## The expansion pipeline (`src/prefab/expand.ts`)

One path for both prefab kinds:

- `expandPrefab(prefab, vars)` — generator → `GENERATORS[generatorId].expand(vars)`;
  snapshot → `structuredClone(template)`. Pure, deterministic memberKeys.
- `instantiatePrefab(world, zoneId, prefab, origin, vars?)` — ONE transaction:
  1. Assign member ids (`existingIds` map param keeps ids memberKey-stable across
     future re-expansion) and build `idMap: template-local id → world id`.
  2. Clone each member def; transform prefab-local → world (rotate by
     `origin.rotationY` about Y, translate; objects/shapes bump `rotation.y`,
     trigger volumes create/merge `rotation`, ladders bump `rotationY`, stairs
     rotate `start` AND `end`).
  3. `remapScripts`: fresh script ids, retargeted `zoneId`, and every intra-prefab
     entity ref (`trigger.targetId`, `actions[].targetId`, `conditions[].npcId`)
     remapped through idMap — ids NOT in the map (external entities, group ids)
     pass through untouched.
  4. Stamp `prefab` on each member; route through the normal `world.addX`
     mutators; `world.addPrefabInstance(zoneId, record)`.
- `defaultVars`, `findInstances` helpers.

Undo/redo: because everything flows through journaled mutators in one transaction,
a 9-member place is one undo step, and redo restores the record with the same id.

## WorldState / undo

- `addPrefabInstance` / `updatePrefabInstance` / `removePrefabInstance` — the
  optional-array pattern (`zone.prefabInstances ??= []`), `"prefabInstance"`
  ChangeKind, `prefabinstance:added/updated/removed` bus events, `_emitChange`
  case. **No ZoneManager listener** — records have no visual.
- Session field `WorldState.prefabLibrary?: PrefabDef[]` (gameItems precedent,
  never serialized into scenes).

## Library persistence (`src/prefab/library.ts`)

- Project open → `GameConfig.prefabs` in game.json (items/stateSchema precedent;
  written by the existing Save → `writeGame()`); edits set `isDirty`.
- No project → localStorage `worldeditor_prefabs` (written on every change).
- On project open/adopt: `promoteSessionPrefabs` unions session prefabs into
  game.json by id (game.json wins), clears the session key, marks dirty.
- Library edits are NOT undoable (matches items — game config sits outside the
  scene's undo journal).

## Tiled-platform generator (`src/prefab/generators/tiledPlatform.ts`)

Variables: `width`/`depth` (int 2–32, default 3), `tileSet` (grass|dirt).
Grid at 2m pitch, centered on the origin: tile (i,j) center
`((i−(w−1)/2)·2, 0, (j−(d−1)/2)·2)`. Roles: corners at the 4 grid corners
(rotY 0 at −X/+Z, 90 at +X/+Z, 180 at +X/−Z, −90 at −X/−Z), side tiles along
edges rotated so the skirt faces out (Corner's natural outward faces are −X/+Z;
Side's is +Z — measured from the Phase-43 models), centers inside. Walkable top
at origin.y + 1 (tiles are 2×2×2, model-natural origin). memberKey `tile_i_j`.

## UI

- Toolbar ASSETS flyout: **Prefabs** panel row (`LeftPanelId "prefabs"`, new
  `IconPrefab`).
- `src/ui/PrefabPanel.tsx`: library list (ƒ generator / ⬡ snapshot badge, live
  instance count, Place / rename / delete — delete disabled while instances
  exist) + BUILT-IN GENERATORS section (first Place lazily creates the library
  def with the generator's default variables).
- `src/editor/PrefabTool.ts` (ToolId `"prefab"`, ObjectTool template): armed by
  `prefab:selected` from the panel; ghost = translucent green extents box of the
  expanded members (±1m padding around anchor points — exact for 2m-pitch tiles);
  0.5m grid snap; lands on the surface under the cursor; R rotates 90°; Esc /
  right-click stops; ghost persists for continuous placement.
- App: `prefabs` state + `applyPrefabs` routing (project game.json vs session
  localStorage), instance counts recomputed on `prefabinstance:added/removed`.

## Verification (done 2026-07-21, Chrome MCP on the live app)

- `npm run typecheck` clean.
- Real-click path: ASSETS → Prefabs → Place (Tiled Platform) → ground click:
  seamless 3×3 grass platform, skirts all facing outward.
- `__world`: 1 record (`variables {width:3, depth:3, tileSet:"grass"}`) + 9
  stamped members (corner/side/center assets, correct rotations, 2m pitch).
- Preview: character teleported above stands at y≈1.914 on the center tile AND a
  corner tile (slab colliders uniform — including the flat-plane grass center).
- Cmd+Z once → 0 records, 0 members; Cmd+Shift+Z → 9 members + same `pfi_` id
  restored; final undo → clean.
- Tiles category pill lists all 19 kit assets in the AssetBrowser.
- Session hygiene: autosave snapshot-restored byte-identical, no test ids left.

## Known limits (deliberate, next phases)

- No variables editing / re-expand / unlink UI yet (phase 45).
- Selection picks individual tiles, not the instance (phase 45).
- No capture-from-selection (phase 46), no prefab editing/propagation (phase 47).
- Ghost is an extents box, not real member meshes (phase 48 polish).
