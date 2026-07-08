# 3D World Editor — Full Project Architecture
> Vite + React + TypeScript + Three.js (no R3F) — physics via Rapier3D

**Version 4.11.1** — last updated 2026-07-07
- v1.0 — Initial architecture, Phases 1–12
- v1.1 — TypeScript conversion, full type system, tsconfig
- v1.2 — Rapier physics integrated Phase 3+, sky system, character architecture
- v1.3 — Phase 4.5 material system, Phase 4.6 wall graph, ambientCG naming convention
- v1.4 — Dynamic asset manifest, Phase 7 model importer, Phase 9 persistence split, Phase 10.5 scripting/event system
- v1.5 — Default spawn system, Preview vs Start Game, SpawnPointTool, item/dialogue/quest/audio stubs in Phase 12
- v1.6 — Phase 6 fully specced: dynamic floor tabs, floor creation flow, derived elevation, PropertiesPanel floor view, ceiling toggle, no deletion
- v1.7 — Phase 4.7 merged corner geometry, Phase 4.8 complete wall interaction model (chain, loop close, node dragging)
- v1.8 — Phase 4.9 floor system: multi-floor bug fix, Z-fighting offset, auto-floor from loop, polygon floor tool, vertex editing
- v1.9 — Phase 6.1 transform gizmos: GizmoManager, resize handles, platform Y handle, wall segment move
- v2.0 — Phase 6.2 scene save/load, Phase 9 full persistence (game save, auto-save, preferences, startup flow), all object types covered
- v2.1 — **Sync to actual implementation:** wall node graph (startNodeId/endNodeId), wall runs/buildRun(), Rapier colliders replacing mesh colliders, polygon platforms, stair CSG cutter, per-material overrides, updated all builder signatures, ZoneManager internal patterns
- v2.1.1 — Restored orphaned Phase 7 header and content (was floating inside Phase 6.3)
- v2.2 — Phase 6.5 properties panel navigation redesign: drilldown stack, fixed header, per-type screen mapping
- v2.3 — Phase 6.5 refined: Actions as expanded-by-default accordion on root, Quality moved to Material screen, no Actions drilldown screen
- v2.2 — Phase 6.3 wall-run gizmo extensions + multi-floor wall elevation system
- v2.3 — Phase 6.4 delete support (Delete key + panel button) + copy-to-floor opening strip
- v2.4 — Phase 6.6 input UX & floor fixes: EditorCamera focus guard, universal live debounce hook, floor gizmo centroid, floor elevation default, wall-run stale rebuild fix
- v2.5 — Phase 6.7 snapshot-based undo/redo: HistoryManager, `history:restore` event, Cmd+Z/Cmd+Y shortcuts, toolbar buttons, all placement tools and App.tsx mutation handlers wrapped
- v2.6 — Phase 7 redesigned: LeftPanel generic slot system, AssetBrowser in left panel, Model Importer modal, manifest system, object placement wired to GizmoManager
- v2.7 — Phase 8 fully specced: zones vs floors guidance, stair zone links, ZonePanel always browse-only, transition linking in PropertiesPanel only, HelpTooltip component
- v2.9 — Phase 10 & 10.5 rewritten into uploaded doc: character model option, capsule-only mode, interact system, trigger volume editor, Script Panel full spec, all action implementations
- v3.0 — Phase 10.6 added: EntityRegistry, index-based ScriptEngine, ActionDispatcher, animation clip discovery, per-entity Scripts tab in PropertiesPanel
- v3.1 — Phase 10.7 added: Animations tab in PropertiesPanel, editor-mode clip preview, auto-play animation on placed objects, WorldObject.autoPlayAnimation field
- v3.2 — Phase 12 updated: Brush primitive stub with local-space architecture requirement and world-space anti-pattern warning
- v3.3 — Phase 10.8 added: world-space UV generation, UVUtils.ts, consistent texture density across all builders, uvVersion migration
- v3.4 — Three-level script architecture: object scripts on WorldObject, zone scripts on ZoneDef, world scripts on WorldConfig. ScriptEngine manages all three independently. Script Panel has World/Zone/Object tabs.
- v3.5 — **Phase 10.5 implemented:** ScriptEngine, GameStateManager, TriggerVolumeTool, ScriptPanel, DialogueOverlay, TriggerSystem volume sensors, ZoneManager volume wireframes + colliders, ColliderBuilder.registerVolumeSensor(), WorldState triggerVolume mutations, App.tsx fully wired.
- v3.6 — **Phase 10.6 Groups system:** Zones redesigned as Groups (named labels, no spatial bounds). GroupPanel replaces ZonePanel, Z key toggles groups panel, GroupDef/groupIds added to all entity types, WorldState group CRUD with bus events, ScriptPanel tabs renamed GLOBAL/LEVEL/SELECTED with per-tab descriptions, TriggerVolumeTool auto-selects after placement, click-through fix via InputManager drag threshold.
- v2.8 — **Sync to actual implementation (Phases 6.8 + 8):** LevelStepper in PropertiesPanel (wall/platform/object/floor); AssetCategory widened to allow custom strings; OpeningDragHandler adds opening moves to undo history; SelectionManager clears selected on object:deselected (gizmo reattach fix); Phase 8 implemented: ZoneTool, ZonePanel, ZoneNamingDialog, HelpTooltip, zone:enter wired in ZoneManager, door opening zone-link picker in PropertiesPanel
- v3.7 — **Phase 10.9 — Group Functionality + Scripting Cleanup:** `on_timer` implemented (ScriptEngine timer loop, shipped); `play_animation`/`change_material`/`fade_screen` re-homed from "Unassigned"/stale-10.6 tags into Phase 10.9; Groups gains real functionality (assignment UI in PropertiesPanel, group visibility toggle, bulk operations, group scripting targets); `WorldObject.material` added for `change_material`; duplicate "Phase 10.6" label resolved (Groups foundation retitled "Phase 10.6a").
- v3.8 — **Phase 10.7 reconciled to reality:** `ObjectPlacer` documented as new/extracted from `ZoneManager._loadObjectMesh` (not an edit to an existing file); stale `WorldObject` interface snippet + Files Modified corrected; `loadModel`/`SkeletonUtils.clone` animation caveats added. Phase 10.9 `change_material` field renamed `materialOverride`→`material`; object-mesh actions (material swap, play_animation) routed through `ObjectPlacer` instead of `ZoneManager`.
- v3.9 — **Phase 10.6b — Local-Space Geometry Storage** added (before Phase 10.7): local-space vertex storage for platforms + polygon floors fixes rotation snap-back / corner-drag; `FloorDef.position` added (`PlatformDef.rotation` already existed); `WorldLoader` local-space migration runs before the 10.8 UV migration; Phase 10.7 ObjectPlacer + Phase 10.8 migration-ordering notes added. Groups name-list foundation relabeled **10.6a** to free the 10.6b slot (10.6 cluster: 10.6 Entity Event System / 10.6a Groups / 10.6b Local-Space).
- v3.9.1 — **10.6a/10.6b/10.7/10.8 coherence pass:** synced canonical `FloorDef`/`PlatformDef` type blocks to reality (`PlatformDef.rotation` + `groupIds` from 10.6a; `FloorDef.groupIds` + new `FloorDef.position`), resolving a contradiction where 10.6b claimed `PlatformDef.rotation` existed but the type block omitted it; clarified that platforms/floors have no `scale` transform; presented the 10.6b migration as the named `_migrateToLocalSpace()` method referenced by 10.8; fixed 10.7 intro to follow 10.6b.
- v3.9.2 — Synced remaining entity interface blocks to the shipped 10.6a `groupIds` field: added `groupIds?: string[]` to the canonical `WallDef`, `StairDef`, `WorldObject`, `TriggerVolume` doc blocks (already present in `types.ts`; doc had only updated `FloorDef`/`PlatformDef`).
- v3.9.5 — **Orphaned-node cleanup (pre-existing bug, surfaced during 10.6b testing).** `removePlatform`/`removeFloor` never deleted a node-backed polygon primitive's corner nodes, so deleted polygons left orphan nodes in `zone.nodes` that `NodeDragger` kept drawing as scattered dots + edge lines (and they persisted after delete). Added `pruneOrphanNodes(zone)` to `WorldLoader` (reaps nodes not referenced by any wall/floor/platform; shared nodes kept); called from `removePlatform`/`removeFloor` and from the load path (`handleLoadFromJSON`, covering both file-open and autosave-restore, so old saves self-clean). `NodeDragger` now also `_refresh()`es on `platform:removed`/`floor:removed` so stale dots clear immediately. Not part of 10.6b's geometry work; tracked here for history.
- v3.9.4 — **Phase 10.6b implemented + scope corrected to match the code.** Investigation found the original "local-space storage for platforms + polygon floors" premise false: polygon floors/platforms are node-backed (`points[]` is a cache regenerated from world-space `zone.nodes` each build), so they never snap back and a `points[]`→local migration would be a no-op (and `FloorDef.position` actively harmful — double offset). The real user-visible bug was a **gimbal flip in `GizmoManager`**: rotate commits read `pivot.rotation.y` (Euler), which wraps past ±90° (135°→45°, 180°→0°), so rotating a platform/room past 90° snapped to a wrong angle on release — affecting rect platforms *and* node-backed polygons (and distorting polygon shape via the AABB `size` recompute). Fixed with a `_pivotYaw()` quaternion-based yaw helper routing all four pivot-yaw reads. Also shipped (separate, smaller): rect Y rotation via `mesh.rotation` instead of baked geometry (`PlatformBuilder`) + collider quaternion mirroring it, CSG-guarded (`ColliderBuilder.registerPlatform`) — fixes the previously un-rotated collider. Reverted the speculative doc additions: removed `FloorDef.position` from the type block and the `_migrateToLocalSpace` migration-ordering note (no geometry migration added). Skip-rebuild optimization deferred (perf-only). Section retitled "Rect Platform Rotation as a Mesh Transform."
- v3.9.6 — **Phase 10.7 — Object Animation Editor implemented (Option B: full extraction), spec corrected to match the code.** Created `src/preview/ObjectPlacer.ts` owning the full placed-object domain — mesh build (transform + userData + `SkeletonUtils.clone` for skinned/animated GLTFs + fallback box) and the animation subsystem (`AnimationMixer`/clip map per object, `update(dt)`, `previewClip`/`stopPreview`, auto-play, lazy back-fill of `assetDef.animations`). `ZoneManager` no longer builds object meshes: `_loadObjectMesh` removed, `loadZone`/`_addObject`/`_removeObject`/`unloadZone` now delegate to `ObjectPlacer` and keep only `objectsGroup`/`objectMeshes` registration for selection; the now-unused `assetManager` import was dropped. `App.tsx` instantiates `ObjectPlacer`, passes it to `ZoneManager`, and registers `scene.onUpdate(dt => objectPlacer.update(dt))` (runs in editor + preview). Three stale spec assumptions corrected: (1) **no `src/ui/screens/` folder** — screens are inline `PropertiesPanel.tsx` components, so `AnimationsScreen` is inline and `"animations"` is appended to an object's `ScreenId[]` only when its asset has clips; (2) **no `WorldLoader._migrate()`** — `autoPlayAnimation?` is optional so old files need no migration, and pre-existing assets' clip names are lazily back-filled by `ObjectPlacer` (plus stored in `manifest.json` at import via `ModelImporterModal`); (3) `worldState.getObject`/`assetManager.getAsset` don't exist (used `assetManager.getAssetDef` + an internal auto-play map). Added `AssetDef.animations?`, `WorldObject.autoPlayAnimation?`, and `animation:preview-start`/`preview-stop`/`auto-play-changed` bus events to `types.ts`. Verified: `npm run typecheck`/`build` clean; data-layer add/remove and sync ZoneManager delegation verified in-browser; async asset-load path could not be exercised in the automation tab (background tabs freeze `fetch`/timers) and needs a foreground tab + an animated GLB for the full preview/auto-play visual check.
- v4.0.0 — **Phase 10.8 — World-Space UV Generation implemented, spec corrected to match the code.** Investigation found the spec's premise false: builders never used Three.js default `0→1` UVs or `texture.repeat` — every builder already baked world-space UVs proportional to physical size (`wrapS/wrapT` set once in `AssetManager`). The *real* bug was an **inverted `tileScale` convention**: `WallBuilder` divided (`len / tileScale` = meters-per-repeat) while `FloorBuilder`/`PlatformBuilder`/`StairBuilder` multiplied (`dim · tileScale` = repeats-per-meter), so the same value behaved oppositely on a wall vs a floor (agreeing only at `1.0`). Fix: created `src/builders/UVUtils.ts` (`applyUVOffset`, `applyProjectedUVs`, `worldUV`) and **unified all builders onto the ÷ convention** (flipped floors/platforms/stairs `×→÷`, incl. the wall's passage-liner reveals which also multiplied). The spec's literal `applyWorldSpaceUVs(geo, w, h)` 4-vertex BL/BR/TL/TR helper was **not adopted** — builders hand-build multi-face indexed `BufferGeometry` (8-vert wall strip; `pushFace`/`pushQuad` per face), so the convention lives at the inline UV call-sites + `worldUV`. Added `offsetX/offsetY` to `MaterialOverrides` (applied via `applyUVOffset` per built geometry, after scale) + an OFFSET row in the PropertiesPanel Material screen (Tile/Tile X/Y/split already existed from before). Migration: added `uvVersion?: number` to `SceneMetadata`, `migrateUVs(file)` in `WorldLoader` (resets legacy `tileScale*`→`1.0`; **not** a nonexistent `WorldLoader._migrate()`), called from `App.tsx`'s load path beside `migrateWallNodes` (**not** in `loadFromJSON` — `HistoryManager` reuses that for already-migrated undo snapshots); `WorldState.toJSON()` stamps `uvVersion: 1` on every save. Verified: `npm run typecheck`/`build` clean.
- v4.1.0 — **Phase 10.9 — Group Functionality + Scripting Cleanup implemented, spec corrected to match the code.** Groups made live: a **Groups accordion** in `PropertiesPanel` (new `GroupsAccordion`, mirrors `ActionsAccordion`) is the first reader/writer of `groupIds`, on the root screen for object/wall/floor/platform/stair **and** inside `TriggerVolumeView` for trigger volumes; it writes via the existing `onObjectUpdate`→`handleObjectUpdate` path (no new mutators — every per-type updater already `Object.assign`s, so it gets undo/redo + selection sync for free). **Group visibility** is an eye-toggle in `GroupPanel` (new `hiddenGroupIds`/`onToggleVisibility` threaded through `LeftPanel`); App tracks a `hiddenGroups` set and emits a new `group:visibility` bus event. **Deviation from the plan's split:** visibility is handled **entirely in `ZoneManager._applyGroupVisibility()`** — it already holds both world data *and* every mesh reference (`objectMeshes` + built-geometry groups), so injecting `WorldState` into `ObjectPlacer` just to toggle `.visible` added complexity for no benefit (a merged wall run hides only when *all* its walls are hidden). Scripting: added `ScriptEngine._resolveTargets(targetId)` (group id → member ids across the active zone; single id otherwise), looped over it in `despawn_object`/`move_object`/`play_animation`/`change_material`; **`show_ui` is NOT group-resolved** (its target is a UI element id, not an entity — the spec listed it in error). `play_animation` emits a new `object:play-animation` event; `change_material` emits `object:updated` with `{ material }`. Both are handled in **`ObjectPlacer`**, which gained a `_meshes` registry (populated in `build`, cleared in `remove`) plus constructor subscriptions — `play_animation` reuses `previewClip`, `change_material` loads via `assetManager.getMaterial` and traverses the object's meshes. Added `WorldObject.material?` (applied on build when set). New `src/preview/FadeOverlay.tsx` renders the long-firing `overlay:fade-in` event (App holds `fadeState`). `ScriptPanel` action editor split out `play_animation`/`change_material` to add the missing clip-name / material-id inputs. **Bulk operations deferred** (Select all/Delete/Duplicate/Move) — they need real `SelectionManager` multi-select, which doesn't exist yet; tracked as a follow-up. Verified: `npm run typecheck`/`build` clean; in-browser pass pending.
- v4.1.1 — **`despawn_object` / `move_object` runtime consumers + DEV test harness.** Found while reviewing 10.9: `despawn_object` emitted `object:despawn` with **no listener**, and `move_object`'s `object:updated{position}` was only applied by `SelectionManager` to the *currently-selected* mesh (dead in preview). Both now handled in **`ObjectPlacer`** (owns object meshes): `object:despawn` hides the mesh + stops its mixer; `object:updated` applies `position/rotation/scale` to any object's mesh via a new `_applyTransformChanges`. Runtime-only — script actions emit raw bus events and never touch `WorldState`, so a zone reload reverts them (editor edits go through `WorldState.updateObject` and persist). Objects carry **no Rapier colliders** (`ColliderBuilder` has no `registerObject`), so only the mesh is touched. Added a DEV-only **`src/dev/testHelpers.ts`** (`window.__test`: `enterPreview`/`enterGame`/`exitPreview`, `fire`, `runAction` → real `_dispatch`, `openPanel` → `leftpanel:open`, `spawnPlatform`/`spawnObject`/`cleanup`), exposed `window.__bus`/`__scriptEngine`/`__preview`, and added an `App` `leftpanel:open` listener so panels are programmatically openable. TESTING.md gained a "Driving preview mode & firing scripts" section. Verified in-browser; typecheck/build clean.
- v4.1.2 — **Script action target picker.** The action **Target** field (despawn/move/change_material/play_animation/open_door/close_door) was a free-text id box; replaced with a new `ActionTargetPicker` dropdown in `ScriptPanel.tsx` — a placeholder + **Groups** optgroup + **Objects** optgroup (preserves a hand-entered/cross-zone id as a "(custom)" option). `groups` is threaded `App → LeftPanel → ScriptPanel → ScriptEditor → ActionRow → ActionFields`. Also gave `move_object` its missing **X/Y/Z position** inputs (it had none in the UI). Verified end-to-end in-browser: picking a group writes `targetId`, and `on_game_start` → `despawn_object` on that group hid the member. (The `WrongDocumentError: ... pointer lock` console line when entering game *programmatically* is an automation-context artifact, not a code bug.)
- v4.1.3 — **Trigger volume Y-rotation.** `TriggerVolume` gained `rotation?: Vec3` (Y = yaw degrees, matching `PlatformDef`). The rotate gizmo already attached to volumes and previewed live but **discarded the rotation on release** (no `trigger-volume` case in `GizmoManager._commitRotate`); added that case (stores absolute `pivotYaw`, mirrors the rect-platform path) plus reading `vol.rotation.y` in `_attach`/`_reattachMeshes` so the ring resumes from the current angle. Rotation now applies to the wireframe (`ZoneManager._buildVolumeMesh` `wire.rotation.y`), the **Rapier sensor** (`ColliderBuilder.registerVolumeSensor` `setRotation` quaternion, mirroring `registerPlatform`), and picking (`TriggerVolumeTool._findVolumeAt` inverse-rotates the ray into the box's local frame — an OBB hit-test without OBB math). Verified in-browser: rotating to 45° gave wireframe yaw π/4, sensor quat (y=0.383,w=0.924), persisted in `toJSON`, and a rotated volume is still click-selectable.
- v4.1.4 — **Trigger volume rotation — actually reachable now (fixes v4.1.3 gap).** v4.1.3 wired the commit/render/physics/picking but missed the entry points, so rotation was uninvokable: (1) `GizmoManager`'s **KeyR** handler gated rotate mode to `platform|stair|wall|object` — added `trigger-volume`, so pressing **R** on a selected volume now switches the gizmo to rotate (verified: TransformControls mode `translate→rotate`, rings render); (2) added an editable **ROTATION (Y°)** input to `TriggerVolumeView` (was absent) wired through the existing `onObjectUpdate`→`updateTriggerVolume` path (verified: typing 30 + Enter → data=30, wireframe yaw=30°, sensor quat y=0.259/w=0.966). v4.1.3's "rotate gizmo attaches" claim was wrong — that screenshot was the translate gizmo.
- v4.1.5 — **Spawn-point move never saved (bug fix).** Dragging the player spawn gizmo appeared to work but was silently discarded — `GizmoManager._onDragEnd` bailed on `!this._selZoneId`, and the spawn marker is world-level with `zoneId === ""` (falsy), so `_commitTranslate` never ran. Result: `world.defaultSpawn` was never updated, so the move didn't persist to JSON and Start Game used the old position. Fixed the guard to require only `_selId`/`_selType` and skip the zoneId check for `spawn`; the spawn commit now also emits `spawn:updated` so the marker stays synced to committed data (parity with the panel `handleSpawnPositionChange` path). Verified in-browser: simulated drag → `defaultSpawn` (1,0,1)→(4,0,3), `toJSON` carries it, and `enter("game")` spawns the body at (4,0.9,3).
- v4.1.6 — **Spawn point: facing cone + rotatable.** The spawn marker (`SpawnPointTool`) is now a parent `Group` (positioned at the spawn foot, `rotation.y = facingDeg`) holding the up-arrow post, ground ring, and a new **facing cone** midway up pointing in the start-look direction (local `-Z`, matching `CharacterController` where `facingDeg 0 = -Z`). Made the spawn **rotatable**: added `spawn` to `GizmoManager`'s KeyR allow-list, an `_attach` branch seeding pivot yaw from `defaultSpawn.facingDeg`, and a `_commitRotate` `spawn` case writing `facingDeg = radToDeg(pivotYaw)` via `setDefaultSpawn` + emitting `spawn:updated`. The `spawn:updated` handler now re-syncs the marker's position **and** facing from world state (authoritative). Verified in-browser: rotate gizmo → `facingDeg` 0→90, persisted in `toJSON`, cone world-forward `(-1,0)` == player forward at game start (`_yaw` 90°). Builds on the v4.1.5 `_onDragEnd` spawn-commit fix.
- v4.1.7 — **Spawn rotation drift fixed.** Repeated spawn rotations snapped to random degrees after one or two — the same stale-pivot class of bug already solved elsewhere. Every other rotatable type re-seeds the gizmo after each commit via a rebuild/update event → `GizmoManager._reattachMeshes` (resets pivot to a clean `(0, yaw, 0)` and refreshes `_trackedMeshes`); the spawn had no such event/branch, so its pivot quaternion + cached tracked-mesh transforms went stale and the next live-rotate read garbage. Fix (mirrors the `triggervolume:updated` pattern): added a `spawn:updated` listener in `GizmoManager` that calls `_reattachMeshes()` when the spawn is selected (matched on `_selType`/`_selId`, since `_selZoneId` is `""`), plus a `spawn` branch in `_reattachMeshes` that re-seeds pivot position + `facingDeg` from `defaultSpawn`. Verified in-browser: 4 consecutive rotations (90→180→−45→5, crossing past 180°) accumulated exactly, pivot tilt stayed 0, persisted in `toJSON`.
- v4.1.8 — **Spawn rotation drift, second attempt (v4.1.7 was insufficient).** v4.1.7's synchronous `_reattachMeshes` did not fix the real gizmo drag (only a synthetic dispatch test, which doesn't reproduce TransformControls' live drag). Re-analysis: the differentiator from the *working* types (platform, trigger-volume) is **not** reattach timing — trigger-volume also reattaches synchronously — but that they rebuild a **fresh mesh** on commit, whereas the spawn reused one persistent marker that accumulates stale transform state, and the reattach depended on listener order with `SpawnPointTool`. Change: (1) `SpawnPointTool` now **rebuilds the marker fresh** on `spawn:updated` (mirrors ZoneManager rebuilding the volume wireframe); (2) `GizmoManager` **defers** the spawn `_reattachMeshes` to a `queueMicrotask` so it runs after the fresh marker exists and after TransformControls' drag-end unwinds, then `_updateMeshOffsets` re-tracks the clean marker. **Reasoned, not yet verified against a real gizmo drag** (gizmo dragging can't be driven from the test harness — pending user confirmation).
- v4.1.9 — **Object script indexing fixes (interact / on_game_start never fired).** Diagnosed "E does nothing on the bunny": the script's trigger was left at the default `on_game_start` (not `on_interact`) — but *also* a real bug: `ScriptPanel.addScript` stamped `trigger.targetId = selectedObjectId` onto the default target-less trigger, so `ScriptEngine.loadZone` keyed it `on_game_start:<objId>` while `fire("on_game_start", null)` looks up the wildcard → it never fired either. Fixes: (1) `addScript` no longer sets `targetId`; (2) `loadZone` now normalises per-object triggers — `on_interact` → `targetId = obj.id` (keys `on_interact:<objId>`), target-less triggers with a stale `obj.id` get it stripped (→ wildcard). Verified against the real scene: the bunny's `on_game_start` now fires on Start Game (keys `on_game_start:*`), and switching it to `on_interact` keys `on_interact:<objId>` and plays the Death clip on E. Also: `ObjectPlacer.previewClip` now `console.warn`s (with available clip names) instead of failing silently, and `window.__objectPlacer` is exposed in DEV. **Note (not fixed here):** the Scripts-panel edit lag is `HistoryManager.record()` deep-cloning the whole world (`toJSON()`) twice per edit — a snapshot-undo tradeoff, separate change if optimised.
- v4.2.0 — **Undo/redo redesigned: transaction + per-entity diff (replaces whole-world snapshots).** The old `HistoryManager` deep-cloned the entire world (`JSON.parse(JSON.stringify(toJSON()))`) per entry and restored via full `loadFromJSON` — `O(world)` time/memory, the Scripts-panel lag, and (worse) **incomplete coverage**: gizmo commits, node drags, spawn placement, and group ops bypassed it, so undo "did nothing / undid too much." New model: `WorldState` owns a **change journal** — every mutator calls `_touch(kind,zone,id)` (deep-clones only that entity, first-touch-wins); `transaction(label, fn)` / `beginTransaction`/`commitTransaction`/`abortTransaction` group a gesture into one `HistoryEntry { label, changes[] }` (drops no-op/unchanged keys, `O(touched entities)`). `_applyChanges(changes, dir)` replays per-entity diffs (mutate-all-then-emit the existing `*:added/updated/removed`/`node:updated` events) so `ZoneManager` rebuilds only affected meshes — no full reload. `HistoryManager` is now a thin command stack. Coverage is automatic: `GizmoManager._onDragEnd` wraps the commit in `world.transaction`; `NodeDragger` brackets drags with begin/commit/abort; tools/App handlers/`OpeningDragHandler` use `world.transaction` instead of `history.record`. Cascades captured: `pruneOrphanNodes` journals removed nodes (delete polygon floor → undo restores floor + nodes); ZoneManager's run-mate wall sync routed through `updateWallSegment` (segmentOnly, no re-sync loop) so undo restores all run-mates. Verified at the data layer: add/update/remove undo+redo, **interleaved edits undo one logical change at a time** (not "everything"), gizmo gesture = exactly one entry. `window.__history` exposed in DEV.
- v4.2.2 — **Copy / paste / duplicate (Cmd+C / Cmd+V / Cmd+D), all types incl. node-backed.** New `src/editor/copyPaste.ts`: `copySelection` deep-clones the selection (entity, or the whole `runWalls` run, plus the referenced corner/endpoint **nodes**, deduped) into a self-contained `Clipboard`; `pasteClipboard` regenerates ids per type (`obj_`/`plat_`/`stair_`/`wall_`/`vol_`+uuid8, floors/nodes full uuid), clones referenced nodes with fresh ids and **remaps** `startNodeId`/`endNodeId` / `floorMesh.nodeIds` / `platform.nodeIds`, offsets positions/points, regenerates `openings[].id`, and adds everything inside `world.transaction("paste")` — so paste is **undoable in one step** (incl. its cloned nodes) and pasted polygons get fresh nodes (editing a copy never moves the original). Mirrors the existing `handleCopyRunToFloor` node-remap pattern. `App` holds `clipboardRef` + a cascading paste offset, wires `handleCopy/handlePaste/handleDuplicate` to Cmd+C/V/D (skipped while typing in inputs / in preview), and emits `tool:placed` so the pasted entity auto-selects. Scripts copy as-is (`on_interact` re-targets to the new object via ScriptEngine.loadZone; other action `targetId`s keep originals). Single-selection for now (multi-select copy needs the deferred SelectionManager multi-select). Verified at the data layer for object/wall/polygon-platform incl. **disjoint cloned nodes** + one-step undo/redo of the wall+nodes; `window.__copyPaste` exposed in DEV.
- v4.2.3 — **Modifier-key guard for editor movement / gizmo-mode keys.** Cmd+D (duplicate) also panned the editor camera because `D` is a WASD key — `EditorCamera._handleKeyDown` recorded held keys without checking modifiers. Same class of bug let Cmd+S/Cmd+R flip the gizmo's T/R/S mode. Fix: `EditorCamera` ignores movement keys when `metaKey||ctrlKey` is held; `GizmoManager`'s `input:keydown` (T/R/S) bails on `ctrl||meta`; added `meta` to the `input:keydown` bus payload (`InputManager`) so consumers can see Cmd. Verified: Cmd+D no longer registers `KeyD` for the camera while plain `D` still pans.
- v4.2.4 — **Stair railings reworked into real, configurable railings.** The old railing was a single `BoxGeometry(railT, railH, horizDist)` per side, only yaw-rotated — so it rendered as a flat horizontal slab cutting through the stairs (length was the *horizontal* run; it was never pitched up the slope). `StairBuilder` now builds an **open railing** per side from a slope-aligned orthonormal basis (`makeBasis`: x→up-slope, z→side, y→perp-up): a top rail spanning first→last step **nosing** (no overhang) plus **vertical balusters anchored at the centre of each step's tread** (local x = 0), so posts sit on the tread rather than overhanging the nosing and never float (verified: post bottoms land exactly on every step top 0.2…3.0; post centres match each tread centre). Made fully configurable via new optional `StairDef.railing` (`StairRailingDef`: `topRail`/`balusters` toggles, `height`, `stepInterval` = a post every N steps with the top step always included, `barThickness`, `postThickness`, `sideInset` = inward offset from the step's side edge so balusters sit on the tread instead of overhanging the side — `localZ = side·max(postT/2, hd − sideInset)`; `overhang` = how far the top rail extends past the end posts each end, added as `2·overhang` to the rail length about its fixed midpoint so the end posts don't move); absent → defaults (0.9 / every step / 0.1 / 0.06 / 0.1 / 0.15) so existing stairs are unchanged. `StairGeoView` gained a `RAILING` sub-section (the two toggles + four numeric inputs) writing through the existing `onObjectUpdate`→`updateStair` path (undo/redo + autosave for free). Verified in-browser: toggles/interval/height drive the rebuild and persist in `toJSON()`.
- v4.2.5 — **Configurable stair underside / stringer.** Stairs were free-floating per-step boxes with an open stepped underside; added `StairDef.underside` (`StairUndersideDef`: `mode` + `thickness`) with three modes built mode-gated inside the existing `StairBuilder` per-step loop (into the `body` accumulator, body material): `open` (default, unchanged), `diagonal` (solid wedge — side trapezoids + one slanted soffit offset below the nosing line by `thickness`, plus a sub-floor front cap and a back cap), `closed` (same but underside flat at the floor `y=start.y`). Side-bottom local-y is constant across steps so the soffit tiles watertight; `effThk = max(thickness, stepRise·1.001)` keeps the plane clear of the inner step corners. Colliders untouched (per-step, visual-only change). New `UNDERSIDE` panel section in `StairGeoView` (segmented Open/Diagonal/To-floor buttons reusing the COPY-TO-FLOOR styling + thickness input shown only for diagonal), written via `onObjectUpdate`→`updateStair` (undo/redo + persist for free). Verified in-browser per mode: open=150 body tris (regression-identical), diagonal=124 (minY −0.1, all-slanted soffit normals), closed=122 (minY 0, flat soffit); side-view screenshots confirm the diagonal bottom edge and the to-floor solid.
- v4.2.6 — **Continuous stringer UVs.** In `diagonal`/`closed` underside modes each step's side trapezoid + soffit were built with `pushQuad`, which hard-codes UVs from `(0,0)` per quad — so the body texture **restarted every step** and read as one tile repeated up the panel. Added a `pushQuadUV` helper (explicit per-corner UVs) and switched the stringer side + underside faces to **continuous world-space UVs** (sides: u = run distance, v = world height; soffit: u = run, v = width), so the texture flows across the whole stringer. Treads/risers/caps and the `open` mode are unchanged. Verified: diagonal-mode body `maxU` jumps from ~one step's worth to the full run length, side-view shows continuous concrete.
- v4.2.7 — **Diagonal stringer: `thickness` redefined as clearance, deeper default.** The diagonal soffit sat too close to the steps because `thickness` was the drop below the *nosing line*, of which `stepRise` is consumed just clearing the inner step corners — so `thickness 0.3` left only ~0.1 of visible gap. Redefined `thickness` to mean the **clearance below the step undersides** directly (internal `effThk = thickness + stepRise`), so the control maps 1:1 to the gap the user sees, and bumped the default 0.3 → 0.25. The front nose now dips `thickness` below the floor (closed by the existing front cap). Verified: diagonal `minY = −thickness` (−0.25 at default).
- v4.2.8 — **Stair HEIGHT / LENGTH / ROTATION inputs (alternate dimension entry).** Stairs were only editable via the raw START/END points, so setting a specific rise/run or bearing meant hand-computing the end coordinate. Added three inputs to `StairGeoView` (a `H · L · R°` row under START/END) that are **two-way bindings on the existing `end` point** — no schema change, no `StairBuilder`/collider/copy-paste change, no migration: `height = end.y − start.y` (rewrites `end.y`, honoring the existing "Link end-Y to steps" toggle), `length = hypot(dx,dz)` (rewrites `end.x/z` along the current bearing), `rotation = atan2(dz,dx)°` (rewrites `end.x/z` at the current length, pivoting about START). Backed by a `stairDims(start,end)` helper; the panel's sync effect now watches `start` **and** `end` (previously end-only) so the H/L/R **and** the START row stay live when the gizmo moves/rotates the stair. All writes go through the existing `onObjectUpdate`→`updateStair` path (undo/redo + autosave for free). `start`/`end` remain the stored source of truth.
- v4.2.9 — **NodeDragger mutes picking during a gizmo drag (fixes nodes snagged by rotate/move).** `TransformControls` and `InputManager` both listen on the canvas, so pressing a gizmo ring that sits over a node dot from another floor/platform behind it fired `input:mousedown` into `NodeDragger`, which grabbed that node — then the gizmo rotate/move drag dragged it around the whole gesture. `NodeDragger` now subscribes to the existing `gizmo:dragging` event (already consumed by `EditorCamera`/`SelectionManager`) and sets a `_gizmoActive` flag that early-returns out of `input:mousedown` **and** `input:mousemove`. `gizmo:dragging` fires on `TransformControls` **pointerdown**, before the compat `mousedown` that drives `input:mousedown`, so the flag is set in time. Guard: `NodeDragger` re-emits `gizmo:dragging` for its *own* node/edge drags (state is already `"DRAG"` by then), so the listener sets `_gizmoActive = isDragging && _state !== "DRAG"` to avoid a node drag muting itself.
- v4.3.0 — **Trigger volumes: optional configurable "warp box" fill (visible in preview + game).** Trigger volumes rendered only as an editor-only amber wireframe (`hideInGame: true`); added an optional in-world gradient fill. `TriggerVolume` gained `visual?: TriggerVolumeVisual` (`{ enabled, style:"gradient", color, fadeDir:"up"|"down", opacity, fadeHeight (0..1 fraction of box height), animate }`) — `style` is a discriminator so more fill styles can be added later. New `src/world/volumeFillMaterial.ts` builds a `ShaderMaterial` that computes alpha from local height in the fragment shader, **driven entirely by uniforms** (uColor/uOpacity/uFadeDir/uFadeHeight/uSizeY/uTime/uAnimate) so color/fade/opacity/animation change without rebuilding geometry. `ZoneManager._buildVolumeMesh` builds the fill via new `_buildVolumeFill` as a **sibling** of the wireframe in the zone group (NOT a child — so the game-mode `_setHideInGameVisible` traversal hides the `hideInGame` wireframe while the fill, untagged, stays visible); tracked in new `_volumeFills` map + `_animatedVolumeMats` set, disposed in `_removeTriggerVolumes`/`_removeSingleVolume` via `_disposeFill`. Animation: new public `ZoneManager.updateVolumeVisuals(dt)` (bumps `uTime`, early-returns when nothing animated) registered in `App.tsx` alongside `objectPlacer.update` via `scene.onUpdate`. New **VISUAL** section in `TriggerVolumeView` (enable checkbox seeds a default; color/fade/opacity/gradient-height/animate controls) writes the full `visual` object through the existing `onObjectUpdate`→`updateTriggerVolume` shallow-`Object.assign` path (undo/redo + autosave for free). Highlight refresh (`_refreshVolumeHighlights`) is untouched — it only iterates the wireframe map. Verified in-browser: fill builds (wireframe LineBasicMaterial + fill ShaderMaterial), **in game the wireframe hides and the fill stays visible** (core check), all knobs update the shader live and persist in `toJSON`, `uTime` advances when frames run, disable disposes the fill + empties the animated set, and the real select→panel→Animate-checkbox click landed `animate:true` in the data.
- v4.3.1 — **`despawn_object` extended to every entity type (picker + runtime).** Building on the `store_position`→`object position` source already accepting any positioned entity (`ScriptEngine._resolveObjectPose`), the `despawn_object` action now targets **platforms, stairs, walls, floors, and trigger volumes** too — not just model objects. UI: `ActionTargetPicker` (`ScriptPanel.tsx`) gained optional `zonePlatforms`/`zoneStairs`/`zoneWalls`/`zoneFloors`/`triggerVolumes` props rendered as extra optgroups; **opt-in per action** — only `despawn_object` passes them (via a new `despawnTargetPicker`), while `move_object`/`change_material`/`play_animation` stay object-only because their runtime (`ObjectPlacer`) only touches object meshes, so widening their pickers would add dead options. `zoneStairs`/`zoneWalls`/`zoneFloors` are threaded `App → LeftPanel → ScriptPanel → ScriptEditor → ActionRow → ActionFields` (platforms/checkpoints/volumes were already threaded). Runtime: objects are still despawned by `ObjectPlacer`; **everything else is handled in a new `ZoneManager` `object:despawn` listener** (`_despawnEntity` → `_setEntityHidden(id, true)`) that owns the non-object meshes/colliders — it hides the mesh(es) and calls `collider.setEnabled(false)` (a disabled volume sensor also stops firing enter/exit via `TriggerSystem.intersectionPairsWith`). A merged wall run hides as a unit (a wall id shares its `RunEntry` with the rest of the run). Because exiting preview does **not** rebuild the zone (`preview:stop` only re-shows editor-only/hideInGame meshes), despawned ids are tracked in `_despawnedIds` and reversed by `_restoreDespawned()` on `preview:stop` so entities reappear (and colliders re-enable) in the editor rather than staying hidden. Group despawn was already fanned out to all entity types by `ScriptEngine._resolveTargets` but previously no-op'd for non-objects — this listener also fixes that. Verified in-browser: despawning a platform + a trigger volume in preview set `visible=false` and disabled both colliders, and exiting preview restored visibility + re-enabled both and cleared the tracking set. **Not changed:** `ObjectPlacer`'s pre-existing object despawn still isn't restored on preview:stop (objects stay hidden after exit) — left as-is to keep this change surgical.
- v4.3.2 — **Thumbnail quality overhaul + re-stage modal.** Auto-generated asset thumbnails were often too dark (0.7 ambient + one directional over a `0x1e1e1e` background), off-center/tiny (fixed camera at `(3.5, 2.45, 3.5)` over a normalize-to-2-units scale hack), or **missing entirely on bulk imports** (a fresh `WebGLRenderer` per model exhausts the browser's WebGL-context pool — `dispose()` alone doesn't release contexts). `thumbnailRenderer.ts` reworked: (1) a **shared lazy offscreen renderer** (`getRenderer()` singleton + exported `releaseThumbnailRenderer()` which also calls `forceContextLoss()`; `ModelImporterModal` releases after the import loop), (2) a **`ThumbnailStage` class** — neutral rig (hemi 1.2 / key 2.0 / fill 0.6, background `0x2e2e33`) + camera **fitted to the model's bounding sphere** (`dist = r/sin(fov/2)·1.06/zoom`, lookAt bbox center, near/far derived from dist) so any model is centered and framed regardless of size or origin offset, parameterized by `StageParams {yaw,pitch,zoom,light}`; `renderModelThumbnail(root)` is now a one-shot `ThumbnailStage` render at `DEFAULT_STAGE` (256² PNG, up from 128²). New **`src/ui/ThumbnailStagerModal.tsx`**: after import, **Manage → check exactly one asset → 📷** opens a stager — live preview (drag-to-orbit / scroll-to-zoom pointer handlers re-render the stage into an `<img>` per gesture; Zoom + Light sliders; Reset view) — loading the model via `assetManager.loadModel(id)`. **Save Thumbnail** hands the PNG data URL to `App.handleSaveThumbnail`, which via `ensureDir(modelsDir)` writes `<base>_thumb.png` (reusing the asset's existing thumbnail filename when present), patches `manifest.json`'s `thumbnail` to the clean path, and updates in-memory state with a **`?v=<Date.now()>` cache-buster** so the grid `<img>` refreshes in-session (manifest stays clean). `dataURLtoArrayBuffer` moved from `ModelImporterModal` into `thumbnailRenderer.ts` (shared with App). Threading: `AssetBrowser.onRestage` → `LeftPanel.onRestageAsset` → App `stagingAsset` state. Import-time flow deliberately stays automatic (a per-model modal would make bulk imports painful) but uses the same improved rig. Verified in-browser: a formerly pitch-black armchair renders clearly lit/centered in the stager, orbit/zoom/light re-render live, and the full save chain (thumb PNG bytes + manifest patch + `?v=` tile refresh) verified against a `showDirectoryPicker` stub backed by OPFS (real-folder write needs the native picker — same `createWritable` API, human pass pending).
- v4.3.3 — **Skeleton-safe `AssetManager.loadModel` (fixes the "phantom animal" placement ghost).** Placing a freshly-imported rigged animal showed a stuck "nonsense" copy that ignored the cursor and only vanished on Escape — that was the `ObjectTool` **ghost**: `loadModel` returned `gltf.scene.clone()`, and a plain `.clone()` of a `SkinnedMesh` keeps `skeleton` bound to the **cached source scene's bones**, which are never in the render scene and never get matrix updates — so the ghost rendered frozen at the source skeleton's pose/position no matter where `ghost.position` moved (static furniture .glbs clone fine; glb-vs-gltf was a red herring — it's static vs skinned). `ObjectPlacer` was already correct (`SkeletonUtils.clone`, v3.9.6); the fix moves the same treatment into `loadModel` via a private `_cloneScene()` (traverse for `isSkinnedMesh` → `SkeletonUtils.clone`, else plain `.clone()`), fixing every `loadModel` consumer at once — placement ghost **and** `ThumbnailStagerModal` (which loads rigged models through the same path). OBJ path untouched (never skinned). Supersedes v3.9.6's "no `loadModel` change needed" note. Verified in-browser with `horse.gltf` (8 skinned meshes): all 8 cloned skeletons' bones are descendants of the returned root (was 0), the translucent ghost follows the cursor, one click places one real horse (13 clips listed), Esc clears only the ghost.
- v4.4.0 — **Attached colliders on placed objects (objects finally solid + per-object sensors).** `AssetDef.collidable`/`colliderType` were manifest-only dead fields — objects had zero Rapier colliders, so the game character walked through every prop. New `WorldObject.colliders?: AttachedCollider[]` (`{id, shape:"box"|"sphere"|"capsule", offset (local pre-scale), size (per-shape semantics), rotationY?, isSensor}`; `undefined` → **implicit auto-box** fitted from the model's local AABB when `asset.collidable`, `[]` → explicitly none — so every existing placed collidable object became solid with no data migration). Pieces: **`src/physics/attachedColliderMath.ts`** (`defaultColliderFromAABB`, `colliderWorldTransform` — object quat × local yaw, offsets/extents scaled componentwise in the collider's local frame; approximation documented for rotY≠0 under non-uniform scale) shared by physics + editor so they can't drift; **`ColliderBuilder.registerAttachedColliders(obj, colliders)`** (cuboid/ball/capsule; `isSensor` → `createSensorCollider`); **`ObjectPlacer.build`** stashes the pre-transform `Box3` as `mesh.userData.localAABB` + exposes `getLocalAABB(id)` (fallback box = unit AABB); **`ZoneManager`** owns the lifecycle like every other collider map (`ZoneEntry.objectColliders`, `_buildObjectColliders`/`_removeObjectColliders`, built in `loadZone`+`_addObject` after the async mesh build, rebuilt on `object:updated` transform/collider changes via a `{...obj, ...changes}` merge so runtime-only script moves carry colliders, removed in `_removeObject`/`unloadZone`, `_setEntityHidden` object case for despawn + preview:stop restore); sensor handles join **`_volumeSensors`** keyed to the object id so `TriggerSystem` → `trigger:volume-enter/exit` → ScriptEngine `on_player_enter/on_player_exit` work unchanged (`loadZone` object-script normalization now also stamps `targetId=obj.id` for those two triggers — previously it *stripped* them, which would have silently broken object sensor scripts). KCC blocking needed zero character changes (`computeColliderMovement` already collides with all non-sensor fixed colliders). UI: **"Colliders" screen** in the PropertiesPanel object drilldown (`OBJECT_SCREENS.object += "colliders"`; implicit state shows "auto box" + Customize / Remove-collision; explicit list = per-collider card with shape segmented buttons (`reshapeCollider` keeps ~volume when switching), OFFSET/SIZE/ROT-Y° draft fields debounced 300ms, Sensor checkbox, ✕ remove, + Add; App's object branch now mirrors edits into `setSelected` and passes `defaultColliderFor` from the placer AABB). **`src/editor/ColliderEditor.ts`** (modeled on TriggerVolumeResizer): cyan (solid) / amber (sensor) wireframes on the selected object incl. the implicit auto-box, 6 push/pull face handles per **box** collider with full-3D axis-constrained plane projection (opposite face pinned, snap 0.5 / MIN 0.1 / Alt = free), writes the full `colliders` array per move inside a transaction — dragging the implicit box **materializes** it; new **`collider:handle-hover`** bus event → GizmoManager suspends TransformControls while a handle is hovered (TC's invisible pickers otherwise blanket small objects and steal every grab — found live when the test desk kept translating instead of resizing). Import modal checkbox relabeled "auto box collider from model bounds". Verified in-browser (desk on a platform): auto-box registers on place (+1 collider, correct AABB), held-W character clamps at the box face (z=5.614 for face 5.39 + capsule radius), `colliders:[]` walks through, sensor doesn't block + enter/exit scripts flip `gameState` both ways, panel Colliders screen live-edits (typing W=3 updated data + wireframe scale in one debounce), handle drag through the module's real handler chain resized with exact face-pinning (1.82→3.5 snapped, offset +0.84) and one-step undo restored it, remove/unload returns the collider count to baseline. **Known limits:** thin/hollow props get a solid auto-box (customize per object); clicking through a scene-spanning trigger volume still selects the volume over an object behind it (pre-existing TriggerVolumeTool click priority, untouched).
- v4.4.1 — **Collider editing UX: gizmo suspend toggle, per-collider move gizmo, per-collider editor visibility.** v4.4.0's collider handles sit right on top of the object's own TransformControls on typical props; three editor-session toggles fix the pile-up (no schema/persistence changes — all state resets when the Colliders screen closes or the selection changes). (1) **"Hide object move gizmo while editing colliders"** checkbox at the top of the Colliders screen → new **`gizmo:suspend { source, suspended }`** bus event; `GizmoManager` now gates controls through `_applyControlsEnabled()` (game mode wins, then a **Set of suspend sources**, then the transient `collider:handle-hover` mute — the old direct enabled writes in the hover/preview handlers are folded into this). (2) Per-collider **Move** button → **`collider:move { objectId, colliderId|null }`**; `ColliderEditor` owns a second, smaller (`setSize(0.5)`) translate-only `TransformControls` attached to a proxy `Group` at the collider's world center — `objectChange` converts proxy world pos → object-local pre-scale `offset` (inverse object quaternion, ÷ scale, 3-dp) and writes the full `colliders` array (materializes the implicit auto-box like the face handles); `dragging-changed` brackets a `"move collider"` transaction + relays `gizmo:dragging` so SelectionManager/NodeDragger/camera mute as usual; activating it also emits `gizmo:suspend(source:"collider-move")` so the object gizmo gets out of the way automatically. (3) Per-collider **👁 eye** → **`collider:hidden { objectId, hidden[] }`**; hidden ids skip wireframe+handle builds in `_sync` (physics untouched — display only), card dims to 0.55, and hiding the move-gizmo'd collider drops its gizmo. Panel state lives in `CollidersScreen` (unmount cleanup emits suspend-off/move-null/hidden-empty; `ColliderEditor._resetPanelState()` mirrors on selection/zone change); `object:updated` re-sync now also skips while `_moveDragging` (the move handler calls `_positionAll()` inline). Verified in-browser (2-collider test object): checkbox removes the object gizmo, Move shows the small gizmo on the right collider, eye hides only the sensor's amber wireframe/handles + dims its card, a **real mouse drag** on the collider gizmo's Y arrow moved `offset.y` 0.46→1.688 while the object position stayed put (suspension held), and one Cmd+Z restored it.
- v4.4.2 — **Generous object picking (clicks no longer thread through props).** Low-poly models are full of gaps (between an animal's legs, under a desk top, through a chair back), so SelectionManager's precise triangle raycast frequently missed the prop the user was visibly clicking and selected whatever was behind it. New **`src/editor/objectPicking.ts`** — `castObjectBoxes(ray, scene)`: for every visible selectable object root, slab-tests the ray against the **cached model AABB** (`userData.localAABB`, stashed by ObjectPlacer since v4.4.0) as an oriented box in world space (ray → object-local via inverse `matrixWorld`, entry point back to world for a distance comparable with mesh hits); scratch vectors, hits sorted nearest-first. **`SelectionManager._cast`** merges these synthetic `Intersection`s ({distance, point, object: root}) into the real hits and re-sorts — entering an object's box counts as hitting the object, while anything genuinely closer (a wall in front, a nearer object) still wins on distance, and `_pickByPriority`'s coplanar tiebreak already ranks `object` above `platform`. Applies to hover tint too (same `_cast`). **`TriggerVolumeTool._findVolumeAt`** gained the matching occluder clause: a box hit closer than the volume entry blocks the volume pick, so a gap-click inside a scene-spanning volume's footprint selects the prop instead of the volume (the existing mesh-occluder rule — platforms/objects block, floors/walls stay see-through — is unchanged). Verified in-browser: clicking between the husky's legs now selects the **husky** (previously the trigger volume / platform behind), clicking the sofa's box selects the sofa, bare-platform and empty-ground clicks still select the platform / the volume. (Also learned: the Chrome-extension screenshot is downscaled vs the client — clicks aim in screenshot space, so pixel targets from projections must divide by `clientWidth/1400`-style factors; earlier "misses" in testing were this, not picking bugs.)
- v4.5.0 — **Wall segment tools: right-click vertex insert, per-segment visibility, segment-row hover highlight.** (1) **Split:** new **`src/editor/WallSplitter.ts`** (`IEditorModule`, registered in App) — a *stationary* right-click on a wall with the Select tool inserts a vertex at the clicked point, splitting that wall into two connected segments sharing a new node. Plumbing: InputManager now emits **`input:rightclick`** from `mouseup` button 2 when the press+release stayed under the 5px `_DRAG_THRESHOLD` (DOM `click` never fires for RMB), so RMB camera orbits — which always move — never trigger it. The splitter raycasts wall meshes (solid hits preferred over ghosts), maps the hit to the nearest run segment (point-to-segment in XZ across `userData.wallIds`), projects the click onto the segment axis, refuses splits within 0.15m of a node, then in one `"split wall"` transaction: `addNode` (exact projected point, on-axis), `updateWallSegment(wallId, { endNodeId: newNode, openings: keepA })`, `addWall({...wall, id: wall_<uuid8>, startNodeId: newNode, openings: moveB })` — openings stay with the half containing their centre, second-half offsets re-measured from the new node (`offset -= splitDist`). Emits `tool:placed` for selection + history-UI sync; the two halves re-merge into the same run (same props, shared degree-2 node), so the mesh is visually unchanged until the new vertex is dragged (NodeDragger, unchanged). (2) **Per-segment visibility:** new **`WallDef.hidden?: boolean`** (persisted). A hidden segment stays in `zone.walls` and its run (room configuration, floor fills, `resolveRunNodeIds`, zone membership all unaffected) but is physically gone: `WallBuilder.buildRun` routes its 4 faces into a separate **ghost index buffer** instead of the solid geometry, registers **no colliders** for it, skips its openings (no CSG/trim/trigger meshes), and `ZoneManager._registerDoorSensors` skips it; a generalized **cap rule** replaced the old open-run endcap block (cap at every visible/hidden or run-end boundary — degenerates to exactly the old two endcaps for all-visible open runs; verified 28→32→36 tri counts). The ghost renders as a translucent editor-only mesh (`makeGhostMaterial()`: 0x7aa2ff, opacity 0.12, no depthWrite/shadows) tagged `userData.ghostPick + hiddenWall`, pushed into `trimMeshes` so run rebuild/removal disposes it; `WallBuilder.build` (single wall) swaps the whole mesh to ghost material instead. **`ZoneManager._setHiddenWallGhostsVisible`** hides ghosts on `preview:start` and restores on `preview:stop` (both preview and game). **Ghost-aware picking:** `SelectionManager._cast` and InputManager's `surfacePos` prefer non-`ghostPick` hits — ghosts never occlude real geometry (dollhouse click-through), but clicking a ghost over empty space still selects its run, so fully-hidden walls stay recoverable. UI: each `WallSegmentRow` gets a **👁 toggle** (`onUpdate({hidden})` → `updateWallSegment`, segmentOnly so run-mate sync never propagates it) + dimmed card + HIDDEN badge; `hidden` is deliberately NOT a `canMerge`/run-sync criterion. (3) **Hover highlight:** new **`src/editor/SegmentHighlighter.ts`** — `WallSegmentRow` mouseenter/leave emits **`wall:segment-hover { zoneId, wallId|null }`** (panel already holds `bus`; unmount cleanup emits null), and the module overlays a translucent box (0x4d8cff, 0.35, +0.06 inflate) on that segment computed from nodes + height/thickness/elevation — an overlay because a merged run is one mesh and can't be tinted per-segment; cleared on null/`object:deselected`/`wall:removed`. Verified in-browser end-to-end (real right-click through InputManager, real panel clicks): split at (13.2,0) on a 3-wall run → 4 walls/1 mesh/4 colliders/36 tris, `"split wall"` undo entry; eye-hide → colliders 4→3, main 32 tris + 12-tri ghost, gap visible with capped ends, ghost invisible in preview & restored on exit, gap click re-selects run via ghost fallback; unhide restores 36/4/no-ghost; hover row → box at segment midpoint, cleared on mouseout.
- v4.5.1 — **Fix: duplicate/orphan wall meshes after undoing a split (+ split feedback flash).** Undoing a wall split emits `wall:updated` + `wall:removed` in one tick; the update went through the coalesced `_rebuildWallBatch` while `wall:removed` fired `_removeWall` immediately — two async ops mutating `wallData`/`wallsGroup` interleaved across `await`s, each rebuilding the same surviving run: one mesh landed tracked, one became an **untracked orphan** stacked on top (z-fighting flicker; the orphan ignores subsequent moves, looking like "the wall didn't move" and later like a duplicate wall — user-reported after split×N → undo×N → move → undo). Concurrent `_rebuildWallBatch`es (rapid splits/undos) hit the same race. Fix: **`ZoneManager._wallOpChain`** — every `_rebuildWallBatch`/`_removeWall` call is enqueued via `_enqueueWallOp` onto a single promise chain (strictly serialized, errors caught so the chain never stalls). Verified in-browser with the fix live: split×2 then Cmd+Z×2 fired back-to-back → 0 orphans (every `wallsGroup` child tracked by a `RunEntry`), data fully reverted, run re-merged with correct collider count; node move + undo also clean. Also: **WallSplitter now flashes** the new second half with the segment-highlight box for 700ms after a split ("hard to tell if it worked" feedback) — the run re-merges seamlessly, so there was previously no visual cue.
- v4.6.0 — **Floor geometry panel + node-link visibility.** Motivated by the v4.5.1 incident's discovery that wall↔floor node sharing (by ID — WallTool endpoint snap reuses floor corner nodes; fill-run-with-floor/auto-floor reuse the wall run's nodes) was completely invisible in the UI, and floors exposed NO geometry properties at all (`OBJECT_SCREENS.floor` was `["mat","vert"]`; VertScreen = level+elevation only). (1) **Floor Geometry screen** (`OBJECT_SCREENS.floor = ["geo","mat","vert"]`, new **`FloorGeoView`** + **`FloorVertexRow`** in PropertiesPanel): rect node-backed floors get POSITION X/Z (centroid) + SIZE W/D that recompute all 4 nodes **by min/max membership** (nodeIds order never reshuffled — NodeDragger's `RECT_SAME_X/Z` rect-corner adjacency is index-based) through App's new **`handleFloorNodesUpdate`** (N× `updateNode` in ONE transaction = one undo step) with read-only corner rows; polygon node-backed floors get an editable per-node X/Z vertex list (same debounced-field pattern); legacy floors (no `nodeIds` — or **broken** ones, whose render otherwise collapses missing vertices to `{0,0}` via `resolveFloorMesh`) edit `floorMesh.points` via `updateFloor` with a fresh array, and broken-node edits detach `nodeIds` so points become authoritative again. Panel reads node positions live from the `zones` prop; refresh after edits rides `floor:rebuilt` → SelectionManager re-emit. (2) **Node-link visibility**: new **`WorldState.getNodeLinks(zoneId,nodeId) → NodeLinks {wallIds,floorIds,platformIds}`** (replaces the dead `getWallsAtNode`; same reference model as `_pruneOrphanNodes`); vertex rows show a blue **LINKED** chip when another entity shares the node, `WallSegmentRow` chips when a wall node is shared with a floor/platform (wall–wall sharing ignored); hovering a vertex row emits new **`node:link-hover {zoneId,nodeId|null,sourceId}`** → **SegmentHighlighter** (extended: `_meshes[]`, `_wallBox` helper) overlays a node marker sphere + boxes over every linked wall/floor/platform, skipping the hover's source entity; cleared on leave/unmount/deselect/removal. Verified in-browser end-to-end: fill-run floor's vertex rows all chip LINKED; editing V1.x 30→28 moved the node, the shared wall run mesh (minX 29.85→27.79), AND the floor mesh, with ONE "move floor vertex" undo reverting all three (0 orphan meshes); rect SIZE W 6→8 updated all 4 nodes (centroid preserved, still axis-aligned, one undo); hover produced exactly marker+2 wall boxes and cleared to 0; legacy points edit + undo clean; user's coincident-but-unshared east wall correctly reports unlinked. **Known follow-up (explicitly deferred):** `removeNode` still guards walls only — deleting a wall can orphan floor/platform-referenced nodes.
- v4.7.0 — **Phase 20 — Overlay decals (DecalGeometry stamping).** First half of the decals feature (`aplans/decals-plan.md`; Phase 21 = surface-effect shader decals). New entity type **`DecalDef`** (`zone.decals?: DecalDef[]` — optional array, no migration): a **free-floating world-space anchor + unit normal + roll°/size/opacity/textureId** with **no target entity id** — wall runs merge/split and their meshes are disposed wholesale on rebuild, so decals re-project at build time onto whatever static geometry (wall/floor/platform/stair; `ghostPick` excluded) their projector box intersects; zero clipped triangles ⇒ def kept, mesh skipped. New **`src/world/decals/DecalBuilder.ts`** (pure fns: `decalOrientation` = quaternion aligning +Z to the normal × roll, `decalProjectorBox` = world AABB of the oriented projector, `buildOverlayDecalMesh` = `three/addons DecalGeometry` per intersecting target merged via `mergeGeometries` — the multi-target merge lets one stamp wrap a mitered corner between runs or bridge a wall/floor junction; output is world-space at identity). Overlay material: `MeshStandardMaterial { map (SRGB), transparent, depthWrite:false, polygonOffset -4/-4 (beats the wall-liner −1/−1), castShadow:false, renderOrder 10+i }`, `_ownsMaterial:true` — inherits fog/ACES automatically; optional manifest `maps.normal/roughness` load `NoColorSpace`. **ZoneManager owns the lifecycle** (mirrors `_volumeMeshes`): `_decalMeshes` map, `_buildDecals` in `loadZone` AFTER the stair-CSG second pass, `decal:added/updated/removed` handlers, and **rebuild survival** — `wall/floor/platform/stair:rebuilt` mark dirty any decal whose projector AABB intersects the rebuilt entity's new bounds OR whose `userData._decalTargets` (entity ids recorded at projection time) contains it (catches "target moved away" stale meshes); dirty set coalesced per microtask and regens run through the existing `_wallOpChain` so they never see a half-rebuilt run; emits new `decal:rebuilt` (consumed by SelectionManager re-tint + GizmoManager re-attach). Assets: **`public/assets/decals/manifest.json`** (`DecalTexDef { id,label,category?,path,maps?,kinds:["overlay"|"surface"] }`) + 9 procedurally-generated CC0-equivalent starter PNGs (cracks/bullet holes/paint/arrow/exit sign + stage-B weathering); `AssetManager.initDecals/getDecalDef/getDecalList` (textures through the existing `loadTexture` cache so `setQuality` disposal covers them). Tool: **`src/editor/DecalTool.ts`** (TriggerVolumeTool template) — armed by the new **`src/ui/DecalBrowser.tsx`** left panel (`LeftPanelId "decals"`, Toolbar "Decal"/K, auto-opens) via `decaltool:texture`; does its **own raycast** for hit point + world face normal; ghost = `PlaneGeometry` quad (real DecalGeometry only on commit — per-mousemove regen would clip a merged run's full index buffer); **scroll = size** (0.1–8 m), **shift+scroll = rotate**, `[`/`]` ±15°, click stamps in a `"place decal"` transaction and stays armed; Escape disarms (re-emits `decaltool:texture null` so the picker highlight clears). **Wheel gating:** new `camera:zoom-lock {source,locked}` — `EditorCamera._handleWheel` early-returns while any source holds a lock (Set, `gizmo:suspend` idiom); DecalTool locks only while its ghost is on a surface. `input:wheel` payload gained `shift/ctrl/alt/meta`. Selection: `"decal"` inserted in `PRIORITY` **above** platform/wall/floor (decals are coplanar with them — priority must break the raycast distance tie); `_getDataRecord` decal case; emissive tint works as-is. Panel: custom **`DecalView`** (texture-swap mini grid, position/size/rotation/opacity, Delete). Gizmo: **translate-only** (roll-around-normal maps badly to the world-Y ring; not in the KeyR/KeyS lists), pivot at anchor + normal·0.3, commit case + multi-select `_refDisplayPos`/`_translateRef` cases, re-attach on `decal:rebuilt`. Undo: `"decal"` `ChangeKind` + `_zoneArr`/`_emitChange` cases — place/move/edit/delete all one-step undoable; serialization automatic. Verified in-browser end-to-end (real toolbar/tile/canvas clicks): ghost orients to the brick wall, wheel resizes without zooming (radius pinned, unlocks over sky), stamp = def + 10-tri conforming mesh, undo/redo (redo = cold `loadZone` rebuild), node-drag rebuild re-projects onto the moved face (new uuid, no orphans), coplanar click selects the decal over the wall, panel width edit rebuilds (2 m at 30° roll ⇒ 2.48 m span, exact), Delete clears def+mesh; zero console errors. **Known caveat:** default projector depth (`max(w,h)·0.5`) can exceed a thin wall's 0.2 m thickness ⇒ faint mirrored bleed on the back face (classic DecalGeometry artifact) — set the per-decal `depth` field smaller when it matters.
- v4.8.0 — **Phase 21 — Surface-effect decals (in-shader projection / triplanar).** Second half of the decals feature: `kind: "surface"` decals (water damage, stains, moss, grime) sampled inside the target surface's **own** `MeshStandardMaterial` — the repo's first `onBeforeCompile`, isolated in new **`src/world/decals/surfaceDecals.ts`**. No extra mesh, **zero extra draw calls**; the base normal map is untouched so lighting has no seam at the decal edge. Design: `makeSurfaceDecalMaterial(base, slots)` **clones** the base (never mutates the shared AssetManager cache instance; the clone is assigned with `_ownsMaterial: true` so existing disposal owns it) and injects: vertex → `vSdWorldPos/vSdWorldNormal` after `<worldpos_vertex>` (from `transformed`/`objectNormal` — no dependence on the guarded `worldPosition`); fragment after `<map_fragment>` → **fixed unrolled samplers** `uSdTex0..3` with `MAX_SURFACE_DECALS = 4` per mesh (GLSL ES 3.0 forbids dynamically-indexed sampler arrays; excess decals on one mesh drop with a console.warn; an atlas is the documented escape hatch), planar path = `uSdProj[i]` (world→normalized projector) UV + smoothstep edge fade + **normal-dot fade** (stops painting a thick wall's far side) + z-band clamp, **triplanar path** (per-slot flag) = three world-axis projections centered on `uSdAnchor[i]` weighted `|N|⁴` with radial falloff — ignores projector direction, so a stain wraps a mitered corner / wall-top edge with no seam (verified visually); fragment after `<roughnessmap_fragment>` → `roughnessFactor = mix(roughnessFactor, uSdParams[i].z, alphaᵢ)` (wet look; `DecalDef.roughnessMod`, blank = off). Uniforms are seeded pre-compile on `mat.userData._sdUniforms` and merged in the hook, so `updateSurfaceDecalUniforms` gives **uniform-only updates** — moving/resizing/toggling a stain keeps `material.uuid` (verified); `customProgramCacheKey = "surfdecals"` shares one program per base shader config. **ZoneManager**: `_surfacePatches: Map<zoneId, Map<Mesh, {original, ownedBefore, decalIds}>>` + `_refreshSurfaceDecals(zoneId)` — a reconcile pass (desired per-mesh slot lists from projector-AABB ∩ mesh-AABB → patch new / uniform-update existing / **unpatch + restore the shared material + dispose the clone when the last stain leaves**, `ownedBefore` restored) called from `loadZone`, from `_rebuildDecal` on every decal change, and via the dirty queue after target rebuilds (patch re-lands on the NEW run mesh — verified). **Bug found & fixed in verification:** `decal:removed` went straight to `_removeDecalMesh` (overlay-only) and skipped the surface reconcile — the wall stayed patched after delete; removal now routes through `_rebuildDecal` like add/update. **Selection** (no mesh to raycast): `DecalTool` picks surface decals analytically (ray vs projector rectangle, occluder check, TriggerVolumeTool pattern — runs after SelectionManager so its emit overrides the wall pick; gated off while armed-stamping) and shows a cyan `LineLoop` rectangle while selected, synced on `decal:updated`, cleared on deselect/remove/dispose. UI: DecalBrowser **Surface** kind enabled (Weather tiles: leak stain / moss / grime); `DecalView` gains **TRIPLANAR** checkbox + **WET ROUGHNESS** input for surface kind. Verified in-browser (real toolbar/tile/canvas clicks + data-layer): stamp patches exactly the intersected run mesh (`uSdCount 1`, no decal mesh), moss renders blended into the brick, triplanar wraps the wall-top edge seamlessly, move/resize/triplanar = same `material.uuid`, delete restores the shared material (`_ownsMaterial` false, 0 patches) and undo re-patches, node-move rebuild re-patches the new mesh, zero console errors. Caveats: floor-dimming's material swap temporarily hides a patch on dimmed levels (cosmetic, editor-only); over-cap warning is console-only.
- v4.9.0 — **Phase 22 — Parametric shape primitives (cylinder/cone, wedge/ramp, flexible box).** Unreal-style placeable solids as a new top-level entity type **`ShapeDef`** (`zone.shapes?: ShapeDef[]` — optional array, no migration; flat optional per-kind scalars because `updateShape` shallow-merges): `kind: "cylinder" | "wedge" | "box"` + cylinder `radiusTop/radiusBottom/height/radialSegments 3–64` (radiusTop 0 = cone), wedge `width/depth/heightLow/heightHigh` (heightLow 0 = true ramp), box `width/depth/height/taperX/taperZ/shearX/shearZ`. **The local-space contract (the Phase-12 brush prerequisite):** geometry is ALWAYS generated in local space (XZ-centered, base at y=0) by new **`src/builders/ShapeBuilder.ts`**; `position`/`rotation` (Euler° XYZ) are applied as `mesh.position`/`mesh.rotation` and mirrored onto the collider — never baked into vertices, so mesh and physics structurally cannot drift (the world-space platform bug class is impossible), and a future vertex-editable brush extends the same type by superseding kind params with a local vertex list. Defaults + clamping live in exported `resolveShapeParams` (every consumer resolves through it, so sparse defs never crash). **Geometry:** hand-built with explicit per-corner normals/UVs — cylinder sides use a **cylindrical metric unwrap** (u = arc-length meters ÷ tileScale per ring, so cones keep density; v = slant length) with **flat per-face normals ≤ `FLAT_SHADE_MAX_SEGMENTS` (11)** for crisp tri-prism/hex-pillar looks and analytic smooth frustum normals above; wedge/box faces go through `pushQuadMetric` (face normal from the corner cross product, in-plane metric UV projection) so slanted/tapered faces tile at the same physical density as walls (verified visually: brick courses on a tapered obelisk match the wall behind). **Physics:** `ColliderBuilder.registerShape` = `RAPIER.ColliderDesc.convexHull(localHullPoints)` + def translation/rotation — all three kinds are convex by construction so the hull is exact (verified with rays: cylinder top y=2.000, side x=3.000, 4-seg prism rotated 45° hits at exactly 2+1/√2); null-tolerant on degenerate hulls (mesh renders, no collision, warn). Walkability rides the KCC 45° max-climb: a 31° ramp climbs, a 50° wedge blocks (both verified in preview). **ZoneManager:** `shapeEntries`/`shapesGroup` + add/rebuild/remove with the platform cancellation-token pattern (`_shapeBuildTokens` — 8 rapid edits leave exactly one mesh), `shape:rebuilt` emit, `_setEntityHidden` + `_applyGroupVisibility` + floor-dimming arms, and a **runtime `move_object` fast-path**: a script move on a shape sets `mesh.position` + `collider.setTranslation` directly (no rebuild — the local-space payoff), WorldState untouched by design. **Tool:** new `src/editor/ShapeTool.ts`, one class behind three ToolIds under a single toolbar **Shape** button (variants popover, like floor/platform): cylinder = click center → move = radius → click commits; wedge/box = two-click footprint (high edge on −Z, rotate after); ghost = the real `buildLocalGeometry` in translucent blue (true silhouette), base elevation = first click's `surfacePos.y`; Escape/RMB cancels. **Selection/gizmo/panel:** `"shape"` in `PRIORITY` between decal and platform; translate + rotate gizmo (no scale — size lives in params; rotate commits absolute yaw via `_pivotYaw()` **preserving panel-set X/Z tilt**, verified committing −107.58° past the ±90° Euler gimbal trap); `ShapeGeoView` (position/rotation XYZ + kind-specific params via `SHAPE_PARAM_FIELDS`, transform fields value-resync after gizmo commits) + single-material `ShapeMatView`. **Integrations:** copy/paste/duplicate (`COPYABLE` + `shape_` id prefix + offset clone), groups (`groupMembers COLLECTIONS`, membership bumps, group hide/show), ScriptEngine `_resolveTargets` (group fan-out → despawn works via `_setEntityHidden`, restored on preview:stop) + `_resolveObjectPose` (store_position), undo (`"shape"` `ChangeKind`; journal replay generic), serialization automatic, `__test.spawnShape` dev helper. `change_material` remains object-only (unwired for shapes, like platforms). Every milestone verified in-browser through the real UI paths (toolbar clicks, canvas placement clicks, gizmo drags, panel React inputs, preview walks).
- v4.9.1 — **Shapes are decal targets.** Three additive lines: `"shape"` joins `ZoneManager._collectDecalTargets` (overlay projection AND surface-effect patching), `shape:rebuilt` → `_markDecalsDirty` (decals re-project when a shape moves/rebuilds — verified: stale mesh removed when the shape moves away, def kept, re-projects on return), and `DecalTool.TARGET_TYPES` (the stamp ghost sticks to shapes).
- v4.9.2 — **Shape gizmo rotate: X/Z rings now commit.** The shape `_commitRotate` arm used `_pivotYaw()` (yaw-only) and "preserved" stored X/Z — so X/Z ring drags previewed live but committed nothing and snapped back. Now reads the tracked mesh's full Euler after detach (object-case pattern) and writes all three axes; no-op drags guarded against decomposition noise (±0.01°). Verified with real ring drags: X-ring −54.88° sticks, a follow-up yaw drag composes (data = mesh = collider quaternion, exact).
- v4.9.3 — **Shape X/Z rotate: commit the orbited position too.** The gizmo pivot sits ABOVE the shape (top + 0.3), so X/Z ring drags orbit the shape's base origin around it during the live preview; v4.9.2 committed rotation only, so the rebuild re-anchored the rotation about the shape's own base and the mesh visibly shifted back on release (Y was immune — the origin lies on the yaw axis). The shape `_commitRotate` arm now writes `position` (read off the detached mesh) alongside `rotation`, making the commit exactly the release pose. Verified with a mouseup-instant snapshot: release pos = committed def = post-rebuild mesh, byte-identical (12, 0.977, 1.881 @ −54.9°X).
- v4.9.4 — **Shape gizmo pivots at the transform-aware body center.** The pivot was `position + height + 0.3` — upright-only math: after an X/Z tilt the base origin and "top" no longer relate to where the body visually is, so the gizmo re-attached far from the shape and subsequent ring drags orbited the shape around it in a circle. New `_shapePivotWorld(shape)` = local mid-height center `(0, h/2, 0)` rotated by the shape's Euler + position, used by both `_onSelect` and `_reattachMeshes` — the gizmo always sits on the body and rotation always turns the shape about its own center. Verified on a 90°X-tilted box: pivot == mesh bbox center (12,0,1) exactly, and two composed ring drags (+3.8°Y then −70.8°Z) left the body center byte-identical.
- v4.10.0 — **Phase 22b — Brush editing, resize handles, cap/side materials for shapes.** Three additions to the shape system. **(1) Quake/UE-style brush editing:** new optional `ShapeDef.mesh: ShapeBrushMesh { vertices: Vec3[] }` (local space) that **supersedes the kind params** when ≥4 vertices are present — geometry AND collider are both the **convex hull of the cloud** (`three/addons ConvexGeometry` triangulation with per-face metric UVs from a normal-derived basis, so coplanar hull triangles share one projection; `localHullPoints` returns the cloud verbatim, so mesh/physics stay exact for any arrangement — interior/coplanar points are absorbed, convexity is guaranteed by construction; degenerate hulls fall back to the kind params with a warn). Geometry panel gains **Convert to Brush** (bakes the kind's hull corners, one undoable step, `kind` kept as provenance) and **Revert to <kind> params** (`mesh: undefined`). New **`src/editor/BrushVertexEditor.ts`** (TriggerVolumeResizer idioms): an amber sphere handle per corner — **drag** = camera-facing-plane move snapped to 0.25 local (Alt = free) with **live hull rebuild** through drag-scoped begin/commitTransaction (one undo step; Escape restores + aborts); **right-click a corner deletes it** (min 4); **"+ Add corner"** (panel button → `shape:add-corner` bus event) arms a click-on-the-brush insertion — the new corner starts ON the hull (no visual change) and becomes real when dragged outward; a gizmo:dragging pulse swallows the click so SelectionManager doesn't re-pick. GizmoManager's `_shapePivotWorld` uses the cloud's local bbox center for brushes. **(2) Drag-resize handles** for parametric shapes: new **`src/editor/ShapeResizer.ts`** + a **RESIZE HANDLES** checkbox in the Geometry panel (`shape:resize-toggle`, per-selection, coexists with the translate gizmo via the `collider:handle-hover` yield + `gizmo:dragging` mute). Five axis-tinted face handles, **local-axis aware** (work at any XYZ rotation; drags project the mouse ray onto the rotated axis line — closest-point formula `t = (d·w0 − b·(rd·w0))/(1 − b²)`, sign verified the hard way): box/wedge ±X/±Z resize width/depth with the **opposite face pinned** (position shifts half the delta along the rotated axis — verified: −X face byte-stable at 17.000 while width grew), +Y = height (box/cylinder) or heightHigh (wedge) with the base pinned; cylinder's four radial handles shift **both radii together** (cones stay cones). Snap 0.25, Alt = free, live rebuild in one transaction. Brush shapes get no handles — their corners are the handles. **(3) Cap/side materials** (platform-style): `ShapeDef.sideMaterial?`/`sideMaterialOverrides?`; ShapeBuilder now emits **two meshes** per shape (cap = top/bottom faces + `material`, side = lateral faces + `sideMaterial ?? material`; hull faces split by `|normal.y| ≥ 0.5`; side UV offsets fall back to cap's) — `ShapeBuildOutput.meshes[]`, `ZoneManager.ShapeEntry.meshes[]` (hide/group/dim/move-fast-path loop them). **Both meshes are selectable** (deviation from platforms: clicking a side face selects the shape, and decals project onto shape sides). `ShapeMatView` = TOP/BOTTOM + SIDES MaterialSections. Verified in-browser through the real UI (panel buttons, checkbox, mouse drags): brick-sides/concrete-top box, Convert-to-Brush → corner drag morphs the hull live into a peaked solid, armed click added corner #9 on the clicked face, right-click deleted it, cylinder +Y drag 2→3.5 (base pinned) and radial drag r 1→2.25 (center pinned), zero console errors.
- v4.11.0 — **Phase 23 — Blender-style face/vertex sub-object editing for shapes.** Brushes graduate from derived-hull point clouds to real polygonal meshes, opt-in and additive (shapes/brushes that never enter the new modes run the exact v4.10 code paths). **Data:** `ShapeBrushMesh.faces?: BrushFace[]` — explicit CCW-outward loops (`{ verts: number[], material?, materialOverrides? }`, every undirected edge traversed by exactly 2 loops); absent = legacy cloud. HARD RULE: `updateShape` replaces `mesh` wholesale, so every writer sends `{ mesh: { ...shape.mesh, vertices, faces } }` (dev-mode warn added in WorldState when faces would be dropped). **brushOps.ts** (new, pure): `facesFromCloud` (hull → dedupe → BFS coplanar merge → boundary-loop chaining → collinear cleanup; box→6 quads, winding preserved), `splitFaceQuad` (quads only; midpoint insertion **with T-junction propagation into every neighbor loop sharing a split edge** — verified: 2 pentagons appear, no cracks), `extrudeFace` (dup ring along the Newell normal + side quads; faceIdx stays on the moved cap), `validateMesh` (edge pairing + positive volume) gates every op commit. **Builder:** face-brushes render one mesh per (material, overrides) group (single-material stays 1 draw call) with per-face metric UVs from the normal-derived basis; `userData.faceGroups` maps triangle ranges → logical faces for picking; collider = `registerShapeTrimesh` (`ColliderDesc.trimesh` + `FIX_INTERNAL_EDGES`) — first trimesh in the repo, concave solids collide exactly (KCC blocked inside an L-notch at wall+capsule-radius exactly; NOTE: editor-time console raycasts only see colliders after one `world.step()` — the editor doesn't step; preview always does). **Select modes:** ToolIds `select-face`/`select-vertex` under the Select button's variants popover + Blender 1/2/3 hotkeys; `isSelectMode()` helper swept across all ~25 gating sites (SelectionManager, ColliderEditor, resizers, NodeDragger×11, WallSplitter, OpeningDragHandler, DecalTool, TriggerVolumeTool) — sub-modes behave exactly like Select for non-shape machinery. SelectionManager resolves `hit.faceIndex`→faceGroups→face, carries `faceIndex`/`vertexIndex` on `object:selected` with a **validity clamp on every emit**, and sinks the new `shape:sub-select` event (panel rows + vertex handles re-emit through one channel); mode switches clear sub-selection. **Gizmos:** `BrushFaceEditor` (translate TC on the face centroid; drag moves all face verts live in one transaction; owns the legacy-cloud **auto-bake** — first face/vertex-mode selection of a cloud bakes faces, one undoable step) and BrushVertexEditor gains vertex-mode-only handles (cyan selected corner) + a 3-axis TC on the selected corner; both suspend the entity gizmo via `gizmo:suspend` (BUGFIX: `GizmoManager._onSelect` now re-applies `_applyControlsEnabled()` after `attach()` — attach forced the controls visible, overriding suspenders that fired in the same object:selected dispatch). `BrushFaceHighlighter` overlays the selected (0.55) and panel-hovered (0.35) face polygons (SegmentHighlighter idiom, +0.01 normal lift). **Panel:** Geometry screen in face mode = FACES list (selected row expanded: corners, inline material+TILE, SPLIT ─/│ (quads only, hint otherwise), EXTRUDE); vertex mode = CORNERS list (selected row = debounced X/Y/Z inputs); Materials screen for face-brushes = per-face rows with inline pickers (hover highlights the face in-canvas; replaces TOP/BOTTOM+SIDES). Verified in-browser end-to-end through real UI paths: mode hotkeys + popover, face clicks resolve exact normals ((0,1,0)/(0,0,1)), face-TC drag raised a face 2→3 snapped, vertex-TC drag moved one corner 3→3.5, per-face brick face split the mesh into 10+2-tri groups, SPLIT produced 7 faces/2 pentagons/valid manifold, EXTRUDE +4 sides at exactly +0.25 (watertight step visually), undo chain returns to the pristine 6-face box, faces survive autosave round-trips. Known v1 limits: vertex delete/add-corner disabled on face-brushes (split/extrude are the topology tools), no negative extrude, quads-only split, non-planar quads shade flat.
- v4.11.1 — **Materials screen shows the selected face.** The per-face materials list didn't indicate which face was selected in face mode; the selected face's row now gets the blue highlight (same styling as the Geometry FACES list), the header shows "selected: FACE n", and clicking a row's FACE label sub-selects that face (same `shape:sub-select` channel).
- v3.9.3 — **Phase 10.6 status clarified:** the engine-routing half (index-based `fire()` + `on_timer` timers) is already shipped in `ScriptEngine.ts`; the unbuilt remainder (`EntityRegistry` capability discovery + `ActionDispatcher` handler registry) is deferred to **Phase 13**, where it first has consumers (NPCs/enemies). 10.6 adds no functional capability over what's already shipped/planned — only decoupling + capability-aware UI. Added a status banner and struck the already-solved problems (O(n) lookup, timer polling).
- v4.1 — **Generic gameplay-state store implemented** (`src/scripting/GameState.ts`). Replaced the boolean-only flag system + string-set `GameStateManager` inventory with one `Map<string, JsonValue>` store (registered-schema defaults + numeric clamp; ad-hoc keys). Removed script types `set_flag`/`clear_flag`/`give_item`/`flag_set`/`flag_not_set`/`player_has_item`/`on_flag_set`/`on_flag_cleared`; added `set_state`/`adjust_number`/`delete_state`/`has_state`/`compare_number`/`on_state_changed`. Added a `worldeditor_gamesave` localStorage game save (state snapshot + fired one-shots). **Full reference: `GAMEPLAY_STATE.md`** — the stale `GameSave`/flag/`GameStateManager` descriptions in this file are superseded by it.

---

## Vision

A browser-based 3D world editor for building explorable 3D spaces. The user constructs outdoor terrain, streets, and buildings with a floating editor camera, then enters buildings through zone transitions to place interior walls, floors, platforms, stairs, and props. The world is saved as a JSON scene file and can be previewed with a configurable first-person or third-person camera.

The world is designed from day one to support a full game runtime: playable characters, NPCs, and enemies. This means every wall, floor, platform, and stair built in the editor generates a proper Rapier physics collider alongside its visual mesh — not a raycast approximation added later. The physics world is always live and game-ready.

**Two tools, two jobs:**
- `three-mesh-bvh` — editor only: fast raycasting for object selection, tool snapping, and surface placement
- `@dimforge/rapier3d-compat` — runtime: rigid body physics, character capsule controller, NPC/enemy colliders

---

## Tech Stack

| Layer | Library | Notes |
|---|---|---|
| Language | TypeScript 5 | Strict mode, all files `.ts` / `.tsx` |
| Build | Vite + vite-plugin-checker | Fast HMR, TS type-checking in dev |
| UI Shell | React 18 + @types/react | UI panels only — no Three.js inside React |
| 3D Renderer | Three.js + @types/three | Initialized outside React in plain TS classes |
| CSG (wall openings) | three-bvh-csg | Boolean mesh operations for doors/windows |
| BVH Raycasting | three-mesh-bvh | Fast collision/selection raycasting |
| Physics (Phase 3+) | @dimforge/rapier3d-compat | WASM — static colliders built with every mesh |
| Persistence | JSON | Save/load scene files |

**Critical rule:** React never touches Three.js objects. Three.js never touches React state. They communicate only through an `EventBus` (custom event emitter). No exceptions.

---

## TypeScript Types & Interfaces

All shared types live in `src/types.ts` and are imported across every module. Never use `any`. Use `unknown` for truly dynamic payloads and narrow with type guards.

```ts
// src/types.ts

// ─── Primitive helpers ────────────────────────────────────────────────────────

export type ToolId = "select" | "floor" | "poly-floor" | "wall" | "platform" | "poly-platform" | "stair" | "object" | "zone" | "shape-cylinder" | "shape-wedge" | "shape-box";  // (+ spawnpoint / trigger-volume / decal — see src/types.ts)
export type ZoneType = "outdoor" | "indoor" | "dungeon";
export type OpeningType = "door" | "window" | "arch" | "passage";
export type StairStyle = "straight" | "l-shape" | "spiral";
export type CameraMode = "fps" | "thirdperson";
export type EditorObjectType = "wall" | "floor" | "platform" | "stair" | "object" | "terrain" | "trigger" | "trim" | "opening" | "shape";  // (+ spawn / trigger-volume / checkpoint / decal — see src/types.ts)
export type TransitionEffect = "fade" | "none";

// ─── Vec / transform ─────────────────────────────────────────────────────────

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }
export interface Euler3 { x: number; y: number; z: number }   // degrees
export interface Scale3 { x: number; y: number; z: number }
export interface Bounds { x: number; z: number; width: number; depth: number }

// ─── EventBus typed map ───────────────────────────────────────────────────────

export interface BusEvents {
  "tool:select":           { tool: ToolId };
  "floor:select":          { level: number };
  "object:selected":       SelectedObjectPayload;
  "object:deselected":     Record<string, never>;
  "object:updated":        { id: string; zoneId: string; changes: Partial<WorldObject> };
  "asset:selected":        { assetId: string };
  "asset:dropped":         { assetId: string; screenPos: { x: number; y: number } };
  "wall:added":            { zoneId: string; wall: WallDef };
  "wall:updated":          { zoneId: string; wallId: string; changes: Partial<WallDef>; segmentOnly?: boolean };
  "wall:removed":          { zoneId: string; wallId: string };
  "wall:rebuilt":          { zoneId: string; wallId: string };
  "node:updated":          { zoneId: string; nodeId: string; pos: { x: number; z: number } };
  "wall:segment-hover":    { zoneId: string; wallId: string | null };  // panel row hover → SegmentHighlighter (v4.5.0)
  "node:link-hover":       { zoneId: string; nodeId: string | null; sourceId?: string };  // vertex-row hover → highlight node + linked entities (v4.6.0)
  "floor:added":           { zoneId: string; floor: FloorDef };
  "floor:updated":         { zoneId: string; floorId: string; changes: Partial<FloorDef> };
  "floortool:suggest-auto-floor": { zoneId: string; level: number; points: Vec2[]; nodeIds: string[] };
  "platform:added":        { zoneId: string; platform: PlatformDef };
  "platform:updated":      { zoneId: string; id: string; changes: Partial<PlatformDef> };
  "platform:removed":      { zoneId: string; id: string };
  "tool:placed":           { type: EditorObjectType; id: string; zoneId: string };
  "stair:added":           { zoneId: string; stair: StairDef };
  "stair:updated":         { zoneId: string; id: string; changes: Partial<StairDef> };
  "stair:removed":         { zoneId: string; id: string };
  "stair:rebuilt":         { zoneId: string; stairId: string };
  "object:added":          { zoneId: string; object: WorldObject };
  "object:removed":        { zoneId: string; id: string };
  "zone:added":            { zone: ZoneDef };
  "zone:activated":        { zoneId: string };
  "zone:enter":            { zoneId: string };
  "transition:added":      { transition: TransitionDef };
  "preview:start":         Record<string, never>;
  "preview:stop":          Record<string, never>;
  "preview:zone-entered":  { zoneName: string };
  "gizmo:dragging":        { isDragging: boolean };
  "camera:jump":           { x: number; z: number };
  "camera:topdown":        Record<string, never>;
  "character:teleport":    { position: Vec3; facing: number };
  "character:triggerdoor": { transitionId: string };
  "overlay:fade-in":       { color: string; duration: number };
  "overlay:fade-out":      { duration: number };
  "scene:save":            Record<string, never>;
  "scene:load":            { json: unknown };
  "scene:saved":           { json: SceneFile };
  "scene:loaded":          { metadata: SceneMetadata };
  "world:loaded":          { metadata: SceneMetadata };
  "materials:loaded":      { materials: MaterialDef[] };
  "quality:changed":       { quality: QualityScale };
  "terrain:sculpt":        { x: number; z: number; radius: number; delta: number };
  "input:click":           { screenPos: ScreenPos; worldPos: Vec3; button: number };
  "input:dblclick":        { screenPos: ScreenPos; worldPos: Vec3 };
  "input:rightclick":      { screenPos: ScreenPos; worldPos: Vec3; surfacePos: Vec3 | null };  // stationary RMB only (v4.5.0)
  "input:mousemove":       { screenPos: ScreenPos; worldPos: Vec3; delta: ScreenPos };
  "input:mousedown":       { button: number; screenPos: ScreenPos };
  "input:mouseup":         { button: number; screenPos: ScreenPos };
  "input:wheel":           { delta: number };
  "input:keydown":         { code: string; key: string; shift: boolean; ctrl: boolean; alt: boolean };
  "input:keyup":           { code: string };
  "assets:loaded":    { assets: AssetDef[] };        // implemented Phase 7
  "leftpanel:open":   { panelId: LeftPanelId };
  "leftpanel:close":  Record<string, never>;
  // ⏳ Phase 8: "script:trigger": { triggerId: string; context: ScriptContext };
  // ⏳ Phase 8: "flag:set": { flag: string; value: boolean };
  // ⏳ Phase 9: "spawn:set": { spawn: SpawnPoint };
}

export type BusEventName = keyof BusEvents;
export type BusCallback<K extends BusEventName> = (payload: BusEvents[K]) => void;

// ─── Selection ────────────────────────────────────────────────────────────────

export interface SelectedObjectPayload {
  id: string;
  type: EditorObjectType;
  zoneId: string;
  parentId?: string;   // wallId when type === "opening"
  position: Vec3;
  rotation: Euler3;
  scale: Scale3;
  data: WallDef | FloorDef | PlatformDef | StairDef | WorldObject | Opening | null;
  runWalls?: WallDef[]; // populated for multi-wall runs; undefined for single-wall selections
}

// ─── userData on Three.js meshes ─────────────────────────────────────────────

export interface MeshUserData {
  editorId:                string;
  editorType:              EditorObjectType;
  zoneId:                  string;
  selectable:              boolean;
  floorLevel:              number;
  _ownsMaterial:           boolean;
  _origEmissive?:          number;
  _origEmissiveIntensity?: number;
  _hoverEmissive?:         number;
  _parentId?:              string;
  triggerType?:            "door";
  transitionId?:           string;
  openingId?:              string;
  wallId?:                 string;
  assetId?:                string;
  editorOnly?:             boolean;  // hidden in preview mode (e.g. CSG cutter wireframes)
}

// ─── Scene file data model ────────────────────────────────────────────────────

export interface SceneMetadata {
  name:         string;
  version:      string;
  author:       string;
  created:      string;
  lastModified: string;
  uvVersion?:   number;   // 1 = world-space UVs (Phase 10.8+), absent = legacy tileScale behaviour
}

export interface PlayerSettings {
  cameraMode:           CameraMode;
  moveSpeed:            number;
  jumpHeight:           number;
  fov:                  number;
  thirdPersonDistance:  number;
  thirdPersonHeight:    number;
}

// ⏳ Phase 7 — not yet implemented
export interface SkyConfig {
  turbidity:        number;
  rayleigh:         number;
  mieCoefficient:   number;
  mieDirectionalG:  number;
  sunElevation:     number;
  sunAzimuth:       number;
}

// ⏳ Phase 9 — not yet implemented
export interface SpawnPoint {
  position:  Vec3;
  zoneId:    string;
  facing:    number;
}

export interface WorldConfig {
  size:           { width: number; depth: number };
  ambientLight:   { color: string; intensity: number };
  sunLight:       { color: string; intensity: number; position: Vec3 };
  skybox:         string;        // sky material id — sky: SkyConfig planned ⏳ Phase 7
  fogColor:       string;
  fogDensity:     number;
  playerSettings: PlayerSettings;
  // defaultSpawn: SpawnPoint — ⏳ Phase 9
}

export interface TerrainLayerMaterial {
  id:        string;
  texture:   string;
  tileScale: number;
  minHeight: number;
  maxHeight: number;
}

export interface TerrainDef {
  resolution:      number;
  heightData:      Float32Array | string;   // Float32Array in memory, base64 string on disk
  maxHeight:       number;
  layerMaterials:  TerrainLayerMaterial[];
}

export interface FloorMeshDef {
  shape:    "rect" | "polygon";
  points:   Vec2[] | null;
  nodeIds?: string[];  // if set, points are derived from these wall nodes at build time
  material: string;
}

export interface FloorDef {
  id:                string;
  level:             number;
  elevation:         number;
  ceilingHeight:     number | null;
  floorMesh:         FloorMeshDef;
  materialOverrides?: MaterialOverrides;
  groupIds?:         string[]; // Phase 10.6a
}

export interface Opening {
  id:                 string;
  type:               OpeningType;
  offsetAlongWall:    number;
  width:              number;
  height:             number;
  elevation:          number;
  trim?:              boolean;   // default true — false hides the jamb/header/sill
  innerTileH?:        number;    // tiling scale for top + bottom inner faces (sill/lintel)
  innerTileV?:        number;    // tiling scale for left + right inner faces (jambs)
  linkedZoneId:       string | null;
  linkedTransitionId: string | null;
}

export interface WallNode {
  id: string;
  x:  number;
  z:  number;
}

// WallDef references nodes by ID — coordinates come from ZoneDef.nodes at build time
export interface WallDef {
  id:                 string;
  startNodeId:        string;   // was start:{x,z} in early spec — now uses node graph
  endNodeId:          string;
  floor:              number;
  height:             number;
  thickness:          number;
  material:           string;
  exteriorMaterial:   string;
  openings:           Opening[];
  materialOverrides?: MaterialOverrides;
  groupIds?:          string[];   // Phase 10.6a
  hidden?:            boolean;    // v4.5.0 — editor ghost + no colliders + no openings; stays in runs/room loops
}

export interface PlatformDef {
  id:             string;
  position:       Vec3;
  size:           { width: number; depth: number };
  thickness:      number;
  material:       string;
  hasRailing:     boolean;
  railingHeight:  number;
  rotation?:      Vec3;     // degrees, Y = yaw — stored transform, applied by mesh (Phase 10.6b)
  floorLevel?:    number;
  points?:        Vec2[];   // polygon platform — if set, size is ignored
  nodeIds?:       string[];
  materialOverrides?:     MaterialOverrides;
  sideMaterial?:          string;
  sideMaterialOverrides?: MaterialOverrides;
  groupIds?:              string[];   // Phase 10.6a
}

export interface StairCutterDef {
  offset:      Vec3;    // relative to stair.end
  width:       number;
  depth:       number;
  height:      number;
  rotation?:   Vec3;    // degrees (X/Y/Z); Y defaults to stair angle on enable
  innerTileH?: number;
  innerTileV?: number;
}

export interface StairOpening {
  linkedZoneId:        string | null;
  linkedTransitionId:  string | null;
}

export interface StairDef {
  id:          string;
  start:       Vec3;
  end:         Vec3;
  width:       number;
  numSteps?:   number;
  style:       StairStyle;
  material:    string;
  hasRailing:  boolean;
  railing?:                StairRailingDef;   // railing config; absent → builder defaults
  underside?:              StairUndersideDef; // underside style; absent → "open" (current)
  materialOverrides?:      MaterialOverrides;
  riserMaterial?:          string;
  riserMaterialOverrides?: MaterialOverrides;
  csgCutter?:              StairCutterDef;  // defines a hole cut in the floor/platform above
  topOpening?:             StairOpening;    // optional zone link at top of stair
  bottomOpening?:          StairOpening;    // optional zone link at bottom of stair
  groupIds?:               string[];        // Phase 10.6a
}

export interface StairRailingDef {
  topRail:       boolean;   // top cap rail along the slope
  balusters:     boolean;   // vertical posts
  height:        number;    // rail height above the step nosings (m)
  stepInterval:  number;    // a baluster every N steps (>= 1)
  barThickness:  number;    // top-rail cross-section (m)
  postThickness: number;    // baluster cross-section (m)
  sideInset:     number;    // inward offset of the rail from the step's side edge (m)
  overhang:      number;    // how far the top rail extends past the end posts, each end (m)
}

export type StairUndersideMode = "open" | "diagonal" | "closed";
export interface StairUndersideDef {
  mode:      StairUndersideMode;  // open = stepped (current); diagonal = slanted soffit; closed = to floor
  thickness: number;              // diagonal only: clearance below the steps (stringer depth, m)
}

export interface ObjectProperties {
  interactable:   boolean;
  npcSpawn:       boolean;
  lootTableId:    string | null;
  triggerEventId: string | null;
}

export interface WorldObject {
  id:                  string;
  assetId:             string;
  position:            Vec3;
  rotation:            Euler3;
  scale:               Scale3;
  floor:               number;
  zoneId?:             string;
  properties:          ObjectProperties;
  autoPlayAnimation?:  string | null;    // clip name to loop on load, null = none
  scripts:             ScriptDef[];      // scripts that belong to this object — loaded/unloaded with it
  groupIds?:           string[];         // Phase 10.6a
}

export interface ZoneDef {
  id:        string;
  name:      string;
  type:      ZoneType;
  bounds:    Bounds;
  nodes:     WallNode[];   // wall node graph — walls reference these by ID
  floors:    FloorDef[];
  walls:     WallDef[];
  platforms: PlatformDef[];
  stairs:    StairDef[];
  objects:   WorldObject[];
  decals?:   DecalDef[];   // Phase 20 — free-floating anchor+normal stamps, re-projected onto static geometry at build time
  // scripts: ScriptDef[]        — ⏳ Phase 8
  // triggerVolumes: TriggerVolume[] — ⏳ Phase 8
}

// Phase 20 — decals. NO target entity id: wall runs merge/split and their meshes are
// disposed wholesale on rebuild, so a stored wallId would dangle. The decal re-projects
// onto whatever static geometry its projector box intersects; if geometry moves away,
// the def is kept and the mesh is skipped.
export type DecalKind = "overlay" | "surface";   // surface = in-shader projection, Phase 21
export interface DecalDef {
  id:        string;          // dec_<uuid8>
  label?:    string;
  kind:      DecalKind;
  textureId: string;          // decals-manifest id (public/assets/decals/manifest.json)
  position:  Vec3;            // world-space anchor ON the surface
  normal:    Vec3;            // unit world normal captured at placement
  rotation:  number;          // degrees, roll around normal
  size:      { width: number; height: number };  // meters
  depth?:    number;          // overlay projector depth; default max(w,h)*0.5 (min 0.2)
  opacity:   number;
  triplanar?: boolean;        // surface kind only (Phase 21)
  roughnessMod?: number;      // surface kind only (Phase 21)
  groupIds?: string[];
}

export interface TransitionDef {
  id:               string;
  fromZone:         string;
  toZone:           string;
  triggerType:      "door" | "volume" | "loading-zone";
  triggerOpeningId: string;
  effect:           TransitionEffect;
  fadeColor:        string;
  fadeDuration:     number;
  spawnPoint:       Vec3 & { facing: number };
}

export interface SceneFile {
  metadata:    SceneMetadata;
  world:       WorldConfig;
  terrain:     TerrainDef | null;
  zones:       ZoneDef[];
  transitions: TransitionDef[];
}

// ─── Physics ─────────────────────────────────────────────────────────────────

// Stored by ZoneManager alongside mesh groups — used to clean up Rapier on zone unload
export interface ZoneColliders {
  floors:    import("@dimforge/rapier3d-compat").Collider[];
  walls:     import("@dimforge/rapier3d-compat").Collider[][];   // per wall: segment colliders
  platforms: import("@dimforge/rapier3d-compat").Collider[];
  stairs:    import("@dimforge/rapier3d-compat").Collider[][];   // per stair: step colliders
  sensors:   import("@dimforge/rapier3d-compat").Collider[];     // door sensors
  terrain:   import("@dimforge/rapier3d-compat").Collider | null;
}

// ─── Characters, NPCs, Enemies ─────────────────── ⏳ Phase 10 ──────────────

export interface CharacterDef {
  id:                 string;
  name:               string;
  modelAssetId:       string;
  capsuleRadius:      number;
  capsuleHeight:      number;
  moveSpeed:          number;
  jumpHeight:         number;
  cameraMode:         CameraMode;
  thirdPersonOffset:  Vec3;
  health?:            number;
  maxHealth?:         number;
  faction?:           string;
}

export type NpcBehaviour = "idle" | "patrol" | "follow" | "guard";

export interface NpcDef {
  id:            string;
  name:          string;
  modelAssetId:  string;
  spawnPosition: Vec3;
  faction:       string;
  behaviour:     NpcBehaviour;
  patrolPath?:   Vec3[];
  dialogueId?:   string | null;
  lootTableId?:  string | null;
}

export interface EnemyDef extends NpcDef {
  attackRange:     number;
  detectionRange:  number;
  damage:          number;
  attackCooldown:  number;
}

// ─── Material system ─────────────────────────────────────────────────────────

export type QualityScale = 'low' | 'medium' | 'high';

export interface QualitySettings {
  textureScale:    QualityScale;
  shadowMapSize:   512 | 1024 | 2048;
  shadowsEnabled:  boolean;
  fogEnabled:      boolean;
  antialias:       boolean;
}

export interface MaterialMapConfig {
  enabled: boolean;
  path:    string;
}

export interface MaterialDef {
  id:                string;
  label:             string;
  tileScale:         number;
  roughnessVal:      number;
  metalnessVal:      number;
  displacementScale: number;
  maps: {
    albedo:       MaterialMapConfig;
    normal:       MaterialMapConfig;
    roughness:    MaterialMapConfig;
    metalness:    MaterialMapConfig;
    ao:           MaterialMapConfig;
    displacement: MaterialMapConfig;
  };
}

export interface MaterialOverrides {
  maps?:              Partial<Record<keyof MaterialDef['maps'], { enabled: boolean }>>;
  tileScale?:         number;
  tileScaleX?:        number;   // per-axis override (overrides tileScale)
  tileScaleY?:        number;
  offsetX?:           number;   // UV offset U axis (0.0–1.0, wraps) — shifts all maps together
  offsetY?:           number;   // UV offset V axis (0.0–1.0, wraps) — shifts all maps together
  roughnessVal?:      number;
  displacementScale?: number;
}

// ─── Asset registry ────────────────────────────────── ⏳ Phase 7 ───────────

export type ColliderType = 'box' | 'mesh' | 'none';
export type AssetCategory = 'Furniture' | 'Props' | 'Structures' | 'Lights' | 'Characters' | 'Vegetation' | 'Other';

export interface AssetDef {
  id:            string;
  label:         string;
  category:      AssetCategory;
  path:          string;                  // /assets/models/<id>.glb
  thumbnail?:    string;                  // /assets/models/thumbnails/<id>.png — auto-generated on import
  collidable:    boolean;
  colliderType:  ColliderType;
  tags:          string[];
  dateAdded:     string;                  // ISO timestamp
}

export interface AssetManifest {
  version:  string;
  assets:   AssetDef[];
}

// ─── Scripting / Event system ──────────────────────── ⏳ Phase 8 ───────────

export type TriggerType =
  | 'on_player_enter'   // player enters a trigger volume
  | 'on_player_exit'    // player leaves a trigger volume
  | 'on_interact'       // player presses interact key near object
  | 'on_timer'          // fires after N seconds
  | 'on_health_zero'    // NPC/enemy dies
  | 'on_flag_set'       // a game flag was set
  | 'on_flag_cleared'   // a game flag was cleared
  | 'on_zone_enter'     // player enters a zone
  | 'on_game_start';    // fires once on scene load

export type ConditionType =
  | 'flag_set'
  | 'flag_not_set'
  | 'player_has_item'
  | 'player_health_above'
  | 'player_health_below'
  | 'npc_alive'
  | 'npc_dead';

export type ActionType =
  | 'play_sound'
  | 'show_dialogue'
  | 'move_object'
  | 'play_animation'
  | 'spawn_npc'
  | 'despawn_object'
  | 'change_material'
  | 'open_door'
  | 'close_door'
  | 'set_flag'
  | 'clear_flag'
  | 'fire_event'
  | 'fade_screen'
  | 'teleport_player'
  | 'show_ui'
  | 'give_item'
  | 'run_script';        // JavaScript escape hatch

export interface ScriptTrigger {
  type:       TriggerType;
  targetId?:  string;        // object/zone/volume ID the trigger watches
  delay?:     number;        // seconds delay before firing (optional)
  repeat?:    boolean;       // for on_timer: repeat or one-shot
  interval?:  number;        // for on_timer: seconds between fires
}

export interface ScriptCondition {
  type:    ConditionType;
  flag?:   string;
  itemId?: string;
  value?:  number;
  npcId?:  string;
}

export interface ScriptAction {
  type:         ActionType;
  targetId?:    string;       // object to act on
  animation?:   string;       // animation clip name
  sound?:       string;       // sound asset id
  dialogue?:    DialogueDef;
  material?:    string;       // material id for change_material
  position?:    Vec3;         // for move_object, teleport_player, spawn_npc
  flag?:        string;       // for set_flag / clear_flag
  eventId?:     string;       // for fire_event
  itemId?:      string;       // for give_item
  fadeColor?:   string;
  fadeDuration?:number;
  uiElementId?: string;
  // JavaScript escape hatch — sandboxed, runs in a limited context
  script?:      string;       // JS function body as string — see ScriptContext
}

export interface DialogueDef {
  speaker:  string;
  lines:    string[];         // array of lines, player advances through them
  portrait?:string;           // asset id for speaker portrait image
}

export interface ScriptDef {
  id:          string;
  label:       string;        // human-readable name shown in Script Panel
  zoneId:      string;        // which zone this script belongs to
  enabled:     boolean;
  trigger:     ScriptTrigger;
  conditions:  ScriptCondition[];   // ALL must pass (AND logic)
  actions:     ScriptAction[];      // executed in order
  oneShot:     boolean;       // if true, disables itself after first successful fire
}

// Runtime context passed to sandboxed JS scripts
export interface ScriptContext {
  objectId:   string;         // ID of the object that triggered this
  playerId:   string;
  flags:      Record<string, boolean>;
  // Methods available to scripts:
  // setFlag(flag: string): void
  // clearFlag(flag: string): void
  // hasFlag(flag: string): boolean
  // playSound(id: string): void
  // showDialogue(speaker: string, lines: string[]): void
  // teleportPlayer(position: Vec3): void
  // despawnObject(id: string): void
  // fireEvent(eventId: string): void
}

// Trigger volume — placed in world, referenced by scripts
export interface TriggerVolume {
  id:       string;
  label:    string;
  position: Vec3;
  size:     Vec3;             // width, height, depth
  rotation?: Vec3;           // degrees, Y = yaw (v4.1.3)
  zoneId:   string;
  groupIds?: string[];        // Phase 10.6a
  visual?:  TriggerVolumeVisual;  // optional gradient fill, shows in preview + game (v4.3.0)
}

// Optional decorative fill for a trigger volume (a "warp box"). `style` is a discriminator
// so more fill styles can be added later. Rendered by src/world/volumeFillMaterial.ts as a
// uniform-driven ShaderMaterial (alpha from local height); built as a sibling of the
// wireframe so it stays visible in game while the wireframe hides.
export interface TriggerVolumeVisual {
  enabled:    boolean;
  style:      "gradient";
  color:      string;         // hex
  fadeDir:    "up" | "down";  // up = opaque at bottom, fades toward top
  opacity:    number;         // 0..1 max alpha
  fadeHeight: number;         // 0..1 fraction of box height the gradient spans
  animate:    boolean;        // subtle pulse (updateVolumeVisuals bumps uTime)
}

// ─── Persistence ───────────────────────────────────── ⏳ Phase 9 ───────────

// Scene file: already implemented as SceneFile above.
// Game state and editor prefs: planned Phase 9.

// ⚠️ SUPERSEDED — runtime game state now lives in the generic GameState store,
// not this flags/inventory-shaped GameSave. See GAMEPLAY_STATE.md. The shipped
// save (worldeditor_gamesave) is { version, ts, state: snapshot, firedOneShots }
// and omits playerPosition/zone/facing. The struct below is retained only as the
// original design intent.
export interface GameSave {
  version:        string;
  timestamp:      string;
  sceneName:      string;
  playerPosition: Vec3;
  playerZoneId:   string;
  playerFacing:   number;
  flags:          Record<string, boolean>;
  firedOneShots:  string[];               // script IDs that have fired and disabled
  inventory:      string[];               // item IDs
}

// Editor preferences — user settings, persisted to localStorage
export interface EditorPreferences {
  quality:          QualitySettings;
  lastOpenedScene:  string | null;
  gridVisible:      boolean;
  snapEnabled:      boolean;
  snapUnit:         number;
  cameraSpeed:      number;
  theme:            'dark';               // only dark for now
}

// ─── Entity / scripting infrastructure ────────────────────────────────────────

export interface EntityCapabilities {
  emits:    TriggerType[];
  receives: ActionType[];
}

// Added to AssetDef (Phase 10.6):
// animations?: string[];   // clip names discovered at import time

// ─── Builder return types ─────────────────────────────────────────────────────

// Actual builder output types (Rapier colliders, not mesh colliders):

export interface WallBuildOutput {
  mesh:       THREE.Mesh;
  colliders:  RAPIER.Collider[];  // Rapier physics — no separate collision mesh
  trimMeshes: THREE.Mesh[];       // door frames, liners, passage trim (includes trigger triggers)
}

export interface FloorBuildOutput {
  mesh:     THREE.Mesh;
  collider: RAPIER.Collider;
}

export interface PlatformBuildOutput {
  meshes:   THREE.Mesh[];  // [capMesh, sideMesh, ...innerFaces, ...railings]
  collider: RAPIER.Collider;
}

export interface StairBuildOutput {
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];  // one per step
}

// ─── Module interfaces (lifecycle contract) ───────────────────────────────────

export interface IEditorModule {
  init():        void;
  update(dt: number): void;
  dispose():     void;
}
```

---

## Project Structure

```
world-editor/
├── index.html
├── vite.config.ts
├── package.json
├── WORLD_EDITOR_ARCHITECTURE.md
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── core/
│   │   ├── SceneManager.ts
│   │   ├── AssetManager.ts
│   │   ├── InputManager.ts
│   │   └── EventBus.ts
│   ├── world/
│   │   ├── WorldState.ts
│   │   ├── WorldLoader.ts
│   │   ├── WorldSerializer.ts
│   │   ├── ZoneManager.ts
│   │   ├── TransitionManager.ts
│   │   ├── TerrainBuilder.ts
│   │   └── decals/
│   │       ├── DecalBuilder.ts     ← overlay decals: DecalGeometry projection + merge (Phase 20)
│   │       └── surfaceDecals.ts    ← surface-effect decals: onBeforeCompile projection/triplanar (Phase 21)
│   ├── builders/
│   │   ├── WallBuilder.ts
│   │   ├── FloorBuilder.ts
│   │   ├── PlatformBuilder.ts
│   │   ├── StairBuilder.ts
│   │   └── ObjectPlacer.ts
│   ├── editor/
│   │   ├── EditorCamera.ts
│   │   ├── HistoryManager.ts      ← snapshot-based undo/redo (Phase 6.7)
│   │   ├── SelectionManager.ts
│   │   ├── WallTool.ts
│   │   ├── FloorTool.ts
│   │   ├── PlatformTool.ts
│   │   ├── StairTool.ts
│   │   ├── ObjectTool.ts
│   │   ├── ZoneTool.ts
│   │   ├── SpawnPointTool.ts
│   │   ├── TriggerVolumeTool.ts    ← amber wireframe drag-to-size, IDLE→PLACING state machine
│   │   ├── DecalTool.ts            ← click-to-stamp decals: quad ghost, scroll=size / shift+scroll=rotate (Phase 20)
│   │   └── TransitionTool.ts
│   ├── physics/
│   │   ├── PhysicsWorld.ts         ← Rapier world singleton, step loop, debug draw
│   │   ├── ColliderBuilder.ts      ← mesh → Rapier collider (called by every builder)
│   │   └── CharacterBody.ts        ← Rapier KinematicCharacterController wrapper
│   ├── scripting/
│   │   ├── ScriptEngine.ts         ← Runtime: trigger index, condition eval, action dispatch
│   │   └── GameState.ts            ← Generic runtime state store (see GAMEPLAY_STATE.md; replaced GameStateManager)
│   ├── preview/
│   │   ├── PreviewController.ts
│   │   ├── CharacterController.ts  ← input + camera; delegates physics to CharacterBody
│   │   ├── FadeOverlay.tsx         ← fade_screen renderer (overlay:fade-in)
│   │   └── TriggerSystem.ts        ← door/zone trigger detection via Rapier sensors
│   ├── dev/
│   │   └── testHelpers.ts          ← DEV-only window.__test harness (preview/scripts/spawns)
│   ├── ui/
│   │   ├── EditorUI.tsx
│   │   ├── Toolbar.tsx
│   │   ├── PropertiesPanel.tsx
│   │   ├── FloorLevelSelector.tsx
│   │   ├── ZonePanel.tsx
│   │   ├── AssetBrowser.tsx
│   │   ├── ScriptPanel.tsx         ← World/Zone/Object tabs, script list + editor drill-down
│   │   ├── DecalBrowser.tsx        ← decal texture picker (Overlay/Surface toggle, category pills)
│   │   ├── DialogueOverlay.tsx     ← in-game dialogue bar (speaker + lines, E to advance)
│   │   ├── SaveLoadPanel.tsx
│   │   └── PreviewHUD.tsx
│   ├── assets/
│   │   ├── textures/
│   │   ├── models/
│   │   └── icons/
│   └── utils/
│       ├── math.ts
│       ├── csg.ts
│       └── uuid.ts
```

---

## Core Principles

### React ↔ Three.js Boundary

The canvas is owned entirely by Three.js. React renders HTML overlaid on top via `position: absolute`. The two sides never share references.

```
App.tsx
  <div style="position:relative; width:100vw; height:100vh">
    <canvas ref={canvasRef} />           ← Three.js owns this
    <div style="position:absolute; inset:0; pointerEvents:none">
      <Toolbar pointerEvents="all" />    ← React UI overlay
      <PropertiesPanel pointerEvents="all" />
    </div>
  </div>
```

In `App.tsx` `useEffect`:
```js
const bus = new EventBus();
const sm = new SceneManager(canvasRef.current, bus);
// Expose bus to React via Context
```

React components call `bus.emit(...)` to send instructions to Three.js. Three.js calls `bus.emit(...)` to update React UI. React never holds a reference to any `THREE.*` object.

### Module Lifecycle

Every engine module implements this interface:
```js
class SomeModule {
  constructor(deps) { /* store deps, don't start yet */ }
  init()            { /* attach listeners, add objects to scene */ }
  update(dt)        { /* called every frame via SceneManager */ }
  dispose()         { /* remove listeners, dispose geometries/materials */ }
}
```

SceneManager calls `update(dt)` on all registered modules each frame. Modules never start their own `requestAnimationFrame` loops.

### Coordinates & Units

- All world coordinates in **meters**
- Default wall height: **3.0m**
- Floor/platform slab thickness: **0.2m**
- Grid snap unit: **0.5m**
- One floor level (wall + slab): **3.2m**
- Y = 0 is ground plane, positive Y is up
- Positive Z is "south", positive X is "east"

---

## Data Model (SceneFile JSON)

The canonical save/load format. All builders read exclusively from this structure — never from the Three.js scene.

```jsonc
{
  "metadata": {
    "name": "My World",
    "version": "1.0",
    "author": "",
    "created": "2026-01-01T00:00:00Z",
    "lastModified": "2026-01-01T00:00:00Z"
  },
  "world": {
    "size": { "width": 200, "depth": 200 },
    "ambientLight": { "color": "#8899bb", "intensity": 0.6 },
    "sunLight": { "color": "#fff4e0", "intensity": 1.8 },
    "sky": {
      "turbidity": 10,
      "rayleigh": 3,
      "mieCoefficient": 0.005,
      "mieDirectionalG": 0.7,
      "sunElevation": 25,
      "sunAzimuth": 180
    },
    "fogDensity": 0.012,
    "playerSettings": {
      "cameraMode": "fps",
      "moveSpeed": 5.0,
      "jumpHeight": 1.2,
      "fov": 75,
      "thirdPersonDistance": 4.0,
      "thirdPersonHeight": 1.8
    },
    "defaultSpawn": {
      "position": { "x": 0, "y": 0, "z": 0 },
      "zoneId": "zone_001",
      "facing": 0
    }
  },
  "terrain": {
    "resolution": 64,
    "heightData": "<base64-encoded Float32Array, resolution×resolution floats 0..1>",
    "maxHeight": 10.0,
    "layerMaterials": [
      { "id": "grass", "texture": "grass_01.jpg", "tileScale": 4.0, "minHeight": 0.0, "maxHeight": 0.4 },
      { "id": "dirt",  "texture": "dirt_01.jpg",  "tileScale": 3.0, "minHeight": 0.3, "maxHeight": 0.7 },
      { "id": "rock",  "texture": "rock_01.jpg",  "tileScale": 2.0, "minHeight": 0.6, "maxHeight": 1.0 }
    ]
  },
  "zones": [
    {
      "id": "zone_001",
      "name": "Town Square",
      "type": "outdoor",
      "bounds": { "x": 0, "z": 0, "width": 50, "depth": 50 },
      "nodes": [
        { "id": "node_001", "x": 0.0, "z": 0.0 },
        { "id": "node_002", "x": 10.0, "z": 0.0 }
      ],
      "floors": [
        {
          "id": "floor_001",
          "level": 0,
          "elevation": 0.0,
          "ceilingHeight": 3.0,
          "floorMesh": { "shape": "rect", "points": null, "material": "cobblestone" }
        },
        {
          "id": "floor_002",
          "level": 1,
          "elevation": 3.2,
          "ceilingHeight": 3.0,
          "floorMesh": { "shape": "rect", "points": null, "material": "wood_planks" }
        }
      ],
      "walls": [
        {
          "id": "wall_001",
          "startNodeId": "node_001",
          "endNodeId":   "node_002",
          "floor": 0,
          "height": 3.0,
          "thickness": 0.2,
          "material": "brick_01",
          "exteriorMaterial": "brick_exterior_01",
          "openings": [
            {
              "id": "opening_001",
              "type": "door",
              "offsetAlongWall": 4.0,
              "width": 1.2,
              "height": 2.2,
              "elevation": 0.0,
              "linkedZoneId": "zone_002",
              "linkedTransitionId": "trans_001"
            },
            {
              "id": "opening_002",
              "type": "window",
              "offsetAlongWall": 7.5,
              "width": 1.0,
              "height": 1.2,
              "elevation": 0.9,
              "linkedZoneId": null,
              "linkedTransitionId": null
            }
          ]
        }
      ],
      "platforms": [
        {
          "id": "platform_001",
          "position": { "x": 5.0, "y": 3.2, "z": 5.0 },
          "size": { "width": 8.0, "depth": 6.0 },
          "thickness": 0.3,
          "material": "concrete_01",
          "hasRailing": true,
          "railingHeight": 1.0
        }
      ],
      "stairs": [
        {
          "id": "stair_001",
          "start": { "x": 2.0, "y": 0.0, "z": 4.0 },
          "end":   { "x": 2.0, "y": 3.2, "z": 8.0 },
          "width": 1.5,
          "style": "straight",
          "material": "concrete_01",
          "hasRailing": true
        }
      ],
      "objects": [
        {
          "id": "obj_001",
          "assetId": "prop_bench_01",
          "position": { "x": 2.0, "y": 0.0, "z": 3.0 },
          "rotation": { "x": 0, "y": 45, "z": 0 },
          "scale":    { "x": 1.0, "y": 1.0, "z": 1.0 },
          "floor": 0,
          "properties": {
            "interactable": false,
            "npcSpawn": false,
            "lootTableId": null,
            "triggerEventId": null
          }
        }
      ]
    }
  ],
  "transitions": [
    {
      "id": "trans_001",
      "fromZone": "zone_001",
      "toZone": "zone_002",
      "triggerType": "door",
      "triggerOpeningId": "opening_001",
      "effect": "fade",
      "fadeColor": "#000000",
      "fadeDuration": 0.3,
      "spawnPoint": { "x": 1.0, "y": 0.0, "z": 1.0, "facing": 180 }
    }
  ]
}
```

---

## WorldState.ts

The in-memory mirror of the JSON. All tools write to WorldState; WorldState emits change events; builders/managers listen and rebuild geometry accordingly. Nothing writes directly to Three.js objects.

> **v4.9.0:** `addShape` / `updateShape` / `removeShape` (`zone.shapes ??= []` — optional
> array, old saves need no migration; `_zoneArr` normalizes like `triggerVolumes`/`decals`).
> `updateShape` is a shallow `Object.assign` merge — ShapeDef's per-kind params are flat
> scalars for exactly this reason. Emits `shape:added/updated/removed`; `"shape"` is a
> `ChangeKind`, so undo/redo replay is generic. `removeShape` does NOT prune nodes
> (shapes are not node-backed — cloned from the stair trio, not the platform trio).

```js
class WorldState {
  constructor(bus) {
    this.bus = bus;
    this.metadata = {};
    this.world = {};
    this.terrain = null;
    this.zones = new Map();        // zoneId → ZoneData
    this.transitions = new Map();  // transitionId → TransitionData
    this.activeZoneId = null;
  }

  // --- Zone mutations ---
  addZone(zoneData) {
    this.zones.set(zoneData.id, zoneData);
    this.bus.emit('zone:added', { zone: zoneData });
  }
  setActiveZone(zoneId) {
    this.activeZoneId = zoneId;
    this.bus.emit('zone:activated', { zoneId });
  }

  // --- Wall mutations ---
  addWall(zoneId, wallData) {
    this.zones.get(zoneId).walls.push(wallData);
    this.bus.emit('wall:added', { zoneId, wall: wallData });
  }
  updateWall(zoneId, wallId, changes) {
    const wall = this.zones.get(zoneId).walls.find(w => w.id === wallId);
    Object.assign(wall, changes);
    this.bus.emit('wall:updated', { zoneId, wallId, changes });
  }
  removeWall(zoneId, wallId) {
    const zone = this.zones.get(zoneId);
    zone.walls = zone.walls.filter(w => w.id !== wallId);
    this.bus.emit('wall:removed', { zoneId, wallId });
  }
  addOpening(zoneId, wallId, openingData) {
    const wall = this.zones.get(zoneId).walls.find(w => w.id === wallId);
    wall.openings.push(openingData);
    this.bus.emit('wall:updated', { zoneId, wallId, changes: { openings: wall.openings } });
  }

  // --- Floor mutations ---
  addFloor(zoneId, floorData) {
    this.zones.get(zoneId).floors.push(floorData);
    this.bus.emit('floor:added', { zoneId, floor: floorData });
  }
  updateFloor(zoneId, level, changes) {
    const floor = this.zones.get(zoneId).floors.find(f => f.level === level);
    Object.assign(floor, changes);
    this.bus.emit('floor:updated', { zoneId, level, changes });
  }

  // --- Platform mutations ---
  addPlatform(zoneId, data)          { /* push + emit 'platform:added' */ }
  updatePlatform(zoneId, id, changes){ /* find + assign + emit 'platform:updated' */ }
  removePlatform(zoneId, id)         { /* filter + emit 'platform:removed' */ }

  // --- Node mutations ---
  addNode(zoneId, node)              { /* push to zone.nodes */ }
  updateNode(zoneId, nodeId, pos)    { /* find + update + emit 'node:updated' */ }
  removeNode(zoneId, nodeId)         { /* filter */ }
  getNode(zoneId, nodeId)            { /* find + return */ }
  getNodeLinks(zoneId, nodeId)       { /* v4.6.0 (replaced getWallsAtNode) — { wallIds, floorIds, platformIds } referencing the node */ }

  // --- Wall mutations (extended) ---
  updateWallSegment(zoneId, wallId, changes) { /* same as updateWall but emits segmentOnly:true */ }
  updateOpening(zoneId, wallId, openingId, changes) { /* find opening + assign + emit 'wall:updated' */ }
  addOpening(zoneId, wallId, opening) { /* push opening + emit 'wall:updated' */ }
  removeOpening(zoneId, wallId, openingId) { /* filter opening + emit 'wall:updated' */ }

  // --- Stair mutations ---
  addStair(zoneId, data)             { /* push + emit 'stair:added' */ }
  updateStair(zoneId, id, changes)   { /* find + assign + emit 'stair:updated' */ }
  removeStair(zoneId, id)            { /* filter + emit 'stair:removed' */ }

  // --- Object mutations ---
  addObject(zoneId, data)            { /* push + emit 'object:added' */ }
  updateObject(zoneId, id, changes)  { /* find + assign + emit 'object:updated' */ }
  removeObject(zoneId, id)           { /* filter + emit 'object:removed' */ }

  // --- Transition mutations ---
  addTransition(transData) {
    this.transitions.set(transData.id, transData);
    this.bus.emit('transition:added', { transition: transData });
  }

  // --- Bulk load (called by WorldLoader) ---
  loadFromJSON(json) {
    this.metadata = json.metadata;
    this.world = json.world;
    this.terrain = json.terrain;
    this.zones.clear();
    this.transitions.clear();
    json.zones.forEach(z => this.zones.set(z.id, z));
    json.transitions.forEach(t => this.transitions.set(t.id, t));
    this.activeZoneId = json.zones[0]?.id || null;
    this.bus.emit('world:loaded', { metadata: json.metadata });
  }

  // --- Snapshot (called by WorldSerializer) ---
  toJSON() {
    return {
      metadata: { ...this.metadata, lastModified: new Date().toISOString() },
      world: this.world,
      terrain: this.terrain,
      zones: [...this.zones.values()],
      transitions: [...this.transitions.values()],
    };
  }
}
```

---

## userData Schema

Every Three.js mesh that participates in selection, raycasting, or collision **must** carry `userData`. Builders are responsible for setting this on every mesh they create.

```js
// Minimum required on ALL meshes
mesh.userData = {
  editorId:    "wall_001",      // matches data model id
  editorType:  "wall",          // "wall"|"floor"|"platform"|"stair"|"object"|"terrain"|"trigger"|"trim"
  zoneId:      "zone_001",
  selectable:  true,            // false for triggers, trim, terrain, helpers
  floorLevel:  0,               // which floor level (walls, floors, objects)
  _ownsMaterial: false,         // true if this mesh cloned the material (must dispose it)
}

// Wall meshes add:
mesh.userData.wallId = "wall_001";

// Opening trigger volumes add:
mesh.userData.triggerType     = "door";
mesh.userData.transitionId    = "trans_001";
mesh.userData.openingId       = "opening_001";
mesh.userData.selectable      = false;         // not selectable, only walkable trigger

// Object meshes add:
mesh.userData.assetId         = "prop_bench_01";

// Child meshes of GLTF objects add:
mesh.userData._parentId       = "obj_001";    // id of the root object group
```

Builders tag child meshes too — GLTF models have deep mesh hierarchies that raycasting will hit. Every child gets `_parentId` so SelectionManager can resolve to the root object.

---

## SelectionManager.ts

> **v4.11.0:** the Select tool has three modes — `select` / `select-face` /
> `select-vertex` (Toolbar variants + 1/2/3 hotkeys; `isSelectMode()` from
> `src/editor/selectMode.ts` gates all selection-era machinery so sub-modes behave
> exactly like plain Select for non-shape entities). Face mode resolves
> `hit.faceIndex` → `userData.faceGroups` → logical brush face; `object:selected`
> carries `faceIndex`/`vertexIndex` (clamped against the live mesh on every emit);
> the `shape:sub-select` event is the single sink for panel-row/handle sub-selection.

### Raycast Priority

When a click ray intersects multiple meshes, priority order (highest first):

1. `opening` / `object` / `checkpoint` / `spawn` — props, markers, openings
2. `decal` — projected decal meshes (v4.7.0; **above** platform/wall/floor because a decal
   is coplanar with its surface — priority, not raycast distance, must break the tie)
3. `shape` — parametric solids (v4.9.0; shapes typically sit ON platforms/floors, so they
   win overlapping picks against them)
4. `platform` — raised floor slabs
5. `wall` — wall segments
6. `floor` — floor planes
7. `terrain` — never selected directly (only for placement snapping)
8. `trigger` — never selectable

**Ghost fallback (v4.5.0):** hidden-wall ghost meshes (`userData.ghostPick`) are stripped
from the hit list whenever any non-ghost hit exists — a ghost never occludes real geometry.
Only when *nothing* solid is under the cursor do ghost hits count, so a fully-hidden wall
run can still be clicked (on empty space) to select and re-show it. Applies to hover too
(same `_cast`).

### Highlight Strategy

Use **emissive tint** (not outline post-process — that requires EffectComposer, Phase 12+).

On select:
```js
// Clone material if shared (never mutate a shared material)
if (!mesh.userData._ownsMaterial) {
  mesh.material = mesh.material.clone();
  mesh.userData._ownsMaterial = true;
}
mesh.userData._origEmissive = mesh.material.emissive.getHex();
mesh.userData._origEmissiveIntensity = mesh.material.emissiveIntensity;
mesh.material.emissive.set(0x3366ff);
mesh.material.emissiveIntensity = 0.25;
```

On deselect:
```js
mesh.material.emissive.set(mesh.userData._origEmissive ?? 0x000000);
mesh.material.emissiveIntensity = mesh.userData._origEmissiveIntensity ?? 0;
```

Hover highlight: lighter tint (`0x224488`, intensity `0.12`). Tracked separately from selection — `this._hoveredMesh` vs `this._selectedMesh`. If the hovered mesh is also selected, selection tint wins.

GLTF objects: apply highlight to ALL child meshes of the root group (traverse and tint each).

### Full Class

```js
class SelectionManager {
  constructor(scene, camera, domElement, worldState, bus) {
    this._scene = scene;
    this._camera = camera;
    this._dom = domElement;
    this._worldState = worldState;
    this._bus = bus;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.firstHitOnly = true;
    this._mouse = new THREE.Vector2();
    this._selectedMesh = null;
    this._hoveredMesh = null;
    this._activeTool = 'select';
  }

  init() {
    this._dom.addEventListener('click', this._onClick = this._onClick.bind(this));
    this._dom.addEventListener('mousemove', this._onMouseMove = this._onMouseMove.bind(this));
    this._bus.on('tool:select', ({ tool }) => { this._activeTool = tool; });
    this._bus.on('object:updated', ({ id, zoneId, changes }) => this._onExternalUpdate(id, zoneId, changes));
  }

  _onClick(e) {
    if (this._activeTool !== 'select') return;
    const hits = this._castRay(e);
    const selectable = hits.filter(h => h.object.userData.selectable);
    if (selectable.length === 0) { this._deselect(); return; }
    const best = this._pickByPriority(selectable);
    // Resolve GLTF child to root group
    const root = this._resolveRoot(best.object);
    this._select(root);
  }

  _onMouseMove(e) {
    if (this._activeTool !== 'select') return;
    const hits = this._castRay(e);
    const selectable = hits.filter(h => h.object.userData.selectable);
    const hovered = selectable.length ? this._resolveRoot(this._pickByPriority(selectable).object) : null;
    if (hovered !== this._hoveredMesh) {
      if (this._hoveredMesh && this._hoveredMesh !== this._selectedMesh)
        this._clearHover(this._hoveredMesh);
      this._hoveredMesh = hovered;
      if (hovered && hovered !== this._selectedMesh)
        this._applyHover(hovered);
    }
  }

  _select(root) {
    if (this._selectedMesh === root) return;
    if (this._selectedMesh) this._clearSelect(this._selectedMesh);
    this._selectedMesh = root;
    this._applySelect(root);

    this._bus.emit('object:selected', {
      id:       root.userData.editorId,
      type:     root.userData.editorType,
      zoneId:   root.userData.zoneId,
      position: root.position.clone(),
      rotation: { x: THREE.MathUtils.radToDeg(root.rotation.x), y: THREE.MathUtils.radToDeg(root.rotation.y), z: THREE.MathUtils.radToDeg(root.rotation.z) },
      scale:    root.scale.clone(),
      data:     this._getDataRecord(root),
    });
  }

  _deselect() {
    if (!this._selectedMesh) return;
    this._clearSelect(this._selectedMesh);
    this._selectedMesh = null;
    this._bus.emit('object:deselected', {});
  }

  _applySelect(root) {
    root.traverse(child => {
      if (!child.isMesh) return;
      if (!child.userData._ownsMaterial) {
        child.material = child.material.clone();
        child.userData._ownsMaterial = true;
      }
      child.userData._origEmissive = child.material.emissive.getHex();
      child.userData._origEmissiveIntensity = child.material.emissiveIntensity;
      child.material.emissive.set(0x3366ff);
      child.material.emissiveIntensity = 0.25;
    });
  }

  _clearSelect(root) {
    root.traverse(child => {
      if (!child.isMesh || !child.userData._ownsMaterial) return;
      child.material.emissive.set(child.userData._origEmissive ?? 0x000000);
      child.material.emissiveIntensity = child.userData._origEmissiveIntensity ?? 0;
    });
  }

  _applyHover(root) {
    root.traverse(child => {
      if (!child.isMesh) return;
      if (!child.userData._ownsMaterial) {
        child.material = child.material.clone();
        child.userData._ownsMaterial = true;
      }
      child.userData._hoverEmissive = child.material.emissive.getHex();
      child.material.emissive.set(0x224488);
      child.material.emissiveIntensity = 0.12;
    });
  }

  _clearHover(root) {
    root.traverse(child => {
      if (!child.isMesh || !child.userData._ownsMaterial) return;
      child.material.emissive.set(child.userData._hoverEmissive ?? 0x000000);
      child.material.emissiveIntensity = 0;
    });
  }

  _resolveRoot(mesh) {
    // Walk up until we find the mesh with a real editorId (not _parentId)
    if (mesh.userData._parentId) {
      let node = mesh;
      while (node.parent) {
        node = node.parent;
        if (node.userData.editorId && !node.userData._parentId) return node;
      }
    }
    return mesh;
  }

  _pickByPriority(hits) {
    const order = ['object', 'platform', 'wall', 'floor'];
    for (const type of order) {
      const hit = hits.find(h => h.object.userData.editorType === type);
      if (hit) return hit;
    }
    return hits[0];
  }

  _castRay(event) {
    const rect = this._dom.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    return this._raycaster.intersectObjects(this._scene.children, true);
  }

  _getDataRecord(root) {
    const { editorType, editorId, zoneId } = root.userData;
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return null;
    switch (editorType) {
      case 'wall':     return zone.walls.find(w => w.id === editorId);
      case 'floor':    return zone.floors.find(f => f.level === root.userData.floorLevel);
      case 'platform': return zone.platforms.find(p => p.id === editorId);
      case 'stair':    return zone.stairs.find(s => s.id === editorId);
      case 'object':   return zone.objects.find(o => o.id === editorId);
      default:         return null;
    }
  }

  _onExternalUpdate(id, zoneId, changes) {
    // React edited a field — apply transform changes directly to mesh if selected
    if (!this._selectedMesh || this._selectedMesh.userData.editorId !== id) return;
    if (changes.position) this._selectedMesh.position.set(changes.position.x, changes.position.y, changes.position.z);
    if (changes.rotation) this._selectedMesh.rotation.set(
      THREE.MathUtils.degToRad(changes.rotation.x),
      THREE.MathUtils.degToRad(changes.rotation.y),
      THREE.MathUtils.degToRad(changes.rotation.z)
    );
    if (changes.scale) this._selectedMesh.scale.set(changes.scale.x, changes.scale.y, changes.scale.z);
  }

  update(dt) { /* gizmo update in Phase 7 */ }

  dispose() {
    this._dom.removeEventListener('click', this._onClick);
    this._dom.removeEventListener('mousemove', this._onMouseMove);
  }
}
```

### Transform Gizmos (Phase 7)

> **v4.9.0:** `shape` joins the gizmo types — translate + rotate (KeyR allow-list), **no
> scale** (size lives in the shape's params; gizmo scale would fight them or bake scale,
> which the brush contract forbids). Pivot sits just above the shape's top
> (`resolveShapeParams` height). Re-attach on `shape:rebuilt`; group multi-select
> translate has a plain position-shift arm.
> **v4.11.0:** two more TransformControls instances (ColliderEditor proxy pattern):
> `BrushFaceEditor` (translate TC on the selected brush face's centroid — dragging
> moves all face verts live) and BrushVertexEditor's corner TC. Both suspend the
> entity gizmo via `gizmo:suspend` while active; `_onSelect` re-applies
> `_applyControlsEnabled()` after `attach()` so a suspender firing in the same
> object:selected dispatch isn't overridden (attach forces visibility).

> **v4.9.2:** shape rotate commits **all three axes** — reads the tracked mesh's Euler
> after `_detachFromPivot()` (the object-case pattern; the mesh's parent shapesGroup is
> identity, so local Euler = world rotation) instead of `_pivotYaw()`, which only
> extracts yaw and made X/Z ring drags snap back. No-op drags are guarded by comparing
> against the stored rotation (±0.01°) so decomposition noise isn't committed.

Use `THREE.TransformControls` from `three/addons/controls/TransformControls.js`:

```js
import { TransformControls } from 'three/addons/controls/TransformControls.js';

this._gizmo = new TransformControls(camera, domElement);
scene.add(this._gizmo);

// Attach on select
this._gizmo.attach(selectedMesh);

// Key bindings
// G = translate, R = rotate (Y-axis only for objects), S = scale uniform
bus.on('input:keydown', ({ code }) => {
  if (!this._selectedMesh) return;
  if (code === 'KeyG') this._gizmo.setMode('translate');
  if (code === 'KeyR') this._gizmo.setMode('rotate');
  if (code === 'KeyS') this._gizmo.setMode('scale');
});

// Suppress camera during drag
this._gizmo.addEventListener('dragging-changed', e => {
  bus.emit('gizmo:dragging', { isDragging: e.value });
});

// Write back to WorldState on drag end
this._gizmo.addEventListener('objectChange', () => {
  const mesh = this._selectedMesh;
  worldState.updateObject(mesh.userData.zoneId, mesh.userData.editorId, {
    position: mesh.position,
    rotation: { x: THREE.MathUtils.radToDeg(mesh.rotation.x), y: THREE.MathUtils.radToDeg(mesh.rotation.y), z: THREE.MathUtils.radToDeg(mesh.rotation.z) },
    scale: mesh.scale,
  });
});
```

---

## EventBus Contract

```js
class EventBus {
  on(event, callback)  // subscribe; returns unsubscribe fn
  off(event, callback) // unsubscribe
  emit(event, payload) // fire synchronously
}
```

### Full Event Table

| Event | Direction | Payload |
|---|---|---|
| `tool:select` | React → Three.js | `{ tool: string }` |
| `floor:select` | React → Three.js | `{ level: number }` |
| `object:selected` | Three.js → React | `{ id, type, zoneId, position, rotation, scale, data }` |
| `object:deselected` | Three.js → React | `{}` |
| `selection:changed` | Three.js → React | `{ refs: SelectedRef[] }` (multi-select set changed) |
| `selection:set` | React → Three.js | `{ refs: SelectedRef[] }` (programmatic select, e.g. "select all in group") |
| `object:updated` | React → Three.js | `{ id, zoneId, changes }` |
| `asset:selected` | React → Three.js | `{ assetId }` |
| `asset:dropped` | React → Three.js | `{ assetId, screenPos }` |
| `wall:added` | internal | `{ zoneId, wall }` |
| `wall:updated` | internal | `{ zoneId, wallId, changes }` |
| `wall:removed` | internal | `{ zoneId, wallId }` |
| `floor:added` | internal | `{ zoneId, floor }` |
| `floor:updated` | internal | `{ zoneId, level, changes }` |
| `platform:added` | internal | `{ zoneId, platform }` |
| `platform:updated` | internal | `{ zoneId, id, changes }` |
| `platform:removed` | internal | `{ zoneId, id }` |
| `stair:added` | internal | `{ zoneId, stair }` |
| `stair:removed` | internal | `{ zoneId, id }` |
| `object:added` | internal | `{ zoneId, object }` |
| `object:removed` | internal | `{ zoneId, id }` |
| `zone:added` | internal | `{ zone }` |
| `zone:activated` | internal | `{ zoneId }` |
| `zone:enter` | React → Three.js | `{ zoneId }` |
| `transition:added` | internal | `{ transition }` |
| `preview:start` | React → Three.js | `{}` |
| `preview:stop` | Three.js → React | `{}` |
| `preview:zone-entered` | Three.js → React | `{ zoneName }` |
| `gizmo:dragging` | internal | `{ isDragging: bool }` |
| `camera:jump` | internal | `{ x, z }` |
| `character:teleport` | internal | `{ position, facing }` |
| `overlay:fade-in` | internal | `{ color, duration }` |
| `overlay:fade-out` | internal | `{ duration }` |
| `scene:save` | React → Three.js | `{}` |
| `scene:load` | React → Three.js | `{ json }` |
| `scene:saved` | Three.js → React | `{ json }` |
| `scene:loaded` | Three.js → React | `{ metadata }` |
| `world:loaded` | internal | `{ metadata }` |
| `terrain:sculpt` | internal | `{ x, z, radius, delta }` |
| `input:click` | InputManager → all | `{ screenPos, worldPos, button }` |
| `input:dblclick` | InputManager → all | `{ screenPos, worldPos }` |
| `input:mousemove` | InputManager → all | `{ screenPos, worldPos, delta }` |
| `input:mousedown` | InputManager → all | `{ button, screenPos }` |
| `input:mouseup` | InputManager → all | `{ button, screenPos }` |
| `input:wheel` | InputManager → all | `{ delta, shift, ctrl, alt, meta }` (modifiers added v4.7.0 for shift+scroll decal rotate) |
| `input:keydown` | InputManager → all | `{ code, key, shift, ctrl, alt }` |
| `input:keyup` | InputManager → all | `{ code }` |
| `history:restore` | internal | `{}` — fired after undo/redo; ZoneManager reloads active zone |
| `decal:added` | internal | `{ zoneId, decal }` |
| `decal:updated` | internal | `{ zoneId, id, changes }` |
| `decal:removed` | internal | `{ zoneId, id }` |
| `decal:rebuilt` | internal | `{ zoneId, decalId }` — mesh re-projected; SelectionManager re-tints, GizmoManager re-attaches |
| `decal:placed` | Three.js → React | `{ zoneId, id }` |
| `decaltool:texture` | React ↔ Three.js | `{ textureId \| null, kind }` — picker arms the DecalTool; tool re-emits null on Escape so the picker highlight clears |
| `camera:zoom-lock` | internal | `{ source, locked }` — EditorCamera wheel-zoom suspended while any source holds a lock |

---

## InputManager.ts

Centralizes all DOM input so tools don't each add their own listeners. Tools subscribe to bus events instead of DOM events directly. InputManager can suppress all input during transitions by simply not emitting.

**Right-click (v4.5.0):** DOM `click` only fires for the primary button, so `mouseup` with
`button === 2` synthesizes **`input:rightclick`** — but only when the cursor moved ≤ the 5px
`_DRAG_THRESHOLD` since `mousedown`. RMB camera orbits always exceed the threshold, so they
never fire it; a stationary RMB tap does. Consumed by `WallSplitter` (vertex insert).
The `surfacePos` raycast also skips `userData.ghostPick` meshes so hidden-wall ghosts don't
catch surface placements.

**Wheel modifiers (v4.7.0):** `input:wheel` now carries `shift/ctrl/alt/meta` from the
WheelEvent (DecalTool uses shift+scroll = rotate). Existing consumers that destructure
`{ delta }` are unaffected.

```js
class InputManager {
  constructor(domElement, camera, bus) {
    this._dom = domElement;
    this._camera = camera;
    this._bus = bus;
    this._keys = {};
    this._mousePos = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._raycaster = new THREE.Raycaster();
    this._suppress = false;  // set true during transitions
  }

  init() {
    this._dom.addEventListener('mousedown',   this._md = e => this._onMouseDown(e));
    this._dom.addEventListener('mousemove',   this._mm = e => this._onMouseMove(e));
    this._dom.addEventListener('mouseup',     this._mu = e => this._onMouseUp(e));
    this._dom.addEventListener('click',       this._mc = e => this._onClick(e));
    this._dom.addEventListener('dblclick',    this._dc = e => this._onDblClick(e));
    this._dom.addEventListener('wheel',       this._mw = e => this._onWheel(e), { passive: false });
    this._dom.addEventListener('contextmenu', this._cx = e => e.preventDefault());
    window.addEventListener('keydown',        this._kd = e => this._onKeyDown(e));
    window.addEventListener('keyup',          this._ku = e => this._onKeyUp(e));
    this._bus.on('overlay:fade-in',  () => { this._suppress = true; });
    this._bus.on('overlay:fade-out', () => { this._suppress = false; });
  }

  get isShiftDown() { return !!(this._keys['ShiftLeft'] || this._keys['ShiftRight']); }
  get isAltDown()   { return !!(this._keys['AltLeft']   || this._keys['AltRight']); }
  get isCtrlDown()  { return !!(this._keys['ControlLeft'] || this._keys['ControlRight']); }
  isKeyDown(code)   { return !!this._keys[code]; }

  _worldPos(event) {
    const rect = this._dom.getBoundingClientRect();
    this._mousePos.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mousePos.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mousePos, this._camera);
    const target = new THREE.Vector3();
    this._raycaster.ray.intersectPlane(this._groundPlane, target);
    return target;
  }

  _onMouseDown(e) {
    if (this._suppress) return;
    this._bus.emit('input:mousedown', { button: e.button, screenPos: { x: e.clientX, y: e.clientY } });
  }
  _onMouseMove(e) {
    if (this._suppress) return;
    const worldPos = this._worldPos(e);
    this._bus.emit('input:mousemove', {
      screenPos: { x: e.clientX, y: e.clientY },
      worldPos,
      delta: { x: e.movementX, y: e.movementY },
    });
  }
  _onMouseUp(e)    { if (!this._suppress) this._bus.emit('input:mouseup',   { button: e.button, screenPos: { x: e.clientX, y: e.clientY } }); }
  _onClick(e)      { if (!this._suppress) this._bus.emit('input:click',     { screenPos: { x: e.clientX, y: e.clientY }, worldPos: this._worldPos(e), button: e.button }); }
  _onDblClick(e)   { if (!this._suppress) this._bus.emit('input:dblclick',  { screenPos: { x: e.clientX, y: e.clientY }, worldPos: this._worldPos(e) }); }
  _onWheel(e)      { e.preventDefault(); if (!this._suppress) this._bus.emit('input:wheel', { delta: e.deltaY }); }
  _onKeyDown(e)    {
    this._keys[e.code] = true;
    if (!this._suppress) this._bus.emit('input:keydown', { code: e.code, key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
  }
  _onKeyUp(e)      { delete this._keys[e.code]; if (!this._suppress) this._bus.emit('input:keyup', { code: e.code }); }

  dispose() {
    this._dom.removeEventListener('mousedown',   this._md);
    this._dom.removeEventListener('mousemove',   this._mm);
    this._dom.removeEventListener('mouseup',     this._mu);
    this._dom.removeEventListener('click',       this._mc);
    this._dom.removeEventListener('dblclick',    this._dc);
    this._dom.removeEventListener('wheel',       this._mw);
    this._dom.removeEventListener('contextmenu', this._cx);
    window.removeEventListener('keydown',        this._kd);
    window.removeEventListener('keyup',          this._ku);
  }
}
```

---

## EditorCamera.ts

### Controls

| Input | Action |
|---|---|
| Right-click drag | Orbit around focus point |
| Middle-click drag | Pan focus point on XZ plane |
| WASD / Arrow keys | Pan focus point on XZ plane |
| Scroll wheel | Zoom in/out — **suspended while any `camera:zoom-lock` source is held** (v4.7.0; a tool consuming scroll, e.g. DecalTool resize, locks while active; Set-of-sources idiom like `gizmo:suspend`) |
| Q / E | Snap rotate 45° left / right |
| F | Frame selected object (focus on its AABB center) |
| `[` / `]` | Previous / next floor level |
| P | Enter preview mode |
| Esc | Exit preview |
| Home | Reset to default position |

### Implementation

Uses `THREE.Spherical` for orbit. All inputs write to `targetSpherical` / `targetFocus`. Each frame lerps actual values toward targets (factor 0.12) — gives smooth deceleration.

```js
update(dt) {
  // WASD pan
  if (this._keys['KeyW']) this.targetFocus.z -= panSpeed * dt * 60;
  // ...

  // Smooth lerp
  this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * 0.12;
  this.spherical.theta  += (this.targetSpherical.theta  - this.spherical.theta)  * 0.12;
  this.spherical.phi    += (this.targetSpherical.phi    - this.spherical.phi)    * 0.12;
  this.focus.lerp(this.targetFocus, 0.12);

  // phi clamped: [0.05, PI/2 - 0.05] — prevents gimbal lock
  this.spherical.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.spherical.phi));

  this._updateCameraPosition();
}
```

Disable all camera inputs when `gizmo:dragging` = true (subscribe to bus).

Both `_handleKeyDown` and `_handleKeyUp` also guard against input-field focus via `_isTypingTarget(e)` — identical to the same guard in `InputManager`. This prevents Arrow/WASD keys typed inside any `<input>`, `<select>`, or `<textarea>` from moving the camera.

### Floor Clip Plane

When active floor level > 0:
```js
const clipY = zone.floors[level].elevation + zone.floors[level].ceilingHeight;
renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), clipY)];
```
When floor 0 is active: `renderer.clippingPlanes = []`.

Lower floor meshes: set `material.opacity = 0.2`, `material.transparent = true` on all meshes with `floorLevel < activeLevel`. Restore on floor change.

---

## Wall Generation System (WallBuilder.ts)

### Signatures

```ts
// src/builders/WallBuilder.ts

static async build(
  wall:  WallDef,
  zoneId: string,
  zone:  ZoneDef,
  nodes: Map<string, WallNode>,
): Promise<WallBuildOutput>

static async buildRun(
  walls: WallDef[],   // connected chain, ordered start→end
  zoneId: string,
  zone:  ZoneDef,
  nodes: Map<string, WallNode>,
): Promise<WallBuildOutput>

export interface WallBuildOutput {
  mesh:       THREE.Mesh;
  colliders:  RAPIER.Collider[];
  trimMeshes: THREE.Mesh[];       // frames, liners, door jambs/headers, passage trim
}
```

### Hidden segments (v4.5.0)

`WallDef.hidden` walls stay in the run but are physically absent from the build output:

- `buildRun` emits each segment's 4 faces into either the solid `idxArr` or a separate
  `ghostIdx` buffer (segment *i* ↔ `walls[i]`; `resolveRunNodeIds` preserves order). A
  generalized **cap rule** replaced the old open-run endcap block: within the face loop,
  a `capStart`/`capEnd` pair is pushed at every boundary where the neighbor segment is the
  other kind (visible↔hidden) or absent (run end). For all-visible open runs this degenerates
  to exactly the old two endcaps.
- If `ghostIdx` is non-empty, a **ghost mesh** (fresh position attribute, `makeGhostMaterial()`
  — 0x7aa2ff, opacity 0.12, `depthWrite:false`, no shadows) is pushed into `trimMeshes` (so
  the run entry's rebuild/removal disposes it) tagged `userData { ghostPick, hiddenWall,
  selectable:true, editorType:"wall", wallIds }`.
- Hidden walls contribute **no colliders**, and their openings are skipped entirely
  (no CSG, no trim/trigger meshes; `hasAnyOpenings` ignores them).
- `build()` (single wall): the whole mesh gets the ghost material, openings/CSG/colliders
  skipped, same `ghostPick`/`hiddenWall` tags, `castShadow/receiveShadow` off.
- `hidden` is deliberately **not** a `canMerge` criterion and is excluded from ZoneManager's
  run-mate sync (panel writes it via `updateWallSegment`, segmentOnly), so toggling one
  segment never splits or mutates the run.

### Algorithm

```
Input: WallDef { id, startNodeId, endNodeId, floor, height, thickness, material,
                 exteriorMaterial, openings[] }
       nodes Map<id, {x, z}>

Step 1: Resolve coordinates
  start = nodes.get(wall.startNodeId)
  end   = nodes.get(wall.endNodeId)
  length = hypot(end.x - start.x, end.z - start.z)
  angle  = atan2(end.z - start.z, end.x - start.x)
  elevation = zone.floors[wall.floor].elevation

Step 2: build() — single wall custom geometry
  Builds 6-face box geometry directly (not BoxGeometry) for interior + exterior
  material separation and UV tiling per face.

  buildRun() — merged run
  For a chain of walls sharing nodes, builds one merged mesh with:
  - Mitered corner joins (each shared node shortens both walls by thickness/2 on their
    shared end so they meet cleanly at 45°)
  - UV continuity across the full run length

Step 3: CSG Openings (sorted by offsetAlongWall asc)
  csgSubtract() from src/utils/csg.ts
  Cutter = BoxGeometry(width + 0.05, height + 0.05, thickness + 0.1)
  Applied to the merged-run mesh; interior + exterior CSG together.

Step 4: Trim meshes (added to trimMeshes[], never the main mesh)
  - Door/arch openings: jamb + header liner (passage-style inner face)
  - Window openings: sill + lintel liner, side jambs
  - Door trigger volumes: thin sensor mesh tagged { editorType:'trim', triggerType:'door' }
    (used by TriggerSystem in preview mode)

Step 5: Rapier colliders
  Wall segments between openings → ColliderBuilder.registerWallSegments()
  Returns RAPIER.Collider[] — no separate collision meshes

Step 6: userData tagging
  Main mesh: selectable: true, editorType: "wall", wallId
  Trim meshes: selectable: false, editorType: "trim" | "opening"
```

### Run System (ZoneManager)

ZoneManager groups connected walls (sharing a node) into `RunEntry`. All walls in a run
share one merged mesh. `buildRun()` handles corners; `build()` is the single-wall fallback.
When any wall in a run changes, the entire run is rebuilt atomically via `_rebuildWallBatch()`.
Queue coalescing (`_queueRebuild()`) prevents rebuild storms on multi-wall changes.

---

## FloorBuilder.ts

```ts
// src/builders/FloorBuilder.ts

static async build(
  floor: FloorDef,
  bounds: Bounds,
  zoneId: string,
  levelIndex = 0,
  cutterMeshes: THREE.Mesh[] = [],  // world-space CSG cutters from stair csgCutters
): Promise<FloorBuildOutput>

export interface FloorBuildOutput {
  mesh:     THREE.Mesh;
  collider: RAPIER.Collider;
}
```

**Algorithm:**
- Rect floor: `PlaneGeometry(bounds.width, bounds.depth)` rotated -90° to XZ plane
- Polygon floor: `ShapeGeometry` from `floor.floorMesh.points` (or derived from `nodeIds`)
- UV tiling: world-scale repeat using `materialDef.tileScale`
- CSG cuts: if `cutterMeshes.length > 0`, translates geo to world space, applies `csgSubtract()` per cutter, result stays in world space
- Collider: `ColliderBuilder.registerFloor(floor)` → Rapier trimesh (not a visible mesh)

---

## PlatformBuilder.ts

```ts
// src/builders/PlatformBuilder.ts

static async build(
  platform: PlatformDef,
  zoneId: string,
  cuts: CutInfo[] = [],  // stair CSG cutter data from ZoneManager
): Promise<PlatformBuildOutput>

export interface PlatformBuildOutput {
  meshes:   THREE.Mesh[];   // [capMesh, sideMesh, ...innerFaceMeshes, ...railings]
  collider: RAPIER.Collider;
}

export interface CutInfo {
  mesh:            THREE.Mesh;   // world-space BoxGeometry for csgSubtract
  worldX:          number;
  worldZ:          number;
  width:           number;
  depth:           number;
  rotX:            number;       // radians
  rotY:            number;
  rotZ:            number;
  innerTileH:      number;
  innerTileV:      number;
  innerFaceHeight: number;       // = platform.thickness
}
```

**Mesh breakdown:**
- **capMesh**: top + bottom faces only (custom geometry, not BoxGeometry). Polygon platforms use `ShapeGeometry`. Receives CSG cuts in world space.
- **sideMesh**: 4 vertical faces. Separate material (`sideMaterial` / `sideMaterialOverrides`).
- **innerFaceMeshes**: one per `CutInfo`. 4-sided open box covering the slab thickness at each hole — visible from inside. Inward normals so they're front-facing when viewed from the passage.
- **railings**: 4 `BoxGeometry` posts if `hasRailing: true`.

---

## StairBuilder.ts

```ts
// src/builders/StairBuilder.ts

static async build(stair: StairDef, zoneId: string): Promise<StairBuildOutput>

export interface StairBuildOutput {
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];  // one per step — proper step-shaped colliders
}
```

**Mesh breakdown:**
- **bodyMesh**: single merged custom geometry for all step tops/sides/backs (one mesh per material — body material). The underside is **mode-gated** by `stair.underside` (`StairUndersideDef`): `open` (default) = current free-floating per-step boxes; `diagonal` = a solid wedge — per-step side trapezoids + a single slanted soffit plane offset below the nosing line by `thickness` (a front cap fills the sub-floor nose, a back cap closes the top); `closed` = the same but the underside is flat at the floor (`y = start.y`) with a vertical back cap. Side-corner local y is constant across steps (`hh − effThk` / `3·hh − effThk`, or floor for closed), so the soffit tiles watertight. `thickness` is the **clearance below the steps** (visible stringer depth); the internal drop below the nosing line is `effThk = thickness + stepRise`, which is always `> stepRise` so the plane clears the inner step corners (the front nose dips `thickness` below the floor, closed off by the front cap). New faces reuse the **body material**, and the stringer side/underside faces use **continuous world-space UVs** (via `pushQuadUV` with explicit per-corner UVs — sides map u=run distance / v=world height, soffit maps u=run / v=width) so one large texture flows across the whole stringer instead of restarting per step (the per-step `pushQuad` restarts UVs at `(0,0)`, which is fine for separate treads but tiled visibly on a continuous panel). Colliders are unchanged (per-step) regardless of underside mode.
- **riserMesh**: single merged geometry for all step front faces (`riserMaterial` if set, else falls back to body material)
- **railing meshes**: per side, an open railing built from `BoxGeometry` parts when `hasRailing: true` — a sloped top rail plus vertical balusters anchored at the **centre of each step's tread** (local x = 0, outer edge), so posts sit on the tread rather than overhanging the nosing, and the rail (derived from the same anchors) spans first→last tread centre plus a symmetric `overhang` each end. Config comes from `stair.railing` (`StairRailingDef`): `topRail`/`balusters` toggles, `height`, `stepInterval` (a post every N steps, top step always included), `barThickness`, `postThickness`. Absent → defaults (0.9 / every step / 0.1 / 0.06). Built via a slope-aligned orthonormal basis (`makeBasis`): rail follows the diagonal, posts are world-vertical.
- **CSG cutter wireframe**: `LineSegments` (EdgesGeometry of cutter box) if `stair.csgCutter` is set. Tagged `editorOnly: true` — hidden in preview mode.

**Algorithm (straight style):**
```
numSteps  = stair.numSteps ?? round(heightDiff / 0.2)
stepRise  = heightDiff / numSteps
stepDepth = horizDist / numSteps
angle     = atan2(dz, dx)

For each step i:
  center = start + t*(end-start)  where t = (i + 0.5) / numSteps
  Build 6-face custom geometry rotated by angle in world space
  (body faces: top, bottom, left, right, back; riser: front face)
```

**Colliders:** `ColliderBuilder.registerStairSteps(stair)` → one box collider per step.

---

## ObjectPlacer.ts

> **Status: implemented (Phase 10.7, Option B full extraction).** `src/preview/ObjectPlacer.ts`
> owns the placed-object domain. The old inline `ZoneManager._loadObjectMesh()` was removed;
> `ZoneManager` now calls `objectPlacer.build(obj, zoneId)` (in `loadZone` + the `object:added`
> handler) and `objectPlacer.remove(objectId)` (in `_removeObject` + `unloadZone`), keeping only
> `objectsGroup`/`objectMeshes` registration so SelectionManager/disposal still work. `App.tsx`
> constructs it (`new ObjectPlacer(bus)`), injects it into `ZoneManager`, and drives mixers via
> `scene.onUpdate(dt => objectPlacer.update(dt))` (active in editor **and** preview).
>
> `build()` uses `assetManager.loadGLTF` + `SkeletonUtils.clone` for GLTF assets (skeleton-safe
> for skinned/animated props; static meshes clone identically) and `assetManager.loadModel` for
> OBJ. It lazily back-fills `assetDef.animations` the first time it loads a GLTF, so assets
> imported before clip discovery existed still get clip names. On load failure it returns the
> orange wireframe fallback box (same as before). The player mixer in `CharacterController` is
> separate and unaffected; Phase 13 NPCs/enemies reuse this subsystem.
>
> **Phase 10.9 additions:** a `_meshes: Map<id, Object3D>` registry (set in `build`, cleared in
> `remove`) plus two constructor bus subscriptions for script actions — `object:play-animation`
> (reuses `previewClip`) and `object:updated` with `{ material }` (loads `assetManager.getMaterial`
> and traverses the object's meshes, flipping `_ownsMaterial=false`). `build` also applies
> `obj.material` when present. ScriptEngine has already group-resolved the target id, so these
> handlers act on a single concrete object id.
>
> **Animation playback options:** `previewClip(objectId, clipName, opts?)` takes
> `{ loop?, hold? }`. The `play_animation` script action forwards `action.animationLoop` /
> `action.animationHold` through the `object:play-animation` event. `loop` → `LoopRepeat`;
> `hold` → play once and clamp on the final frame (e.g. a death pose stays lying down);
> default → play once then revert to auto-play/bind pose. The revert is driven by a
> `finished`→`stopPreview` listener that is **only** registered in the default case (loop
> never finishes; hold must not revert). The Properties-panel preview button calls
> `previewClip` with no opts, so it keeps the play-once-then-revert behaviour.
>
> **Crossfade / blending:** clip switches are blended, not hard-cut. A `_active: Map<id,
> AnimationAction>` tracks the currently-playing action; `_fadeTo(objectId, mixer, clip,
> {loop, duration})` resets+plays the next action and `prev.crossFadeTo(next, duration)` from
> the tracked active one (duration 0 → hard cut). Used at `previewClip` (blend in, duration =
> `action.animationBlend ?? BLEND_SEC`), `stopPreview` (blend back to the resting clip), and
> `setAutoPlay` (blend resting-clip swaps). `_setupMixer`'s first auto-play is a hard start
> (nothing to blend from) but records `_active` so the first switch can fade. Per-action
> override: `ScriptAction.animationBlend` (seconds) flows through `object:play-animation`'s
> `blend`. Default `BLEND_SEC = 0.3`. Teardown paths (`remove`, `object:despawn`) clear
> `_active`. Cost: a blend evaluates two clips for that one model during the overlap window —
> see Performance Concerns.
>
> **Skinned-mesh frustum culling:** `build` disables `frustumCulled` on skinned meshes only
> (`isSkinnedMesh`) so animation-displaced submeshes like eyes/face don't get culled against
> a stale bind-pose bounding sphere. See **Performance Concerns → Skinned-mesh frustum
> culling** for the full rationale and the crowd-scale upgrade path.

```ts
class ObjectPlacer {
  // mixers/clips/auto-play/preview state keyed by objectId
  constructor(bus: EventBus) {}

  async build(obj: WorldObject, zoneId: string): Promise<THREE.Object3D> {
    // GLTF → loadGLTF + SkeletonUtils.clone (+ read gltf.animations, back-fill assetDef.animations)
    // OBJ  → assetManager.loadModel
    // sets position/rotation(deg→rad)/scale + userData (editorId/_parentId for selection),
    // castShadow/receiveShadow; if clips exist, builds an AnimationMixer + clip map and
    // starts obj.autoPlayAnimation looping. Returns the root (ZoneManager parents it).
  }

  remove(objectId: string): void {}              // tear down mixer/clips/preview (geometry: ZoneManager)
  update(dt: number): void {}                     // advance all mixers — registered on SceneManager RAF
  previewClip(objectId, clipName, opts?): void {} // play clip; opts {loop, hold, blend}; one preview at a time
  stopPreview(objectId): void {}                  // restore auto-play clip or bind pose
  setAutoPlay(objectId, clipName | null): void {} // change resting-state loop; takes effect immediately
}
```

---

## ShapeBuilder.ts (v4.9.0)

Parametric shape primitives — cylinder/cone, wedge/ramp, flexible box (`ShapeDef.kind`).

```ts
// src/builders/ShapeBuilder.ts
export function resolveShapeParams(def: ShapeDef): ResolvedShapeParams;  // defaults + clamps
export const FLAT_SHADE_MAX_SEGMENTS = 11;  // ≤ 11 radial segments → flat side normals

export class ShapeBuilder {
  static buildLocalGeometry(def: ShapeDef, tileScale: number): THREE.BufferGeometry; // mesh + tool ghost
  static localHullPoints(def: ShapeDef): Float32Array;   // convex-hull cloud for the collider
  static async build(def: ShapeDef, zoneId: string): Promise<ShapeBuildOutput>; // { mesh, collider }
}
```

**The local-space contract** (prerequisite for the future Phase-12 vertex-editable brush):
geometry is ALWAYS generated in local space — footprint centered on the XZ origin, base at
local y = 0 (`position.y` = bottom, the platform convention). `position`/`rotation`
(Euler°, XYZ) are applied as `mesh.position`/`mesh.rotation` and mirrored onto the Rapier
collider (`registerShape`). They are **never baked into vertices** — moving updates
`position` only, rotating updates `rotation` only, so mesh and collider cannot drift
(unlike world-space-baked platforms/floors/walls).

- One mesh per shape, `selectable: true`, single material via the standard
  `getMaterialWithOverrides → getMaterial → getDefaultMaterial` chain; `applyUVOffset`
  honored.
- **Cylinder**: rings hand-built (not `THREE.CylinderGeometry` — its side UVs are
  parametric, not metric). Side UVs = cylindrical metric unwrap: `u = arcLenMeters /
  tileScale` per ring (each ring uses its own circumference, so cones keep world density),
  `v = slantLen / tileScale`. `radiusTop: 0` → cone (apex triangles, no top cap). Flat
  per-face side normals at ≤ `FLAT_SHADE_MAX_SEGMENTS` (crisp hex pillar / tri prism);
  analytic smooth frustum normals `normalize(h·cosθ, rB−rT, h·sinθ)` above.
- **Wedge / flexible box**: planar faces via `pushQuadMetric` — face normal from the
  corner cross product, in-plane metric UVs (u along the a→b edge, v along normal×u,
  meters ÷ tileScale) so slanted tops and tapered/sheared sides tile at wall density.
  Wedge with `heightLow: 0` degenerates the front face away (side triangles). Box
  taper/shear keeps all four side faces planar (top/bottom edges stay axis-parallel).
- **Face-brushes (v4.11.0)**: when `mesh.faces` is present (`isFaceBrush`), the loops
  are authoritative — `_buildFaceBrush` groups faces by effective material
  (`face.material ?? shape.material` + overrides key) into **one mesh per group**
  (single-material brush = 1 draw call), fan-triangulates with flat Newell normals and
  per-face metric UVs, stamps `userData.faceGroups` (triangle range → face index) for
  face-mode picking, and registers a **trimesh** collider from `localTrimesh(def)`
  (concave solids collide exactly). Topology lives in `src/editor/brushOps.ts`
  (facesFromCloud / splitFaceQuad / extrudeFace / validateMesh — pure, fresh-array
  outputs for the undo journal).

## ZoneManager.ts

### Internal Entry Types

```ts
interface RunEntry {
  mesh:       THREE.Mesh;
  colliders:  RAPIER.Collider[];
  wallIds:    string[];     // all wall IDs in this merged run
  trimMeshes: THREE.Mesh[];
}

interface PlatformEntry {
  meshes:   THREE.Mesh[];
  collider: RAPIER.Collider;
}

interface ShapeEntry {           // v4.9.0 — parametric shapes
  mesh:     THREE.Mesh;          // one mesh per shape, local-space geometry + transform
  collider: RAPIER.Collider | null;  // convex hull; removed + re-registered per rebuild
}

interface StairEntry {
  group:     THREE.Group;
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];
  def:       StairDef;      // kept to detect CSG cutter changes on rebuild
}

interface ZoneEntry {
  group:            THREE.Group;
  floorsGroup:      THREE.Group;
  wallsGroup:       THREE.Group;
  platformsGroup:   THREE.Group;
  stairsGroup:      THREE.Group;
  floorColliders:   Map<string, RAPIER.Collider>;   // floorId → collider
  wallData:         Map<string, RunEntry>;           // wallId → run (multiple IDs can map to same RunEntry)
  platformEntries:  Map<string, PlatformEntry>;
  stairEntries:     Map<string, StairEntry>;
}
```

### loadZone

```
1. Build floors (with CSG cuts from any existing stair cutters)
2. Group walls into runs (chains of walls sharing nodes)
   → buildRun() for each run, or build() for isolated walls
3. Build platforms (with CSG cuts)
4. Build stairs (including cutter wireframes)
5. Place objects (GLTF via ObjectPlacer)
6. Second pass: for each stair with csgCutter → _rebuildOverlapping()
   (needed because floors are built before stairs on initial load)
7. Apply floor dimming
```

### Key Patterns

**Wall run system**
Connected walls (sharing a node) → grouped into `RunEntry`. `wallData` maps every wallId in the run to the same `RunEntry`. On rebuild, the entire run is rebuilt atomically via `_rebuildWallBatch()`.

**Queue-based coalescing**
`_queueRebuild(zoneId, wallId)` and `_queuePlatformRebuild(zoneId, platformId)` batch changes via `Promise.resolve().then(...)` (microtask). Multiple rapid changes to the same zone merge into a single rebuild pass.

**Wall-op serialization (v4.5.1)**
Coalescing alone was not enough: `_rebuildWallBatch` and `_removeWall` both mutate `wallData`/`wallsGroup` across `await`s, and two in flight at once each rebuilt the same surviving run → **stacked duplicate meshes plus an untracked orphan** (z-fighting flicker; the orphan then ignores moves/undo). Undoing a wall split triggers exactly that — `_applyChanges` emits `wall:updated` (→ coalesced batch) *and* `wall:removed` (→ `_removeWall`) in the same tick. All wall mesh ops are now funneled through one promise chain (`_wallOpChain` via `_enqueueWallOp`) so they run strictly one at a time; errors are caught so a failed op can't stall the chain.

**Token-based staleness (platforms)**
Each platform rebuild increments a token. Async `PlatformBuilder.build()` captures the token; if it has changed by the time the result arrives, the result is discarded. Prevents stale async results from overwriting newer rebuilds.

**Wall-run stale rebuild fix**
`_removeWall` computes the surviving run synchronously, then calls `await WallBuilder.buildRun()`. After the await, it checks that at least one wall from the run still exists in `zone.walls`. If not (rapid multi-delete emptied the run), the freshly-built mesh and colliders are disposed immediately and discarded — no ghost mesh is added to the scene.

**Dimming system**
`_applyDimming()` clones materials for meshes whose `floorLevel` ≠ active level and sets reduced opacity. `_pruneDimMaterials()` disposes clones that are no longer in use. Materials at the active level are restored to full opacity.

**CSG cutter integration**
`stair:added/updated/removed` → `_rebuildOverlapping(zoneId, stair)` computes the cutter's world AABB and rebuilds any floor/platform whose bounds overlap.
- `_getStairCuttersForFloor(zoneId, floor)` → `THREE.Mesh[]` (plain cutter meshes for FloorBuilder)
- `_getStairCuttersForPlatform(zoneId, platform)` → `CutInfo[]` (includes tiling + inner face data for PlatformBuilder)

**Preview toggle**
`preview:start` → iterate all stairEntries, set `mesh.visible = false` for any mesh with `userData.editorOnly === true` (CSG wireframes etc.)
`preview:stop` → restore visibility

**Overlay decal lifecycle (v4.7.0)**
`_decalMeshes: Map<zoneId, Map<decalId, Mesh>>` mirrors `_volumeMeshes`. `_buildDecals`
runs in `loadZone` **after** the stair-CSG second pass (decals project onto final cut
geometry). Targets = meshes in the zone group with `selectable && editorType ∈
{wall,floor,platform,stair} && !ghostPick`. Rebuild survival: `*:rebuilt` events mark
dirty any decal whose projector AABB intersects the rebuilt entity's new bounds OR whose
`userData._decalTargets` (ids recorded at projection time) contains the entity — the
latter catches "target moved away" (stale mesh would float in air). Dirty set coalesces
per microtask; regens are chained through `_wallOpChain` (never observe a half-rebuilt
run) and emit `decal:rebuilt`. Decal materials are always `_ownsMaterial: true`
(geometry+material disposed on remove/rebuild; textures stay in the AssetManager cache).
`quality:changed` needs no special decal handling — the full unload/reload rebuilds them.

**Surface-effect decal patches (v4.8.0)**
`kind: "surface"` decals have no mesh — the intersected surface's material is swapped
for a shader-patched CLONE (`surfaceDecals.ts`, max 4 per mesh). `_surfacePatches:
Map<zoneId, Map<Mesh, {original, ownedBefore, decalIds}>>` + `_refreshSurfaceDecals()`
is a reconcile pass: patch new meshes, uniform-only-update already-patched ones
(`material.uuid` stable), and unpatch (restore `original`, restore `ownedBefore`,
dispose the clone) when the last stain leaves a mesh. Runs from `loadZone`, from
`_rebuildDecal` on EVERY decal change — including `decal:removed`, which must route
through `_rebuildDecal`, not just `_removeDecalMesh` (learned in verification: skipping
it left the wall patched after delete) — and via the dirty queue after target rebuilds
(the patch re-lands on the new run mesh).

**History restore**
`history:restore` → `unloadZone(activeZoneId)` then `loadZone(activeZoneId)`. Called by ZoneManager after `HistoryManager` calls `world.loadFromJSON(snapshot)` to rebuild all scene geometry from the restored WorldState. Identical code path to `scene:load`, so it is proven and safe. Selection is cleared via `object:deselected` emitted immediately before `history:restore`.

---

## TransitionManager.ts

```js
class TransitionManager {
  constructor(worldState, zoneManager, bus) { ... }

  async trigger(transitionId) {
    if (this._transitioning) return;
    this._transitioning = true;
    const t = this._worldState.transitions.get(transitionId);

    if (t.effect === 'fade') {
      this._bus.emit('overlay:fade-in', { color: t.fadeColor ?? '#000000', duration: t.fadeDuration ?? 0.3 });
      await this._sleep((t.fadeDuration ?? 0.3) * 1000);
      await this._zoneManager.unloadZone(t.fromZone);
      await this._zoneManager.loadZone(t.toZone);
      this._worldState.setActiveZone(t.toZone);
      this._bus.emit('character:teleport', { position: t.spawnPoint, facing: t.spawnPoint.facing });
      this._bus.emit('overlay:fade-out', { duration: t.fadeDuration ?? 0.3 });
      await this._sleep((t.fadeDuration ?? 0.3) * 1000);
      const zoneName = this._worldState.zones.get(t.toZone).name;
      this._bus.emit('preview:zone-entered', { zoneName });
    }

    this._transitioning = false;
  }

  // Editor mode: jump without character, just camera
  async editorJump(transitionId) {
    const t = this._worldState.transitions.get(transitionId);
    this._bus.emit('overlay:fade-in', { color: '#000000', duration: 0.2 });
    await this._sleep(200);
    await this._zoneManager.unloadZone(t.fromZone);
    await this._zoneManager.loadZone(t.toZone);
    this._worldState.setActiveZone(t.toZone);
    const zone = this._worldState.zones.get(t.toZone);
    this._bus.emit('camera:jump', { x: zone.bounds.x + zone.bounds.width / 2, z: zone.bounds.z + zone.bounds.depth / 2 });
    this._bus.emit('overlay:fade-out', { duration: 0.2 });
  }

  _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}
```

---

## Editor Tool State Machines

### FloorTool.ts

```
States: IDLE → PLACING → IDLE

IDLE:
  Show 0.5m grid-snapped cursor square following mouse on ground plane
  On input:click (left): record snapToGrid(worldPos), enter PLACING

PLACING:
  Show semi-transparent preview PlaneGeometry from startPoint to mousePos (updated each input:mousemove)
  Preview color: rgba(80,140,255, 0.3)
  On input:mousemove: resize preview mesh
  On input:click (left): create floor
    bounds = normalizeRect(startPoint, endPoint)  // ensure positive width/depth
    if bounds.width < 0.5 or bounds.depth < 0.5: ignore
    floorDef = { level: activeLevel, elevation: activeLevel * 3.0, shape: 'rect',
                 material: selectedMaterial, ... }
    // elevation always defaults to activeLevel * 3.0 — same formula as WallTool.
    // Never copied from an existing floor at that level (would inherit user overrides).
    worldState.addFloor(zoneId, floorDef)
    Remove preview mesh
    Return to IDLE
  On input:keydown Escape or input:mousedown right: remove preview, return to IDLE

Grid snap: Math.round(val / 0.5) * 0.5 on all x,z coordinates
```

### WallTool.ts

```
States: IDLE → DRAWING → DRAWING (chains)

IDLE:
  Show snapped dot at mouse world position
  On input:click: record startPoint (snapped), enter DRAWING

DRAWING:
  Ghost wall: thin BoxGeometry(currentLen, defaultHeight, 0.2), grey, 50% opacity
  Updated each input:mousemove (rebuild ghost each frame with new length/angle)
  Show floating text label with length in meters above midpoint
  Shift held: snap angle to nearest 45°

  On input:click:
    endPoint = snapped (or angle-snapped if Shift)
    if distance(start, end) < 0.5: ignore
    Snap to nearby existing node if within snap radius (0.5m)
    If no existing node at start/end: worldState.addNode(zoneId, newNode)
    Detect loop close (endNode == chainStartNode) → emit 'floortool:suggest-auto-floor'
    wallDef = { id: uuid(), startNodeId, endNodeId, floor: activeLevel, height: 3.0,
                thickness: 0.2, material: selectedMaterial, exteriorMaterial: selectedMaterial, openings: [] }
    worldState.addWall(zoneId, wallDef)
    startNodeId = endNodeId  ← chain continues
    Remain in DRAWING

  On input:dblclick or input:keydown Enter: finish chain, return to IDLE
  On input:keydown Escape or input:mousedown right: discard ghost, return to IDLE
```

### PlatformTool.ts

```
States: IDLE → PLACING → IDLE (same rect-drag as FloorTool)

Extra: scroll wheel during PLACING adjusts Y offset in 0.2m increments
Default Y = activeFloor.elevation + defaultWallHeight (sits at top of current floor walls)
Status label shows current Y elevation during PLACING
```

### StairTool.ts

```
States: IDLE → SET_BOTTOM → SET_TOP → IDLE

SET_BOTTOM:
  Raycast against floor meshes + platform meshes + ground (not walls)
  Cursor snaps to nearest floor surface hit
  On input:click: record bottomPoint, enter SET_TOP

SET_TOP:
  Show preview line from bottomPoint to mouse
  Cursor still snaps to floor surfaces
  Show angle label and height label
  Scroll wheel adjusts stair width (0.8m–4.0m, default 1.5m)

  On input:click:
    if topPoint.y <= bottomPoint.y: flash error "Top point must be higher", stay in SET_TOP
    stairDef = { id: uuid(), start: bottomPoint, end: topPoint, width, style, material, hasRailing: true }
    worldState.addStair(zoneId, stairDef)
    Return to IDLE

  On input:keydown Escape: return to IDLE
```

### ShapeTool.ts (v4.9.0)

```
One class behind three ToolIds (shape-cylinder / shape-wedge / shape-box) — a single
toolbar "Shape" button with a variants popover (floor/platform pattern). Kind derives
from the active ToolId on tool:select.

States: IDLE → PLACING → IDLE

cylinder:  click = CENTER → mousemove = radius (snapped, min 0.25) → click commits
           radiusTop = radiusBottom = r, height 2, radialSegments 16
wedge/box: two-click footprint rect (PlatformTool pattern, GRID 0.5, MIN_SIZE 0.5)
           wedge: heightLow 0 → heightHigh 1.5, high edge on −Z (rotate after placing)
           box:   height 2, taper 1, shear 0 (tune in the panel)

Base elevation = first click's surfacePos.y (sit ON whatever was clicked); falls back
to the active level's floor top. Ghost preview = the REAL ShapeBuilder.buildLocalGeometry
in translucent blue (true cone/wedge silhouette), regenerated per mousemove with
dispose-before-replace. Commit inside world.transaction("add shape") + tool:placed
(auto-select via SelectionManager). Escape / RMB cancels.
```

### ObjectTool.ts

```
Mode A — Placing (asset selected in AssetBrowser):
  Ghost model follows snapped mouse position on nearest floor/platform surface (raycast)
  On input:click: ObjectPlacer.place(assetId, position, floor, zoneId), stay in Mode A
  On Escape: deactivate asset selection, return to passive Mode B

Mode B — Transform (object selected via SelectionManager):
  G key: enter translate mode (object follows mouse XZ, Y locked to floor surface)
  R key: enter rotate mode (mouse X delta → Y rotation, 45° snap unless Alt held)
  S key: enter scale mode (mouse Y up = larger, Y down = smaller, uniform)
  In any transform mode: click confirms, Escape cancels (restores original transform)
  After confirm: worldState.updateObject(...)

Grid snap: 0.5m (disable with Alt key)
Rotation snap: 45° (disable with Alt key)
```

### ZoneTool.ts

```
States: IDLE → PLACING → NAMING → IDLE

IDLE:
  Draw dashed outlines of all existing zone boundaries
  On input:click in empty area (no zone hit): enter PLACING

PLACING:
  Drag to define zone rect (same as FloorTool)
  On input:click: capture bounds, enter NAMING

NAMING:
  Show input dialog (React UI, not canvas) for zone name and type
  Bus event 'zonetool:awaiting-name' → React shows modal
  React emits 'zonetool:name-confirmed' { name, type }
  ZoneTool creates zoneDef, calls worldState.addZone()
  Sets new zone as active zone
  Return to IDLE

Clicking inside an existing zone: set as active zone (no state change)
```

### TransitionTool.ts

```
Requires: a wall with a door opening already exists and is selected

Step 1: User selects wall via SelectTool → PropertiesPanel shows openings list
Step 2: User clicks "Link zone..." next to a door opening in PropertiesPanel
        → bus emits 'transitiontool:start' { wallId, openingId }
Step 3: ZonePanel highlights available destination zones
Step 4: User clicks a zone in ZonePanel
        → bus emits 'zonetool:zone-selected' { zoneId }
Step 5: TransitionTool computes default spawn point:
        1m inside destination zone from the direction the door faces
Step 6: Creates transitionDef, calls worldState.addTransition()
Step 7: WallBuilder rebuilds the wall (trigger volume now linked)
Step 8: Visual: dashed line drawn between source zone and destination zone
Step 9: Clicking a linked door opening in editor → TransitionManager.editorJump()
```

### DecalTool.ts (Phase 20)

No PLACING state — the tool is either disarmed or armed with a texture and stays armed
across stamps (repeat stamping is the workflow):

```
tool:select "decal"          → active (App auto-opens the "decals" left panel)
decaltool:texture {id, kind} → armed: quad ghost created (PlaneGeometry, MeshBasicMaterial,
                               polygonOffset −4, renderOrder 50, editorOnly)
input:mousemove              → own raycast vs {wall,floor,platform,stair} (!ghostPick);
                               hit → ghost at point + normal·0.01, quaternion from
                               decalOrientation(normal, roll); emits camera:zoom-lock ON
                               no hit → ghost hidden, zoom-lock OFF
input:wheel                  → size ×= exp(−delta·0.001) clamped 0.1–8 m
input:wheel + shift          → roll −= delta·0.1°     ([ / ] = ±15° fallback)
input:click (L)              → world.transaction("place decal", addDecal(def)) — def captures
                               anchor/normal/roll/size; emits decal:placed; STAYS ARMED
Escape                       → emits decaltool:texture null (disarms + clears picker highlight)
```

The ghost is a cheap quad because a live DecalGeometry per mousemove would clip a merged
run's entire index buffer every frame; the real projection is built once by ZoneManager
on `decal:added`.

**Surface-decal selection (Phase 21):** `kind:"surface"` decals have no mesh, so this
tool also owns their picking — analytic ray-vs-projector-rectangle on `input:click`
(Select tool, or Decal tool while disarmed; occluders in front block the pick), emitting
`object:selected` after SelectionManager's handler so it overrides the wall pick
(TriggerVolumeTool pattern). A cyan `LineLoop` rectangle marks the selected stain,
re-positioned on `decal:updated`.

---

## AssetManager.ts

```js
class AssetManager {
  constructor() {
    this._textureCache  = new Map();
    this._materialCache = new Map();
    this._gltfCache     = new Map();
    this._textureLoader = new THREE.TextureLoader();
    this._gltfLoader    = null;
  }

  async loadTexture(url) {
    if (this._textureCache.has(url)) return this._textureCache.get(url);
    const tex = await this._textureLoader.loadAsync(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._textureCache.set(url, tex);
    return tex;
  }

  async getMaterial(materialId) {
    if (this._materialCache.has(materialId)) return this._materialCache.get(materialId);
    const def = MATERIAL_REGISTRY[materialId];
    if (!def) {
      console.warn(`Unknown material: ${materialId}, using default`);
      return new THREE.MeshStandardMaterial({ color: 0x888888 });
    }
    const mat = new THREE.MeshStandardMaterial({
      map:       await this.loadTexture(def.texture),
      roughness: def.roughness ?? 0.8,
      metalness: def.metalness ?? 0.0,
    });
    if (def.normalMap) mat.normalMap = await this.loadTexture(def.normalMap);
    this._materialCache.set(materialId, mat);
    return mat;
  }

  async loadGLTF(assetId) {
    if (this._gltfCache.has(assetId)) return this._gltfCache.get(assetId);
    if (!this._gltfLoader) {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      this._gltfLoader = new GLTFLoader();
    }
    const gltf = await this._gltfLoader.loadAsync(`/assets/models/${assetId}.glb`);
    this._gltfCache.set(assetId, gltf);
    return gltf;
  }

  dispose() {
    this._textureCache.forEach(t => t.dispose());
    this._materialCache.forEach(m => m.dispose());
    this._textureCache.clear();
    this._materialCache.clear();
    this._gltfCache.clear();
  }
}

// Material registry — add entries as textures are added to /assets/textures/
const MATERIAL_REGISTRY = {
  brick_01:          { texture: '/assets/textures/brick_01.jpg',      tileWidth: 1.0, tileHeight: 1.0, roughness: 0.9 },
  brick_exterior_01: { texture: '/assets/textures/brick_ext_01.jpg',  tileWidth: 1.0, tileHeight: 1.0, roughness: 0.85 },
  cobblestone:       { texture: '/assets/textures/cobblestone_01.jpg',tileWidth: 1.0, tileHeight: 1.0, roughness: 0.95 },
  wood_planks:       { texture: '/assets/textures/wood_planks_01.jpg',tileWidth: 0.8, tileHeight: 0.8, roughness: 0.7 },
  concrete_01:       { texture: '/assets/textures/concrete_01.jpg',   tileWidth: 2.0, tileHeight: 2.0, roughness: 0.8 },
};
```

---

## CollisionWorld.ts

> **Superseded by Rapier (Phase 3).** Replaced by `src/physics/PhysicsWorld.ts` + `src/physics/ColliderBuilder.ts`. `three-mesh-bvh`'s `computeBoundsTree()` is still called on visual meshes for **editor raycasting** (selection, snapping) — but all runtime collision is Rapier. See the **Physics Architecture** section for full implementation details.


## CharacterController.ts

```js
class CharacterController {
  constructor(scene, camera, collisionWorld, inputManager, bus, settings) {
    this._settings = settings; // from worldState.world.playerSettings
    this._velocity = new THREE.Vector3();
    this._position = new THREE.Vector3();
    this._yaw = 0;
    this._pitch = 0;
    this._grounded = false;
    this._active = false;
    this._capsuleRadius = 0.3;
    this._capsuleHeight = 1.8;
  }

  spawn(position) {
    this._position.copy(position);
    this._velocity.set(0, 0, 0);
    this._active = true;
    this._bus.on('input:mousemove', this._onMouseMove = ({ delta }) => {
      if (document.pointerLockElement) {
        this._yaw   -= delta.x * 0.002;
        this._pitch  = Math.max(-1.4, Math.min(1.4, this._pitch - delta.y * 0.002));
      }
    });
  }

  despawn() {
    this._active = false;
    this._bus.off('input:mousemove', this._onMouseMove);
  }

  update(dt) {
    if (!this._active) return;

    // --- Input ---
    const s = this._settings;
    const fwd  = new THREE.Vector3(-Math.sin(this._yaw), 0, -Math.cos(this._yaw));
    const right = new THREE.Vector3(-Math.cos(this._yaw), 0,  Math.sin(this._yaw));
    const move  = new THREE.Vector3();
    if (this._input.isKeyDown('KeyW')) move.add(fwd);
    if (this._input.isKeyDown('KeyS')) move.sub(fwd);
    if (this._input.isKeyDown('KeyA')) move.sub(right);
    if (this._input.isKeyDown('KeyD')) move.add(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(s.moveSpeed);

    this._velocity.x = move.x;
    this._velocity.z = move.z;

    // --- Gravity ---
    this._velocity.y -= 20 * dt;

    // --- Ground check ---
    const groundY = this._collisionWorld.getGroundHeight(this._position.x, this._position.z);
    const feetY = this._position.y - this._capsuleHeight / 2;
    if (feetY <= groundY) {
      this._position.y = groundY + this._capsuleHeight / 2;
      this._velocity.y = Math.max(0, this._velocity.y);
      this._grounded = true;
    } else {
      this._grounded = false;
    }

    // --- Jump ---
    if (this._grounded && this._input.isKeyDown('Space')) {
      this._velocity.y = Math.sqrt(2 * 20 * s.jumpHeight);
    }

    // --- Apply velocity ---
    this._position.addScaledVector(this._velocity, dt);

    // --- Camera ---
    if (s.cameraMode === 'fps') {
      this._camera.position.set(
        this._position.x,
        this._position.y + this._capsuleHeight * 0.4,
        this._position.z
      );
      this._camera.rotation.order = 'YXZ';
      this._camera.rotation.y = this._yaw;
      this._camera.rotation.x = this._pitch;
    } else {
      const offset = new THREE.Vector3(
        -Math.sin(this._yaw) * s.thirdPersonDistance,
        s.thirdPersonHeight,
        -Math.cos(this._yaw) * s.thirdPersonDistance
      );
      this._camera.position.copy(this._position).add(offset);
      this._camera.lookAt(this._position.x, this._position.y + 1.0, this._position.z);
    }

    // --- Trigger check ---
    const trigger = this._collisionWorld.checkTriggers(this._position);
    if (trigger?.triggerType === 'door' && trigger.transitionId) {
      this._bus.emit('character:triggerdoor', { transitionId: trigger.transitionId });
    }
  }
}
```

---

## PreviewController.ts

```js
class PreviewController {
  constructor(sceneManager, editorCamera, characterController, collisionWorld, worldState, bus) { ... }

  async enter() {
    this._bus.emit('preview:start', {});
    await document.body.requestPointerLock();
    this._collisionWorld.buildFromZone(this._worldState.activeZoneId);
    const spawnPos = this._editorCamera.focus.clone();
    spawnPos.y = this._collisionWorld.getGroundHeight(spawnPos.x, spawnPos.z) + 0.9;
    this._characterController.spawn(spawnPos);
    this._sceneManager.onUpdate(dt => this._characterController.update(dt));
    this._bus.on('character:triggerdoor', ({ transitionId }) => {
      this._transitionManager.trigger(transitionId);
    });
    this._bus.on('input:keydown', ({ code }) => { if (code === 'Escape') this.exit(); });
    document.addEventListener('pointerlockchange', this._onLockChange = () => {
      if (!document.pointerLockElement) this.exit();
    });
  }

  exit() {
    this._characterController.despawn();
    this._collisionWorld.clear();
    document.exitPointerLock();
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this._bus.emit('preview:stop', {});
  }
}
```

---

## React UI Components

### PropertiesPanel.tsx

Subscribes to `object:selected` and `object:deselected`. Renders a view based on `selected.type`:

**OpeningView** — type (door/window/arch/passage), offset along wall, width, height, elevation, trim toggle, inner tiling (T+B, L+R). Changes emit `wall:updated`.

**WallView** — height, thickness, interior material + overrides, exterior material. Openings list (add/edit/remove). **SegmentsSection** (when `runWalls.length > 1`): expandable list of run-mate wall segments with per-segment material overrides. Changes emit `wall:updated` or `wall:updated` with `segmentOnly:true`. (v4.5.0) Each `WallSegmentRow` also carries a **👁 visibility toggle** (writes `{ hidden }` via `updateWallSegment`; card dims + HIDDEN badge when off) and **row hover** emits `wall:segment-hover { zoneId, wallId|null }` (cleanup on unmount) → `SegmentHighlighter` overlays a translucent box on that segment in the canvas. The screen footer notes the canvas gesture: *right-click a wall to insert a vertex* (WallSplitter).

**FloorView** — elevation, material, material overrides (tile scale, roughness, displacement, map toggles). (v4.6.0) Floors also get a **Geometry screen** (`FloorGeoView`): rect node-backed floors show POSITION X/Z (centroid) + SIZE W/D fields that recompute all 4 node positions by min/max membership in one batched transaction (nodeIds order never reshuffled — NodeDragger's rect-corner constraints depend on it), with read-only corner rows; polygon node-backed floors show an editable vertex list (`FloorVertexRow`, X/Z per node → `updateNode` via App's `handleFloorNodesUpdate`); legacy floors (no/broken `nodeIds`) edit `floorMesh.points` directly via `updateFloor` (broken-node edits detach `nodeIds`, making points authoritative again — avoids the resolveFloorMesh `{0,0}` collapse). Each node-backed row shows a blue **LINKED** chip when `getNodeLinks` reports another entity sharing the node, and row hover emits `node:link-hover` → SegmentHighlighter overlays a node marker + boxes over every linked wall/floor/platform. `WallSegmentRow` gets the same LINKED chip when a wall node is shared with a floor/platform (wall–wall sharing ignored — chained walls always share nodes).

**PlatformView** — position XYZ, size (width/depth), thickness, railing toggle + height, two material sections: cap (top/bottom) and side, each with full overrides.

**StairView** — start/end vectors, an alternate **`H · L · R°` row** (height / horizontal length / bearing, two-way bindings that rewrite `end` from `start`), step count, width, railing toggle (when on, a `RAILING` sub-section exposes Top rail / Balusters checkboxes + Height / Post every N steps / Rail thickness / Post thickness / Side inset / Rail overhang inputs, writing `stair.railing`); an **UNDERSIDE section** (Open / Diagonal / To-floor segmented buttons + a Stringer-thickness input shown only for Diagonal, writing `stair.underside`), body material + overrides, riser material + overrides. **CUT BOX section**: enable/disable toggle; when enabled shows offset XYZ, rotation XYZ (deg), width/depth/height, inner tiling (T+B, L+R). Changes emit `stair:updated`.

**TransformView** — position XYZ, rotation XYZ, scale XYZ (for selected WorldObjects).

**ToolView** — active tool hint text.

All number inputs: local string state while typing, commit on blur/Enter. Changes emit the appropriate bus event (debounced where needed).

### ZonePanel.tsx

- Populates zone list from a `zones` state array
- Updated via bus events `zone:added` and `scene:loaded`
- Each row: zone name (editable inline), type badge (outdoor/indoor), "Enter ▶" button
- "Enter" emits `zone:enter { zoneId }`
- "+" button activates ZoneTool (emits `tool:select { tool: 'zone' }`)
- Active zone highlighted with accent border

### AssetBrowser.tsx

- Scrollable grid, assets grouped by category tabs: Furniture, Props, Structures, Lights
- Each asset: thumbnail (placeholder color block), name label
- Click: emits `asset:selected { assetId }`, sets ObjectTool to placement mode
- Draggable: `onDragStart` → `onDrop` on canvas fires `asset:dropped { assetId, screenPos }`
- Search input filters by asset name

### PreviewHUD.tsx

Visible only when `preview:start` event fires. Hidden on `preview:stop`.

- Centered crosshair: two 1px lines, 16px each, rgba(255,255,255,0.7)
- Bottom-center: zone name (fades in on `preview:zone-entered`, fades out after 3s)
- Top-left: current floor level indicator
- Bottom-right: "Esc to exit" hint, small monospace

### SaveLoadPanel.tsx (in TopBar)

- "Save" button: `bus.emit('scene:save', {})` → WorldSerializer downloads JSON
- "Load" button: `<input type="file" accept=".json">` hidden, triggered by button click
- On file selected: `FileReader.readAsText` → `bus.emit('scene:load', { json: parsed })`
- Bus listens for `scene:loaded` → shows toast "World loaded: [name]"

---

## WorldSerializer.js / WorldLoader.ts

### Serializer

```js
class WorldSerializer {
  serialize(worldState) {
    const state = worldState.toJSON();
    // Encode terrain heightData to base64
    if (state.terrain?.heightData instanceof Float32Array) {
      state.terrain.heightData = btoa(
        String.fromCharCode(...new Uint8Array(state.terrain.heightData.buffer))
      );
    }
    return state;
  }

  download(worldState) {
    const json = JSON.stringify(this.serialize(worldState), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `${worldState.metadata.name || 'world'}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  autoSave(worldState) {
    try {
      localStorage.setItem('worldeditor_autosave', JSON.stringify(this.serialize(worldState)));
      localStorage.setItem('worldeditor_autosave_time', Date.now());
    } catch (e) {
      console.warn('Auto-save failed (storage quota?)', e);
    }
  }
}
```

### Loader

```js
class WorldLoader {
  async load(json, worldState, zoneManager) {
    if (!json?.metadata?.version) throw new Error('Invalid or missing scene file version');

    // Unload all current zones
    for (const zoneId of worldState.zones.keys()) {
      zoneManager.unloadZone(zoneId);
    }

    // Decode terrain heightData base64 → Float32Array
    if (json.terrain?.heightData && typeof json.terrain.heightData === 'string') {
      const binary = atob(json.terrain.heightData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json.terrain.heightData = new Float32Array(bytes.buffer);
    }

    // Load state
    worldState.loadFromJSON(json);

    // Build first zone
    if (json.zones.length > 0) {
      await zoneManager.loadZone(json.zones[0].id);
    }

    this._bus.emit('scene:loaded', { metadata: json.metadata });
  }

  checkAutoSave() {
    const saved = localStorage.getItem('worldeditor_autosave');
    const time  = localStorage.getItem('worldeditor_autosave_time');
    if (!saved || !time) return null;
    return { json: JSON.parse(saved), age: Date.now() - Number(time) };
  }
}
```

Auto-save: `setInterval(() => serializer.autoSave(worldState), 60_000)` started in `App.tsx` after scene loads. On startup, call `loader.checkAutoSave()` and if found within 24h, show restore prompt in React UI.

---

## TerrainBuilder.ts

```js
class TerrainBuilder {
  static build(terrainDef, worldSize) {
    const { resolution, heightData, maxHeight, layerMaterials } = terrainDef;
    const geo = new THREE.PlaneGeometry(worldSize, worldSize, resolution - 1, resolution - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = heightData[i] ?? 0;
      pos.setY(i, h * maxHeight);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Multi-layer material — basic MeshStandardMaterial for now (Phase 11 adds shader blending)
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a5c2a, roughness: 0.95 });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData = { editorType: 'terrain', selectable: false };

    // BVH for ground collision in preview mode
    geo.computeBoundsTree();

    return mesh;
  }

  // Sculpt: raise/lower vertices in a brush area
  static sculpt(mesh, worldX, worldZ, radius, delta) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const worldSize = /* passed in */ 200;
    const resolution = Math.sqrt(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const dist = Math.hypot(vx - worldX, vz - worldZ);
      if (dist < radius) {
        const falloff = 1 - (dist / radius);
        const newY = Math.max(0, pos.getY(i) + delta * falloff);
        pos.setY(i, newY);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundsTree(); // rebuild BVH after sculpt
  }
}
```

---

## utils/math.ts

```js
import * as THREE from 'three';

export const snapToGrid = (val, unit = 0.5) => Math.round(val / unit) * unit;

export const snapVec3XZ = (v, unit = 0.5) =>
  new THREE.Vector3(snapToGrid(v.x, unit), v.y, snapToGrid(v.z, unit));

export const dist2D = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

export const midpoint2D = (a, b) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });

export const angleXZ = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);

export const snapAngle = (radians, degrees = 45) => {
  const snap = degrees * (Math.PI / 180);
  return Math.round(radians / snap) * snap;
};

// Normalize a rect so width/depth are always positive
export const normalizeRect = (a, b) => ({
  x: Math.min(a.x, b.x),
  z: Math.min(a.z, b.z),
  width: Math.abs(b.x - a.x),
  depth: Math.abs(b.z - a.z),
});

// World position from mouse event, raycasted against a Y=planeY plane
export const screenToWorld = (event, camera, domElement, planeY = 0) => {
  const rect = domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width)  * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, target);
  return target;
};

// AABB center of a Three.js Object3D
export const getCenter = (object) => {
  const box = new THREE.Box3().setFromObject(object);
  return box.getCenter(new THREE.Vector3());
};

// Lerp a number
export const lerp = (a, b, t) => a + (b - a) * t;
```

---

## utils/uuid.ts

```js
export const uuid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
```

---

## utils/csg.ts

```js
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

let _evaluator = null;
const getEvaluator = () => {
  if (!_evaluator) _evaluator = new Evaluator();
  return _evaluator;
};

// Returns a new mesh: A minus B
// Caller is responsible for positioning meshA and meshB before calling
export const csgSubtract = (meshA, meshB) => {
  const brushA = new Brush(meshA.geometry, meshA.material);
  brushA.position.copy(meshA.position);
  brushA.rotation.copy(meshA.rotation);
  brushA.scale.copy(meshA.scale);
  brushA.updateMatrixWorld();

  const brushB = new Brush(meshB.geometry, meshB.material);
  brushB.position.copy(meshB.position);
  brushB.rotation.copy(meshB.rotation);
  brushB.scale.copy(meshB.scale);
  brushB.updateMatrixWorld();

  const result = getEvaluator().evaluate(brushA, brushB, SUBTRACTION);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
};
```

---

## Build Phases

### Phase 1 — Scene Foundation ✅
- Vite + React + TypeScript scaffold
- SceneManager (scene, renderer, RAF loop with registered update callbacks)
- EditorCamera (orbit, pan, zoom, smooth lerp, WASD)
- Ground grid + ground plane
- EventBus (fully typed via BusEvents map)
- React UI shell: Toolbar with SVG icons, PropertiesPanel stub, FloorLevelSelector, coordinate display

### Phase 2 — Selection System ✅
- InputManager (centralized events, suppress flag)
- `userData as MeshUserData` tagging on all demo meshes
- SelectionManager: BVH raycast, priority ordering, emissive highlight (select + hover), GLTF child resolution
- PropertiesPanel: shows position/rotation/scale of selected object (editable number inputs)
- `object:updated` → applies transform changes to mesh
- Deselect on empty click

### Phase 3 — Physics Foundation + Sky + Floor Tool
Rapier goes in here, not later. Every subsequent builder depends on it.

**Sky setup (SceneManager addition):**
- Import `Sky` from `three/addons/objects/Sky.js`
- Add `THREE.Sky` mesh to scene, scale to `450000`
- Expose `skyUniforms`: `turbidity`, `rayleigh`, `mieCoefficient`, `mieDirectionalG`, `sunPosition`
- Compute sun position from azimuth + elevation angles stored in `WorldConfig.sunLight.position`
- Link `THREE.Sky` sun position to the existing `DirectionalLight` position — they must always match
- `PMREMGenerator`: generate environment map from sky for realistic reflections on materials
- Update `renderer.toneMappingExposure` to complement sky brightness
- Sky parameters stored in `WorldConfig` and editable in PropertiesPanel (Phase 7+):
  ```ts
  // Add to WorldConfig in types.ts
  sky: {
    turbidity:           number;  // default 10 — atmospheric haze
    rayleigh:            number;  // default 3  — sky blueness
    mieCoefficient:      number;  // default 0.005
    mieDirectionalG:     number;  // default 0.7
    sunElevation:        number;  // degrees above horizon, default 25
    sunAzimuth:          number;  // degrees, default 180
  }
  ```
- When sky params change (editor scrubbing): rebuild PMREMGenerator env map, update `DirectionalLight` position to match new sun angles
- Remove the hardcoded `scene.background = new THREE.Color(0x1a1f2e)` and `scene.fog` from Phase 1 SceneManager — sky replaces background, fog color should be derived from sky

**Physics setup:**
- `npm install @dimforge/rapier3d-compat`
- `PhysicsWorld.ts`: init Rapier WASM, create world with gravity `(0, -9.81, 0)`, step in RAF loop after Three.js update
- `ColliderBuilder.ts`: utility that takes a Three.js mesh + type and registers a matching Rapier collider
  - Floor/platform → `ColliderDesc.cuboid(w/2, 0.01, d/2)` positioned at mesh world transform
  - Wall segment → `ColliderDesc.cuboid(len/2, h/2, t/2)` per collision segment (gaps at openings)
  - Stair step → `ColliderDesc.cuboid` per step
  - Terrain → `ColliderDesc.heightfield(resolution, resolution, heightData, scale)`
  - All static geometry → `RigidBodyDesc.fixed()`
- PhysicsWorld debug draw: optional wireframe overlay showing all colliders (toggle with `~` key in editor)
- Rapier world lives in `src/physics/PhysicsWorld.ts` — imported by builders, NOT by React components

**Floor Tool:**
- WorldState (floor mutations only)
- FloorBuilder: rect → PlaneGeometry + UV + `ColliderBuilder.registerFloor(mesh, floorDef)`
- AssetManager: texture loading, material cache, MATERIAL_REGISTRY
- FloorTool: click-drag state machine, preview rect, grid snap, Esc cancel
- ZoneManager: loadZone/unloadZone skeleton, floor rebuild on `floor:added` — old collider removed, new one registered
- PropertiesPanel: material picker for selected floor

**Collider lifecycle rule:** Every builder `build()` call returns collider handles alongside meshes. ZoneManager stores these. On rebuild or removal, ZoneManager calls `physicsWorld.removeCollider(handle)` before disposing the mesh.

### Phase 4 — Wall Tool
- WallBuilder: BoxGeometry, orientation, UV tiling, trim pieces, corner joining, `userData` tagging
- WallBuilder registers Rapier cuboid colliders per wall segment via `ColliderBuilder` (one per gap between openings — no collider where a door/window will be cut)
- WallTool: click-chain state machine, ghost wall, length label, angle snap (Shift)
- ZoneManager: wall rebuild on `wall:added`/`wall:updated`/`wall:removed` — removes old colliders, registers new ones
- PropertiesPanel: height, thickness, material → `object:updated` → ZoneManager rebuilds wall + re-registers colliders

### Phase 4.5 — Material System

Sits between Phase 4 (walls working) and Phase 5 (openings). Once complete, every surface in the editor — walls, floors, platforms, stairs, and any future geometry — uses the same material pipeline. Nothing about this phase needs to be revisited later.

#### Applies To

Every builder that produces a visible mesh:
- `WallBuilder` — wall body, trim pieces
- `FloorBuilder` — floor slabs
- `PlatformBuilder` — platform slabs, railings
- `StairBuilder` — step meshes, railings
- `TerrainBuilder` (Phase 11) — terrain surface
- `ObjectPlacer` (Phase 7) — static prop surfaces where materials are overridable

#### File Naming Convention

All textures live in `public/assets/textures/<material_id>/`. Each map is a separate file named by suffix. This is the canonical naming spec — `AssetManager` derives all paths from the material ID and these suffixes automatically.

```
public/
  assets/
    textures/
      brick_01/
        albedo.jpg       ← base color / diffuse (required)
        normal.jpg       ← normal map (optional)
        roughness.jpg    ← roughness map (optional, grayscale)
        metalness.jpg    ← metalness map (optional, grayscale)
        ao.jpg           ← ambient occlusion (optional, grayscale)
        displacement.jpg ← displacement/height map (optional, grayscale)
      concrete_01/
        albedo.jpg
        normal.jpg
        roughness.jpg
        ao.jpg
      wood_planks_01/
        albedo.jpg
        normal.jpg
        roughness.jpg
      cobblestone_01/
        albedo.jpg
        normal.jpg
        roughness.jpg
        ao.jpg
```

**Where to get textures:** Polyhaven (polyhaven.com) — free CC0, download at 1K or 2K resolution, rename maps to match the convention above. Every Polyhaven material provides all six map types.

**Resolution guidance:**
- `1K` (1024×1024) — good default, fine for most surfaces at normal viewing distance
- `2K` (2048×2048) — use for hero surfaces seen up close (floors you walk on, walls at eye level)
- `4K` — avoid in the editor, too expensive for a tool

#### Updated MATERIAL_REGISTRY

```ts
// src/materials.ts

export interface MaterialMapConfig {
  enabled:  boolean;   // toggle in UI — disabled maps are not loaded
  path:     string;    // derived automatically: /assets/textures/<id>/<suffix>.jpg
}

export interface MaterialDef {
  id:            string;
  label:         string;         // display name in AssetBrowser / PropertiesPanel
  tileScale:     number;         // UV repeat per meter, default 1.0
  // PBR scalars (used when map is disabled or absent)
  roughnessVal:  number;         // 0–1
  metalnessVal:  number;         // 0–1
  displacementScale: number;     // meters, default 0.05 — only matters if displacement enabled
  // Per-map toggles
  maps: {
    albedo:      MaterialMapConfig;   // always enabled
    normal:      MaterialMapConfig;
    roughness:   MaterialMapConfig;
    metalness:   MaterialMapConfig;
    ao:          MaterialMapConfig;
    displacement:MaterialMapConfig;   // off by default — expensive
  };
}

export const MATERIAL_REGISTRY: Record<string, MaterialDef> = {
  brick_01: {
    id: 'brick_01', label: 'Brick',
    tileScale: 1.0, roughnessVal: 0.9, metalnessVal: 0.0, displacementScale: 0.03,
    maps: {
      albedo:      { enabled: true,  path: '/assets/textures/brick_01/albedo.jpg' },
      normal:      { enabled: true,  path: '/assets/textures/brick_01/normal.jpg' },
      roughness:   { enabled: true,  path: '/assets/textures/brick_01/roughness.jpg' },
      metalness:   { enabled: false, path: '/assets/textures/brick_01/metalness.jpg' },
      ao:          { enabled: true,  path: '/assets/textures/brick_01/ao.jpg' },
      displacement:{ enabled: false, path: '/assets/textures/brick_01/displacement.jpg' },
    },
  },
  concrete_01: {
    id: 'concrete_01', label: 'Concrete',
    tileScale: 2.0, roughnessVal: 0.85, metalnessVal: 0.0, displacementScale: 0.02,
    maps: {
      albedo:      { enabled: true,  path: '/assets/textures/concrete_01/albedo.jpg' },
      normal:      { enabled: true,  path: '/assets/textures/concrete_01/normal.jpg' },
      roughness:   { enabled: true,  path: '/assets/textures/concrete_01/roughness.jpg' },
      metalness:   { enabled: false, path: '/assets/textures/concrete_01/metalness.jpg' },
      ao:          { enabled: true,  path: '/assets/textures/concrete_01/ao.jpg' },
      displacement:{ enabled: false, path: '/assets/textures/concrete_01/displacement.jpg' },
    },
  },
  wood_planks_01: {
    id: 'wood_planks_01', label: 'Wood Planks',
    tileScale: 0.8, roughnessVal: 0.7, metalnessVal: 0.0, displacementScale: 0.01,
    maps: {
      albedo:      { enabled: true,  path: '/assets/textures/wood_planks_01/albedo.jpg' },
      normal:      { enabled: true,  path: '/assets/textures/wood_planks_01/normal.jpg' },
      roughness:   { enabled: true,  path: '/assets/textures/wood_planks_01/roughness.jpg' },
      metalness:   { enabled: false, path: '/assets/textures/wood_planks_01/metalness.jpg' },
      ao:          { enabled: false, path: '/assets/textures/wood_planks_01/ao.jpg' },
      displacement:{ enabled: false, path: '/assets/textures/wood_planks_01/displacement.jpg' },
    },
  },
  cobblestone_01: {
    id: 'cobblestone_01', label: 'Cobblestone',
    tileScale: 0.5, roughnessVal: 0.95, metalnessVal: 0.0, displacementScale: 0.04,
    maps: {
      albedo:      { enabled: true,  path: '/assets/textures/cobblestone_01/albedo.jpg' },
      normal:      { enabled: true,  path: '/assets/textures/cobblestone_01/normal.jpg' },
      roughness:   { enabled: true,  path: '/assets/textures/cobblestone_01/roughness.jpg' },
      metalness:   { enabled: false, path: '/assets/textures/cobblestone_01/metalness.jpg' },
      ao:          { enabled: true,  path: '/assets/textures/cobblestone_01/ao.jpg' },
      displacement:{ enabled: false, path: '/assets/textures/cobblestone_01/displacement.jpg' },
    },
  },
};
```

#### Updated AssetManager.getMaterial()

```ts
async getMaterial(
  materialId: string,
  overrides?: Partial<MaterialDef>,        // per-instance overrides from WorldState
  qualityScale?: QualityScale              // global quality setting
): Promise<THREE.MeshStandardMaterial> {

  const cacheKey = `${materialId}_${qualityScale ?? 'high'}`;
  if (this._materialCache.has(cacheKey)) return this._materialCache.get(cacheKey)!;

  const def = { ...MATERIAL_REGISTRY[materialId], ...overrides };
  if (!def) {
    console.warn(`Unknown material: ${materialId}`);
    return new THREE.MeshStandardMaterial({ color: 0x888888 });
  }

  const load = async (mapDef: MaterialMapConfig): Promise<THREE.Texture> => {
    const tex = await this._textureLoader.loadAsync(mapDef.path);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    // Quality scaling — downscale by halving anisotropy and capping resolution
    tex.anisotropy = qualityScale === 'low' ? 1 : qualityScale === 'medium' ? 4 : this._renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = qualityScale === 'low' ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = qualityScale !== 'low';
    return tex;
  };

  const mat = new THREE.MeshStandardMaterial({
    roughness: def.roughnessVal,
    metalness: def.metalnessVal,
  });

  // Load only enabled maps
  if (def.maps.albedo.enabled)
    mat.map = await load(def.maps.albedo);

  if (def.maps.normal.enabled)
    mat.normalMap = await load(def.maps.normal);

  if (def.maps.roughness.enabled)
    mat.roughnessMap = await load(def.maps.roughness);

  if (def.maps.metalness.enabled)
    mat.metalnessMap = await load(def.maps.metalness);

  if (def.maps.ao.enabled)
    mat.aoMap = await load(def.maps.ao);

  if (def.maps.displacement.enabled) {
    mat.displacementMap = await load(def.maps.displacement);
    mat.displacementScale = def.displacementScale;
    // NOTE: displacement requires subdivided geometry to have any effect.
    // Builders must check if displacement is enabled and increase geometry
    // segments accordingly (see Displacement section below).
  }

  // UV tiling applied at geometry level via repeat — see builders
  this._materialCache.set(cacheKey, mat);
  return mat;
}
```

#### Displacement — Special Handling

Displacement actually moves vertices, so it requires subdivided geometry. Flat boxes with 1 segment per face show no effect.

When `displacement.enabled === true` for a material:
- `WallBuilder` uses `BoxGeometry(length, height, thickness, Math.ceil(length * 4), Math.ceil(height * 4), 1)` — 4 segments per meter
- `FloorBuilder` uses `PlaneGeometry(w, d, Math.ceil(w * 4), Math.ceil(d * 4))`
- `PlatformBuilder` same as floor
- `StairBuilder` — displacement disabled, steps are too small to subdivide usefully

**Default is off.** Displacement is the most expensive map. Enable only for hero surfaces where close-up detail matters. A normal map gives 90% of the visual benefit at a fraction of the cost.

#### Quality Scale System

```ts
// src/types.ts addition
export type QualityScale = 'low' | 'medium' | 'high';

export interface QualitySettings {
  textureScale:    QualityScale;   // controls anisotropy, mipmaps, filter mode
  shadowMapSize:   number;         // 512 | 1024 | 2048
  shadowsEnabled:  boolean;
  fogEnabled:      boolean;
  antialias:       boolean;        // set at renderer init — requires restart to change
}

export const QUALITY_PRESETS: Record<QualityScale, QualitySettings> = {
  low: {
    textureScale:  'low',
    shadowMapSize:  512,
    shadowsEnabled: false,
    fogEnabled:     false,
    antialias:      false,
  },
  medium: {
    textureScale:  'medium',
    shadowMapSize:  1024,
    shadowsEnabled: true,
    fogEnabled:     true,
    antialias:      false,
  },
  high: {
    textureScale:  'high',
    shadowMapSize:  2048,
    shadowsEnabled: true,
    fogEnabled:     true,
    antialias:      true,
  },
};
```

Quality settings stored in `WorldConfig` (not the scene file — it's a user preference, not world data). Persisted to `localStorage` independently of save/load.

When quality changes:
1. Clear `AssetManager` material cache
2. Reload all materials for the active zone at new quality level
3. Update `renderer.shadowMap.mapSize` (requires `renderer.shadowMap.needsUpdate = true`)
4. Toggle fog on scene
5. Antialias requires renderer recreation — warn user, offer page reload

#### Per-Surface Material Overrides

Each wall, floor, platform, stair in WorldState can carry per-instance map overrides:

```ts
// Addition to WallDef, FloorDef, PlatformDef, StairDef in types.ts
materialOverrides?: {
  maps?: Partial<Record<keyof MaterialDef['maps'], { enabled: boolean }>>;
  tileScale?:         number;
  roughnessVal?:      number;
  displacementScale?: number;
};
```

This lets you disable normal maps on a specific wall that's far away, or crank up tileScale on a large floor without touching the global registry.

#### PropertiesPanel — Material Section

When a wall, floor, platform, or stair is selected, the Properties Panel shows a **Material** section:

```
MATERIAL
┌─────────────────────────────────┐
│ [Brick ▾]          Tile: [1.0]  │  ← material picker + tile scale
├─────────────────────────────────┤
│ MAPS                            │
│ [✓] Albedo                      │
│ [✓] Normal                      │
│ [✓] Roughness      val: [0.9]   │  ← scalar shown when map disabled
│ [ ] Metalness      val: [0.0]   │
│ [✓] AO                          │
│ [ ] Displacement   val: [0.03]  │  ← scale shown when enabled
├─────────────────────────────────┤
│ QUALITY                         │
│ ○ Low  ● Medium  ○ High         │  ← global, not per-surface
└─────────────────────────────────┘
```

Toggling a map checkbox:
1. React emits `object:updated { id, zoneId, changes: { materialOverrides: { maps: { normal: { enabled: false } } } } }`
2. Three.js side calls `worldState.updateWall()` → `wall:updated` fires
3. ZoneManager detects material-only change → calls `AssetManager.getMaterial()` with new overrides → swaps material on mesh without full geometry rebuild
4. No flicker — material swap is instant

Changing the material picker (e.g. Brick → Concrete):
- Same flow but full material replacement
- If new material has displacement enabled and old didn't (or vice versa): geometry rebuild required (different segment count)
- Otherwise: material swap only

#### Performance Notes for Claude Code

- Never call `getMaterial()` inside the RAF loop — materials are loaded once and cached
- `aoMap` requires a second UV set (`uv2`) on the geometry — builders must call `geometry.setAttribute('uv2', geometry.attributes.uv)` when AO is enabled
- Displacement on walls with CSG openings: run CSG first on unsubdivided geometry, then subdivide the result — CSG on high-segment geometry is very slow
- Texture memory: a single 2K RGBA texture = ~16MB GPU memory. With 6 maps × 2K = ~96MB per material. Keep an eye on total materials loaded. The quality system's cache clear helps with this.
- `THREE.DefaultLoadingManager` can be used to show a loading indicator while textures load on zone switch

### Phase 4.6 — Wall Graph

Sits between Phase 4.5 (material system) and Phase 5 (openings). Retrofits a node-based connection system onto the wall data model so that walls can share corners, corner geometry trimming works reliably, and the foundation exists for rooms and connected wall manipulation later.

#### Why Before Phase 5

Openings (doors, windows) are placed at an offset along a wall. If walls are later restructured to use nodes, all opening offset calculations need revisiting. Better to have the correct data model in place before adding that complexity.

#### Data Model Changes

Replace raw `start`/`end` coordinates on `WallDef` with node ID references. Add a `nodes` array to `ZoneDef`.

```ts
// Addition to ZoneDef in types.ts
nodes: WallNode[];

// New type in types.ts
export interface WallNode {
  id:  string;
  x:   number;
  z:   number;
}

// WallDef — replace start/end with node references
// BEFORE:
// start: Vec2;
// end:   Vec2;
// AFTER:
startNodeId: string;
endNodeId:   string;
```

Two walls sharing a corner reference the same `WallNode` ID. No coordinate comparison needed — connection is explicit in the data.

#### WorldState Changes

```ts
// New mutations on WorldState
addNode(zoneId: string, node: WallNode): void
updateNode(zoneId: string, nodeId: string, pos: { x: number; z: number }): void
removeNode(zoneId: string, nodeId: string): void   // only if no walls reference it
getNode(zoneId: string, nodeId: string): WallNode
getNodeLinks(zoneId: string, nodeId: string): NodeLinks    // v4.6.0 (replaced getWallsAtNode) — wall/floor/platform ids referencing this node

// updateNode emits 'node:updated' { zoneId, nodeId, pos }
// ZoneManager listens and rebuilds ALL walls referencing that node
```

#### WallTool — Endpoint Snapping

When placing a wall start or end point, check proximity to existing nodes:

```
On click (placing wall endpoint):
  1. Get all existing nodes in active zone
  2. Find closest node within snap radius (0.5m)
  3. If found:
       reuse that node's ID as startNodeId/endNodeId
       snap cursor position to that node's exact coordinates
  4. If not found:
       create new WallNode { id: uuid(), x: snapped.x, z: snapped.z }
       worldState.addNode(zoneId, newNode)
       use new node's ID

Visual feedback:
  - Existing nodes render as small dots (visible only when WallTool is active)
  - Dot highlights when cursor is within snap radius
  - Cursor snaps visually before click confirms
  - Snap radius indicator ring shown around highlighted node
```

Node dots are editor-only helpers — not selectable, not saved as geometry, invisible in preview mode.

#### WallBuilder Changes

WallBuilder no longer reads `wall.start` / `wall.end` directly. It receives node positions as resolved coordinates:

```ts
// WallBuilder.build() signature change
static build(
  wall:      WallDef,
  zone:      ZoneDef,        // used to resolve node positions
  nodes:     Map<string, WallNode>  // passed in, not looked up internally
): WallBuildResult

// Inside build():
const start = nodes.get(wall.startNodeId)!;
const end   = nodes.get(wall.endNodeId)!;
// rest of build logic unchanged
```

#### Corner Joining — Now Reliable

With shared node IDs, corner detection is exact:

```ts
// In WallBuilder, before computing geometry:
const connectedAtStart = zone.walls.filter(w =>
  w.id !== wall.id &&
  (w.startNodeId === wall.startNodeId || w.endNodeId === wall.startNodeId)
);
const connectedAtEnd = zone.walls.filter(w =>
  w.id !== wall.id &&
  (w.startNodeId === wall.endNodeId || w.endNodeId === wall.endNodeId)
);

// Shorten wall by thickness/2 at each connected end
// This eliminates visible overlap at corners — guaranteed to fire
// because connection is by ID, not by coordinate proximity
if (connectedAtStart.length > 0) startOffset += wall.thickness / 2;
if (connectedAtEnd.length > 0)   endOffset   += wall.thickness / 2;
```

No floating point comparison. No missed corners. Overlap at wall joins is eliminated.

#### ColliderBuilder Changes

Same as WallBuilder — resolves node positions from the nodes map before computing collider positions. No other changes needed.

#### WorldLoader — Migration

Old scene files store `start`/`end` as raw `Vec2`. WorldLoader detects and migrates on load:

```ts
// In WorldLoader, after parsing JSON:
for (const zone of json.zones) {
  if (!zone.nodes) zone.nodes = [];

  for (const wall of zone.walls) {
    // Detect old format
    if ('start' in wall && 'end' in wall) {
      // Find or create node for start position
      let startNode = zone.nodes.find(n =>
        Math.abs(n.x - (wall as any).start.x) < 0.001 &&
        Math.abs(n.z - (wall as any).start.z) < 0.001
      );
      if (!startNode) {
        startNode = { id: uuid(), x: (wall as any).start.x, z: (wall as any).start.z };
        zone.nodes.push(startNode);
      }

      // Find or create node for end position
      let endNode = zone.nodes.find(n =>
        Math.abs(n.x - (wall as any).end.x) < 0.001 &&
        Math.abs(n.z - (wall as any).end.z) < 0.001
      );
      if (!endNode) {
        endNode = { id: uuid(), x: (wall as any).end.x, z: (wall as any).end.z };
        zone.nodes.push(endNode);
      }

      wall.startNodeId = startNode.id;
      wall.endNodeId   = endNode.id;
      delete (wall as any).start;
      delete (wall as any).end;
    }
  }
}
```

Two old walls that happened to share the same coordinates get the same node — preserving any accidental connections from Phase 4 work.

#### What This Does NOT Include Yet

- Dragging a node to stretch connected walls (SelectionManager + node gizmo — Phase 12)
- Room detection from closed wall loops (Phase 12+)
- Any UI panel showing node data — nodes are invisible infrastructure
- Merging two nearby nodes that aren't exactly equal (snap-merge tool — Phase 12)

#### Summary of Changes

| File | Change |
|---|---|
| `src/types.ts` | Add `WallNode`, add `nodes` to `ZoneDef`, update `WallDef` |
| `src/world/WorldState.ts` | Add node mutations, `getWallsAtNode()` (replaced by `getNodeLinks()` in v4.6.0) |
| `src/world/WorldLoader.ts` | Migration from old `start`/`end` format |
| `src/builders/WallBuilder.ts` | Resolve nodes from map, reliable corner joining |
| `src/physics/ColliderBuilder.ts` | Resolve nodes from map |
| `src/editor/WallTool.ts` | Snap detection, node creation/reuse, node dot rendering |



### Phase 4.7 — Merged Corner Geometry

Builds directly on the wall graph from Phase 4.6. Instead of two separate trimmed meshes at corners, compatible connected walls are merged into a single continuous extruded mesh with a clean mitered join.

#### Compatibility Rules for Merging

Two walls sharing a node are merged into one run only when ALL of the following are true:
- Same `material` and `exteriorMaterial`
- Same `height`
- The shared node has exactly **two** walls connected (no T-junctions or crossings)

If any condition fails, fall back to the existing trimmed separate mesh approach from 4.6.

#### WallBuilder — new `buildRun()` method

```ts
// Existing — builds one wall segment independently
static build(wall: WallDef, zone: ZoneDef, nodes: Map<string, WallNode>): WallBuildResult

// New — builds a continuous merged mesh from a sequence of compatible walls
static buildRun(walls: WallDef[], zone: ZoneDef, nodes: Map<string, WallNode>): WallBuildResult
```

The run is an ordered array of walls that form a connected chain. `buildRun()` traces the node sequence to get an ordered polyline of points, then extrudes a rectangular cross-section along it with proper mitered joins at each corner:

```ts
// Pseudocode for miter join at interior corner
// Given three consecutive points A → B → C:
// 1. Compute inward normals of AB and BC
// 2. Find miter direction (bisector of the two normals)
// 3. Compute miter length = thickness / 2 / sin(half-angle)
// 4. Offset corner vertex along miter direction
// This gives a clean sharp join regardless of angle
```

UV mapping along a run: U coordinate continues across the entire run length — so a brick texture flows continuously around a corner without restarting at the join.

**Openings on merged runs:** CSG cutouts still work per-opening. Each opening's position is computed as a world offset along the run's total length, same as before. The merged mesh is the base geometry; openings are subtracted from it.

**Collision geometry:** Still split into per-segment boxes around openings — same as before, not affected by visual merge.

#### ZoneManager — run grouping

Before building wall meshes for a zone, ZoneManager groups walls into runs:

```ts
function groupWallRuns(zone: ZoneDef, nodes: Map<string, WallNode>): WallDef[][] {
  // 1. Build adjacency: for each node, list connected walls
  // 2. Traverse connected walls, grouping compatible ones into runs
  // 3. A run ends when: node has >2 walls (T-junction), material/height differs, or no more connected walls
  // 4. Return array of runs (each run is an array of WallDef in connection order)
}
```

Single-wall runs (isolated walls, T-junction endpoints) → `WallBuilder.build()`
Multi-wall runs → `WallBuilder.buildRun()`

#### Incremental Rebuild

When a wall in a run changes (material, height, opening added):
1. Re-evaluate which run it belongs to
2. Dispose and rebuild the entire run's mesh
3. Adjacent runs that may have changed compatibility also rebuilt

This is slightly more expensive than rebuilding a single wall, but runs are typically short (2–6 walls) so it's fast in practice.

---

### Phase 4.8 — Wall Tool Interaction Model

Completes the wall drawing and editing experience. Builds on 4.6 (node graph) and 4.7 (merged geometry).

#### Wall Chain — Complete Spec

The WallTool already chains walls (set startPoint = endPoint after each click). Phase 4.8 fills in the gaps:

**Closing a loop:**
- While in DRAWING state, if the cursor snaps to the very first node of the current chain (the node where the chain started), clicking completes the loop
- Visual indicator: the first node pulses/highlights when the cursor is within snap radius of it
- On close: the final wall connects endNode back to the chain's startNode
- ZoneManager detects the closed loop — in Phase 12 this enables room auto-detection
- After closing: return to IDLE

**Starting from an existing node:**
- In IDLE state, clicking near an existing node (within snap radius) starts a new chain FROM that node
- Uses that node's ID as `startNodeId` of the first new wall
- Continuation feels natural — like picking up where you left off

**Escape behaviour:**
- Esc during DRAWING: discard only the current in-progress wall segment (the ghost), keep all previously placed walls in the chain
- Double-Esc or Esc from IDLE: do nothing (already idle)
- The chain is committed wall by wall — placing a wall is immediately written to WorldState, not held in a buffer

#### Node Dragging in Select Mode

When the Select tool is active and the user clicks/drags a wall node:

```
Detection:
  On mousemove (select tool active):
    Check proximity to all nodes in active zone (within 8px screen space)
    If near a node: show node highlight, cursor changes to move cursor

On mousedown near a node:
  Enter NODE_DRAG state
  Store original node position (for cancel)
  Suppress camera orbit during drag

During NODE_DRAG (mousemove):
  Update node position to snapped world position (0.5m grid, or free if Alt held)
  All walls referencing this node immediately rebuild their meshes (live preview)
  Rapier colliders update in real time

On mouseup:
  Confirm drag — node position written to WorldState via worldState.updateNode()
  All affected wall runs re-evaluated and rebuilt
  Return to normal select state

On Esc during drag:
  Restore node to original position
  Rebuild affected walls
  Return to normal select state
```

Node dragging is only available in Select mode — not while any other tool is active.

**Visual node indicators (Select mode):**
- All nodes in active zone shown as small square dots (4px, colour: `--text-dim`)
- Hovered node: larger dot (6px, colour: `--accent`)
- Dragging node: ring indicator showing original position as ghost
- Nodes only visible when Select tool OR Wall tool is active — hidden otherwise

#### WallTool Cursor States

| State | Cursor | Visual |
|---|---|---|
| IDLE, no node nearby | crosshair | snapped dot on ground |
| IDLE, near existing node | move | node highlight pulse |
| DRAWING, free space | crosshair | ghost wall + length label |
| DRAWING, near existing node | move | node highlight + snap indicator |
| DRAWING, near chain start node | pointer | chain-start node pulses green |

#### Updated WallTool State Machine

```
IDLE
  mousemove → check node proximity → highlight nearest node if within snap
  click (free space) → create new node → startNodeId = new node → enter DRAWING
  click (near existing node) → startNodeId = existing node → enter DRAWING

DRAWING
  mousemove → update ghost wall end position
             → check node proximity at end position
             → if near chain start node: highlight it green (loop close indicator)
  click (free space) → create new node → place wall → startNode = new node → stay DRAWING
  click (near existing node, not chain start) → reuse node → place wall → startNode = that node → stay DRAWING
  click (near chain start node) → close loop → place final wall → worldState → IDLE
  dblclick or Enter → finish chain open-ended → IDLE
  Esc → discard current ghost segment → IDLE (prior walls in chain already committed)
```

### Phase 4.9 — Floor System Improvements

Builds on Phase 3 (FloorTool, FloorBuilder) and Phase 4.8 (wall loop closing). Fixes the multiple floors bug, adds auto-floor from closed wall loops, a polygon floor tool, proper floor properties in PropertiesPanel, polygon vertex editing, and Z-fighting prevention.

#### Bug Fix — Multiple Floors Disappearing

**Root cause:** `floor:added` event causes ZoneManager to rebuild all floor meshes for the zone rather than appending the new one. Fix: ZoneManager listens to `floor:added` and only builds the new floor mesh, adding it to the existing `floorsGroup` without touching existing meshes.

```ts
// ZoneManager — fix floor:added handler
this._bus.on('floor:added', ({ zoneId, floor }) => {
  if (zoneId !== this._activeZoneId) return;
  const { floorsGroup } = this._loadedZones.get(zoneId)!;
  const result = FloorBuilder.build(floor, zone.bounds, zone.floors.indexOf(floor));
  floorsGroup.add(result.mesh, result.collisionMesh);
  this._zoneColliders.get(zoneId)!.floors.push(result.collider);
});
```

Each floor mesh is independently tracked in `floorsGroup` by its `editorId` — never wiped on subsequent adds.

#### Z-Fighting Prevention

Floor meshes at the same elevation (e.g. inner room floor on top of outer floor) Z-fight because the GPU can't determine draw order.

Fix: each floor mesh gets a tiny Y offset based on its index within the zone's floors array at the same level:

```ts
// In FloorBuilder.build() — floorIndex is the position in zone.floors filtered to this level
const Z_OFFSET = 0.001;
mesh.position.y = floorDef.elevation + (floorIndex * Z_OFFSET);
```

This is invisible at normal viewing distances but prevents flickering. A floor placed inside another floor will always sit fractionally higher, which is also physically correct. The Rapier collider uses the base elevation without the offset — physics doesn't need sub-millimeter precision here.

#### Auto-Floor from Closed Wall Loop (Phase 4.8 integration)

When `WallTool` closes a loop in Phase 4.8, after the final wall is committed:

```ts
// In WallTool, on loop close:
const loopNodes = this._getChainNodes(); // ordered WallNode[] forming the closed polygon
const points: Vec2[] = loopNodes.map(n => ({ x: n.x, z: n.z }));

// Check if a polygon floor already covers this area — skip if so
const exists = worldState.zones.get(zoneId)?.floors
  .some(f => f.floorMesh.shape === 'polygon' && polygonsOverlap(f.floorMesh.points!, points));

if (!exists) {
  this._bus.emit('floortool:suggest-auto-floor', { points, level: activeFloorLevel });
}
```

React receives `floortool:suggest-auto-floor` and shows a subtle non-blocking prompt (bottom of canvas, not a modal):

```
┌─────────────────────────────────────────────┐
│  Create floor for this room?  [Yes] [Dismiss]│
└─────────────────────────────────────────────┘
```

On "Yes":
1. `worldState.addFloor(zoneId, { shape: 'polygon', points, material: activeFloorMaterial, level: activeFloorLevel, ... })`
2. `FloorBuilder` builds `ShapeGeometry` from points
3. Rapier collider registered
4. Prompt dismisses

On "Dismiss": nothing happens, user can place a floor manually later.

#### Polygon Floor Tool

New tool: `PolygonFloorTool.ts`. Works like the WallTool — click to place vertices, close the loop to finish.

```
States: IDLE → DRAWING → IDLE

IDLE:
  Show snapped cursor dot on ground plane
  On click: place first vertex → enter DRAWING

DRAWING:
  Show placed vertices as dots connected by lines (preview polygon outline)
  Show ghost line from last vertex to current cursor position
  Show filled semi-transparent preview polygon as vertices are added (THREE.ShapeGeometry, 30% opacity)
  Minimum 3 vertices required before closing is allowed

  On click (free space): add new vertex, update preview
  On click (near first vertex, ≥3 vertices placed): close polygon → create floor → IDLE
  On click (near existing vertex, not first): snap to it, add as next vertex
  Esc: remove last placed vertex (step back one vertex)
  Double-Esc or Esc with only 1 vertex: discard entirely → IDLE

On close:
  worldState.addFloor(zoneId, {
    id: uuid(),
    level: activeFloorLevel,
    elevation: activeFloor.elevation,
    ceilingHeight: activeFloor.ceilingHeight,
    floorMesh: {
      shape: 'polygon',
      points: placedVertices,   // Vec2[] in order placed
      material: selectedMaterial,
    }
  })

Grid snap: 0.5m (disable with Alt)
Angle snap: hold Shift for 45° snapping from last vertex
```

Add `PolygonFloorTool` to the Toolbar as a sub-tool of the Floor tool — long press or dropdown on the Floor button shows Rect and Polygon options. Or a separate toolbar button if preferred.

Add to project structure: `src/editor/PolygonFloorTool.ts`

#### Polygon Vertex Editing (Select Mode)

Once a polygon floor exists, its vertices are editable in Select mode — same pattern as node dragging in Phase 4.8.

```
Detection (Select tool active):
  On mousemove over a polygon floor:
    Check proximity to each vertex point (within 8px screen space)
    If near a vertex: highlight it, cursor changes to move cursor

On mousedown near a polygon vertex:
  Enter VERTEX_DRAG state
  Store original vertex position
  Suppress camera orbit

During VERTEX_DRAG (mousemove):
  Update vertex position to snapped world position
  Rebuild floor ShapeGeometry live
  Update Rapier collider

On mouseup:
  Confirm — write updated points back to worldState.updateFloor()
  Return to normal select state

On Esc during drag:
  Restore original vertex position
  Rebuild floor
  Return to normal select state
```

Vertex dots rendered as small squares on polygon floors when Select tool is active — same visual style as wall node dots.

#### Floor PropertiesPanel

When a floor is selected, PropertiesPanel shows floor-appropriate properties:

```
FLOOR — Level G
┌─────────────────────────────────┐
│ Material   [Cobblestone      ▾] │
│ Shape      rect / polygon       │  ← read-only label
│ Level      G (0)                │  ← read-only
│ Elevation  0.00m                │  ← read-only, derived
└─────────────────────────────────┘
```

No position/rotation/scale — those don't apply to floors. Material change triggers mesh rebuild. Shape and level are informational only.

#### Floor Overlap Warning

Two polygon/rect floors at the same level that overlap produce a warning in the editor — a subtle orange outline on the overlapping meshes and a console warning. No hard prevention — the user may intentionally want layered floors with Z-offset. Just a visual hint.

#### FloorBuilder — polygon support confirmation

`FloorBuilder.build()` must handle both `shape: 'rect'` and `shape: 'polygon'`:

```ts
if (floorDef.floorMesh.shape === 'polygon' && floorDef.floorMesh.points) {
  const shape = new THREE.Shape(
    floorDef.floorMesh.points.map(p => new THREE.Vector2(p.x, p.z))
  );
  geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
} else {
  geo = new THREE.PlaneGeometry(zoneBounds.width, zoneBounds.depth);
  geo.rotateX(-Math.PI / 2);
}
```

If this isn't already implemented from Phase 3, it must be added here.



### Phase 5 — Openings (Doors & Windows)
- CSG integration via `utils/csg.ts` (three-bvh-csg) — visual mesh only
- WallBuilder: CSG subtract openings from visual mesh; collision geometry is **separate** (no CSG on physics — split wall into segments around openings instead)
- "Add Opening" → `addOpening` → `wall:updated` → WallBuilder rebuilds visual + re-registers split collision segments
- Opening types: door, window, arch
- Door sensor volumes: Rapier `ColliderDesc.cuboid` with `setSensor(true)` — fires intersection events, doesn't block movement
- `TriggerSystem.ts`: polls Rapier intersection events each frame, emits `character:triggerdoor` on bus when character sensor overlaps door sensor
- TransitionTool skeleton: door openings show "Link zone..." option

### Phase 6 — Multi-Floor
- FloorLevelSelector fully functional (tabs G/1/2/3)
- ZoneManager: floor dimming (opacity 0.15 for non-active), clip plane for active floor
- PlatformTool + PlatformBuilder: slab + railings + `ColliderBuilder.registerPlatform()`
- StairTool + StairBuilder: straight style, per-step cuboid colliders registered via `ColliderBuilder`
- All new geometry assigned to active floor level, colliders positioned at correct world Y

### Phase 6.1 — Transform Gizmos & Object Editing

Adds spatial editing gizmos to all editor objects. Builds on Phase 6 (platforms, stairs exist) and Phase 7 (TransformControls already used for props).

#### Scope

| Object | Translate | Rotate | Resize | Notes |
|---|---|---|---|---|
| Platform | XYZ | Y-axis only | width/depth edge handles | Y = change floor height |
| Stair | XZ only | Y-axis only | — | Resize via endpoint nodes |
| Placed object | XYZ | all axes | uniform scale | Confirmed from Phase 7 |
| Wall segment | XZ only | — | — | Moves whole wall, updates both nodes |
| Floor (rect) | XZ only | — | edge handles | Polygon floors via vertex drag (4.9) |

#### GizmoManager.ts (src/editor/)

Centralises all gizmo logic, replaces ad-hoc TransformControls from Phase 7:
- `init()` creates `TransformControls`, attaches to scene, subscribes to `object:selected` / `object:deselected`
- `_attach(id, type, zoneId)` — attaches gizmo to selected mesh, shows/hides axes based on type, attaches resize handles if applicable
- `_detach()` — detaches gizmo, disposes resize handles
- On `objectChange`: writes position/rotation back to WorldState (`updatePlatform`, `updateObject`, `updateNode` for walls, `updateFloor` for rect floors)
- For `"floor"` selections: gizmo is positioned at the **centroid of `floorMesh.points`** (Y = `elevation + 0.3`). Floor meshes sit at world origin in Three.js (geometry is world-space baked), so the mesh position cannot be used directly. Rect floors with no points fall back to the zone bounds center.
- Emits `gizmo:dragging` to suppress camera during drag

Key bindings (only active when something is selected):
- `G` — translate mode
- `R` — rotate mode (platforms, stairs, objects only)
- `S` — scale uniform (objects only)
- `Alt` + drag — disable snap
- `Esc` — deselect

#### ResizeHandleGroup.ts (src/editor/)

Four edge handles (N/S/E/W) as thin flat box meshes on platform and rect floor edges. N/S drag changes depth (opposite edge fixed), E/W drag changes width. Minimum 0.5m x 0.5m. On drag end: `worldState.updatePlatform()` or `updateFloor()` triggers mesh + collider rebuild.

#### Platform Y Handle

Vertical arrow handle above platform center. Drag up/down changes `platform.position.y` in 0.2m snap increments (Alt = free). Cleaner than scroll wheel which only works during initial placement.

#### Move Wall as Segment

`G` with a wall selected translates the whole wall — both endpoint nodes shift by the same XZ delta. Distinct from Phase 4.8 node dragging which moves one node and stretches. On translate end: `worldState.updateNode()` called for both `startNodeId` and `endNodeId`.

#### PropertiesPanel Live Fields

While a gizmo is active: X/Y/Z, rotation Y, width/depth (where applicable) update live as the gizmo moves. Typing a value snaps the gizmo to it. All inputs debounced 150ms before WorldState write.

All numeric inputs across every sub-component use the shared `useFieldDebounce` hook (300 ms, 150 ms for ObjectGeoView). The pattern is `onChange → schedule(commit)`, `onBlur/Enter → flush(commit)`. This ensures every field updates the canvas live while typing and commits immediately on blur or Enter. Covered components: WallGeoView, PlatformGeoView, StairGeoView, ObjectGeoView, VertScreen (elevation), MaterialSection (tile scale/X/Y, roughness, displacement), OpeningRow (offset/width/height/elevation, inner tiles H/V), WallSegmentRow (tile scale). Select elements commit immediately on `onChange` and are excluded.



### Phase 6.2 — Scene Save & Load

You've now built walls, floors, zones, platforms, stairs, and connected wall graphs. Losing all of that on every dev server restart is unacceptable. This phase adds the one thing that makes the editor actually usable day-to-day: save your scene to a JSON file and load it back.

This is intentionally narrow — just the scene file. Game saves, auto-save, editor preferences, and migration logic all stay in Phase 9 where they belong.

#### What Gets Saved

Everything in `WorldState` at the time of saving:
- All zones with their walls, floors, platforms, stairs, objects, scripts, trigger volumes
- Wall nodes
- Zone transitions
- World config (sky, lighting, player settings, default spawn)
- Terrain (if present — encoded as base64 Float32Array)

What does NOT get saved here:
- Game state (flags, player position, inventory) — Phase 9
- Editor preferences (quality, snap, grid) — Phase 9
- Asset/material manifests — those live on disk, not in the scene file

#### WorldSerializer.ts

```ts
export class WorldSerializer {
  serialize(worldState: WorldState): SceneFile {
    const raw = worldState.toJSON();
    // Encode terrain heightData Float32Array → base64 string for JSON
    if (raw.terrain?.heightData instanceof Float32Array) {
      raw.terrain.heightData = this._encodeHeightData(raw.terrain.heightData as Float32Array);
    }
    return raw as SceneFile;
  }

  download(worldState: WorldState): void {
    const json = JSON.stringify(this.serialize(worldState), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `${worldState.metadata.name || 'world'}.json`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private _encodeHeightData(data: Float32Array): string {
    return btoa(String.fromCharCode(...new Uint8Array(data.buffer)));
  }
}
```

#### WorldLoader.ts

```ts
export class WorldLoader {
  async load(
    json:         unknown,
    worldState:   WorldState,
    zoneManager:  ZoneManager,
    bus:          EventBus
  ): Promise<void> {
    // 1. Basic validation
    const file = json as Partial<SceneFile>;
    if (!file.metadata?.version) throw new Error('Invalid scene file — missing metadata.version');

    // 2. Unload all current zones and clear WorldState
    for (const zoneId of worldState.zones.keys()) {
      zoneManager.unloadZone(zoneId);
    }

    // 3. Decode terrain heightData base64 → Float32Array
    if (file.terrain?.heightData && typeof file.terrain.heightData === 'string') {
      file.terrain.heightData = this._decodeHeightData(file.terrain.heightData);
    }

    // 4. Field migration — add missing fields for older scene files
    this._migrate(file);

    // 5. Load into WorldState
    worldState.loadFromJSON(file as SceneFile);

    // 6. Build meshes for first zone
    const firstZone = file.zones?.[0];
    if (firstZone) await zoneManager.loadZone(firstZone.id);

    // 7. Notify UI
    bus.emit('scene:loaded', { metadata: file.metadata as SceneMetadata });
  }

  private _migrate(file: Partial<SceneFile>): void {
    // Ensure every zone has the fields added in later phases
    for (const zone of file.zones ?? []) {
      zone.nodes          ??= [];
      zone.scripts        ??= [];
      zone.triggerVolumes ??= [];
      // Migrate old wall start/end format → node IDs (Phase 4.6)
      for (const wall of zone.walls ?? []) {
        if ('start' in wall && !('startNodeId' in wall)) {
          const w = wall as any;
          const sNode = { id: uuid(), x: w.start.x, z: w.start.z };
          const eNode = { id: uuid(), x: w.end.x,   z: w.end.z   };
          zone.nodes.push(sNode, eNode);
          (wall as any).startNodeId = sNode.id;
          (wall as any).endNodeId   = eNode.id;
          delete w.start;
          delete w.end;
        }
      }
      // Ensure floors have id field (migration from pre-Phase-6 saves)
      for (const floor of zone.floors ?? []) {
        floor.id ??= uuid();
      }
    }
    // Ensure world config has defaultSpawn
    if (file.world && !file.world.defaultSpawn) {
      file.world.defaultSpawn = {
        position: { x: 0, y: 0, z: 0 },
        zoneId:   file.zones?.[0]?.id ?? '',
        facing:   0,
      };
    }
  }

  private _decodeHeightData(b64: string): Float32Array {
    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  }
}
```

#### SaveLoadPanel.tsx

Shown in the top bar, always visible:

```
┌──────────────────────────────────────────┐
│  [💾 Save]   [📂 Load]   My World  [✏️]  │
│                                          │
│  last saved: never                       │
└──────────────────────────────────────────┘
```

- **Save button** — calls `bus.emit('scene:save', {})` → Three.js side serializes and triggers download
- **Load button** — opens a hidden `<input type="file" accept=".json">`, on file selected reads text and calls `bus.emit('scene:load', { json: parsed })`
- **World name** — editable inline, updates `worldState.metadata.name`
- **Last saved** — updates to current time on each successful save (stored in component state, not WorldState)

On `scene:save` bus event:
```ts
// In SceneManager or a SaveLoadController
bus.on('scene:save', () => {
  serializer.download(worldState);
  bus.emit('scene:saved', { json: serializer.serialize(worldState) });
});
```

On `scene:load` bus event:
```ts
bus.on('scene:load', async ({ json }) => {
  try {
    await loader.load(json, worldState, zoneManager, bus);
  } catch (e) {
    bus.emit('scene:load-error', { message: (e as Error).message });
  }
});
```

On `scene:load-error`: React shows a brief error toast.

#### Keyboard Shortcut

`Cmd+S` / `Ctrl+S` → save. Intercept in `InputManager`:
```ts
if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
  e.preventDefault();
  bus.emit('scene:save', {});
}
```

#### Error Handling

- Save: only fails if `JSON.stringify` throws (shouldn't happen with valid WorldState). Wrap in try/catch, show error toast on failure.
- Load: validate version field, catch all errors, show descriptive error toast. Never partially apply a broken scene file — if migration or load throws, WorldState is not mutated.
- File too large (>50MB): warn before loading, don't block.

#### What This Unlocks

After 6.2 you can:
- Save your scene at the end of a session
- Load it back the next day and continue exactly where you left off
- Share scene files between machines
- Keep multiple scene files as named snapshots

#### New Bus Events

```ts
"scene:save-error": { message: string };
"scene:load-error": { message: string };
```
(Add these to BusEvents in types.ts)



### Phase 6.3 — Wall-Run Gizmo Extensions & Multi-Floor Wall Elevation

Extends the Phase 6.1 gizmo to fully support wall-runs as first-class spatial objects, and adds a working multi-floor wall elevation system.

#### Wall-Run Gizmo

`GizmoManager._wallRunIds` — tracks every wall ID in the selected run (not just nodes).

**Translate (G):**
- Y-axis enabled for walls; previously it was locked to XZ only.
- When the run is moved on Y, `updateWall` is called for every wall in the run with the new `elevation` value.
- Floors whose node IDs are entirely owned by the moved run are co-elevated (checked via `fIds.every(id => movedNodes.has(id))`).
- NodeDragger dots and floor edge lines both track elevation via a unified `nodeY` priority map (wall elevation → floor elevation → platform top-face).
- NodeDragger mutes its own picking while a gizmo drag is active (subscribes to `gizmo:dragging` → `_gizmoActive`), so a gizmo ring pressed over a node dot behind it doesn't grab that node (v4.2.9).

**Rotate (R):**
- `R` key now enabled for walls (previously platforms/stairs only).
- Uses snapshot + `makeRotationY(deltaAngle)` pattern: node positions captured at drag start (`_wallDragSnapshot`), baked with THREE.js sign convention on release.
- `deltaAngle = pivot.rotation.y - _rotateStartAngle` — delta-based so repeated drags accumulate correctly.
- Floors reconstruct automatically because they reference the same nodeIds.

#### WallDef.elevation Field

```typescript
export interface WallDef {
  elevation?: number;   // Y offset from ground (default 0)
  // ... existing fields
}
```

`buildRun()` uses `walls[0].elevation ?? 0` as `runElevation`; all Y positions in the run mesh (body, liner, trim, collider) are offset by this value.

`canMerge()` in `wallRuns.ts` checks both `floor` and `elevation` before merging walls into a run — prevents cross-floor walls from merging into a single mesh that jumps between heights.

#### Multi-Floor Wall Placement

When drawing walls, `WallTool` derives elevation from the active floor's stored `elevation`, falling back to `activeLevel * wallHeight` (default 3.0m per floor, not 3.2m — no slab gap).

Same formula used for:
- Preview mesh Y position during draw
- Node dot Y position
- `WallDef.elevation` on commit
- `FloorTool` floor elevation fallback
- Auto-floor prompt elevation in App.tsx

This places floor-1 walls starting flush at Y=3.0 (the top of floor-0 walls) with no gap.

#### Wall-Run Properties Panel

Two new controls appear in the properties panel when a wall-run is selected:

**Fill closed loop with floor** — button appears only when the run's walls form a closed polygon (detected via `resolveRunNodeIds(runWalls)` — first and last node IDs are equal). Creates a polygon `FloorDef` from the run's node positions at the correct elevation. Equivalent to the auto-floor toast prompt but available at any time from the panel.

**Copy to Floor (0–3)** — row of buttons, current floor disabled. Duplicates the entire run (all walls + nodes, with new IDs) at the target floor's elevation. Openings are duplicated with fresh IDs. Useful for stacking identical floor plans.

### Phase 6.5 — Properties Panel Navigation Redesign

Replaces the flat vertical properties panel with a drilldown navigation system. The panel has a fixed header and a scrollable content area. The root screen shows a list of category rows. Tapping a row pushes a detail screen. A back button in the fixed header returns to the previous screen.

This phase touches only `src/ui/PropertiesPanel.tsx` and its sub-components. No Three.js, no WorldState, no bus events change. All existing data bindings remain — only the presentation layer changes.

---

#### Layout Structure

The panel is split into two parts:

**Fixed header** — never scrolls, always visible:
```
┌─────────────────────────────────┐
│ PROPERTIES              ← back  │  ← top bar: label left, back button right
├─────────────────────────────────┤
│ wall_91bfd929                   │  ← object name (updates per screen)
│ WALL · LEVEL 0                  │  ← object subtitle (updates per screen)
└─────────────────────────────────┘
```

**Scrollable body** — content area below the fixed header, `overflow-y: auto`, `max-height` fills remaining panel space.

The back button is hidden on the root screen and shown on all detail screens. It sits in the top bar row alongside the "PROPERTIES" label — label on the left, back button on the right.

---

#### Navigation Model

A `stack: string[]` state array drives all navigation. Each entry is a screen ID string.

```tsx
const [stack, setStack] = useState<string[]>([]);

const push = (screenId: string) =>
  setStack(prev => [...prev, screenId]);

const pop = () =>
  setStack(prev => prev.slice(0, -1));

const currentScreen = stack.length > 0 ? stack[stack.length - 1] : 'root';
const isRoot = stack.length === 0;
```

There is no animation — screens swap instantly on push/pop. The scroll position of the body resets to 0 on every navigation (use a `key` prop on the scrollable container or an effect).

---

#### Root Screen

A vertical list of category rows. Each row is a `<button>` spanning the full panel width:

```
Category name                  summary text  ›
```

- Left: category label — font-weight 500, full text color
- Right: summary string (compact one-liner of current values) — muted color, smaller size
- Rightmost: chevron-right icon
- Bottom border separating rows
- On click: `push(screenId)`

**Category rows and their summary strings:**

| Screen ID | Label | Summary string |
|---|---|---|
| `geo` | Geometry | `h {height} · t {thickness}` |
| `mat` | Material | `{materialName} · {n} maps` |
| `open` | Openings | `{count} openings` or `none` |
| `seg` | Segments | `{count} walls` |

Actions are **not** a drilldown screen. They render directly on the root screen as a collapsible accordion below the Segments row (see Actions Accordion section below).

Quality is **not** on the root screen. It renders at the bottom of the Material screen, below the Maps section, separated by a divider.

The summary string is computed from current props/state at render time. It is read-only — tapping the row opens the detail screen where values are edited.

Below the category rows, on the root screen only, render an **Actions accordion** — expanded by default, collapsible. Contains:
- Fill closed loop with floor (object-type-specific, shown when applicable)
- Copy to Floor (floor number buttons, current floor disabled)
- Delete button

The accordion header row follows the same style as the drilldown rows (label left, chevron right) but toggles instead of navigating. Chevron points down when expanded, right when collapsed. Content has `gap: 12px` between items and generous button padding (`9px`) so actions don't feel cramped.

The **Quality selector** lives inside the **Material screen**, below the Maps section, separated by a divider. It is not on the root screen.

---

#### Actions Accordion (Root Screen)

The Actions accordion sits on the root screen, below the last drilldown row, above nothing else. It is expanded by default on first render. The user can collapse it by clicking the header.

**Header row:** same visual style as drilldown rows — label "Actions" on the left, chevron on the right. Chevron rotates 180° when expanded. Does not navigate anywhere on click — toggles expanded state.

**Content** (when expanded, `gap: 12px` between items, `padding: 9px` on full-width buttons):
- Object-specific action buttons (e.g. "Fill closed loop with floor" for walls) — shown/hidden based on object type and current state
- "Copy to Floor" — label above a row of floor number buttons (G/1/2/3). Current floor is disabled/greyed
- "Delete" button — danger style, always last

**Collapsed state:** accordion header row only, content hidden. Chevron points right.
**Expanded state:** default. Chevron points down.

Accordion open/closed state is held in local React component state (`useState<boolean>(true)`). It resets to open whenever a new object is selected (i.e. when the panel receives a new `object:selected` event).

#### Detail Screens

Each screen ID maps to a dedicated sub-component:

```tsx
const SCREENS: Record<string, React.FC<DetailProps>> = {
  geo:  GeometryScreen,
  mat:  MaterialScreen,
  open: OpeningsScreen,
  seg:  SegmentsScreen,
  act:  ActionsScreen,
};
```

`DetailProps` is a subset of what `PropertiesPanel` already receives — whichever slice of the selected object's data that screen needs. Pass only what's needed, not the entire selection payload.

Each screen renders its own content freely — inputs, lists, toggles, buttons — with no awareness of the navigation wrapper.

---

#### Header Title Updates

The fixed header title and subtitle update based on current screen:

```tsx
const headerTitle    = isRoot ? selectedObject.id    : SCREEN_TITLES[currentScreen];
const headerSubtitle = isRoot ? objectTypeLabel      : SCREEN_SUBTITLES[currentScreen];
```

```tsx
const SCREEN_TITLES: Record<string, string> = {
  geo:  'Geometry',
  mat:  'Material',
  open: 'Openings',
  seg:  'Segments',
  act:  'Actions',
};

const SCREEN_SUBTITLES: Record<string, string> = {
  geo:  'HEIGHT · THICKNESS',
  mat:  'MATERIAL · MAPS',
  open: 'OPENINGS',
  seg:  'WALL SEGMENTS',
  act:  'ACTIONS',
};
```

---

#### Object Type → Screen Mapping

Different object types expose different screens. The root screen's category list is derived from a config map:

```tsx
type ScreenId = 'geo' | 'mat' | 'open' | 'seg' | 'act' | 'vert';

const OBJECT_SCREENS: Record<EditorObjectType, ScreenId[]> = {
  wall:     ['geo', 'mat', 'open', 'seg'],
  floor:    ['geo', 'mat', 'vert'],    // geo added v4.6.0 (position/size + vertex list); vert = level + elevation
  platform: ['geo', 'mat'],
  stair:    ['geo', 'mat'],
  object:   ['geo', 'mat', 'colliders'],   // colliders screen added v4.4.0
  opening:  ['geo', 'mat'],
  terrain:  ['mat'],
  trigger:  [],
};
// Actions accordion always appears on root screen for all object types.
// Quality selector always appears at the bottom of the Material screen.
```

When `selectedObject` changes (bus event `object:selected`), reset `stack` to `[]` so the panel always opens at root for the new selection.

---

#### Scroll Reset

Reset scroll position when navigating:

```tsx
const bodyRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (bodyRef.current) bodyRef.current.scrollTop = 0;
}, [currentScreen]);
```

---

#### Component Structure

```
PropertiesPanel.tsx
  ├── PanelHeader.tsx          ← fixed header: back row (← Properties, detail screens only), title, subtitle
  ├── PanelRoot.tsx            ← root screen: drilldown rows + ActionsAccordion
  ├── ActionsAccordion.tsx     ← expanded-by-default collapsible: object actions + copy-to-floor + delete
  ├── screens/
  │   ├── GeometryScreen.tsx
  │   ├── MaterialScreen.tsx   ← includes Quality selector at bottom
  │   ├── OpeningsScreen.tsx
  │   └── SegmentsScreen.tsx
  └── CategoryRow.tsx          ← reusable row: label + summary + chevron
```

All existing form logic (inputs, material picker, map toggles, copy-to-floor buttons etc.) moves verbatim into the appropriate screen component. No logic changes — only restructuring into these files.

---

#### What Does Not Change

- The panel's position in the layout (right side, fixed height)
- All existing bus event subscriptions (`object:selected`, `object:deselected`, `object:updated`)
- How values are read from and written to the bus — all `onChange` handlers remain identical
- The Quality selector and Delete button behavior
- Any existing TypeScript types

---

#### Implementation Order

1. Create `PanelHeader.tsx` — static layout, back button hidden/shown via prop
2. Create `CategoryRow.tsx` — reusable row component
3. Create `PanelRoot.tsx` — assembles category rows from `OBJECT_SCREENS` config, renders quality + delete below
4. Move existing screen content into individual screen components under `screens/`
5. Rewrite `PropertiesPanel.tsx` to own the `stack` state, render `PanelHeader` + scrollable body that switches between `PanelRoot` and the active detail screen
6. Test: select each object type, verify correct screens appear, verify back navigation works, verify scroll resets, verify all existing inputs still write to bus correctly



### Phase 7 — Object Placement + Model Importer

#### Left Secondary Panel (new UI system)

The editor layout gains a **secondary panel** that slides in from the left, just to the right of the existing toolbar strip. It is dynamic — the panel slot is generic and can host any left-side sub-panel content. Phase 7 introduces it with the Asset Browser as its first occupant. Future phases can add other left panels (e.g. Zone list, Script list) by registering a new panel ID.

**Layout:**
```
┌──────┬──────────────┬───────────────────────────┬─────────────────┐
│      │              │                           │                 │
│Toolbar│ Left Panel  │       Canvas              │ Properties Panel│
│ 64px │  240px       │     (flex: 1)             │    280px        │
│      │ (when open)  │                           │                 │
└──────┴──────────────┴───────────────────────────┴─────────────────┘
```

The left panel has `width: 0` when closed and animates to `240px` when open (CSS transition). The canvas flex-shrinks naturally — no layout recalculation needed.

**`LeftPanelManager` (React state, owned by `App.tsx`):**
```tsx
type LeftPanelId = 'assets' | 'zones' | 'scripts' | null;

const [leftPanel, setLeftPanel] = useState<LeftPanelId>(null);

// Toggling the same tool closes the panel
// Switching to a different tool opens that panel
function setLeftPanelForTool(tool: ToolId): void {
  if (tool === 'object') setLeftPanel(prev => prev === 'assets' ? null : 'assets');
  else setLeftPanel(null);
}
```

Panel opens automatically when the Object tool is selected. Closes when any other tool is selected or when the user clicks the active tool button again.

**`LeftPanel.tsx`** — the generic shell component:
```tsx
interface LeftPanelProps {
  panelId: LeftPanelId;
  onClose: () => void;
}

// Renders the correct sub-panel based on panelId
// Handles open/close animation via CSS class
// Has a consistent header with title + close button
function LeftPanel({ panelId, onClose }: LeftPanelProps) {
  return (
    <div className={`left-panel ${panelId ? 'open' : ''}`}>
      <div className="left-panel-header">
        <span>{PANEL_TITLES[panelId ?? '']}</span>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="left-panel-body">
        {panelId === 'assets' && <AssetBrowser />}
        {panelId === 'zones'  && <ZonePanel />}
        {/* future panels registered here */}
      </div>
    </div>
  );
}
```

**CSS:**
```css
.left-panel {
  width: 0;
  overflow: hidden;
  transition: width 0.2s ease;
  border-right: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
}
.left-panel.open { width: 240px; }
```

---

#### Asset Browser (`src/ui/AssetBrowser.tsx`)

Lives inside the left panel when `panelId === 'assets'`.

**Layout:**
```
┌─────────────────────────────────────┐
│ [search…………………………] [+ Import]       │
├─────────────────────────────────────┤
│ All  Furniture  Props  Structures … │  ← category tabs
├─────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐               │
│ │    │ │    │ │    │  3-col grid    │
│ └────┘ └────┘ └────┘               │
│  name   name   name                 │
│ ┌────┐ ┌────┐ ┌────┐               │
│ │    │ │    │ │    │               │
│ └────┘ └────┘ └────┘               │
└─────────────────────────────────────┘
```

- Search input filters by label and id, live
- Category tabs: All, Furniture, Props, Structures, Lights, Characters, Vegetation, Other — derived from manifest, not hardcoded
- Asset grid: 3 columns, thumbnail + name + file size, collidable badge when `collidable: true`
- Clicking an asset selects it (highlighted border) and puts `ObjectTool` into placement mode
- Clicking the selected asset again deselects, exits placement mode
- On `assets:loaded` bus event: re-render grid from `assetManager.getMaterialList()`

**Thumbnail:** auto-generated 256² PNG at import time (`/assets/models/<base>_thumb.png`, flat beside the model — no `thumbnails/` subfolder). If absent, a ◻ placeholder tile renders instead. **Re-staging (v4.3.2):** in Manage mode, checking exactly one asset enables a 📷 button (between Edit and Delete) that opens `ThumbnailStagerModal` — drag-to-orbit / zoom / light-intensity staging of a replacement shot, saved over the same file (`AssetBrowser.onRestage(id)` → `LeftPanel.onRestageAsset` → App `stagingAsset`).

---

#### Model Manifest System

`public/assets/models/manifest.json` — same pattern as material manifest:

```json
{
  "version": "1.0",
  "assets": [
    {
      "id": "prop_bench_01",
      "label": "Wooden Bench",
      "category": "Furniture",
      "path": "/assets/models/prop_bench_01.glb",
      "thumbnail": "/assets/models/thumbnails/prop_bench_01.png",
      "collidable": true,
      "colliderType": "box",
      "tags": ["outdoor", "seating"],
      "dateAdded": "2026-01-01T00:00:00Z"
    }
  ]
}
```

`AssetManager.initAssets()` fetches this on startup, populates registry, emits `assets:loaded`. No hardcoded assets anywhere — if the file doesn't exist, the browser shows empty with only the Import button.

---

#### Model Importer Modal (`src/ui/ModelImporterModal.tsx`)

Opened by the "+ Import model" button in the AssetBrowser header. Uses File System Access API (`showOpenFilePicker`) — Chrome/Edge only, same as material importer. Shows a browser check on open.

**Three-step flow:**

**Step 1 — File pick:**
- Drop zone or click to browse — accepts `.glb`, `.gltf`
- On file selected: show filename, file size, enable Step 2

**Step 2 — Metadata:**
- Label (text input)
- ID (auto-derived from label, editable, monospace — `my label` → `my_label_01`)
- Category (dropdown)
- Collidable toggle (default on)
- Collider type: Box / Mesh hull / None
- Tags (chip input — type and press Enter)

**Step 3 — Import (on confirm):**
1. Copy `.glb` to `public/assets/models/<id>.glb`
2. Generate thumbnail: `renderModelThumbnail(root)` (`src/editor/thumbnailRenderer.ts`) — a `ThumbnailStage` (256², shared offscreen renderer, hemi+key+fill rig, camera fitted to the model's bounding sphere) rendered once at `DEFAULT_STAGE`, exported as PNG → `public/assets/models/<base>_thumb.png`. After the import loop, `releaseThumbnailRenderer()` frees the shared WebGL context.
3. Read existing manifest (or create empty), merge new entry, write back
4. Call `AssetManager.initAssets()` to reload — asset appears in browser immediately
5. Show success state with "Import another" / "Done" buttons

Progress log shows each step with status. On error: show message, allow retry.

---

#### Thumbnail Stager Modal (`src/ui/ThumbnailStagerModal.tsx`) — v4.3.2

Opened from AssetBrowser Manage mode (📷 with exactly one asset checked). Fixes bad auto-thumbnails after the fact — dark, off-center, or missing shots can be re-staged manually.

- Loads the model via `assetManager.loadModel(asset.id)` into a `ThumbnailStage` (`src/editor/thumbnailRenderer.ts`)
- Preview is an `<img>` re-rendered per gesture: pointer drag = orbit (yaw/pitch), wheel = zoom; Zoom + Light sliders; Reset view returns to `DEFAULT_STAGE`
- **Save Thumbnail** → `App.handleSaveThumbnail(asset, dataUrl)`: `ensureDir(modelsDir)` (dir picker on first use) → write `<base>_thumb.png` (reuses the asset's existing thumbnail filename when set) → patch `manifest.json` `thumbnail` → `assetManager.updateAsset` with a `?v=<timestamp>` cache-busted path so the grid refreshes in-session
- On unmount: `stage.dispose()` + `releaseThumbnailRenderer()`

---

#### Object Placement

- `ObjectPlacer` + GLTF loading via `AssetManager`
- `ObjectTool` Mode A (placing): ghost model follows mouse snapped to nearest floor/platform surface, click to place
- `ObjectTool` Mode B (transform): G/R/S keys, delegates to `GizmoManager` (Phase 6.1)
- Static props with `collidable: true` get Rapier box collider from AABB
- On object move: Rapier body translation updated
- Objects stored in `WorldState`, selectable, PropertiesPanel shows Geometry and Material screens
- Placed object thumbnail shown in PropertiesPanel header for quick identification

---

#### New Bus Events

```ts
"assets:loaded":    { assets: AssetDef[] };   // remove ⏳ marker — now implemented

"leftpanel:close":  Record<string, never>;
```

#### New Files

```
src/
  ui/
    LeftPanel.tsx           ← generic left panel shell with open/close animation
    AssetBrowser.tsx        ← asset grid, search, tabs, selection
    ModelImporterModal.tsx  ← file pick → metadata → import flow
```

#### Add to `src/types.ts`

```ts
export type LeftPanelId = 'assets' | 'zones' | 'scripts' | null;
```

#### Notes for Claude Code

- `LeftPanel` is the only component that knows about the open/close animation. `AssetBrowser` and other sub-panels have no knowledge of the panel system — they just render their content.
- The panel width (240px) is a CSS variable `--left-panel-w` so it can be adjusted without hunting through code.
- `ObjectTool` must listen to `assets:selected` bus event (emitted by `AssetBrowser` on asset click) to enter placement mode, and deactivate when `assets:deselected` is emitted.
- Thumbnail generation uses a **shared** offscreen renderer (`thumbnailRenderer.ts` singleton) — never the main scene renderer, and never one renderer per model (context exhaustion). Call `releaseThumbnailRenderer()` (dispose + `forceContextLoss`) once a batch/session finishes, not per thumbnail.
- File System Access API availability check: `if (!('showOpenFilePicker' in window))` → show "Use Chrome or Edge" message, disable the import button.

### Phase 8 — Zones & Transitions

#### What Zones Are For

A zone is a self-contained region of the world. Think of it as a room, a building interior, an outdoor area, or a dungeon floor — any space that has its own walls, floors, objects, and scripts.

The practical reason zones exist is **performance and organisation**. Only one zone is loaded into the Three.js scene and Rapier physics world at a time. When you walk through a door into a building, the outdoor zone is unloaded (meshes disposed, colliders removed) and the indoor zone is loaded in its place. This means you can build a world with dozens of large detailed spaces without them all being in memory simultaneously.

Zones also define **transition boundaries**. A door opening linked to another zone is how the player moves between spaces — the door triggers a fade, the zone swap happens, and the player appears at a spawn point in the new zone. This is the same pattern used in classic RPGs, The Sims, and most games with interior/exterior spaces.

In the editor: zones are how you organise your work. You draw zone boundaries, name them, assign them a type (outdoor / indoor / dungeon), and switch between them using the Zone Panel. Everything you place — walls, floors, objects, scripts — belongs to whichever zone is currently active.

---

#### ZoneTool

Draws a new zone boundary rectangle on the ground plane:

```
IDLE:
  Show existing zone boundaries as dashed outlines on the canvas
  On click: record start point

PLACING:
  Drag to define rect
  On release: open New Zone dialog

New Zone dialog (modal):
  Name input (text)
  Type selector: outdoor / indoor / dungeon (pill buttons)
  Cancel / Create zone buttons

On Create:
  worldState.addZone(zoneDef)
  Set as active zone
  Zone appears in Zone Panel immediately
```

---

#### Zone Panel (`src/ui/ZonePanel.tsx`)

Lives in the left panel slot (`panelId === 'zones'`). Opens automatically when the Zone tool is active. This panel is for **world-level navigation** — seeing and switching between zones — not for inspecting a selected object (that belongs in the Properties Panel).

**Browse mode (default — always):**

```
┌──────────────────────────────────────┐
│ ZONES                        [+ New] │
├──────────────────────────────────────┤
│ Town Square              outdoor     │  ← active zone, blue tint, no Enter
│ editing                              │
├──────────────────────────────────────┤
│ Tavern Interior          indoor      │
│ 8 walls · 2 floors      [Enter ›]   │
├──────────────────────────────────────┤
│ Dungeon Level 1          dungeon     │
│ 12 walls · 1 floor      [Enter ›]   │
└──────────────────────────────────────┘
```

- Active zone: blue left border, blue name, "editing" label instead of Enter button
- Other zones: Enter button triggers `zone:enter { zoneId }` → ZoneManager swap with fade
- Type badges: outdoor (grey), indoor (blue), dungeon (red)
- "+ New" button opens New Zone dialog

**The Zone Panel never enters a "link picker" mode.** Transition linking is handled entirely inside the Properties Panel (see below). The Zone Panel always stays in browse mode.

---

#### Transition Linking — Properties Panel Flow

When a door opening is selected, the Properties Panel shows a "Zone link" row in the opening's root screen. The entire linking flow is a drill-down within the Properties Panel:

```
Opening root screen
  ├── Geometry  ›
  └── Zone link ›          ← shows "none" or "✓ Zone name"

Zone link screen (drill-down):
  LINKED ZONE
  [No zone linked]         ← or green pill showing linked zone name + unlink button
  
  [Spawn point]  x:1 · y:0 · z:1 · 180°   ← shown when linked
  [Effect]       Fade · 0.3s               ← shown when linked
  
  [Link to zone… / Change linked zone…]    ← button always present

Pick zone screen (drill-down from Link button):
  "Choose the zone this door leads to:"
  
  Town Square    outdoor   ← greyed out, "current zone — cannot link to itself"
  Tavern Interior indoor   ← clickable, selects and confirms immediately
  Dungeon Level 1 dungeon  ← clickable
```

Selecting a zone in the picker immediately confirms the link and navigates back to the Zone link screen showing the new linked zone. No separate confirm step needed — selection is confirmation.

The left Zone Panel is completely unaffected during this entire flow.

---

#### ZoneManager

Manages which zone's meshes and colliders are in the scene at any time:

- `loadZone(zoneId)` — builds all meshes and registers all Rapier colliders for a zone
- `unloadZone(zoneId)` — disposes all meshes, removes ALL Rapier colliders for that zone (walls, floors, platforms, stairs, sensors)
- Only one zone loaded at a time in play/preview mode
- In editor mode: active zone fully loaded, other zones shown as ghost outlines only (dashed boundary lines, no geometry)
- On `zone:enter { zoneId }`: ZoneManager triggers TransitionManager

---

#### TransitionManager

Handles the actual zone swap:

```
1. Fade screen to black (CSS overlay, 0.3s)
2. ZoneManager.unloadZone(fromZone)
3. ZoneManager.loadZone(toZone)
4. Teleport player/camera to transition.spawnPoint
5. Fade back in (0.3s)
6. Emit preview:zone-entered { zoneName }
```

In editor mode (no character): clicking a linked door opening in the Properties Panel triggers an editor jump — same fade, same zone swap, camera moves to the new zone center. No character involved.

---

#### New Bus Events

```ts
"zone:enter":       { zoneId: string };           // user clicks Enter in Zone Panel
"zone:jump":        { zoneId: string };            // editor camera jump (no character)
"transition:fired": { transitionId: string };      // character walked through door
```

---

#### Zones vs Floors — When to Use Each

Both zones and floors handle vertical multi-level spaces, but they serve different purposes:

**Use floors within a zone when:**
- The levels are always loaded together (a small 2-floor shop)
- The player can see between levels (open mezzanine, balcony)
- Performance is not a concern at that scale

**Use separate zones per level when:**
- The levels are large enough that you don't want them all in memory simultaneously (a 10-floor dungeon tower)
- Each level has a distinct feel that benefits from a full load/unload transition
- You want a loading screen / fade effect between floors

**Stair openings can link zones** the same way door openings do. A stair with a `linkedZoneId` triggers a zone transition when the player reaches the top or bottom — the current zone unloads, the destination zone loads, and the player spawns at the stair's arrival point in the new zone. This is identical to a door transition, just vertical.

In `StairDef`, openings at the top and bottom work the same as `Opening` on a wall:
```ts
// Addition to StairDef
topOpening?:    StairOpening;   // zone link at top of stair
bottomOpening?: StairOpening;   // zone link at bottom of stair

export interface StairOpening {
  linkedZoneId:       string | null;
  linkedTransitionId: string | null;
}
```

There is no right answer — it's a design decision per space. The editor supports both. The Zone Panel shows floor count per zone as a hint (`8 walls · 2 floors`) so you can see at a glance how a zone is structured.

---

#### Help Tooltips (`?` buttons)

Several places in the UI have concepts that benefit from a brief explanation. Add a small `?` button next to section headers or labels in these locations. Clicking it shows a non-blocking tooltip (not a modal — a small popover that dismisses on click-outside).

**Locations and copy:**

| Location | Trigger | Tooltip text |
|---|---|---|
| Zone Panel header | `?` next to "ZONES" label | "Zones are separate areas of your world — outdoor spaces, building interiors, dungeon floors. Only one zone is loaded at a time. Use the Floor selector inside a zone for multi-level spaces that should always be in memory together." |
| New Zone dialog title | `?` next to "New zone" | "Each zone is an independently loaded space. A small building might be one zone with multiple floors. A large dungeon tower might use one zone per floor so levels load and unload as the player moves through them." |
| Zone link screen in Properties Panel | `?` next to "LINKED ZONE" | "Linking a door or stair to another zone creates a transition — when the player walks through, the current zone unloads and the destination zone loads. Set the spawn point to where the player should appear in the new zone." |
| Floor level selector (G/1/2/3 tabs) | `?` next to "FLOOR" label | "Floors are levels within this zone. Use floors when the levels should always be loaded together. For large spaces where you want levels to load independently, create separate zones and link them via stair openings." |

**`HelpTooltip` component (`src/ui/HelpTooltip.tsx`):**

```tsx
interface HelpTooltipProps {
  text: string;
}

function HelpTooltip({ text }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 16, height: 16,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'none',
          color: 'var(--muted)',
          fontSize: 10,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 600,
          lineHeight: 1,
        }}
        aria-label="Help"
      >?</button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          />
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
            transform: 'translateX(-50%)',
            width: 220, padding: '8px 10px',
            background: 'var(--raised)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', fontSize: 11, lineHeight: 1.6,
            color: 'var(--muted)', zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,.3)',
          }}>
            {text}
          </div>
        </>
      )}
    </div>
  );
}
```

Usage:
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  <span className="lp-title">ZONES</span>
  <HelpTooltip text="Zones are separate areas of your world..." />
</div>
```

---

#### New Files

```
src/
  ui/
    ZonePanel.tsx           ← zone list, browse mode only, lives in left panel slot
    ZoneNamingDialog.tsx    ← new zone modal (name + type)
    HelpTooltip.tsx         ← reusable ? popover component
  editor/
    ZoneTool.ts             ← rect draw on canvas → opens ZoneNamingDialog
```

### Phase 9 — Full Persistence

Scene save/load was handled in Phase 6.2. This phase adds everything else: game state persistence, editor preferences, auto-save, and a robust startup restore flow. By the end of this phase, nothing is ever lost.

#### What Phase 6.2 Already Covers (do not re-implement)
- `WorldSerializer.download()` and `WorldLoader.load()`
- `WorldLoader._migrate()` — field migration for old scene files
- Save/Load buttons in SaveLoadPanel, `Cmd+S` shortcut
- All `scene:*` bus events

#### Auto-Save (Scene File Backup)

A safety net — not a replacement for the explicit Save button:

```ts
setInterval(() => {
  const json = serializer.serialize(worldState);
  localStorage.setItem('worldeditor_autosave', JSON.stringify(json));
  localStorage.setItem('worldeditor_autosave_ts', Date.now().toString());
}, 60_000); // every 60 seconds
```

On startup: if autosave exists and is newer than last explicit save, show restore prompt — "Unsaved work found from [X minutes ago]. Restore?" Restore loads the autosave. Discard deletes it.

#### GameStateManager.ts (`src/scripting/`)

Owns all runtime game state — completely separate from the scene file:
- Tracks player position, current zone, facing, flags, fired one-shots, inventory
- Auto-saves to `localStorage` (`worldeditor_gamesave`) every 30 seconds during preview mode
- Also saves on every zone transition
- `load()` — restores from localStorage on Continue
- `clear()` — wipes save on New Game
- Syncs flags from `ScriptEngine` via `flag:set` bus event
- Syncs player position from `CharacterController` via `character:position-update`

#### PreferencesManager.ts (`src/core/`)

User-specific settings that never belong in the scene file:
- Quality (texture scale, shadow map size, shadows, fog, antialias)
- Grid visible, snap enabled, snap unit, camera speed
- Loaded on app boot before anything else
- Written to `localStorage` (`worldeditor_prefs`) immediately on every change — no Apply button
- Emits `prefs:changed` so React UI reflects current state

#### SaveLoadPanel — Full Version

Extends Phase 6.2 panel. Game save controls only visible in preview/play mode:

```
EDITOR MODE:
[💾 Save]  [📂 Load]   My World [✏️]   Last saved: 2 min ago   [● Auto-save]

PREVIEW MODE (additional row):
[▶ New Game]  [↺ Continue]  [✕ Clear Save]   Game save: 3 flags, Zone 2
```

#### Startup Flow

1. `preferencesManager.load()` — apply quality, snap, grid
2. Check autosave — if found and recent, show restore prompt
3. Otherwise start with empty scene or last opened (`preferences.lastOpenedScene`)

#### New Bus Events
```ts
"scene:autosave":            Record<string, never>;
"prefs:changed":             { prefs: EditorPreferences };
"script:load-save":          { flags: Record<string,boolean>; firedOneShots: string[] };
"character:position-update": { position: Vec3; zoneId: string; facing: number };
```

#### New Files
```
src/core/PreferencesManager.ts
src/scripting/GameStateManager.ts
```


### Phase 10 — Preview Mode + Character Controller

The world becomes walkable. The character is built on Rapier's `KinematicCharacterController` from day one — not a prototype, game-ready physics from the start.

---

#### Character Setup

The character has two valid configurations. Both use the same `CharacterBody` and `CharacterController` — only the visual representation differs.

**Option A — Capsule only (default)**
No mesh attached. The physics capsule moves through the world invisibly. The camera is attached directly to the capsule position. Good for FPS testing, top-down games, or when you just want to walk around without worrying about a character model.

**Option B — Capsule + GLTF model**
A GLTF model loaded via `AssetManager` is attached to the capsule as a child `THREE.Group`. The model follows the physics body. The camera is separate — it reads position from `CharacterBody` and applies its own offset (FPS: at eye level, third-person: behind/above). In FPS mode the model is hidden. In third-person the model is visible.

Both options set via `CharacterDef.modelAssetId`:
```ts
modelAssetId?: string | null;  // null = capsule only, no mesh
```

Character settings (accessible from SpawnPointTool properties in PropertiesPanel):
- Camera mode: FPS / Third-person
- Model: None (capsule) / asset picker from manifest
- Move speed, jump height, FOV (FPS), third-person distance

Stored in `worldConfig.playerSettings`, persists in scene file.

---

#### CharacterBody.ts

```ts
export class CharacterBody {
  readonly capsuleRadius     = 0.3;
  readonly capsuleHalfHeight = 0.6;

  init(spawnPosition: THREE.Vector3): void {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this._body     = physicsWorld.world.createRigidBody(bodyDesc);
    this._collider = physicsWorld.world.createCollider(
      RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.capsuleRadius), this._body
    );
    this._kcc = physicsWorld.world.createCharacterController(0.01);
    this._kcc.enableAutostep(0.5, 0.2, true);
    this._kcc.enableSnapToGround(0.3);
    this._kcc.setSlideEnabled(true);
    this._kcc.setMaxSlopeClimbAngle(45 * Math.PI / 180);
  }

  move(desired: THREE.Vector3): void {
    this._kcc.computeColliderMovement(this._collider, desired);
    const mv  = this._kcc.computedMovement();
    const pos = this._body.translation();
    this._body.setNextKinematicTranslation({
      x: pos.x + mv.x, y: pos.y + mv.y, z: pos.z + mv.z
    });
  }

  get position(): THREE.Vector3 { ... }
  get isGrounded(): boolean { return this._kcc.computedGrounded(); }
  dispose(): void { ... }
}
```

---

#### CharacterController.ts

Reads input, computes movement, delegates physics to `CharacterBody`, updates camera and optional model mesh.

```ts
update(dt: number): void {
  // 1. Read WASD → local direction
  // 2. Rotate by yaw → world direction
  // 3. Apply move speed
  // 4. Accumulate gravity (velocity.y -= 20 * dt unless grounded)
  // 5. Jump (Space, grounded only)
  // 6. CharacterBody.move(desiredMovement)
  // 7. Update camera from CharacterBody.position
  // 8. If model attached: update model position/rotation
  // 9. Check interact ray (see Interact section)
  // 10. TriggerSystem.update()
}
```

**Mouse look** (pointer lock):
- `dx` → yaw, `dy` → pitch (clamped ±80°)
- FPS: camera rotation = yaw + pitch directly
- Third-person: camera orbits character at `thirdPersonDistance` + `thirdPersonHeight`

---

#### Character Model (Option B)

```ts
// On spawn:
const gltf = await assetManager.loadGLTF(modelAssetId);
this._modelRoot = gltf.scene.clone();
this._mixer     = new THREE.AnimationMixer(this._modelRoot);
scene.add(this._modelRoot);

// On update:
this._modelRoot.position.copy(feetPosition);  // body.position.y - capsuleHalfHeight - capsuleRadius
this._modelRoot.rotation.y = this._yaw;
this._modelRoot.visible = (settings.cameraMode === 'thirdperson');
```

**Animations** — play clips by convention name: `idle`, `walk`, `run`, `jump`.
- Crossfade with `mixer.clipAction(clip).fadeIn(0.15)`
- Missing clips silently skipped — not every model has all four
- Animation support is best-effort: if no animations exist, character still works

---

#### Interact System

Player presses `E` to interact with nearby objects — foundation for NPC conversations, item pickups, door triggers, levers.

**Detection:**
- Each frame: ray cast from camera in look direction, max 2.5m
- Hits mesh with `userData.interactable === true` → show HUD prompt `[E] {label}`
- On `E` press: `scriptEngine.fire('on_interact', hitMesh.userData.editorId, context)`

**Making an object interactable:**
- "Interactable" toggle in PropertiesPanel object properties
- Optional `interactLabel` field: "Open", "Talk", "Pick up" etc. — shown in HUD

```ts
// Additions to ObjectProperties
export interface ObjectProperties {
  interactable:    boolean;
  interactLabel?:  string;       // HUD prompt label, default "Interact"
  npcSpawn:        boolean;
  lootTableId:     string | null;
  triggerEventId:  string | null;
}
```

---

#### TriggerSystem.ts

Detects Rapier sensor overlaps each frame. Handles door sensors (Phase 5) and trigger volume sensors (Phase 10.5):

```ts
update(_dt: number): void {
  if (!this._characterCollider) return;
  this._currentOverlaps.clear();
  physicsWorld.world.intersectionsWith(this._characterCollider, (other) => {
    this._currentOverlaps.add(other.handle);
    // Door sensor
    const transitionId = this._doorSensorMap.get(other.handle);
    if (transitionId) bus.emit('character:triggerdoor', { transitionId });
    // Trigger volume — fire on_player_enter on first overlap
    const volumeId = this._volumeSensorMap.get(other.handle);
    if (volumeId && !this._activeVolumes.has(other.handle)) {
      this._activeVolumes.add(other.handle);
      scriptEngine.fire('on_player_enter', volumeId, {});
    }
  });
  // on_player_exit — was active, no longer overlapping
  for (const handle of this._activeVolumes) {
    if (!this._currentOverlaps.has(handle)) {
      this._activeVolumes.delete(handle);
      const volumeId = this._volumeSensorMap.get(handle);
      if (volumeId) scriptEngine.fire('on_player_exit', volumeId, {});
    }
  }
}
```

---

#### SpawnPointTool

- Arrow + character silhouette icon in editor, invisible in preview
- One per world — placing a new one moves the existing one
- Stored as `worldConfig.defaultSpawn`
- PropertiesPanel shows: position XYZ, facing (degrees), camera mode, model asset picker, move speed, jump height, FOV

---

#### Preview vs Start Game

| | Preview | Start Game |
|---|---|---|
| Spawn position | Editor camera focus | `worldConfig.defaultSpawn` |
| Game save | Ignored | Loaded if exists |
| Flags | Cleared | Restored |
| Scripts | Active | Active |
| Purpose | Quick geometry check | Full game flow test |

Play button: single click = Preview, long press / dropdown = Start Game.
`PreviewController.enter(mode: 'preview' | 'game')`

---

#### PreviewHUD

- Centred crosshair (FPS) or none (third-person)
- Interact prompt: `[E] {label}` — fades in when interactable in range, fades out when not
- Zone name toast: fades in on zone transition, fades out after 3s
- Top-left: current zone name
- Bottom-right: `Esc to exit`

---

#### New Files

```
src/
  preview/
    CharacterBody.ts        ← Rapier KCC wrapper
    CharacterController.ts  ← input + camera + model + interact ray
    TriggerSystem.ts        ← sensor overlap detection, enter/exit events
    PreviewController.ts    ← enter/exit preview mode, pointer lock
  ui/
    PreviewHUD.tsx          ← crosshair, interact prompt, zone toast, Esc hint
  editor/
    SpawnPointTool.ts       ← place/move default spawn marker
```

---


### Phase 10.5 — Scripting / Event System

Sits after Phase 10 because scripts need a character to trigger them.

---

#### Trigger Volumes — Editor Experience

**TriggerVolumeTool.ts** — state machine:

```
IDLE:
  Show existing trigger volumes as amber dashed wireframe boxes
  Label floats above each volume showing its name
  On click (free space): record start point → enter PLACING

PLACING:
  Drag to define box footprint (XZ, same as FloorTool)
  Scroll wheel: adjust height (default 2.5m)
  On release: create TriggerVolume → IDLE

Selected (Select tool):
  Solid amber wireframe + resize handles (same as PlatformTool)
  PropertiesPanel shows trigger volume properties
```

**Trigger volumes:**
- Editor mode: amber dashed wireframe, name label floating above
- Preview/game mode: the wireframe hides (`userData.hideInGame`), but if the volume has an
  **enabled `visual`** (v4.3.0) its gradient "warp box" fill stays visible to the player —
  the fill is built as a *sibling* of the wireframe with no `hideInGame` tag. Absent/disabled
  visual = fully invisible in game, as before.
- Selected: solid amber wireframe + resize handles

**Trigger volume PropertiesPanel:**

```
trigger_vol_a1b2
TRIGGER VOLUME

Name       [Entry Hall Trigger  ]
Size       W [4.0]  H [2.5]  D [3.0]
Position   X [0.0]  Y [0.0]  Z [0.0]

SCRIPTS USING THIS VOLUME
  on_enter: Play music            ›
  on_exit:  Stop music            ›
  [+ Add script using this volume]

[Delete]
```

"Scripts using this volume" lists any `ScriptDef` in the zone whose trigger references this volume ID. Clicking one navigates to it in the Script Panel.

---

#### Script Panel — Full Spec

Lives in left panel slot (`panelId === 'scripts'`). Opens via toolbar "Scripts" button or automatically when TriggerVolumeTool is active.

The Script Panel has three tabs reflecting the three script levels:

```
[World]  [Zone]  [Object]
```

- **World tab** — scripts on `worldConfig.scripts[]`. Always active. For quest logic, global timers, cross-zone reactions.
- **Zone tab** — scripts on the active `zone.scripts[]`. For room-specific logic, ambient triggers, zone-wide traps.
- **Object tab** — scripts on a selected object's `scripts[]`. Only shown when an object is selected. For per-object behaviour like interact responses, animations, dialogue.

Adding a script from any tab creates it in the correct collection. The PropertiesPanel Scripts screen (Phase 10.6) opens the Script Panel on the Object tab pre-filtered to the selected object.

**List view:**
```
┌─────────────────────────────────────┐
│ SCRIPTS                    [+ New]  │
├─────────────────────────────────────┤
│ Play entry music          enabled ● │
│ on_player_enter · 1 action      ›   │
├─────────────────────────────────────┤
│ Open gate when lever pulled   ● ›   │
│ on_interact · 2 conditions · 3 acts │
├─────────────────────────────────────┤
│ Boss spawn                disabled  │
│ on_flag_set · 1 action          ›   │
└─────────────────────────────────────┘
```

**Script editor (drill-down):**
```
← Scripts
Script: "Play entry music"

TRIGGER
  Type      [on_player_enter ▾]
  Target    [Entry Hall Trigger ▾]  ← picks from trigger volumes in zone
  Delay     [0s]
  One-shot  [□]

CONDITIONS  [+ Add]
  (none)

ACTIONS     [+ Add]
  1  play_sound
     Sound  [ambient_music_01 ▾]
     [×]

[Enable/Disable]  [Delete script]
```

`run_script` action shows a monospace textarea for the JS body.

---

#### ScriptEngine.ts

Key behaviours:
- `loadZone(zone)` called by ZoneManager on zone load
- `fire(triggerType, targetId, context)` called by TriggerSystem, CharacterController (interact), TransitionManager
- **Inactive in editor mode** — no triggers fire while editing
- **Active in preview/game mode**
- `on_game_start` fires once when `PreviewController.enter('game')` is called

---

#### Interact Trigger

`on_interact` fires when player presses E near an object with `interactable: true`. The `targetId` is the object's `editorId`. Scripts reference it by that ID in their trigger config.

---

#### Action Implementations

| Action | Implementation |
|---|---|
| `play_sound` | `bus.emit('audio:play', { id, position })` |
| `show_dialogue` | `bus.emit('dialogue:show', { speaker, lines })` |
| `move_object` | Find mesh by editorId, tween to target position |
| `play_animation` | Find mixer by editorId, play named clip |
| `spawn_npc` | `bus.emit('npc:spawn', { npcId, position })` — Phase 13 |
| `despawn_object` | `bus.emit('object:despawn', { id })` → `ObjectPlacer` hides object meshes; `ZoneManager._despawnEntity` hides + disables the collider for platforms/stairs/walls/floors/trigger volumes (restored on `preview:stop`). Picker (`despawnTargetPicker`) offers all these types (v4.3.1). |
| `change_material` | emit `object:updated` with `{ material }` → ObjectPlacer swaps the mesh material (Phase 10.9; requires `WorldObject.material`) |
| `open_door` | Play open animation or remove door collider |
| `close_door` | Reverse of open_door |
| `set_flag` | `scriptEngine.setFlag(flag)` |
| `clear_flag` | `scriptEngine.clearFlag(flag)` |
| `fire_event` | `scriptEngine.fire('on_flag_set', eventId, {})` |
| `fade_screen` | `bus.emit('overlay:fade-in', { color, duration })` |
| `teleport_player` | `bus.emit('character:teleport', { position, facing })` |
| `show_ui` | `bus.emit('ui:show', { elementId })` |
| `give_item` | `gameStateManager.addItem(itemId)` |
| `run_script` | Sandboxed `new Function('ctx', body)(ctx)` |

---

#### New Files

```
src/
  scripting/
    ScriptEngine.ts         ← runtime execution
    GameState.ts            ← generic runtime state store + game save (see GAMEPLAY_STATE.md)
  ui/
    ScriptPanel.tsx         ← script list + editor, in left panel slot
    DialogueOverlay.tsx     ← in-game dialogue display
  editor/
    TriggerVolumeTool.ts    ← place/resize trigger volumes
```

---

#### Updated Bus Events

```ts
// Phase 10
"character:interact":       { objectId: string };
"character:interact-range": { objectId: string; label: string } | null;

// Phase 10.5
"audio:play":               { id: string; position?: Vec3 };
"dialogue:show":            { speaker: string; lines: string[] };
"object:despawn":           { id: string };
"npc:spawn":                { npcId: string; position: Vec3 };
"ui:show":                  { elementId: string };
  "entity:registered":        { entityType: string; caps: EntityCapabilities };  // dev/debug only
```



#### Phase 10.5 — Stub / Planned-Phase Index

Actions and triggers that are registered but not yet implemented, and where they land:

| Stub | Status | Planned phase |
|---|---|---|
| `on_timer` | **implemented** | Phase 10.9 — shipped (ScriptEngine `_startTimers()` loop) |
| `play_animation` | console.warn | Phase 10.9 (wire to the Phase 10.7 mixer/clip system) |
| `change_material` | console.warn | Phase 10.9 (needs `WorldObject.material` + runtime mesh swap — see note below) |
| `fade_screen` | bus event fires, no visual | Phase 10.9 (`<FadeOverlay>` component listening to `overlay:fade-in`) |
| `play_sound` | bus event only, no audio | Phase 12 (Audio system — sound asset manifest, positional audio) |
| `open_door` / `close_door` | console.warn | Phase 13 (NPC + door animation system) |
| `spawn_npc` | console.warn | Phase 13 (NPC system) |
| `on_health_zero` | never fires | Phase 13 (NPC/enemy health system) |
| Branching dialogue | linear `lines[]` only | Phase 12 (Dialogue system redesign) |

> **Note on `change_material`:** the original "small — call `worldState.updateObject`" note was wrong. `WorldObject` has no material field (objects are GLTF assets via `assetId`), so the action needs a new `material?: string` field (registry reference, matching `WallDef.material`; not the plural `MaterialOverrides`) plus runtime mesh-swap plumbing in `ObjectPlacer`. Specced in Phase 10.9.

---

### Phase 10.6 — Entity Event System

Sits immediately after Phase 10.5. Refactors `ScriptEngine` from a zone-level script runner into a proper entity-aware event router. No changes to the `ScriptDef` data format — scenes saved in 10.5 load correctly in 10.6. The change is entirely internal to the engine and the editor UI.

> **Status — partially shipped; remainder deferred to Phase 13.** The *engine-routing* half of this phase is already live in `src/scripting/ScriptEngine.ts`:
> - **Index-based routing — done.** `fire()` does an O(1) `_index.get("type:targetId")` lookup (+ wildcard bucket), not an O(n) scan. The shipped index is a flat composite-key `Map`; this section's nested `Map<type, Map<targetId, …>>` is an equivalent alternative, not a requirement.
> - **Timer triggers — done.** `on_timer` shipped in Phase 10.9 via `setInterval`/`setTimeout` in `_startTimers()` (no polling), instead of the accumulator `update(dt)` design drawn below.
>
> The **unbuilt** remainder is `EntityRegistry` (capability discovery) and `ActionDispatcher` (handler registry). Their entire purpose is to let *entity types register their own emitted triggers / received actions / action handlers* — which only has consumers once NPCs and enemies exist. **Build these as part of Phase 13**, not as a standalone phase. At that point: `ActionDispatcher` lets systems (e.g. `ObjectPlacer` for `change_material`/`play_animation`) register handlers instead of extending the `_dispatch` switch, and `EntityRegistry` lets the Script Panel show only triggers/actions valid for the selected entity. Neither adds functional capability over what's already shipped/planned in 10.9 — they are decoupling + capability-aware UI for the multi-entity world of Phase 13.

---

#### The Problem with 10.5's Approach

In Phase 10.5, `ScriptEngine` held a flat list of scripts and looped through them on every `fire()` call. The first two points below are **already addressed** (indexed routing + non-polling timers, see status banner); the rest are the EntityRegistry/ActionDispatcher motivation, realised in Phase 13:

- ~~Lookup is O(n) over all scripts every time any trigger fires~~ — fixed: indexed `fire()` lookup
- New entity types (NPCs, enemies, items) require special-case handling in the engine
- The Script Panel is zone-level only — there's no way to see "what scripts affect this specific object" without reading through all of them
- ~~Timer triggers require polling~~ — fixed: `setInterval`/`setTimeout` in `_startTimers()`
- No entity knows what events it can emit or receive — action dropdowns are flat lists of all possible types regardless of what makes sense for the target

---

#### EntityRegistry

Every entity type registers its capabilities once, at startup:

```ts
interface EntityCapabilities {
  emits:    TriggerType[];    // events this entity type can fire
  receives: ActionType[];     // actions this entity type can handle
}

class EntityRegistry {
  private _caps: Map<EditorObjectType | 'player' | 'volume', EntityCapabilities> = new Map();

  register(type: string, caps: EntityCapabilities): void {
    this._caps.set(type, caps);
  }

  emits(type: string): TriggerType[]   { return this._caps.get(type)?.emits   ?? []; }
  receives(type: string): ActionType[] { return this._caps.get(type)?.receives ?? []; }
}

export const entityRegistry = new EntityRegistry();
```

Registrations happen in each system's `init()` — not hardcoded in the engine:

```ts
// In ObjectPlacer.init():
entityRegistry.register('object', {
  emits:    ['on_interact'],
  receives: ['play_animation', 'move_object', 'change_material', 'despawn_object', 'show_dialogue'],
});

// In TransitionManager.init():
entityRegistry.register('door', {
  emits:    ['on_interact', 'on_open', 'on_close'],
  receives: ['open_door', 'close_door', 'play_animation'],
});

// In CharacterController.init():
entityRegistry.register('player', {
  emits:    ['on_player_enter', 'on_player_exit', 'on_interact'],
  receives: ['teleport_player', 'give_item', 'fade_screen', 'show_dialogue', 'show_ui'],
});

// In TriggerVolumeTool / TriggerSystem:
entityRegistry.register('volume', {
  emits:    ['on_player_enter', 'on_player_exit'],
  receives: [],
});

// Phase 13 — NPC system registers itself:
entityRegistry.register('npc', {
  emits:    ['on_interact', 'on_health_zero', 'on_player_detected', 'on_dialogue_end'],
  receives: ['spawn_npc', 'despawn_object', 'play_animation', 'show_dialogue', 'move_object'],
});

// Phase 13 — Enemy:
entityRegistry.register('enemy', {
  emits:    ['on_health_zero', 'on_player_detected', 'on_attack'],
  receives: ['despawn_object', 'play_animation', 'move_object'],
});
```

New entity types in Phase 13+ just call `entityRegistry.register()` in their own `init()`. ScriptEngine does not change.

---

#### ScriptEngine — Index-Based Routing

Replace the flat script loop with a two-level index keyed by `(triggerType, targetId)`:

```ts
type ScriptIndex = Map<TriggerType, Map<string, ScriptDef[]>>;
//                       ↑               ↑
//                  trigger type     target entity ID

class ScriptEngine {
  private _index: ScriptIndex = new Map();
  private _timers: TimerEntry[] = [];

  loadZone(zone: ZoneDef): void {
    this._index.clear();
    this._timers = [];

    for (const script of zone.scripts.filter(s => s.enabled)) {
      // Index by trigger type + target ID
      const { type, targetId = '*' } = script.trigger;
      if (!this._index.has(type)) this._index.set(type, new Map());
      const byTarget = this._index.get(type)!;
      if (!byTarget.has(targetId)) byTarget.set(targetId, []);
      byTarget.get(targetId)!.push(script);

      // Register timer triggers
      if (type === 'on_timer') {
        this._timers.push({ script, elapsed: 0, interval: script.trigger.interval ?? 5 });
      }
    }
  }

  fire(triggerType: TriggerType, targetId: string, context: Partial<ScriptContext>): void {
    const byTarget = this._index.get(triggerType);
    if (!byTarget) return;

    // Scripts targeting this specific entity
    const specific = byTarget.get(targetId) ?? [];
    // Scripts targeting any entity of this trigger type (wildcard)
    const wildcard = byTarget.get('*') ?? [];

    for (const script of [...specific, ...wildcard]) {
      if (script.oneShot && this._firedOnce.has(script.id)) continue;
      if (!this._checkConditions(script.conditions)) continue;
      this._executeActions(script.actions, { ...context, objectId: targetId });
      if (script.oneShot) this._firedOnce.add(script.id);
    }
  }

  update(dt: number): void {
    // Timer triggers — priority queue would be ideal; array is fine for small counts
    for (const entry of this._timers) {
      entry.elapsed += dt;
      if (entry.elapsed >= entry.interval) {
        entry.elapsed = entry.script.trigger.repeat ? 0 : Infinity;
        this.fire('on_timer', entry.script.id, {});
      }
    }
  }
}
```

Lookup is now O(1) for specific-target scripts, O(k) where k is the number of matching scripts — not O(n) over all scripts in the zone.

> **Status:** this nested-Map EntityRegistry refactor (including the accumulator-based `update(dt)` timer above) has **not** shipped. `on_timer` was instead implemented in **Phase 10.9** against the *current* flat-index engine, using `setInterval`/`setTimeout` in `_startTimers()` rather than a per-frame `update(dt)`. This section remains the target design for the eventual refactor.

---

#### Action Dispatch — Entity-Aware

Actions are dispatched through a typed handler registry, not a switch statement:

```ts
type ActionHandler = (action: ScriptAction, context: Partial<ScriptContext>) => void;

class ActionDispatcher {
  private _handlers: Map<ActionType, ActionHandler> = new Map();

  register(type: ActionType, handler: ActionHandler): void {
    this._handlers.set(type, handler);
  }

  dispatch(action: ScriptAction, context: Partial<ScriptContext>): void {
    const handler = this._handlers.get(action.type);
    if (!handler) { console.warn(`No handler for action: ${action.type}`); return; }
    handler(action, context);
  }
}

export const actionDispatcher = new ActionDispatcher();
```

Each system registers its own action handlers in `init()`:

```ts
// ObjectPlacer registers:
actionDispatcher.register('play_animation', (action, ctx) => {
  const mixer = this._mixers.get(action.targetId!);
  if (!mixer) return;
  const clip = this._clips.get(action.targetId!)?.get(action.animation!);
  if (!clip) return;
  mixer.clipAction(clip).reset().fadeIn(0.15).play();
});

actionDispatcher.register('move_object', (action, ctx) => {
  // tween object to action.position
});

// TransitionManager registers:
actionDispatcher.register('open_door', (action, ctx) => { ... });
actionDispatcher.register('close_door', (action, ctx) => { ... });

// CharacterController registers:
actionDispatcher.register('teleport_player', (action, ctx) => { ... });
actionDispatcher.register('give_item', (action, ctx) => {
  gameStateManager.addItem(action.itemId!);
});
```

ScriptEngine calls `actionDispatcher.dispatch(action, context)` — it has no knowledge of what any action does. Adding a new action type means registering a handler in the relevant system. No ScriptEngine changes ever.

---

#### Per-Entity Scripts Tab in PropertiesPanel

Every entity in the Properties Panel gets a "Scripts" drilldown screen added to its `OBJECT_SCREENS` entry:

```ts
const OBJECT_SCREENS: Record<string, ScreenId[]> = {
  wall:     ['geo', 'mat', 'open', 'seg', 'scripts'],
  floor:    ['mat', 'vert', 'scripts'],
  platform: ['geo', 'mat', 'scripts'],
  object:   ['geo', 'mat', 'scripts'],
  door:     ['geo', 'mat', 'scripts'],
  volume:   ['scripts'],              // trigger volumes: scripts is the main screen
  npc:      ['geo', 'scripts'],       // Phase 13
  enemy:    ['geo', 'scripts'],       // Phase 13
};
```

**Scripts screen for a selected entity:**

```
← Properties
Scripts
OBJECT SCRIPTS  (stored on this object, travel with it)

  on_interact → Open gate    ›
  on_interact → Show hint    ›
  [+ Add object script]

ALSO TARGETING THIS OBJECT  (zone or world scripts that reference this object as a target)

  flag:gate_opened → Change material ›   (zone script)
  on_game_start → play_animation     ›   (world script)
```

"Add object script" creates a new `ScriptDef` in `WorldObject.scripts[]` — stored directly on the object, not on the zone. The trigger's `targetId` is pre-filled with this entity's `editorId`.

"Also targeting this object" is a read-only list of zone and world scripts that reference this object as an action target — useful for understanding what affects this object without having to search manually.

---

#### What This Enables for Phase 13+

When NPCs and enemies arrive, they call `entityRegistry.register('npc', caps)` and `actionDispatcher.register('...', handler)` in their own `init()`. The ScriptEngine, ActionDispatcher, PropertiesPanel Scripts tab, and Script Panel all work immediately with no changes. An NPC's `on_health_zero` trigger routes through the same index, fires the same condition checks, dispatches the same action handlers.

This is the expandability guarantee — new entity types are self-contained additions, not modifications to existing systems.

---

#### Files Modified / Added

```
src/
  scripting/
    ScriptEngine.ts         ← replace flat loop with index-based routing, add update() for timers
    ActionDispatcher.ts     ← new — typed handler registry, each system registers its own handlers
    EntityRegistry.ts       ← new — capability registration, drives UI dropdowns
  ui/
    screens/
      ScriptsScreen.tsx     ← new — per-entity Scripts tab content, used in PropertiesPanel
```

Files NOT changed: `ScriptDef`, `TriggerType`, `ActionType`, `ScriptPanel.tsx`, `TriggerVolumeTool.ts`. Data format is unchanged — existing scenes load correctly.



### Phase 10.6b — Rect Platform Rotation as a Mesh Transform

Moves the rect platform's Y rotation off the baked geometry and onto `mesh.rotation`, and makes the Rapier collider mirror that rotation. (Unrelated to Phase 10.6a Groups; shares the 10.6 cluster only by numbering.)

> **Scope note — verified against the code, not the original spec.** This phase was originally specced as a broad "local-space geometry storage" change for platforms *and* polygon floors, on the premise that polygon floors/platforms store world-space vertices in `points[]` that go stale on rebuild. Reading the actual code showed that premise is false, so the phase was narrowed to the one genuine defect (rect platform rotation + collider). The investigation findings are recorded below so the next reader doesn't re-derive them.

---

#### What the code actually does (and why most of the original scope was moot)

- **Polygon floors and polygon platforms are node-backed.** `PolygonFloorTool` and `PolygonPlatformTool` both create dedicated `nodeIds` and push the nodes into `zone.nodes`. At build time `resolveFloorMesh()` / `_rebuildPlatform()` **regenerate `points[]` from the live world-space node positions**, overwriting whatever is stored in `points[]`. So the world-space source of truth is the shared nodes; `points[]` is just a derived cache. `NodeDragger` edits those nodes directly.
  - Consequence: these primitives **do not snap back** — every rebuild re-derives geometry from current world nodes, so move (all nodes shift) and vertex-drag (one node moves) are already reflected. There is no stored transform to go stale.
  - Consequence: a `points[]`→local migration would be a **no-op** (overwritten from nodes on the next build), and adding a separate `FloorDef.position` would be **actively harmful** (double offset: local-mode math applied to node-derived world points). So neither was added.
- **The pure-points polygon platform fallback** (a `PlatformDef` with `points` but no `nodeIds`, used for copy/paste) bakes rotation into `points[]` about the centroid and resets `rotation` to 0 on commit — also self-consistent, no snap-back.
- **Rect platforms** store `rotation.y` and were the only real defect:
  1. `PlatformBuilder` baked the Y rotation into the geometry (`geometry.applyMatrix4`) with `mesh.rotation` left at 0. Rotation *was* preserved across rebuilds (re-baked from `platform.rotation.y`), but it violated the mesh-transform convention the rest of the editor uses.
  2. `ColliderBuilder.registerPlatform` ignored rotation entirely, so a rotated rect platform had an **un-rotated physics collider** — a genuine bug.

---

#### The Fix

**`PlatformBuilder.build()`** — for non-CSG rect platforms, apply the Y rotation as `mesh.rotation.y` on each built mesh instead of baking it into vertices. Off-center meshes (railings) are still orbited around the platform XZ center for position; their centered geometry then rotates about its own (orbited) center via the mesh transform. CSG platforms keep rotation disabled (their geometry is baked unrotated in world space and cannot carry a separate transform — a pre-existing limitation, unchanged).

**`ColliderBuilder.registerPlatform(platform, applyRotation = true)`** — set the cuboid collider's quaternion from `platform.rotation.y` (Three.js and Rapier share a right-handed Y-up frame, so a `+angle` mesh rotation maps to `{ y: sin(angle/2), w: cos(angle/2) }`). `PlatformBuilder` passes `applyRotation = !capInWorldSpace`, so CSG platforms (mesh not rotated) keep an un-rotated collider and stay mesh/collider-consistent. Node-backed polygon platforms have `rotation.y === 0` (baked into nodes), so the quaternion is identity for them — unchanged behavior.

**`GizmoManager` — gimbal-safe yaw extraction (the real snap-back fix).** This was the actual cause of the user-visible "rotate, looks fine during the drag, then snaps to a wrong rotation on release — only past ~90°" bug, on rect platforms *and* node-backed polygon platforms/rooms. `TransformControls` rotates the pivot's **quaternion**; the commit code read `pivot.rotation.y` — an **Euler** angle (XYZ order) — which gimbal-flips past ±90° (a 135° drag reads as 45°, a 180° drag reads as 0° → full snap-back). The same Euler read fed the `deltaAngle` used by the polygon-platform/stair/wall rotate commits, so large rotations corrupted those too (and, for polygons, distorted the shape because `size` is recomputed as the AABB of the wrongly-rotated points). Fix: a `_pivotYaw()` helper reads yaw from the quaternion — `atan2(2(wy+xz), 1−2(y²+x²))` — and all four pivot-yaw reads (`_onSelect`, `_reattachMeshes`, `_onDragStart` start angle, `_commitRotate` delta + rect absolute) route through it. The `object` rotate branch is unchanged: it stores all three Euler components and re-applies the same Euler, so it round-trips correctly.

No type changes (`PlatformDef.rotation?: Vec3` already existed). No `FloorDef.position`, no migration, no `FloorBuilder`/`WorldState` changes — see the scope note above.

The transform-only **skip-geometry-rebuild** optimization from the original spec was intentionally deferred: snap-back is fixed by the gimbal correction plus a transform-preserving rebuild, and skipping the rebuild would require reworking GizmoManager's `*:rebuilt`-driven reattach machinery (high regression risk for a perf-only gain).

---

#### What This Fixes

- Rotate a rect platform or polygon room/platform past 90°/180° with the R gizmo → the committed rotation matches the drag; **no snap-back on release** (the gimbal fix).
- Rotate a rect platform → `meshes[0].rotation.y` carries the angle (mesh-transform convention); survives material-change / undo-redo rebuilds.
- A rotated rect platform's collider now matches its visual orientation (player can stand on the rotated slab correctly).

---

#### Files Modified

```
src/builders/PlatformBuilder.ts ← rect Y rotation applied via mesh.rotation, not baked geometry
src/physics/ColliderBuilder.ts  ← registerPlatform mirrors rotation.y on the collider (CSG-guarded)
src/editor/GizmoManager.ts      ← _pivotYaw() gimbal-safe yaw; fixes rotate snap-back past ±90°
```

---

### Phase 10.7 — Object Animation Editor

Sits after Phase 10.6b and before Phase 11 (terrain). Covers the full animation pipeline: clip discovery at import, mixer setup at placement, and editor-mode preview + auto-play configuration.

> **Architecture note — IMPLEMENTED (Option B full extraction).** This phase created
> `src/preview/ObjectPlacer.ts` and removed the inline `ZoneManager._loadObjectMesh()`.
> `ObjectPlacer` owns the object mesh lifecycle (build/remove) **and** the animation subsystem
> (`_mixers`/`_clips`/`update(dt)`/`previewClip`/`stopPreview`/`setAutoPlay`). `ZoneManager`
> delegates: `build()` in loadZone + the `object:added` handler, `remove()` in `_removeObject`
> + `unloadZone`, keeping only `objectsGroup`/`objectMeshes` registration for selection/disposal.
> See the `## ObjectPlacer.ts` file-level section for the real API. NPCs/enemies in Phase 13
> reuse this subsystem; the player's own mixer in `CharacterController` is separate.
>
> The snippets below predate implementation and use illustrative names (`place()`,
> `worldState.getObject`, `assetManager.getAsset`) that **do not match the shipped code** —
> the real methods are `build()`/`remove()`, auto-play state is an internal map, and the asset
> lookup is `assetManager.getAssetDef`. Treat them as intent, not signatures.
>
> **Implementation caveats (confirmed):** `assetManager.loadModel()` returns a clone of
> `gltf.scene` *without* animations — `ObjectPlacer.build()` calls `loadGLTF(assetId)` to read
> `gltf.animations`. Animated/skinned props use `SkeletonUtils.clone(gltf.scene)`, **not** plain
> `.clone()`, so the `AnimationMixer` binds to correctly-named cloned nodes. Since v4.3.3
> `loadModel` itself is also skeleton-safe (`_cloneScene`: `SkeletonUtils.clone` when the scene
> contains a `SkinnedMesh`, plain `.clone()` otherwise), so ghost/thumbnail consumers render
> rigged models correctly too.

---

#### What This Phase Adds

1. **Animation clip discovery** — extract and store clip names from GLTF assets at import time
2. **Mixer setup at placement** — build `AnimationMixer` and clip map when an animated object is placed
3. **Editor-mode clip preview** — click a placed object, see its clips, hit play without entering preview mode
4. **Auto-play configuration** — specify which clip (if any) loops automatically when the object exists in the scene

---

#### Animation Clips — Stored at Import, Managed at Placement

**At import time** (`ModelImporterModal`):
```ts
// After loading GLTF to generate thumbnail:
const clips = gltf.animations.map(a => a.name);
manifestEntry.animations = clips;   // stored in manifest.json
```

**At placement time** (`ObjectPlacer.place()`):
```ts
const asset = assetManager.getAsset(assetId);
if (asset.animations?.length) {
  const mixer = new THREE.AnimationMixer(mesh);
  const clipMap = new Map<string, THREE.AnimationClip>();
  gltf.animations.forEach(clip => clipMap.set(clip.name, clip));
  this._mixers.set(editorId, mixer);
  this._clips.set(editorId, clipMap);
}
```

**In the update loop** — `ObjectPlacer.update(dt)` calls `mixer.update(dt)` for all active mixers.

**In the script action editor** — `play_animation` target picker shows objects in the zone. Once a target is selected, the clip name field becomes a dropdown populated from `assetDef.animations[]`. If the asset has no animations, the field shows "No animations available" and the action is disabled.

---

#### Animations Screen in PropertiesPanel

`AnimationsScreen` is an **inline component in `PropertiesPanel.tsx`** (there is no
`src/ui/screens/` folder — every screen, `GeoScreen`/`MatScreen`/etc., is inline and switched
in the render via the `ScreenId` union). The static `OBJECT_SCREENS` map keeps `object: ['geo','mat']` (since v4.4.0: `['geo','mat','colliders']`);
`"animations"` is appended to the object's screen list **at render time, only when the asset has
clips** (so the row never appears for static props):

```ts
type ScreenId = "geo" | "mat" | "open" | "seg" | "vert" | "animations";

// in PropertiesPanel render:
const hasClips = !!assets.find(a => a.id === objAssetId)?.animations?.length;
const screens = selected
  ? [...(OBJECT_SCREENS[selected.type] ?? []), ...(hasClips ? ["animations" as ScreenId] : [])]
  : [];
```

(There is no separate `scripts` screen — object scripts live in their own section, not a `ScreenId`.)

**Animations screen layout:**

```
← Properties
Animations
CLIPS — prop_door_01

AUTO-PLAY
  [None ▾]     ← dropdown: None / idle / open / close / shake

CLIPS
  idle         [▶ Preview]   2.4s   loop
  open         [▶ Preview]   0.8s   once
  close        [▶ Preview]   0.8s   once
  shake        [▶ Preview]   1.2s   once
```

**Auto-play field:**
- Dropdown populated from `assetDef.animations[]`
- Default: None
- When set: stored as `WorldObject.autoPlayAnimation: string | null`
- When the object is placed or the scene loads, `ObjectPlacer` checks this field and starts the clip looping if set
- Changing it in the editor takes effect immediately on the mesh in the scene

**Preview buttons:**
- Clicking `▶ Preview` on a clip plays it once on the mesh in the editor scene — no preview mode needed
- While a clip is previewing: button changes to `■ Stop`, other clip buttons disabled
- On completion (or Stop): mesh returns to auto-play clip if one is set, or bind pose if none
- Only one clip previews at a time across all objects — previewing a clip on a second object stops any currently playing preview

---

#### WorldObject — New Field

```ts
// WorldObject in types.ts — this phase ADDS only `autoPlayAnimation`.
// (Shown with the real current fields so the addition is unambiguous.)
export interface WorldObject {
  id:                 string;
  assetId:            string;
  position:           Vec3;
  rotation:           Euler3;
  scale:              Scale3;
  floor:              number;
  zoneId?:            string;
  properties:         ObjectProperties;
  scripts?:           ScriptDef[];
  groupIds?:          string[];
  autoPlayAnimation?: string | null;    // ← new (Phase 10.7) — clip name or null
  // material?: string;                  // ← added separately in Phase 10.9 (change_material)
  // colliders?: AttachedCollider[];     // ← added v4.4.0 — undefined = implicit auto-box
  //                                     //   when asset.collidable; [] = explicitly none
}
```

---

#### ObjectPlacer — Auto-Play on Load

> **Local-space convention (Phase 10.6b):** `ObjectPlacer` sets mesh position and rotation from `WorldObject.position` / `WorldObject.rotation` via `mesh.position.set(...)` / `mesh.rotation.set(...)` after building, and never bakes world position into vertex coordinates. Objects already worked this way (a GLTF prop is a root transform); 10.6b brings the rect platform's Y rotation onto the same convention (polygon floors/platforms are node-backed and already derive their transform from world-space nodes — see Phase 10.6b). This complements the extraction note above — ObjectPlacer owns the object transform, ZoneManager just registers the mesh.

```ts
// In ObjectPlacer.place() and ObjectPlacer.loadFromWorldState():
if (object.autoPlayAnimation && asset.animations?.includes(object.autoPlayAnimation)) {
  const mixer  = this._mixers.get(object.id);
  const clipMap = this._clips.get(object.id);
  const clip   = clipMap?.get(object.autoPlayAnimation);
  if (mixer && clip) {
    mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  }
}
```

Auto-play is active in both editor mode and preview/game mode. It is the "resting state" of the object.

---

#### Editor Preview — ObjectPlacer.previewClip()

```ts
previewClip(objectId: string, clipName: string): void {
  // Stop any currently previewing clip across all objects
  if (this._previewingId) this._stopPreview(this._previewingId);

  const mixer  = this._mixers.get(objectId);
  const clipMap = this._clips.get(objectId);
  const clip   = clipMap?.get(clipName);
  if (!mixer || !clip) return;

  this._previewingId = objectId;
  const action = mixer.clipAction(clip)
    .setLoop(THREE.LoopOnce, 1)
    .reset()
    .play();
  action.clampWhenFinished = true;

  // On finish: restore auto-play or bind pose
  mixer.addEventListener('finished', () => {
    this._stopPreview(objectId);
  });

  bus.emit('animation:preview-start', { objectId, clipName });
}

private _stopPreview(objectId: string): void {
  const mixer   = this._mixers.get(objectId);
  const obj     = worldState.getObject(objectId);
  if (!mixer) return;
  mixer.stopAllAction();
  // Restore auto-play if set
  if (obj?.autoPlayAnimation) {
    const clip = this._clips.get(objectId)?.get(obj.autoPlayAnimation);
    if (clip) mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  }
  this._previewingId = null;
  bus.emit('animation:preview-stop', { objectId });
}
```

---

#### Migration — none needed (corrected)

The spec originally called for a `WorldLoader._migrate()` pass. **There is no `_migrate()`**
(`WorldLoader` only has `migrateWallNodes`), and none is required:

1. **`autoPlayAnimation`** is an optional field (`autoPlayAnimation?: string | null`). Old scene
   files simply lack it → it reads as `undefined`, which `ObjectPlacer` treats as "no auto-play."
   No defaulting pass.
2. **Clip discovery for pre-existing assets** is handled **lazily**, not by a startup migration:
   `ObjectPlacer.build()` reads `gltf.animations` whenever it loads a GLTF and back-fills
   `assetDef.animations` if it was `undefined`. New imports also persist clip names into
   `manifest.json` (`ModelImporterModal`). This avoids re-inspecting every model at startup.

---

#### New Bus Events

```ts
"animation:preview-start": { objectId: string; clipName: string };
"animation:preview-stop":  { objectId: string };
"animation:auto-play-changed": { objectId: string; clipName: string | null };
```

---

#### Files Modified

```
src/
  preview/
    ObjectPlacer.ts           ← NEW — full object lifecycle (build/remove) + _mixers/_clips,
                                 update(dt), previewClip()/stopPreview()/setAutoPlay(), auto-play,
                                 SkeletonUtils.clone, lazy assetDef.animations back-fill
  world/
    ZoneManager.ts            ← removed inline _loadObjectMesh; loadZone/_addObject/_removeObject/
                                 unloadZone delegate to ObjectPlacer; dropped unused assetManager import
  ui/
    PropertiesPanel.tsx       ← AnimationsScreen added INLINE (no screens/ folder); "animations"
                                 ScreenId appended for objects with clips; clip list + preview + auto-play
    ModelImporterModal.tsx    ← capture gltf.animations at import, write AssetDef.animations to manifest
App.tsx                       ← instantiate ObjectPlacer, inject into ZoneManager, scene.onUpdate(update)
types.ts                      ← AssetDef.animations?, WorldObject.autoPlayAnimation?, 3 animation:* bus events
```

Not done (spec was wrong): no new `src/ui/screens/AnimationsScreen.tsx` file, no
`WorldLoader._migrate()`, no `AssetManager.loadModel` change (the skinned clone lives in
`ObjectPlacer`, leaving `loadModel`'s other callers — player, ghost — untouched). No changes to
ScriptEngine, ActionDispatcher, or EntityRegistry.
*(Update v4.3.3: the "leave `loadModel` untouched" call turned out wrong for the ghost —
plain-cloned skinned meshes render frozen at the cached skeleton's pose. `loadModel` is now
skeleton-safe via `_cloneScene`; see the v4.3.3 changelog entry.)*




### Phase 10.8 — World-Space UV Generation

Makes the same `tileScale` value produce visually identical results on a 1m wall and a 10m wall — and on a wall vs a floor — by unifying every builder onto one world-space UV convention.

> **Status: implemented (v4.0.0), spec corrected to match the code.** The original spec premise below (Three.js `0→1` default UVs + `texture.repeat`) was **false** for this codebase — builders already baked world-space UVs. The real fix was unifying an inverted per-builder `tileScale` convention. The corrected sections follow; the struck-through original is kept for history.

---

#### The Problem (corrected)

~~Three.js geometry primitives generate UVs from 0→1 regardless of physical size, so `texture.repeat` scales them inconsistently.~~ **Not what was happening.** Every builder already generated world-space UVs proportional to physical dimensions, and none used `texture.repeat` (only `wrapS/wrapT = RepeatWrapping`, set once in `AssetManager`). So texture density was *already* size-consistent within each builder.

The real bug was an **inverted `tileScale` convention between builders**:

| Builder | UV math | `tileScale` meaning |
|---|---|---|
| `WallBuilder` | `len / tileScale` | meters per repeat (÷) |
| `FloorBuilder` | `uv·dim · tileScale` | repeats per meter (×) |
| `PlatformBuilder` | `pos · tileScale` (cap), `arcLen · tileScale` (sides) | repeats per meter (×) |
| `StairBuilder` | `dim · tileScale` | repeats per meter (×) |

So `tileScale: 2` made a wall's texture *bigger* but a floor's texture *smaller* — they only agreed at `1.0`. The wall's own passage-liner reveals also multiplied, contradicting the wall body's divide.

---

#### The Fix — one division convention (`UVUtils.ts`)

The unified rule is **`UV = meters / tileScale`** ("meters per repeat") everywhere. Walls already complied; floors/platforms/stairs (and the wall passage liners) were flipped `×→÷`. `texture.repeat` stays `(1,1)` — all tiling is baked into UVs at build time.

`src/builders/UVUtils.ts` exports:

```ts
// Meters → UV repeats under the division convention.
export function worldUV(meters: number, tileScale: number): number;

// Project positions onto a plane and divide by tileScale (polygon floors/caps).
export function applyProjectedUVs(
  geometry: THREE.BufferGeometry,
  axis: 'xz' | 'xy' | 'zy',
  tileScaleX?: number, tileScaleY?: number,
): void;

// Shift all UVs by (offsetX, offsetY) in repeat units; wraps; no-op at 0,0.
export function applyUVOffset(
  geometry: THREE.BufferGeometry,
  offsetX: number, offsetY: number,
): void;
```

> **Why not the spec's `applyWorldSpaceUVs(geo, w, h, …)`?** That helper assumes one 4-vertex BL/BR/TL/TR quad. The real builders hand-build multi-face indexed `BufferGeometry` (8-vertex wall strip; `pushFace`/`pushQuad` per face), so a single-quad helper doesn't slot in. The ÷ convention instead lives at the existing inline UV call-sites (now dividing) plus `worldUV`; only `applyUVOffset` and `applyProjectedUVs` are geometry-level helpers.

The original (unadopted) spec text is retained below for reference.

#### Original spec (unadopted) — World-Space UV Generation

Every builder generates UVs manually, proportional to the physical size of each face. The rule is simple:

```
UV coordinate = physical dimension (in meters) / tileScale
```

At `tileScale: 1.0` the texture repeats once per meter on every surface. At `tileScale: 0.5` it repeats twice per meter. At `tileScale: 2.0` it repeats once every two meters. The value is consistent and intuitive regardless of object size.

**Core utility function** — add to `src/builders/UVUtils.ts`:

```ts
/**
 * Generate world-space UVs for a flat rectangular face.
 * UVs are proportional to physical dimensions so texture density
 * is consistent regardless of face size.
 *
 * @param geometry  Target BufferGeometry (must have position attribute)
 * @param width     Physical width of the face in meters
 * @param height    Physical height of the face in meters
 * @param tileScaleX  Meters per texture repeat, U axis (default 1.0)
 * @param tileScaleY  Meters per texture repeat, V axis (default tileScaleX)
 */
export function applyWorldSpaceUVs(
  geometry:    THREE.BufferGeometry,
  width:       number,
  height:      number,
  tileScaleX = 1.0,
  tileScaleY = tileScaleX,
): void {
  const uRepeat = width  / tileScaleX;
  const vRepeat = height / tileScaleY;
  const uvAttr   = geometry.attributes.uv as THREE.BufferAttribute;

  // Standard quad vertex order: BL, BR, TL, TR
  uvAttr.setXY(0, 0,       0);
  uvAttr.setXY(1, uRepeat, 0);
  uvAttr.setXY(2, 0,       vRepeat);
  uvAttr.setXY(3, uRepeat, vRepeat);
  uvAttr.needsUpdate = true;
}

/**
 * Apply UV offset to all coordinates in a geometry.
 * Call after applyWorldSpaceUVs or applyProjectedUVs.
 * All maps (albedo, normal, roughness etc.) share UV channel 0
 * so offsetting once shifts everything in sync.
 *
 * @param offsetX  U axis shift (0.0–1.0, wraps)
 * @param offsetY  V axis shift (0.0–1.0, wraps)
 */
export function applyUVOffset(
  geometry: THREE.BufferGeometry,
  offsetX:  number,
  offsetY:  number,
): void {
  if (offsetX === 0 && offsetY === 0) return;
  const uvAttr = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setXY(i, uvAttr.getX(i) + offsetX, uvAttr.getY(i) + offsetY);
  }
  uvAttr.needsUpdate = true;
}

/**
 * Generate world-space UVs for arbitrary polygon geometry
 * by projecting vertex positions onto the XZ plane (for floors/caps)
 * or onto the wall plane (for vertical faces).
 *
 * Used for polygon floors, polygon platforms, wall runs, stair faces.
 */
export function applyProjectedUVs(
  geometry:    THREE.BufferGeometry,
  axis:        'xz' | 'xy' | 'zy',   // which plane to project onto
  tileScaleX = 1.0,
  tileScaleY = tileScaleX,
): void {
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const uvAttr    = geometry.attributes.uv as THREE.BufferAttribute;
  const count     = positions.count;

  for (let i = 0; i < count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    let u: number, v: number;
    if (axis === 'xz') { u = x / tileScaleX; v = z / tileScaleY; }
    else if (axis === 'xy') { u = x / tileScaleX; v = y / tileScaleY; }
    else                    { u = z / tileScaleX; v = y / tileScaleY; }
    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;
}
```

**UV offset** — after calling `applyWorldSpaceUVs` or `applyProjectedUVs`, each builder checks `materialOverrides.offsetX` / `offsetY` and calls `applyUVOffset(geometry, offsetX, offsetY)` if either is non-zero. One call covers all maps.

**Remove `texture.repeat` as the scaling mechanism.** After this phase, `texture.repeat` is always `(1, 1)`. All tiling is baked into UVs at build time. This is more correct — `texture.repeat` applies globally to the texture object which can cause conflicts when the same material is shared across surfaces of different sizes.

---

#### Builder Changes (as implemented)

Each builder reads the existing `tileScale`/`tileScaleX`/`tileScaleY` overrides, applies the ÷ convention at its inline UV math, then calls `applyUVOffset(geo, ovr?.offsetX ?? 0, ovr?.offsetY ?? 0)` once per built geometry (before any CSG, so cut UVs inherit the offset).

**WallBuilder** — already divided (`len / tileX`, `H / tileY`); no math change. Added `applyUVOffset` on the base geometry in both `build` and `buildRun` (before opening CSG). The passage-liner reveals (`jUV`/`hUV`) were flipped `×→÷` to match the wall body. (The decorative trim frame is a solid-color `BoxGeometry` with no tileScale UVs — untouched.)

**FloorBuilder** — rect + polygon: `uv·dim · tileX` → `uv·dim / tileX` (and `tileY`), then `applyUVOffset`.

**PlatformBuilder** — `buildSlabCapGeo`/`buildSlabSideGeo` face UVs and `buildInnerFaceGeo`: `dim·ts` → `dim/ts`; polygon cap `pos · tileScale` → `pos / tileScale`; polygon side `arcLen · tileScale` → `arcLen / tileScale`. `applyUVOffset` on cap (cap overrides), sides + inner faces (side overrides, falling back to cap overrides). Separate `sideTileScale`/`sideMaterialOverrides` preserved.

**StairBuilder** — `dim · ts` → `dim / ts` for both body and riser; `applyUVOffset` on body (body overrides) and riser (riser overrides, falling back to body). Railings are solid-color boxes — untouched.

Polygon floors/caps could alternatively route through `applyProjectedUVs('xz')`; they were left on the existing object-anchored inline math (default-UV × dimension, now ÷) to keep the change to the convention flip only and avoid shifting the UV origin from the object corner to the world origin.

---

#### Future Builders — Required Convention

Any builder added after this phase **must** use `applyWorldSpaceUVs` or `applyProjectedUVs` from `UVUtils.ts`. Never use Three.js default UV generation for any textured face. Never use `texture.repeat` for tiling. This applies to:

- `BrushBuilder` (Phase 12) — use `applyProjectedUVs` per face based on face normal direction
- Any terrain geometry builder (Phase 11) — use `applyProjectedUVs('xz')` for the heightmap mesh
- Any future NPC/character mesh builder

**The rule stated plainly:** if a face is 3m wide and the tile scale is 1.0, the UV U range must be 0→3. Always. No exceptions.

---

#### tileScaleX / tileScaleY Split

`MaterialOverrides.tileScaleX` and `tileScaleY` already exist in `types.ts`. This phase makes them meaningful:

- `tileScaleX` controls horizontal repeat (U axis)
- `tileScaleY` controls vertical repeat (V axis)
- When `splitXY` is false: `tileScaleY = tileScaleX` (single uniform scale)
- When `splitXY` is true: X and Y scale independently — useful for brick textures where you want different horizontal and vertical density
- `offsetX` / `offsetY` shift all UV coordinates after scaling — moves the texture position on the face

The "Split X/Y" checkbox in the Material screen of PropertiesPanel was already specced in Phase 6.5. This phase makes it actually do something.

**Material screen layout addition** — below the Tile row:
```
TILE    [1.0]       SPLIT X/Y [□]
OFFSET  X [0.0]     Y [0.0]
```

Offset values from 0.0 to 1.0 represent one full texture width/height of shift. Values outside that range wrap — 1.1 is the same as 0.1. Negative values work. Default is 0.0 for both axes.

---

#### tileScale Meaning After This Phase

| Value | Effect |
|---|---|
| `1.0` (default) | One texture repeat per meter — consistent everywhere |
| `0.5` | One repeat per 0.5m — texture appears larger/more detailed |
| `2.0` | One repeat per 2m — texture appears smaller |
| `0.25` | One repeat per 0.25m — very large detailed texture |

The value is now physically meaningful and consistent. The same `tileScale: 1.0` on a 1m wall and a 20m wall produces the same brick size in both.

---

#### Migration (as implemented)

Pre-10.8 scenes tuned `tileScale` under the inverted convention, so at non-`1.0` values they now read differently. **Reset to `1.0`** is the chosen behavior (at `1.0` the old × and new ÷ math agree, so untouched scenes look identical).

- `SceneMetadata` gains `uvVersion?: number` (1 = world-space ÷ convention).
- `migrateUVs(file)` in `src/world/WorldLoader.ts` (there is **no** `WorldLoader._migrate()`): if `metadata.uvVersion !== 1`, walk every zone's walls/floors/platforms/stairs — including the secondary `sideMaterialOverrides`/`riserMaterialOverrides` — and reset `tileScale`/`tileScaleX`/`tileScaleY` (any that are present) to `1.0`, then stamp `uvVersion = 1`.
- Called from `App.tsx`'s load path (beside `migrateWallNodes`, before `world.loadFromJSON`) — **not** inside `loadFromJSON`, because `HistoryManager` reuses that to restore already-migrated undo snapshots.
- `WorldState.toJSON()` writes `uvVersion: 1` into `metadata` on every save, so a loaded-and-saved scene won't re-migrate.

(Phase 10.6b added no geometry migration to order against; the 10.7 `autoPlayAnimation` defaulting is independent.)

---

#### New File

```
src/
  builders/
    UVUtils.ts    ← worldUV(), applyProjectedUVs(), applyUVOffset() — imported by all builders
```

#### Files Modified

```
src/builders/WallBuilder.ts      ← passage-liner ÷ flip + applyUVOffset (build + buildRun)
src/builders/FloorBuilder.ts     ← ×→÷ flip + applyUVOffset
src/builders/PlatformBuilder.ts  ← ×→÷ flip (cap/side/inner) + applyUVOffset
src/builders/StairBuilder.ts     ← ×→÷ flip (body/riser) + applyUVOffset
src/world/WorldLoader.ts         ← migrateUVs()
src/world/WorldState.ts          ← toJSON stamps uvVersion: 1
src/App.tsx                      ← call migrateUVs() in load path
src/ui/PropertiesPanel.tsx       ← OFFSET X/Y row in Material screen
src/types.ts                     ← MaterialOverrides.offsetX/offsetY, SceneMetadata.uvVersion
```

### Phase 10.9 — Group Functionality + Scripting Cleanup

> **Status: implemented (v4.1.0), except bulk operations (deferred).** Assignment UI is a
> `GroupsAccordion` in `PropertiesPanel` (root screen + `TriggerVolumeView`) writing `groupIds`
> through the existing `onObjectUpdate` path. **Visibility is handled entirely in `ZoneManager`**
> (`_applyGroupVisibility` + `group:visibility` event + a `hiddenGroups` set in `App`), not split
> into `ObjectPlacer` as originally drafted — ZoneManager already owns both world data and all
> mesh references. `_resolveTargets` + `play_animation`/`change_material` route through
> `ObjectPlacer` (new `_meshes` registry); `show_ui` is **not** group-resolved (UI element id, not
> an entity). `FadeOverlay.tsx` renders `overlay:fade-in`. ~~**Bulk operations need
> `SelectionManager` multi-select (not built) and are deferred to a follow-up phase.**~~
> (v4.1.1: `despawn_object`/`move_object` gained their missing runtime consumers in
> `ObjectPlacer` — hide-mesh and apply-transform, runtime-only.)
>
> **Correction:** multi-select *was* built (test-plan `phase-11-multi-select`), and group bulk
> operations shipped on top of it — see **Phase 10.9b — Group Bulk Operations** below.

Two threads land together here:

1. **Make Groups real.** Phase 10.6a shipped Groups as a name-list manager with dormant `groupIds` fields. This phase makes those fields live — entities can be assigned to groups, groups can be hidden, bulk-operated on, and targeted by scripts.
2. **Clear the scripting backlog.** `on_timer` (shipped), `play_animation`, `change_material`, and `fade_screen`'s visual were either unassigned or tagged to phases that shipped without them. They get implemented here.

#### `on_timer` — shipped

Implemented in `src/scripting/ScriptEngine.ts`:

- The per-script execution logic in `fire()` was extracted into `_evalAndRun(s)` so the timer path and event path share identical guard semantics (`enabled` / oneShot / conditions / delay).
- `_startTimers()` is called at the end of `activate()` (after the index is built). It walks every indexed `on_timer` script and schedules it: `setInterval` when `trigger.repeat`, else `setTimeout`, at `(trigger.interval ?? 5) * 1000` ms. Each callback runs `_evalAndRun(s)` directly — **not** `fire("on_timer", id)`, which would resolve by index key and run every timer script sharing the key.
- Handles are tracked in a new `_intervals` array; `deactivate()` clears both `_timers` and `_intervals`.

#### Groups — assignment UI

- New **GROUPS** section in `src/ui/PropertiesPanel.tsx` for the selected entity: a checklist of existing groups. Toggling a group writes/removes its id in the entity's `groupIds`, persisted via the existing mutators (`WorldState.updateObject` / `updateTriggerVolume`, and the floor/wall/platform/stair equivalents).
- This is the first reader/writer of `groupIds`.

#### Groups — visibility toggle

- Eye icon per group in `src/ui/GroupPanel.tsx`. Hiding a group sets `mesh.visible = false` on every Three.js mesh whose entity's `groupIds` includes that id.
- New `group:visibility` bus event; `ZoneManager` listens and toggles visibility. **Editor-only** — does not mutate saved data or affect preview/runtime.

#### Groups — bulk operations

- In `GroupPanel`: "Select all", "Delete", "Duplicate", "Move" acting on every member of a group. Reuses the existing `SelectionManager` multi-select and the existing delete/duplicate code paths rather than new logic.

#### Groups — scripting targets

- In `ScriptEngine._dispatch`, a new `_resolveTargets(targetId): string[]` helper: if `targetId` matches a `GroupDef.id`, it resolves to all entity ids whose `groupIds` includes it (iterating the active zone's entities in `_state`); otherwise it returns `[targetId]`.
- The per-object actions (`despawn_object`, `move_object`, `change_material`, `show_ui`) loop over `_resolveTargets(action.targetId)` and emit per member — so a single script action can act on a whole group.

#### `change_material` — implemented

- `material?: string` added to `WorldObject` (`src/types.ts`) — a registry material reference, matching the `WallDef.material: string` convention. Distinct from the plural `MaterialOverrides` type (per-texture-map tweaks on built geometry): `material` selects *which* registry material overrides the prop's baked materials when `change_material` fires.
- `change_material` emits `object:updated` with `changes: { material }`. The handler in **`ObjectPlacer`** (which owns object meshes after the Phase 10.7 extraction) traverses the object's GLTF meshes and applies the material from the registry.
- Works with group targets via `_resolveTargets`.

#### `play_animation` — implemented

- Wired to the Phase 10.7 animation mixer/clip system owned by **`ObjectPlacer`**: emits `object:play-animation { id, clip }`; ObjectPlacer plays the named clip on that object's `AnimationMixer`.

#### `fade_screen` visual — implemented

- New `src/preview/FadeOverlay.tsx` listening to `overlay:fade-in`: a full-screen colored div that animates opacity over `duration`. The action's bus event already fires (Phase 10.5); this adds the missing renderer.

#### Files Modified

```
src/scripting/ScriptEngine.ts   ← on_timer loop, _resolveTargets, change_material/play_animation dispatch
src/ui/PropertiesPanel.tsx      ← GROUPS assignment section
src/ui/GroupPanel.tsx           ← visibility toggle + bulk operations
src/preview/ObjectPlacer.ts     ← material swap + object:play-animation (owns object meshes/mixers, Phase 10.7)
src/world/ZoneManager.ts        ← group:visibility for built geometry (floors/walls/platforms/stairs)
src/preview/FadeOverlay.tsx     ← new — overlay:fade-in renderer
src/types.ts                    ← WorldObject.material; bus events group:visibility, object:play-animation
```

> **Object-mesh actions route through `ObjectPlacer`** (the Phase 10.7 owner of object meshes + mixers), not `ZoneManager`. Group *visibility* spans all entity types, so it stays split: `ObjectPlacer` toggles object meshes, `ZoneManager` toggles built geometry.

### Phase 10.9b — Group Bulk Operations

> **Status: implemented.** Closes Phase 10.9's deferred bulk operations. The prerequisite
> multi-select (`SelectionManager` primary + `_extraRefs`, `selection:changed`) already shipped
> (test-plan `phase-11-multi-select`); this phase builds the group-level UI and one new engine
> event on top of it. Test-plan: `test-plans/phase-12-group-bulk-ops.md`.

The Groups left panel (`GroupPanel.tsx`) becomes an **accordion**: each group expands to a member
list plus an action bar.

- **Member derivation** (`src/editor/groupMembers.ts`, new) — `membersByGroup(world)` does one
  O(entities) sweep over every zone's grouped collections (`floors`/`walls`/`platforms`/`stairs`/
  `objects`/`triggerVolumes`), returning `Map<groupId, GroupMember[]>` where a member is
  `{ ref: SelectedRef, label }` (label = `entity.label ?? entity.id`). Also exports
  `entityGroupIds(world, ref)` and `writeGroupIds(world, ref, ids)` — a type→mutator dispatch
  (`updateFloor`/`updateWall`/…) so an arbitrary ref's `groupIds` can be read/written generically.
- **Live refresh** — `App` holds a `membershipRev` counter bumped by bus listeners on
  `*:updated` (only when `changes.groupIds !== undefined`), all `*:removed`, and `*:added` (only
  when the added entity carries `groupIds` — covers paste/duplicate clones). `groupMembers` is a
  `useMemo` keyed on `[membershipRev, groups]`, so the panel stays in sync without polling.
- **`selection:set` (new engine event)** — `SelectionManager._setSelection(refs)` replaces the
  whole selection programmatically: resolves refs to live meshes (skips missing, dedups walls
  sharing a run mesh), makes the first primary and the rest extras, tints all, and emits
  `object:selected` + `selection:changed`. Empty list clears via `object:deselected`. This is the
  only new engine surface; it powers "Select all members".
- **Handlers** (`App`) — `handleAddSelectedToGroup` merges a group id into every `multiSelected`
  ref's `groupIds` in one transaction; `handleRemoveGroupMember` strips it; `handleSelectGroupMembers`
  emits `selection:set`. **Delete/Duplicate reuse the multi-select paths**: `handleDelete`'s
  multi-branch was extracted into `deleteRefs(refs)`, and `duplicateRefs(refs)` wraps
  `copySelectionMulti` + the existing paste path — group Delete/Duplicate just call these with the
  member refs (no new delete/clone logic). Duplicated members keep their `groupIds`, so clones
  re-join the group.

#### Files

```
src/editor/groupMembers.ts    ← new — membersByGroup / entityGroupIds / writeGroupIds
src/editor/SelectionManager.ts← _setSelection + selection:set listener
src/ui/GroupPanel.tsx         ← accordion: member list, action bar, per-member remove
src/ui/LeftPanel.tsx          ← threads the new group-bulk props through
src/App.tsx                   ← membershipRev + listeners, groupMembers memo, deleteRefs/duplicateRefs,
                                group-bulk handlers, LeftPanel wiring
src/types.ts                  ← bus event selection:set
```

### Phase 11 — Terrain
- TerrainBuilder: heightmap → PlaneGeometry with `computeBoundsTree()` (BVH for editor raycasting)
- Terrain Rapier collider: `ColliderDesc.heightfield(res, res, heightData, { x: worldSize, y: maxHeight, z: worldSize })`
- Terrain sculpt tool: raise/lower brush, on stroke end rebuild both Three.js geometry AND Rapier heightfield collider
- Multi-layer material blending by height
- TerrainBuilder integrated into ZoneManager for outdoor zones
- Road tool: spline control points → flat corridor on terrain

### Phase 12 — Polish + Future Systems

**Polish:**
- L-shape and spiral stair styles in StairBuilder (each with correct per-step colliders)
- Outline post-process selection highlight (EffectComposer + OutlinePass, replaces emissive tint)
- Wall exterior material (material array on BoxGeometry for inside/outside faces)
- ~~Undo/redo stack~~ — implemented as snapshot-based HistoryManager in **Phase 6.7**
- Real GLTF prop assets in AssetBrowser with authored collision shapes in asset registry
- Ambient/sun light controls in PropertiesPanel
- Node drag — select a wall node and drag to stretch all connected walls simultaneously
- Room detection — find closed wall loops, auto-label as rooms, apply room-level properties
- Snap-merge tool — merge two nearby nodes that aren't exactly equal

**Future systems (to be specced when needed):**

- **Brush primitive (BSP-style editable solid)** — A freeform convex solid with direct vertex/edge/face editing. Move top and bottom vertices independently to create diagonals and wedges. Split faces and extrude. Distinct from platforms which are parametric. Closer to UE5 Modeling Mode or Quake-style brush editing.

  > **v4.9.0 status:** the foundation shipped as Phase 22's `ShapeDef` (`src/builders/ShapeBuilder.ts`) — a `shape` entity type that already satisfies the local-space requirement below (local vertices + separate `position`/`rotation`, convex-hull collider from the local cloud). The brush phase extends `ShapeDef` with an optional local `mesh: { vertices, faces }` that supersedes the kind params ("Convert to Brush" = bake the kind generator's output once), reusing the same events/selection/gizmo/collider wiring unchanged. See `plans/phase-22-parametric-shapes.md` §7 for the sketch.

  **Critical architecture requirement:** Brush vertices must be stored in **local space** relative to the brush's own origin, not in world space. The brush has a `position`, `rotation`, and `scale` as a separate transform. Moving the brush updates `position` only — vertices don't change. Rotating updates `rotation` only — vertices don't change. Only vertex editing touches vertex data. `BrushBuilder` always builds geometry in local space, then Three.js applies the mesh transform on top. Rapier collider is rebuilt from final world-space positions (local vertices × transform) on any change.

  This is the correct architecture to avoid the rotation/move/corner-snapping bugs that affect the current platform and wall tools — those bugs happen because world-space coordinate storage means the mesh transform and the data get out of sync. Local-space storage keeps them permanently in sync. **Do not repeat the world-space storage pattern from platforms/floors/walls.**

  Collision: static Rapier convex hull or trimesh collider (player walks over it correctly, slopes handled by KCC max climb angle). Dynamic movement not supported — brushes are static scenery.

- **Item system** — `ItemDef` type, item registry/manifest, item pickup objects, inventory UI panel, equippable/consumable/stackable flags, item icons. Currently stubbed as string IDs in `GameSave.inventory` and script actions `give_item` / `player_has_item`.
- **Dialogue system** — branching dialogue trees, NPC conversation UI, dialogue editor panel. Currently stubbed as linear `lines[]` array in `DialogueDef`.
- **Quest system** — quest definitions, objectives, completion conditions, quest log UI.
- **Audio system** — sound asset manifest, positional audio, ambient loops, music tracks, audio mixer.
- **Navmesh** — walkable surface generation from Rapier floor colliders, NPC pathfinding via Recast/Detour.
- **Export** — export as self-contained playable HTML (bakes textures as base64, bundles scripts).
- **Multiplayer** — out of scope for now, noted for future.

---

## Physics Architecture

### Two Tools, Two Jobs

| Tool | Used For | Not Used For |
|---|---|---|
| `three-mesh-bvh` | Editor raycasting (selection, snapping, surface detection), terrain sculpt queries | Any runtime physics |
| `@dimforge/rapier3d-compat` | All runtime: character movement, wall/floor collision, stair step-up, door sensors, future NPC/enemy colliders | Editor visual mesh generation |

These never replace each other. BVH makes the editor fast. Rapier makes the world physically correct at runtime.

### PhysicsWorld.ts

```ts
import RAPIER from "@dimforge/rapier3d-compat";

export class PhysicsWorld {
  private _world!: RAPIER.World;
  private _initialized = false;
  public debugDraw = false;

  async init(): Promise<void> {
    await RAPIER.init();
    this._world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this._initialized = true;
  }

  get world(): RAPIER.World { return this._world; }
  get initialized(): boolean { return this._initialized; }

  // Called by SceneManager RAF loop, after Three.js render
  step(dt: number): void {
    if (!this._initialized) return;
    this._world.timestep = Math.min(dt, 0.05); // cap at 50ms
    this._world.step();
  }

  createStaticCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    const body = this._world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    return this._world.createCollider(desc, body);
  }

  createSensorCollider(desc: RAPIER.ColliderDesc): RAPIER.Collider {
    desc.setSensor(true);
    const body = this._world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    return this._world.createCollider(desc, body);
  }

  removeCollider(collider: RAPIER.Collider): void {
    this._world.removeCollider(collider, true);
  }

  removeRigidBody(body: RAPIER.RigidBody): void {
    this._world.removeRigidBody(body);
  }

  dispose(): void {
    this._world.free();
  }
}

// Singleton — imported by builders and CharacterBody
export const physicsWorld = new PhysicsWorld();
```

### ColliderBuilder.ts

> **v4.4.0:** also `registerAttachedColliders(obj: WorldObject, colliders: AttachedCollider[]): Collider[]`
> — per-object colliders (cuboid/ball/capsule) placed via `colliderWorldTransform` from
> `src/physics/attachedColliderMath.ts`; `isSensor` entries use `createSensorCollider`.

> **v4.11.0:** also `registerShapeTrimesh(shape, vertices, indices): Collider | null` —
> the repo's first trimesh (`ColliderDesc.trimesh` + `TriMeshFlags.FIX_INTERNAL_EDGES`),
> used for face-brushes whose split/extruded solids can be concave. Same transform
> mirroring; convex-hull fallback on degenerate input. Editor gotcha: fresh colliders
> only answer queries after one `world.step()` (the editor doesn't step; preview does).

> **v4.9.0:** also `registerShape(shape: ShapeDef, localPoints: Float32Array): Collider | null`
> — the repo's first non-analytic collider: `RAPIER.ColliderDesc.convexHull()` of the
> LOCAL-space vertex cloud from `ShapeBuilder.localHullPoints`, with the def's
> `position`/`rotation` set on the collider (same transform as the mesh — the two cannot
> drift). All shape kinds are convex by construction so the hull is exact. Returns null
> (mesh renders, no collision, console.warn) only on a degenerate cloud — params are
> clamped upstream by `resolveShapeParams`.

```ts
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "./PhysicsWorld.ts";
import type { WallDef, FloorDef, PlatformDef, StairDef, Opening } from "../types.ts";

export class ColliderBuilder {

  // Floor slab — thin box at floor elevation
  static registerFloor(bounds: { x: number; z: number; width: number; depth: number }, elevation: number): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc
      .cuboid(bounds.width / 2, 0.05, bounds.depth / 2)
      .setTranslation(
        bounds.x + bounds.width / 2,
        elevation - 0.05,
        bounds.z + bounds.depth / 2
      );
    return physicsWorld.createStaticCollider(desc);
  }

  // Wall — split into segments around openings, one cuboid per solid segment
  // Returns one collider per segment (gaps at door/window positions have no collider)
  static registerWallSegments(wall: WallDef, elevation: number): RAPIER.Collider[] {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
    const angle  = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const midX   = (wall.start.x + wall.end.x) / 2;
    const midZ   = (wall.start.z + wall.end.z) / 2;

    // Build list of solid segments between openings
    const sorted: Opening[] = [...wall.openings].sort((a, b) => a.offsetAlongWall - b.offsetAlongWall);
    const segments: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const opening of sorted) {
      if (opening.offsetAlongWall > cursor) segments.push({ start: cursor, end: opening.offsetAlongWall });
      cursor = opening.offsetAlongWall + opening.width;
    }
    if (cursor < length) segments.push({ start: cursor, end: length });

    return segments.map(seg => {
      const segLen  = seg.end - seg.start;
      const segMid  = seg.start + segLen / 2 - length / 2; // offset from wall center
      const wx = midX + Math.cos(angle) * segMid;
      const wz = midZ + Math.sin(angle) * segMid;
      const desc = RAPIER.ColliderDesc
        .cuboid(segLen / 2, wall.height / 2, wall.thickness / 2)
        .setTranslation(wx, elevation + wall.height / 2, wz)
        .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) });
      return physicsWorld.createStaticCollider(desc);
    });
  }

  // Platform slab
  static registerPlatform(platform: PlatformDef): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc
      .cuboid(platform.size.width / 2, platform.thickness / 2, platform.size.depth / 2)
      .setTranslation(platform.position.x, platform.position.y + platform.thickness / 2, platform.position.z);
    return physicsWorld.createStaticCollider(desc);
  }

  // Stairs — one cuboid per step
  static registerStairSteps(stair: StairDef): RAPIER.Collider[] {
    const heightDiff  = stair.end.y - stair.start.y;
    const horizDist   = Math.hypot(stair.end.x - stair.start.x, stair.end.z - stair.start.z);
    const angle       = Math.atan2(stair.end.z - stair.start.z, stair.end.x - stair.start.x);
    const stepHeight  = 0.2;
    const numSteps    = Math.max(1, Math.round(heightDiff / stepHeight));
    const stepDepth   = horizDist / numSteps;
    const colliders: RAPIER.Collider[] = [];

    for (let i = 0; i < numSteps; i++) {
      const t = (i + 0.5) / numSteps;
      const desc = RAPIER.ColliderDesc
        .cuboid(stair.width / 2, stepHeight / 2, stepDepth / 2)
        .setTranslation(
          stair.start.x + (stair.end.x - stair.start.x) * t,
          stair.start.y + (i + 0.5) * stepHeight,
          stair.start.z + (stair.end.z - stair.start.z) * t
        )
        .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) });
      colliders.push(physicsWorld.createStaticCollider(desc));
    }
    return colliders;
  }

  // Door sensor — for transition detection
  static registerDoorSensor(
    wall: WallDef,
    opening: Opening,
    elevation: number
  ): RAPIER.Collider {
    const angle  = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
    const offset = opening.offsetAlongWall - length / 2;
    const desc = RAPIER.ColliderDesc
      .cuboid((opening.width - 0.1) / 2, opening.height / 2, 0.4)
      .setTranslation(
        wall.start.x + Math.cos(angle) * (opening.offsetAlongWall + opening.width / 2),
        elevation + opening.elevation + opening.height / 2,
        wall.start.z + Math.sin(angle) * (opening.offsetAlongWall + opening.width / 2)
      )
      .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) });
    return physicsWorld.createSensorCollider(desc);
  }

  // Terrain heightfield
  static registerTerrain(
    heightData: Float32Array,
    resolution: number,
    worldSize: number,
    maxHeight: number
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc
      .heightfield(resolution - 1, resolution - 1, heightData, {
        x: worldSize, y: maxHeight, z: worldSize,
      })
      .setTranslation(0, 0, 0);
    return physicsWorld.createStaticCollider(desc);
  }
}
```

### Collider Handle Storage in ZoneManager

ZoneManager stores collider references per zone so they can be cleaned up correctly:

```ts
interface ZoneColliders {
  floors:    RAPIER.Collider[];
  walls:     RAPIER.Collider[][];  // per wall: array of segment colliders
  platforms: RAPIER.Collider[];
  stairs:    RAPIER.Collider[][];  // per stair: array of step colliders
  sensors:   RAPIER.Collider[];    // door sensors
  terrain:   RAPIER.Collider | null;
  // v4.4.0 (actual impl: ZoneEntry.objectColliders: Map<objectId, RAPIER.Collider[]>) —
  // attached colliders per placed object; sensor entries also registered in _volumeSensors
  // (handle → objectId) so TriggerSystem fires on_player_enter/exit keyed to the object.
}

// On unloadZone:
for (const c of colliders.floors)              physicsWorld.removeCollider(c);
for (const segs of colliders.walls)    segs.forEach(c => physicsWorld.removeCollider(c));
for (const c of colliders.platforms)           physicsWorld.removeCollider(c);
for (const steps of colliders.stairs)  steps.forEach(c => physicsWorld.removeCollider(c));
for (const c of colliders.sensors)             physicsWorld.removeCollider(c);
if (colliders.terrain)                         physicsWorld.removeCollider(colliders.terrain);
```

### CharacterBody.ts

```ts
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "./PhysicsWorld.ts";
import * as THREE from "three";

export class CharacterBody {
  private _body!: RAPIER.RigidBody;
  private _collider!: RAPIER.Collider;
  private _kcc!: RAPIER.KinematicCharacterController;

  readonly capsuleRadius = 0.3;
  readonly capsuleHalfHeight = 0.6;   // half of the cylinder part (total height ~1.5m + 2*radius)

  init(spawnPosition: THREE.Vector3): void {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this._body = physicsWorld.world.createRigidBody(bodyDesc);

    const collDesc = RAPIER.ColliderDesc.capsule(this.capsuleHalfHeight, this.capsuleRadius);
    this._collider = physicsWorld.world.createCollider(collDesc, this._body);

    this._kcc = physicsWorld.world.createCharacterController(0.01);
    this._kcc.enableAutostep(0.5, 0.2, true);  // step up to 0.5m, min width 0.2m
    this._kcc.enableSnapToGround(0.3);          // snap down to ground within 0.3m
    this._kcc.setSlideEnabled(true);
    this._kcc.setMaxSlopeClimbAngle(45 * Math.PI / 180);
    this._kcc.setMinSlopeSlideAngle(30 * Math.PI / 180);
  }

  // Call each frame with the desired movement vector (gravity already included)
  move(desired: THREE.Vector3): void {
    this._kcc.computeColliderMovement(
      this._collider,
      { x: desired.x, y: desired.y, z: desired.z }
    );
    const mv = this._kcc.computedMovement();
    const pos = this._body.translation();
    this._body.setNextKinematicTranslation({
      x: pos.x + mv.x,
      y: pos.y + mv.y,
      z: pos.z + mv.z,
    });
  }

  get position(): THREE.Vector3 {
    const t = this._body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get isGrounded(): boolean {
    return this._kcc.computedGrounded();
  }

  dispose(): void {
    physicsWorld.world.removeCharacterController(this._kcc);
    physicsWorld.removeCollider(this._collider);
    physicsWorld.removeRigidBody(this._body);
  }
}
```

### TriggerSystem.ts

```ts
import RAPIER from "@dimforge/rapier3d-compat";
import { physicsWorld } from "./PhysicsWorld.ts";
import type { EventBus } from "../core/EventBus.ts";

export class TriggerSystem {
  private _characterCollider: RAPIER.Collider | null = null;
  // Map from Rapier collider handle → transition id
  private _sensorMap = new Map<number, string>();

  constructor(private readonly _bus: EventBus) {}

  setCharacterCollider(collider: RAPIER.Collider): void {
    this._characterCollider = collider;
  }

  registerSensor(collider: RAPIER.Collider, transitionId: string): void {
    this._sensorMap.set(collider.handle, transitionId);
  }

  unregisterSensor(collider: RAPIER.Collider): void {
    this._sensorMap.delete(collider.handle);
  }

  update(_dt: number): void {
    if (!this._characterCollider) return;
    physicsWorld.world.intersectionsWith(this._characterCollider, (other) => {
      const transitionId = this._sensorMap.get(other.handle);
      if (transitionId) {
        this._bus.emit("character:triggerdoor", { transitionId });
      }
    });
  }

  dispose(): void {
    this._sensorMap.clear();
  }
}
```

---

## Future: Characters, NPCs & Enemies

The physics foundation built in Phase 3–10 directly supports this. No rework needed.

### Playable Character (Phase 13+)

The preview `CharacterBody` + `CharacterController` become the base for the playable character. Additional layers:

```ts
interface CharacterDef {
  id:           string;
  name:         string;
  modelAssetId: string;         // GLTF
  capsuleRadius:    number;
  capsuleHeight:    number;
  moveSpeed:        number;
  jumpHeight:       number;
  cameraMode:       CameraMode;
  thirdPersonOffset:Vec3;
  // Game stats (Phase 13+)
  health?:      number;
  maxHealth?:   number;
  faction?:     string;
}
```

- `CharacterDef` stored per zone in `WorldState` (placed by character spawn tool in editor)
- At runtime, spawns a `CharacterBody` + loads GLTF model + attaches animation mixer
- Camera controller reads from `CharacterBody.position` same as preview mode

### NPCs (Phase 14+)

Each NPC is a `CharacterBody` (Rapier KCC) driven by an AI controller instead of input:

```ts
interface NpcDef {
  id:           string;
  name:         string;
  modelAssetId: string;
  spawnPosition:Vec3;
  faction:      string;
  behaviour:    "idle" | "patrol" | "follow" | "guard";
  patrolPath?:  Vec3[];
  dialogueId?:  string;
  lootTableId?: string;
}
```

- `NpcController.ts` implements `IEditorModule` — replaces input with behaviour tree / simple state machine
- Pathfinding: Recast/Detour navmesh (built from walkable floor colliders) or simple waypoint following along `patrolPath`
- NPCs placed in editor via Object tool with NPC-type asset, stored in `zone.objects` with `properties.npcSpawn = true`

### Enemies (Phase 15+)

Same `CharacterBody` base, different controller:

```ts
interface EnemyDef extends NpcDef {
  attackRange:    number;
  detectionRange: number;
  damage:         number;
  attackCooldown: number;
}
```

- `EnemyController.ts`: perception (sphere cast for player detection), chase, attack state machine
- Combat uses Rapier raycasts for hit detection (not mesh raycasting — consistent with physics world)
- Faction system: enemies hostile to player faction, neutral to own faction

### Editor Support for Characters/NPCs/Enemies

These are added as editor tools in Phase 13:
- **Spawn Point Tool**: place a character spawn marker in a zone (`zone.objects` with `properties.characterSpawn = true`)
- **NPC Tool**: place NPC with behaviour config in PropertiesPanel
- **Enemy Tool**: place enemy with combat config
- **Nav Mesh Viewer**: toggle overlay showing walkable navmesh surface (built from Rapier floor colliders)

All definitions stored in `SceneFile` JSON and loaded by the game runtime, not just the editor.

---

## Setup Instructions for Claude Code

```bash
# 1. Scaffold with TypeScript React template
npm create vite@latest world-editor -- --template react-ts
cd world-editor

# 2. Three.js + utilities
npm install three three-mesh-bvh three-bvh-csg

# 3. Rapier physics (WASM)
npm install @dimforge/rapier3d-compat

# 4. Types + checker
npm install -D @types/three typescript vite-plugin-checker

# 5. Run
npm run dev
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

### vite.config.ts

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";

export default defineConfig({
  plugins: [
    react(),
    checker({ typescript: true }),
  ],
});
```

### Phase 6.4 — Delete Support & Copy-to-Floor Cleanup

Adds the ability to delete any selected object and strips openings from copy-to-floor operations.

#### Scope

- `Delete` / `Backspace` keyboard shortcut deletes the currently selected object (guarded against input-field focus).
- "Delete" button rendered at the bottom of the Properties Panel for all selectable types.
- `removeFloor` added to WorldState / `floor:removed` event added to BusEvents (floor deletion was previously missing from the API).
- `ZoneManager._removeFloor` — removes mesh, disposes geometry/material, removes Rapier collider, re-runs `_applyDimming`.
- `SelectionManager` auto-deselects when the selected object's removal event fires.
- Copy-to-Floor: duplicated walls now start with `openings: []` (doors/windows are not copied).
- Wall deletion also removes orphaned nodes (nodes with no remaining walls) via `WorldState.removeNode`, which guards against removing nodes still referenced by walls.

#### New Event

```typescript
"floor:removed": { zoneId: string; floorId: string };
```

#### Delete Handler (App.tsx)

`handleDelete` branches on `selected.type`:
- `"wall"` — removes all walls in the run, then attempts `removeNode` for all their node IDs (safe: WorldState.removeNode no-ops if node still has walls).
- `"floor"` / `"platform"` / `"stair"` / `"object"` — direct removal via WorldState.
- `"opening"` — filters the opening from its parent wall's `openings` array via `updateWall`.

Keyboard listener uses `window.addEventListener("keydown")` with a `useCallback`/`useEffect` pair — re-binds when `selected` changes so the closure is always fresh.

#### PropertiesPanel

`onDelete?: () => void` prop. Rendered as a full-width red-tinted button directly above the Quality section, visible for all non-null selections.

---

### Phase 6.6 — Input UX & Floor Fixes

A collection of correctness and usability fixes applied after Phase 6.4.

#### 1. EditorCamera keyboard focus guard

**Problem:** Arrow keys typed inside any `<input>`, `<select>`, or `<textarea>` were still triggering camera movement because `EditorCamera._handleKeyDown/Up` had no focus guard. `InputManager` had an identical guard but `EditorCamera` is a separate listener on `window`.

**Fix:** Added `_isTypingTarget(e: KeyboardEvent): boolean` to `EditorCamera` (mirrors the identical method in `InputManager`). Both key handlers bail out early when the event target is an input-like element:

```typescript
private _handleKeyDown(e: KeyboardEvent): void {
  if (this._isTypingTarget(e)) return;
  this._keys[e.code] = true;
}
private _handleKeyUp(e: KeyboardEvent): void {
  if (this._isTypingTarget(e)) return;
  delete this._keys[e.code];
}
private _isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}
```

#### 2. Universal live-debounce hook in PropertiesPanel

**Problem:** Most `<input>` fields in `PropertiesPanel.tsx` committed their value only on `blur`. Only three components (WallGeoView, PlatformGeoView, ObjectGeoView) had any live update, and each rolled its own debounce timer independently.

**Fix:** Extracted a shared `useFieldDebounce` hook placed at module scope, before all component definitions:

```typescript
function useFieldDebounce(delayMs = 300) {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (ref.current !== null) clearTimeout(ref.current); }, []);
  const schedule = (fn: () => void) => {
    if (ref.current !== null) clearTimeout(ref.current);
    ref.current = setTimeout(() => { ref.current = null; fn(); }, delayMs);
  };
  const flush = (fn: () => void) => {
    if (ref.current !== null) { clearTimeout(ref.current); ref.current = null; }
    fn();
  };
  return { schedule, flush };
}
```

Every component that owns numeric inputs now calls `useFieldDebounce(300)` (ObjectGeoView uses 150 ms). The pattern applied to every field:

```tsx
// onChange: update local display state + schedule a deferred commit
onChange={e => { setVal(e.target.value); schedule(() => commitFoo(e.target.value)); }}
// onBlur: flush (cancel timer, commit immediately)
onBlur={e => flush(() => commitFoo(e.target.value))}
// onKeyDown Enter: same as blur
onKeyDown={e => { if (e.key === "Enter") flush(() => commitFoo(e.target.value)); }}
```

**Components updated:** WallGeoView, PlatformGeoView, StairGeoView, ObjectGeoView, VertScreen (elevation), MaterialSection (all five tiling/roughness/displacement fields), OpeningRow (offset/width/height/elevation + inner tile H/V), WallSegmentRow (tile scale).

`VertScreen` elevation input was also changed from `type="text" inputMode="decimal"` to `type="number" step={0.001}` so browser spinner arrows appear.

Select elements (`OpeningRow` type select, `WallSegmentRow` material select) commit immediately on `onChange` and require no debounce.

#### 3. Floor gizmo centroid

**Problem:** When a floor was selected, the transform gizmo appeared at world origin (0, 0.3, 0) because floor meshes have `position = (0,0,0)` in Three.js — their geometry vertices encode world coordinates directly (there is no mesh-level translation).

**Fix:** `GizmoManager._onSelect` now computes the gizmo position from the floor data for the `"floor"` selection type:

```typescript
} else if (type === "floor") {
  this._wallNodeIds = [];
  const floorDef = payload.data as FloorDef | null;
  if (floorDef) {
    py = floorDef.elevation + 0.3;
    const pts = floorDef.floorMesh.points;
    if (pts && pts.length > 0) {
      px = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      pz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    } else {
      const zone = this._worldState.zones.get(payload.zoneId);
      if (zone) {
        px = zone.bounds.x + zone.bounds.width  / 2;
        pz = zone.bounds.z + zone.bounds.depth  / 2;
      }
    }
  }
}
```

- Polygon floors: centroid of `floorMesh.points` array.
- Rect floors (points may be empty): center of `zone.bounds`.
- Y: `floorDef.elevation + 0.3` so the gizmo floats just above the surface.

#### 4. Floor elevation default

**Problem:** Both `FloorTool` and `PolygonFloorTool` were deriving the new floor's elevation from the first existing floor at the active level. This caused a new floor to inherit any user-modified elevation instead of defaulting to the level's natural position.

**Fix:** Both tools now always use `this._activeLevel * 3.0` (same formula WallTool uses), with no reference to existing floors:

```typescript
// FloorTool._commit and PolygonFloorTool._commit
const elevation = this._activeLevel * 3.0;
```

Level 0 → elevation 0 m, Level 1 → 3 m, Level 2 → 6 m, etc. The user can then override elevation in the Properties Panel.

#### 5. ZoneManager wall-run stale rebuild fix

**Problem:** `ZoneManager._removeWall` computed a wall run synchronously (the set of walls that share the same run as the deleted wall), then called `await WallBuilder.buildRun()`. If the user deleted all walls in a run before the async build completed (e.g. rapid multi-delete), the newly-built mesh would be added to the scene even though none of its source walls still existed — leaving a ghost mesh.

**Fix:** After `await WallBuilder.buildRun()`, a stale check verifies that at least one wall from the rebuilt run still exists in `zone.walls`. If not, the output mesh and colliders are disposed and the loop continues without adding anything:

```typescript
if (!run.some(w => zone.walls.some(zw => zw.id === w.id))) {
  output.mesh.geometry.dispose();
  if ((output.mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
    (output.mesh.material as THREE.Material).dispose();
  for (const tm of output.trimMeshes) tm.geometry.dispose();
  output.colliders.forEach(c => physicsWorld.removeCollider(c));
  continue;
}
```

---

### Phase 6.7 — Undo / Redo

Adds Cmd+Z / Cmd+Y keyboard shortcuts and two toolbar buttons (↩ / ↪) that undo and redo any WorldState mutation — placements, deletes, property edits, and everything that gets saved.

#### Approach: Snapshot-based HistoryManager

Before each logical action: deep-clone `world.toJSON()` → `before`.
After: deep-clone again → `after`.
Store `{ label, before, after }` on the undo stack (max 50 entries).

Undo: pop entry, call `world.loadFromJSON(entry.before)`, emit `history:restore`.
Redo: same with `entry.after`.

`history:restore` causes ZoneManager to do `unloadZone` + `loadZone` for the active zone — identical to the scene-load path. Selection is cleared automatically via `object:deselected` emitted just before `history:restore`.

No command pattern or inverse-method approach is needed. All WorldState mutations are synchronous, so before/after snapshots are always correct. Compound mutations (e.g. wall delete removes nodes too) are captured as a single step automatically.

#### HistoryManager API (`src/editor/HistoryManager.ts`)

```typescript
class HistoryManager {
  // Single-mutation actions
  record(label: string, fn: () => void): void
  // Multi-step batches (e.g. WallTool: addNode + addWall)
  beginBatch(label: string): void
  commitBatch(): void
  cancelBatch(): void   // for aborted operations
  // Undo / redo
  undo(): void
  redo(): void
  get canUndo(): boolean
  get canRedo(): boolean
  // Clear on scene:load / world:loaded
  clear(): void
}
```

`record()` is a no-op wrapper when `_batching` is true — inner tool calls during a batch just run their fn directly without capturing intermediate snapshots.

#### Integration points

**`src/types.ts`** — `BusEvents` gains:
```typescript
"history:restore": Record<string, never>;
```

**`src/world/ZoneManager.ts`** — in `init()`:
```typescript
this._bus.on("history:restore", () => {
  const zoneId = this._worldState.activeZoneId;
  if (!zoneId) return;
  this.unloadZone(zoneId);
  void this.loadZone(zoneId);
}),
```

**`src/App.tsx`**:
- `historyRef = useRef<HistoryManager | null>(null)` — holds the instance outside React state
- `const [canUndo, setCanUndo] = useState(false)` / `canRedo`
- `syncHistory()` helper calls `setCanUndo / setCanRedo` after every undo/redo/record
- `bus.on("scene:loaded", ...)` and `bus.on("world:loaded", ...)` → `history.clear(); syncHistory()`
- Cmd+Z and Cmd+Shift+Z / Cmd+Y intercepted in the keyboard `useEffect`
- `handleUndo` / `handleRedo` also emit `tool:select → "select"` to reset all tools before restoring
- `handleDelete` wrapped with `history.beginBatch(…)` / `history.commitBatch()`
- All branches of `handleObjectUpdate` wrapped with `history.record(…)`
- `handleSegmentUpdate`, `handleCopyRunToFloor`, `handleFillRunWithFloor`, auto-floor prompt wrapped

**Placement tools** — all receive `HistoryManager` as the 4th constructor argument:

| Tool | Pattern |
|---|---|
| `FloorTool` | `record("add floor", fn)` |
| `PolygonFloorTool` | `record("add floor", fn)` |
| `WallTool` | `beginBatch("add wall")` … `commitBatch()` (addNode + addWall) |
| `PlatformTool` | `record("add platform", fn)` |
| `PolygonPlatformTool` | `beginBatch("add platform")` … `commitBatch()` (addNodes + addPlatform) |
| `StairTool` | `record("add stair", fn)` |

**`src/ui/Toolbar.tsx`** — new props `onUndo`, `onRedo`, `canUndo`, `canRedo`. Two buttons above the tool list, disabled and visually dimmed when the corresponding stack is empty.

#### Behaviour guarantees

- Undo stack cleared on every `scene:load` — you cannot undo across scene loads.
- Max 50 undo entries; oldest are shifted off when the limit is reached.
- Redo stack is wiped whenever a new action is recorded.
- Batch `cancelBatch()` leaves WorldState unmodified and pushes nothing onto either stack.

---

---

## Phase 10.6a — Groups (name-list foundation)

> Numbering note: the label "Phase 10.6" was used for multiple things — the engine refactor ("Phase 10.6 — Entity Event System"), this Groups work, and the Local-Space Geometry Storage phase. To disambiguate the cluster: **10.6** = Entity Event System, **10.6a** = Groups (this section), **10.6b** = Rect Platform Rotation as a Mesh Transform (before Phase 10.7). The actual group *functionality* (assigning entities to groups and acting on them) ships in **Phase 10.9 — Group Functionality** below; this phase only builds the name-list manager and the dormant `groupIds` data fields.

**Motivation:** The original "zone" concept was confusing — zones looked like physical areas with drawn bounds (like Unity scenes), but the single-JSON-per-level design means there is really only one implicit geometry container. User-facing zones were repurposed as **Groups**: lightweight named labels with no spatial component.

### What changed (user-facing)

| Old | New |
|---|---|
| Zone drawing tool (Z key → draw bounds on canvas) | Removed |
| ZonePanel with zone list + "Enter ›" | GroupPanel: flat name list + "+ New" |
| ZoneNamingDialog (name + outdoor/indoor/dungeon type) | Inline rename (click label, Enter confirms) |
| No group concept in entity properties | GROUPS section in every entity's PropertiesPanel — **shipped in Phase 10.9** |
| Script panel tabs: WORLD / ZONE / OBJECT | GLOBAL / LEVEL / SELECTED |

### What stayed the same (internal)

- `ZoneDef` still exists as the internal geometry container (one demo zone, always active)
- `ZoneManager`, `activeZoneId`, all `zone:*` bus events — untouched
- Persistence: `SceneFile.zones[]` still works; demo zone still has floors/walls/objects
- `ZoneType` still on `ZoneDef` for backward-compatible JSON reading; unused in UI

### Data model additions (`src/types.ts`)

```ts
export interface GroupDef {
  id:   string;
  name: string;
}
```

`GroupDef[]` added as optional `groups?` field on `SceneFile`.

`groupIds?: string[]` added to `FloorDef`, `WallDef`, `PlatformDef`, `StairDef`, `WorldObject`, `TriggerVolume` for multi-group assignment. **In 10.6a these fields are dormant** — nothing reads or writes them yet. The assignment UI that makes them live ships in Phase 10.9.

Bus events added: `group:added`, `group:removed`, `group:updated`.

### `src/world/WorldState.ts`

`groups: GroupDef[] = []` field. Methods `addGroup`, `removeGroup`, `updateGroup` emit the new bus events. `toJSON` includes `groups`; `loadFromJSON` reads `file.groups ?? []`.

### `src/ui/GroupPanel.tsx` (new file)

Flat list of groups, each with an inline-rename click target and a × remove button. "+ New" button at the top.

### `src/ui/LeftPanel.tsx`

Renders `<GroupPanel>` when `panelId === "groups"`. Props: `groups`, `onGroupAdd`, `onGroupRemove`, `onGroupRename`.

### `src/App.tsx`

- `groups` state replaces `zones`/`pendingZone` state for the left panel.
- `handleAddGroup`, `handleRemoveGroup`, `handleRenameGroup` handlers wire to `WorldState`.
- Z key toggles the groups panel (no tool activation).
- `ZoneNamingDialog` removed.
- Group bus listeners update `groups` state.
- `world:loaded` listener syncs `groups` from `world.groups`.

### `src/ui/Toolbar.tsx`

Zone button label changed from "Zone" to "Groups". Active state triggered by `openPanel === "groups"` instead of `"zones"`.

### Backward compatibility

- Old saves load fine; `groups` defaults to `[]`.
- Old saves with multiple zones still render (all zone geometry loads, only the first zone is actively editable).
- `groupIds` is optional on all entity types — existing entities behave as if in no groups.

---

## Performance Concerns (circle back to)

Running list of deliberate performance trade-offs — decisions that are correct at the
current scale but have a documented upgrade path if scale grows. Revisit when the
relevant scale assumption changes.

### Skinned-mesh frustum culling (animated characters)

**Symptom that prompted this:** at the end of a death animation (character lying flat),
walking close/around the body made the eyes and face pop out of existence.

**Cause:** Three.js frustum-culls each mesh against a **bounding sphere computed once from
the bind pose** (the default standing pose baked into the geometry). A skinning animation
that moves vertices far from that sphere — e.g. lying flat — leaves the sphere stale. Eyes
and face are usually **separate small submeshes** with their own small spheres; once the
animation displaces them and the camera moves so the stale sphere falls outside the
frustum, Three.js culls the whole submesh and it disappears. The body has a larger sphere
so it survives; small parts vanish first.

**Current fix (`ObjectPlacer.build`):** disable frustum culling on skinned meshes only:

```ts
mesh.traverse(c => { if ((c as THREE.SkinnedMesh).isSkinnedMesh) c.frustumCulled = false; });
```

This walk runs **once per model at spawn** (not per frame), so it has no per-frame cost.
Static GLB props keep normal culling — only actually-animated character meshes are flagged.

**Cost of the fix:** a flagged mesh is always submitted for drawing.
- **On-screen:** zero difference — it was going to be drawn anyway.
- **Off-screen:** one extra draw call (plus its skinning) per flagged character per frame,
  instead of being skipped. Negligible for a handful of characters.

**Why not just enlarge the bounding box instead?** Considered and rejected at this scale.
Keeping culling on with a bigger sphere *would* still cull genuinely off-screen characters,
but: (1) it needs **per-model, per-animation tuning** — a death pose pushes geometry well
outside the standing silhouette, so the margin must be generous, which erodes the culling
benefit (it stops being skipped until far off-screen); (2) guess too small and the exact
eyes/face bug returns **intermittently and pose-dependent** — the worst kind to debug;
(3) the eyes/face are separate submeshes, so it's several spheres to tune per asset. It's
"smarter" but fragile and high-maintenance. Disabling culling is correct for **any**
imported model and animation with zero tuning, and can never wrongly hide a visible part.

**Upgrade path (only when scale demands it):** the trade-off flips with a **crowd** — dozens
to hundreds of skinned characters, many off-screen at once — where the un-culled draw calls
add up. The right upgrade is **not** the hand-tuned box; it's recomputing each skinned
mesh's bounding sphere from the deformed pose (`computeBoundingSphere()` after the mixer
updates each frame). That gives accurate culling with no guessing, at the cost of a bit of
per-frame work — worth it only above the crowd threshold. Below it, the box is just more
complexity for no measurable gain.

### Animation crossfade cost

`ObjectPlacer` crossfades between clips (`_fadeTo` + `AnimationAction.crossFadeTo`). During a
blend window (default `BLEND_SEC = 0.3`s) the mixer evaluates **two clips at once** for that
one model, so a transient ~2× skinning cost per blending character — negligible at a handful
of characters, and zero outside the blend window. The existing `mixer.update(dt)` drives the
fades; no new render loop. Faded-out actions are left at weight 0 (standard three.js pattern)
rather than explicitly stopped; harmless for one-active-at-a-time character models. At crowd
scale this combines with the culling concern above.

---

## Future: Scene Loader

Each JSON file is one complete level. A future **Scene Loader** will manage loading different level JSONs and passing player state (inventory, flags, spawn position) between them. This replaces the current concept of multiple geographic zones within one file.

The current `ZoneDef` / `ZoneManager` will be retained as the per-level geometry container. The Scene Loader will be responsible for unloading one `ZoneDef`-based level and loading another, preserving cross-scene game state via a separate persistence layer.

---

### Prompt template for Claude Code

> "Read `WORLD_EDITOR_ARCHITECTURE.md` in the project root. Implement **Phase [N] — [Name]** exactly as specified. Rules:
> - **TypeScript only.** Every file is `.ts` or `.tsx`. No `.js` or `.jsx`. `strict: true`. No `any` — use `unknown` and narrow with type guards.
> - All shared types come from `src/types.ts`. Never redefine types locally if they already exist there.
> - `three` is only imported in `src/core/`, `src/world/`, `src/builders/`, `src/editor/`, `src/preview/`
> - React components in `src/ui/` never import from `three` — they communicate via EventBus only
> - Every engine module implements `IEditorModule`: `init()`, `update(dt: number): void`, `dispose(): void`
> - SceneManager owns the RAF loop — modules register via `sceneManager.onUpdate(cb: UpdateCallback)`
> - All `mesh.userData` must be typed as `MeshUserData` (from `src/types.ts`) via `mesh.userData as MeshUserData`
> - Materials are only created via `AssetManager.getMaterial()`, never inline
> - All world coordinates are in meters, grid unit 0.5m
> - Use `const` over `let` everywhere possible. Prefer `readonly` on class properties that don't change after construction.
> - **Physics:** `three-mesh-bvh` is for editor raycasting only. All runtime collision uses Rapier via `PhysicsWorld` singleton. Every builder that creates geometry must also register Rapier colliders via `ColliderBuilder` and return their handles. ZoneManager is responsible for removing colliders on unload.
> - Never create Rapier objects outside of `src/physics/`. Never import `@dimforge/rapier3d-compat` directly in builders — use `ColliderBuilder` methods.
> - **Assets:** No hardcoded asset or material registries. Both are loaded dynamically from `public/assets/textures/manifest.json` and `public/assets/models/manifest.json` via `AssetManager.initMaterials()` and `AssetManager.initAssets()` on startup.
> - **Scripting:** `ScriptEngine` is the only place scripts execute. No other module calls `new Function()` or `eval()`. Bus events are the only way scripts communicate with the rest of the engine.
> - **Persistence:** Three separate stores — scene file (explicit save/load), game save (localStorage, auto), editor preferences (localStorage, on change). Never mix them."
