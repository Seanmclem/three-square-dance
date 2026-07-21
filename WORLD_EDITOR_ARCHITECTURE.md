# 3D World Editor — Full Project Architecture
> Vite + React + TypeScript + Three.js (no R3F) — physics via Rapier3D

**Version 4.36.3** — last updated 2026-07-21
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
- v4.11.2 — **Suspended entity gizmo no longer reappears mid face/vertex drag.** `GizmoManager._reattachMeshes()` (runs on every `shape:rebuilt` — i.e. continuously during a face-TC drag) ended with `attach()`, which force-shows the controls without re-applying suspend gating; the same race `_onSelect` already guarded. Now calls `_applyControlsEnabled()` after attach. Verified with a per-frame sampler during a real face drag: max 1 TransformControls visible throughout. Also documented the browser-testing lesson (TESTING.md): after test-entity cleanup, wait for an "autosaved just now" tick before closing the tab, or the cleanup is lost.
- v4.12.0 — **Face-select mode outlines every face of the selected brush.** `BrushFaceHighlighter` now also builds one black `LineSegments` overlay of all face boundary loops (each edge emitted once per adjacent face, lifted 0.012 along that face's normal — no vertex-normal math, no z-fighting) whenever the active tool is `select-face` and the selected shape is a face-brush. Rebuilt on shape:rebuilt / tool change / selection change, cleared outside face mode and in preview; same throwaway-overlay idiom as the face fills (no per-frame work). On by default, no toggle (v1).
- v4.13.0 — **Placement variant menus no longer arm a tool on open + Esc exits placement tools.** The Floor/Platform/Shape toolbar buttons used to arm their primary variant (e.g. cylinder) the moment they were clicked, with no way to close the popover without placing something. Now those buttons only OPEN the popover (`menuFirst` groups — Select keeps its old behavior); nothing is armed until a variant is explicitly picked, and Esc or clicking outside the toolbar closes the popover (document-level listeners while open; hint reads "Pick a type to place — Esc closes."). Additionally App's Escape handler now bails any armed non-select tool back to Select (tools still cancel their in-progress ghost via the bus keydown first), so "I decided I don't want a shape" is always one Esc away. Verified in-browser: opening the Shape menu emits zero tool:select, Esc/click-away close without placing, picking Cylinder arms it, Esc returns to select.
- v4.14.0 — **Phase 23b — Edge select/drag mode (Blender-style, 4th Select variant).** New `select-edge` ToolId (Select popover "╱ Edge (4)" + Digit4 hotkey; `isSelectMode` extended — all non-shape machinery unchanged). **No data-model change:** an edge IS its unordered vertex-index pair, derived from face loops; `object:selected` carries `edgeVerts?: [number, number]` and `shape:sub-select` gains an optional `edge` field (existing emitters unaffected). SelectionManager `_resolveEdge`: hit triangle → logical face via faceGroups → the face loop's boundary edge closest to the hit point in world space (every face click selects an edge — no pixel threshold), with a liveness clamp on every emit (edge valid while some face loop traverses the pair — survives topology ops that keep it, drops cleanly otherwise). **`BrushEdgeEditor`** (new, BrushFaceEditor's proxy pattern): translate TC at the edge midpoint moves the edge's 2 verts live in one transaction (snap 0.25, Alt free, Escape cancels), suspends the entity gizmo (`gizmo:suspend` "edge-mode"), owns the cloud auto-bake for edge-mode selections. **BrushFaceHighlighter**: black face-boundary outlines now show in edge mode too, plus a bright blue tube (`CylinderGeometry` r=0.025, depthTest off) over the selected edge — WebGL 1px lines don't read as selection. Verified in-browser end-to-end: Digit4 + variant popover, cloud auto-bake on first edge click, nearest-edge resolution, real TC drag moved exactly the edge's 2 verts (y 2→0.25 snapped, all others byte-stable), single visible gizmo throughout, one undo restores, overlays clear on mode switch/deselect.
- v4.14.1 — **Autosave no longer clobbered by stale editor tabs.** Root cause of the twice-recurring test-entity resurrection (and a real data-loss hazard: ANY dormant editor tab — e.g. frozen by Chrome Memory Saver since yesterday — flushed its stale in-memory world over newer autosaves via the unconditional 60s tick / closing beforeunload, silently reverting edits made in other tabs). `writeAutosave` now gates on a load-time content baseline (`autosaveBaselineRef`, re-baselined on every write): a tab that never changed the world never writes. Deliberately content-compared rather than gated on React `isDirty`, which console/test-driven `world.transaction()` mutations never set. Verified: untouched tab holds through a full tick (ts frozen); an edit resumes writes on the next tick. Last-writer-wins between two actively-edited tabs is unchanged (pre-existing).
- v4.15.0 — **Phase 24 — Controller & touchscreen support (ControlSchemeManager).** Preview/game-mode input abstracted behind new **`src/input/`** (the editor's InputManager is untouched — this is its preview-mode sibling, alive only between `PreviewController.enter()`/`exit()`): sources (`KeyboardMouseSource` — the listeners extracted verbatim from CharacterController; `GamepadSource` — `navigator.getGamepads()` polled per frame (Chrome returns snapshots — never cache the pad object), radial deadzone 0.15 **with rescale** (per-axis deadzones cause diagonal drift), prev-frame diff for button edges, `gamepaddisconnected` zeroes state so an unplugged held stick can't ghost-walk; `TouchSource` — a plain shared store written imperatively by the React overlay, ecctrl-style, no bus traffic per pointer-move) all merge each frame into ONE **`ActionState`** struct (`move` unit-disc analog — magnitude scales walk speed, so half-stick walks at half speed; `look` per-frame radians delta unifying mouse px·0.002 / stick rad·s⁻¹·dt / touch px·sens; held `jump` — edge stays in CharacterController's `_jumpArmed`; one-frame edges `interactPressed/confirmPressed/cancelPressed/menuNav`), consumed by **CharacterController, which no longer owns any DOM listeners**. Defaults: gamepad **LB=interact, RB=jump** (bumpers per spec; A doubles as jump outside dialogue + confirm inside), left/right sticks move/look, d-pad → `menuNav`, Start=cancel; touch = **floating virtual joystick** (spawn-at-touch, left 40%), **drag-to-look** elsewhere (multi-touch by pointerId — two-thumb move+look works), **tap = interact** (≤5px/250ms, the InputManager `_DRAG_THRESHOLD` idiom — a swipe never interacts), JUMP + ✕ buttons (`TouchControlsOverlay.tsx`, safe-area-inset padded, mounted only while `previewScheme==="touch"`; `joyOrigin` deliberately lives in a ref AND state — a pointermove can arrive before React re-renders). **Scheme = a label, never a gate**: all sources stay live; last-input-wins switching via per-source `hadActivity()` (deadzone-filtered so stick drift can't flip it; unlocked mousemove doesn't count — only locked motion/keys/wheel/real `pointerType:"mouse"` presses; touch claims via a document-level `pointerdown pointerType:"touch"` listener since the overlay isn't mounted while another scheme is active), persisted `worldbuilder.lastScheme`, initial guess last-used → coarse-pointer/maxTouchPoints → connected pad → kbm. **Pointer lock is kbm-only** (mobile Safari/Chrome throw on it): released on leaving kbm, re-acquired on the next canvas mousedown (lock needs a user gesture — a keypress alone can't re-lock). **Menu mode**: `dialogue:show`/`dialogue:closed` gate — movement/look/jump/interact zeroed behind an open dialogue, `action:confirm` emitted ONLY in menu mode (kbm E/Space/Enter, gamepad A, touch tap — **DialogueOverlay's own window keydown listener is gone**, one bus path for all schemes; the E-that-opens-a-dialogue can't insta-advance it because the manager runs before the controller each frame), `action:cancel` (Start/✕) closes the dialogue else exits preview (Esc keeps its App.tsx path). New events: `input:scheme-changed`, `action:confirm`, `action:cancel`, `dialogue:closed`. **PreviewHUD** prompts follow the scheme (`[E]`/`[LB]`/`Tap ·` interact prefix; `Esc · exit`/`Start · exit`/hidden-on-touch). **Bindings** (`src/input/bindings.ts`): `BindingsConfig` per scheme, `loadBindings()` = localStorage `worldbuilder.bindings.v1` deep-merged over `DEFAULT_BINDINGS` (partial/garbage-tolerant), read once per preview session; **CONTROLS (THIS DEVICE)** section (`ControlsSection.tsx`) in the spawn/player panel — sensitivities, deadzone, invert-Y, joystick radius, touch layout, reset — a device preference, never SceneFile data; `window.__bindings` dev global. Suppression: manager zeroes state on `overlay:fade-in` and drains source accumulators+activity during fades (no post-fade input burst or scheme flip). Every step verified in-browser (real DOM/PointerEvents + stubbed `navigator.getGamepads`, deterministic manual-frame stepping for edges): kbm parity vs pre-refactor constants (3.55m/0.6s, −0.4 rad/200px, +1.5 zoom), gamepad deadzone-rescale exact ((0.5−0.15)/0.85=0.412), two-thumb touch, scheme flips + persistence, dialogue advance/close/exit from every scheme, custom sensitivity round-trip (0.01 → exactly −1.0 rad/100px). Known: `viewport-fit=cover` added to index.html; per-key rebinding UI deferred (data model supports it).
- v4.16.0 — **Phase 24b — Pause menu (Start / Enter / ⚙).** Minimal in-session menu reusing Phase 24's menu-mode plumbing: `action:cancel` now means **close dialogue → close pause → OPEN pause** (exit moved into the menu; Esc keeps its direct App.tsx exit). New **`src/ui/PauseMenu.tsx`** (zIndex 110, backdrop-click = resume): Resume / Exit buttons, highlight driven by new **`menu:nav`** bus event (d-pad up/down — `menuNav` finally consumed), activated by `action:confirm` (gamepad A, kbm E/Enter, touch tap) or mouse/touch click; the confirm subscription re-subscribes per selection change (updater-side effects double-fire under StrictMode). kbm gained a **`cancel: ["Enter"]`** binding — Enter is deliberately BOTH confirm and cancel, and the manager **drops the simultaneous cancel whenever confirm fires in menu mode**, so Enter advances an open dialogue / activates the highlighted button, and only opens the menu when nothing is open. Manager menu-mode gate widened to `_dialogueOpen || _pauseOpen` (new `pause:show`/`pause:closed` events, App owns the state incl. `preview:stop` cleanup). **Pointer lock**: pause opens → lock released (cursor needed for the buttons); pause closes → best-effort re-lock when kbm (click/keypress closing it carries user activation; the canvas-mousedown fallback covers failure). Touch overlay's ✕ became **⚙** (same cancel wiring — opens the menu, whose Exit replaces the old instant-exit). HUD hints: `Enter · menu   Esc · exit` / `Start · menu` / hidden-on-touch. The world keeps simulating while paused (same as dialogues) — a real time-freeze is future work. Verified in-browser (manual-frame stepping): Enter/Start/⚙ open, Enter/Start resume-toggle, d-pad highlights Exit + A exits preview, movement frozen while paused, dialogue-Enter regression (advances, never opens pause behind), Esc-while-paused exits, pause state cleared on preview:stop.
- v4.16.1 — **Toolbar variant popovers actually close (supersedes the v4.13.0 close behavior).** The Select/Floor/Platform/Shape popovers (and the Spawn mode menu) used to stay open as long as their tool group was active — `showVariantMenu` included `activeVariantId !== undefined` (and plain `active` for Select), so Select's menu was open permanently and a placement menu stuck around after picking a variant. Now a popover renders only while explicitly opened (`openMenu`), and closes on Esc or ANY `document` click — outside, inside on a row, or inside on the hint text (was: mousedown outside the toolbar root only). Buttons that open a menu `stopPropagation()` so their own click doesn't insta-close it (the document listener attaches in a `useEffect`, so the very first opening click is safe either way — the guard matters when switching directly between two open menus). Select's button still arms `object` (or the current variant) on click while opening its popover; placement groups still arm nothing until a variant is picked; Spawn arms and opens its Initial/Checkpoint menu; the Play ▾ menu joined the same Esc/click-anywhere close path. No variant is pre-highlighted in a fresh placement popover (highlight = currently armed tool only). Verified in-browser via real bubbling clicks: every open/close path above, plus arming. The per-face materials list didn't indicate which face was selected in face mode; the selected face's row now gets the blue highlight (same styling as the Geometry FACES list), the header shows "selected: FACE n", and clicking a row's FACE label sub-selects that face (same `shape:sub-select` channel).
- v4.17.0 — **Phase 26 — Bake shapes/brushes → GLB reusable assets.** A selection of shapes (single-shape Actions button, or the multi-select panel when ALL selected refs are shapes) bakes into one standard GLB: fresh `ShapeBuilder.buildMeshes()` output (new public method — `build()` minus physics registration, so baking never leaks collider bodies; `build()` now composes it), each mesh's transform baked into cloned geometry, re-pivoted to the selection's base center (bbox centerX/minY/centerZ — sits on surfaces like any asset), then **merged by material reference** (`BufferGeometryUtils.mergeGeometries`, attributes normalized to non-indexed position/normal/uv): the draw-call win — a 3-shape/2-material structure renders as 2 meshes per placed copy vs 6. Exported via `GLTFExporter.parseAsync({ binary: true })` (both addons are first-time imports); albedo/normal/roughness/metalness/AO + baked metric UVs survive (REPEAT samplers), displacement has no glTF 2.0 slot and is dropped by decision (negligible on low-poly brushes). **BakeDialog** (`src/ui/BakeDialog.tsx`): slugged name + two default-on outputs — *Add to asset library* (writes `<slug>.glb` + thumbnail via `renderModelThumbnail`, manifest-splices through new `src/core/assetLibraryWriter.ts` — ModelImporterModal's pattern, modal untouched — then `handleAssetsReload()`; category "Baked") and *Save .glb file locally* (`showSaveFilePicker` + anchor-download fallback; picker cancel skips the file WITHOUT killing the library write). Sources are never modified; nothing to undo (matches import ops). **Asset-preset compound colliders:** new optional `AssetDef.colliders` — one box per source shape (yaw-only shapes get an exact local box + `rotationY`; tilted shapes a conservative asset-space AABB — `"hull"` stays reserved); placement preference is `obj.colliders ?? def.colliders ?? auto box` (ZoneManager._buildObjectColliders + ColliderEditor._effectiveColliders + the panel's Customize-seeding and `auto (N boxes)` summary). Purely additive: every existing asset lacks the field and behaves byte-identically. Verified in-browser: GLB structure decoded from the binary (magic/version/2 meshes/2 materials/REPEAT samplers/pivot exact), placed copies = 2 meshes each, preset-collider raycasts exact to the mm (plain box top 2.6124; the 45°-yaw box hit at an offset an unrotated box can't reach and missed outside the rotated footprint; tilted AABB top 2.9568), dialog + button gating (all-shapes only) through real UI, manifest round-trip through `initAssets`. Console harness: `__test.bake(ids)`.
- v4.17.1 — **Bake pickers get an in-app hint pill.** The two native dialogs a bake can open are indistinguishable OS chrome (user report: "which save is this?"); a fixed top-center pill now names each while its picker is up — "Choose where to save <name>.glb (local copy)…" before `showSaveFilePicker`, "Select your assets/models folder so the asset can join the library…" before the `ensureDir` directory grant (shown only when the folder isn't already granted). Cleared inline after each picker plus in the outer finally/catch so cancel/error paths never strand it.
- v4.18.0 — **Phase 27 — Convex hull colliders (objects + baked assets).** Fills the reserved `"hull"` slot in `AttachedColliderShape`: `AttachedCollider.points?: Vec3[]` (object-local, pre-scale, relative to origin+offset — encodes shape AND orientation). **Physics** (`ColliderBuilder._attachedDesc`): `RAPIER.ColliderDesc.convexHull((p+offset)·scale)` positioned at the object's translation/rotation — scale composes before rotation like mesh TRS, so hulls stay exact under full rotation AND non-uniform scale (rotated boxes never could); degenerate points fall back to a points-AABB box with a warn. **Opt-in only**: nothing existing changes — hull happens when a user switches a collider card to Hull or a new bake ships hull presets. **Panel**: the collider card's shape row gains **hull** — switching auto-fits from the model via new `ObjectPlacer.getLocalHullPoints` (vertices stride-sampled to ≤1.5k in object-local space → ConvexGeometry → deduped, typically <100 points; null on unbuilt/degenerate meshes) — hull cards show "N points · auto-fit" + **Refit**, hide size/rotationY (offset + Move gizmo still work). **ColliderEditor**: hull wireframes render the actual ConvexGeometry (rebuilt on reposition, capsule idiom); no face handles. **Baked assets now ship exact hulls**: `bakeShapes` emits one hull per source shape (`localHullPoints` carried through the FULL rotation into asset space) — supersedes phase 26's box presets and fixes the tilted-AABB compromise; concave face-brushes get their convex hull (strictly better than a box). Verified in-browser: Rapier hull raycasts match THREE ConvexGeometry ground truth at every probe (2.612/2.633/2.922 exact), tilted hull misses at its AABB corner where the old box over-collided; real imported rock (`rock_2`): 91-point auto-fit through real panel clicks, hull top 1.843 vs AABB 1.961 and clean miss at the AABB corner, cyan wireframe hugging the silhouette. Runtime cost: static hulls ≈ boxes (user-settled — fit was the feature, not speed).
- v4.19.0 — **Phase 27b — Trimesh attached colliders: baked concave brushes collide exactly.** Closes phase 27's one imprecision (user report: a carved face-brush's baked copy filled its alcove — hulls are convex). `AttachedColliderShape` += `"trimesh"` with `AttachedCollider.indices?: number[]` (triangles into `points`); `ColliderBuilder._attachedDesc` trimesh arm mirrors the hull arm's frame math (`(p+offset)·scale` at the object's translation/rotation) with `FIX_INTERNAL_EDGES`, box fallback on failure. **Bake rule**: face-brush sources → trimesh (vertices/fan indices from `ShapeBuilder.localTrimesh` — the same data their live collider uses — carried through the full rotation into asset space); parametric/cloud sources → hull as before. So a baked structure now collides byte-identically to its sources in every case. ColliderEditor renders trimesh wireframes from points+indices (`_pointsGeometry`, ex-`_hullGeometry`); the panel card shows "N tris · exact from bake" (trimesh isn't user-switchable — no auto-fit from arbitrary render meshes yet; converting away goes through the points-AABB like hulls, Refit is hull-only). Verified in-browser on a hand-authored concave L-prism face-brush baked → preset attached to a placed object: both solid arms hit at exactly 2, the carved notch column passes clean through (a hull reported 2), a horizontal ray inside the notch hits the inner wall at exactly 0.9; panel card + wireframe render. Hollow-surface caveats unchanged from live face-brush trimeshes.
- v4.20.0 — **Phase 25 — Standalone Runtime Shell (manifest + SceneRouter).** A second Vite entry (**`runtime.html`** → **`src/runtime/`**) that plays worlds without the editor: boots from a **manifest.json at any URL** (`?manifest=` param; CORS permitting), shows a DOM main menu from manifest metadata (name/description/author; Start / Continue / New Game; URL input when no param — v1's launcher stand-in), and routes between **whole scene files** via a new **`SceneRouter`** — one level above zone transitions. The runtime is its own ~250-line composition root (`RuntimeApp.tsx`) constructing the same engine classes as App.tsx minus every editor tool: game-mode SceneManager, WorldState, ObjectPlacer, ZoneManager, PreviewController (which owns ControlSchemeManager since phase 24 — kbm/gamepad/touch work unmodified), ScriptEngine, gameState; overlays reused: PreviewHUD(+scheme), DialogueOverlay(+`dialogue:closed` emit), FadeOverlay, TouchControlsOverlay (scheme-gated), PauseMenu + the `action:cancel` handler pattern (exit → menu screen). **Engine decoupling (25.1, zero editor change):** `SceneManager` ctor gains `opts?: { mode?: "editor"|"game" }` — game mode skips EditorCamera (field now `EditorCamera | null`), ViewHelper, and `_setupGrid()` (grid + demo ground); `PreviewController` spawn falls back `editorCamera?.focus` → origin soft-fail (warn, no crash) when a scene lacks `defaultSpawn`; **`AssetManager.setBaseUrl(url)`** + private `_resolve(path)` at every fetch/loader site (all three manifests, `_fileExists`, textures, GLB/OBJ/MTL) so `/assets/**` resolves against a remote origin (default = document origin, byte-identical editor behavior), and `initMaterials/initAssets/initDecals` gain `{ verifyFiles?: boolean }` (runtime passes `false` — cross-origin HEAD checks 405 on some hosts and would hide every asset). **SceneRouter.go(sceneId)** sequence: re-entrancy guard (portals double-fire) → resolve URL first (unknown authored id = non-fatal, stays in scene) → fade + LoadingScreen → capture fired one-shots → `deactivate/clearIndex` → `preview.exit()` → unload ALL zones → fetch scene JSON → editor's exact migration pipeline (`migrateWallNodes`/`migrateUVs`/`pruneOrphanNodes`) → `loadFromJSON` → `loadZone(zones[0])` → re-index scripts (router owns script lifecycle; runtime's `preview:start` handler is UI-state only, unlike App's) → `configureSchema` **without reset** (cross-scene `gameState` persistence is the point) → `activate` + restore one-shots (so cross-scene oneShots never re-fire) → `enter("game")` (+`character:teleport` to saved pose on Continue) → `onGameStart()` only on newGame/resume → `fire("on_level_load", zoneId)` (never synthesize `zone:enter` — it would trip ZoneManager's swap handler). **New script action `load_scene`** (`ActionType` + `ScriptAction.sceneId` + bus `scene:load-request`): one ScriptEngine dispatch case; ScriptPanel free-text field ("runtime manifest key — not validated here"); silent no-op in editor preview (no listener). **Per-manifest saves** (`src/runtime/saveGame.ts`): `runtime_gamesave:<manifest.id>` = `{ version, ts, sceneId, state, firedOneShots, pose }` — pose captured via the existing `character:save-position` mechanism (reserved key `__runtime_pose`, foot-level, round-trips through `character:teleport`); written every 30s + on scene entry + before every exit; Continue restores scene+state+one-shots+pose across full page reloads; New Game clears + `gameState.reset()`. **PhysicsWorld leak fix (pre-existing, exposed by scene cycling):** `createStaticCollider`/`createSensorCollider` allocate a dedicated fixed body per collider but `removeCollider` left it behind — now removes the empty parent body, and `removeRigidBody` is idempotent (`body.isValid()` guard) so CharacterBody's collider-then-body dispose stays safe. Verified A→B→A→B: mesh/collider/body counts identical per scene visit. **Vite:** `build.rollupOptions.input` = main + runtime; the runtime chunk graph contains no editor UI (`main-*.js` not referenced; DEV-only `installTestHelpers` loaded via dynamic import because it statically imports `@/editor/bakeShapes`). **Committed demo** `public/demo/` (manifest + level_01 ⇄ level_02 wired by portal trigger volumes with `load_scene`; state-gated dialogue in level_02 proves cross-scene state). Verified in-browser end-to-end, including a true cross-origin run (second local server with CORS headers — manifest, scenes, asset manifests, textures all resolved against it) and ErrorScreen paths (bad URL, invalid JSON, CORS named explicitly). Dev globals: `window.__runtime` (+ classic `__scene`/`__world`/… so TESTING.md recipes work in the runtime tab). Future work (unchanged from the plan doc): launcher/library + registry, ref-counted asset cache + preloading, 3D menu scenes, editor "Export manifest".
- v4.20.1 — **Runtime menu backdrop: vantage camera on exit-to-menu.** Nothing drives the game-mode default camera, so after exiting to the menu it sat at the origin *inside* the still-loaded level (close-up brick / trigger-volume fills, floor-coplanar view). `RuntimeApp`'s exit-to-menu path framed it at `spawn + (9, 8, 9)` looking at the spawn — the level as a diorama behind the menu card. **Superseded by v4.20.2** (user preferred the clean-sky menu).
- v4.20.2 — **Runtime menu backdrop: unload the world on exit-to-menu (replaces v4.20.1's vantage camera).** `RuntimeApp`'s exit-to-menu path now calls `scriptEngine.deactivate()` (stops script timers that would otherwise keep firing behind the menu — the router re-activates on the next `go()`) and unloads every loaded zone, so the menu always sits over the same clean sky as first boot (verified: 0 level meshes / 0 colliders / 0 bodies at menu; Continue re-fetches and resumes correctly). The vantage-camera code is removed.
- v4.21.0 — **Phase 28 — Occlusion Test play mode (detached debug vantage).** Third `PreviewMode` (`"occlusion"`, `isGameplayMode()` helper in types.ts): New Game gameplay semantics (defaultSpawn, on_game_start, hideInGame furniture hidden, gizmo/node-dot lockout — the `mode === "game"` branches in ZoneManager/NodeDragger/GizmoManager/App flipped to `isGameplayMode(mode)`, tautological for existing modes) but the **editor orbit camera stays the rendered camera** — `PreviewController` skips `setPreviewCamera()`, so SceneManager's `_previewCamera === null` path renders the vantage while the character's camera keeps updating unrendered as the *logic camera* (spring-arm pull-in included; CharacterController unchanged). A `THREE.CameraHelper` on the logic camera (frustumCulled=false, no editorId, disposed on exit) shows the player's view from outside. **Tab** toggles sub-modes: `player` (editorCamera disabled + frozen — its `update()` gates on `enabled` — pointer lock requested, normal game input) / `camera` (lock released, orbit controls live, character input zeroed via `zeroActionState` after `input.update` so document-level WASD can't double-drive). Pointer-lock re-lock sites share a `_wantsLock()` predicate so RMB-orbit clicks in camera sub-mode don't re-lock. **C** toggles the *cull-as-player view*: `SceneManager.setCullOverrideCamera(logicCam)` + `_applyCullOverride()`/`_restoreCullOverride()` around `renderer.render` in `_loop` — replicates the renderer's bounding-sphere-vs-frustum test from the logic camera over meshes with `userData.editorId` (skipping hideInGame/editorOnly/already-hidden/frustumCulled=false), hides failures for the frame, restores immediately after render (script-driven visibility never corrupted; preallocated Frustum/Matrix4/Sphere scratch; `cullStats {tested,hidden}` getter; culled meshes drop out of that frame's shadow map — accepted for a debug view). Default OFF — with the toggle off `_loop` is a single null-check from the pre-phase path, so preview/game/runtime perf is untouched. `occlusion:state {subMode,cullView}` bus event drives a PreviewHUD amber badge (`OCCLUSION TEST — CONTROLLING: PLAYER|CAMERA · CULL VIEW ON|OFF`), crosshair hidden in this mode, `Tab`/`C` hints added; HUD `mode` prop optional (default `"game"`) so RuntimeApp is untouched. Toolbar ▶-menu gains "Occlusion Test"; runtime-shell guard falls back to `"game"` when `editorCamera` is null; **game saves are never written by an occlusion run** (App gates the 30s interval + exit save on mode). Dev hooks: `__sceneManager` global; `__test.enterOcclusion()/occlusionState()/setCullView()/teleport()`. Verified in-browser end-to-end (editor cam renders, cullStats responds to facing, despawned mesh survives cull restore, W drives player XOR camera per sub-mode, Esc exits clean, game save byte-identical, preview/game regress clean). Plan: `plans/phase-28-occlusion-test-mode.md`.
- v4.21.1 — **DialogueOverlay restyled as a floating box.** Was edge-to-edge at the very bottom of the viewport; now a centered box `min(720px, 100% − 64px)` wide with rounded corners, a full border + drop shadow, lifted `40px + env(safe-area-inset-bottom)` off the bottom. Behavior (advance on `action:confirm`/click, speaker/portrait/line counter) unchanged; applies everywhere it's used (editor preview + runtime).
- v4.22.0 — **PropertiesPanel empty state → global-editor home + Credits modal.** The nothing-selected panel (ToolView, select tool only) gains an **EDITOR section** — the designated home for future global editor settings/links — starting with a **CREDITS** button opening the new `src/ui/CreditsModal.tsx`. Credits are derived entirely from the imported registries the panel already receives (`materialList` + `assets` props): every `MaterialDef`/`AssetDef` with an `attribution` (author or sourceName present) is grouped **author → content pack (`sourceName`)**; each pack card shows a `sourceUrl` link, license badges (incl. `licenseOther` free text), and `N materials · N assets` counts; the author heading carries the first-seen `patreonUrl`; unattributed items are skipped (empty state explains credits appear automatically). Modal follows ModelImporterModal conventions (fixed inset-0 z-100 backdrop, 480px card, backdrop-click + ✕ close); `showCredits` state is local to PropertiesPanel. Verified in-browser through the real click path: ambientCG (2 material packs) + Quaternius (2 asset packs, 21+12 assets) grouped with links/badges; close works.
- v4.23.0 — **Phase 29 — Parametric stair landings + switchback stairwells.** A stair can now generate its own top **landing** and repeat itself as N opposed **flights** forming a squared spiral — one entity, fully re-editable, replacing the hand-built flight+platform+missing-rails workflow (user's reference: `worlds/stairs.json`). Four optional `StairDef` fields (no migration): `landing?: StairLandingDef { depth, width? (flights=1 only) }`, `flights?` (≥1), `turn?: "left"|"right"`, `gap?` (void width between opposed flights). Semantics: `start`/`end`/`numSteps` still describe flight 1 exactly; every flight repeats its run/rise 180°-alternated at lateral pitch `width+gap`; a landing tops **every** flight (span = both flights + void, or `landing.width` when flights=1); landings add no rise; `flights>1` requires a landing (panel enforces, builder clamp-defaults). New pure module **`src/builders/stairLayout.ts`** — single source of truth for BOTH mesh and physics: `computeStairLayout()` (FlightSpec[]/LandingSpec[] in a u/v stairwell frame anchored at `start`; degenerate plain stair ⇒ exactly `[{start,end}], []`) and `computeRailPaths()` (see below). `StairBuilder.build()` refactored: the per-step loop extracted verbatim into `emitFlight(fStart,fEnd,mode)` (flight 0 alone = byte-identical vertex stream, verified 232/56 position counts unchanged); `emitLanding()` pushes slab faces into the body accumulator (tread material/UV-scale, per-face winding corrected because a "left" turn mirrors the frame); upper flights/landings downgrade `closed` underside to the diagonal soffit (a to-ground column under flight k≥2 would swallow the flight below — landing thickness derives from underside mode, never configured). **Railing continuation** (the heart): with landings engaged the entire railing is two continuous walking-surface-height polylines — **inner** (up flight k on the void side → level across the landing's void edge → straight up flight k+1 → … → free end after the top landing's crossing; the tread-anchor line meets `(u=run, y=topY)` exactly, so slope→level corners join with no gooseneck) and **outer** (up flight k → level around the landing's three outer perimeter edges, the last leg lying on flight k+1's outer rail line → … → terminates at the top landing's open exit edge where phantom flight N+1 would launch — the storey exit). flights=1+landing = balcony wrap (3 edges railed + lateral jog when the landing is wider). `emitRailPath` emits per-segment oriented boxes (+barThickness overlap closes miters) + posts (corner posts at every vertex, per-step anchors on slopes, `stepInterval×stepDepth` spacing on level runs, positions deduped); the pre-29 rail block is kept verbatim behind `isPlainStair()` — legacy stairs render pixel-identical. `ColliderBuilder.registerStairSteps` consumes the same layout: per-step cuboids per flight + one cuboid per landing slab (30 = 2×14+2 verified; legacy descriptors byte-identical). `StairGeoView` gains a **LANDING & FLIGHTS** section (landing checkbox + depth; width(flights=1)/void-gap(flights>1) shared slot; flights int; Left/Right turn buttons; read-only per-flight note with derived top-Y/total-rise; unchecking landing resets flights in one update = one undo step). Verified in-browser: generated 2-flight left-turn reproduces the user's hand-built stairwell within cm (flight 2 within 17cm of the eyeballed manual placement, landing within 8cm); 3-flight right spiral; balcony; rails/underside toggles; single-step undo ×2 back to a pristine plain stair; physics via manual stepping — player stands on landing top and mid-flight-2 treads at exactly the expected heights. Plan: `plans/phase-29-stair-landings-switchbacks.md`.
- v4.23.1 — **Stair rails: landing perimeter toggle + per-side balusters** (user feedback on v4.23.0 — landings shouldn't be fully ringed by default, and baluster control should split inner/outer everywhere, not just landings). `StairRailingDef` += `landingPerimeter?` (default **false** — outer rails now stop at each landing boundary, per-flight segments, like real stairwells where walls take over; ON restores the continuous 3-edge landing wrap incl. the balcony wrap at flights=1) and `balustersInner?`/`balustersOuter?` (default to legacy `balusters`, so existing worlds are unchanged; inner = the turn/void side — in the legacy plain-stair branch `sideIsInner = (side===1)===(turn==="right")`). `computeRailPaths` now returns side-tagged paths/posts (`RailSide`); StairBuilder gates posts per side in both branches. Panel: RAILING gains Inner/Outer balusters checkboxes (replacing the single Balusters box); LANDING & FLIGHTS gains "Landing perimeter rail" (shown when railing on). Verified in-browser: 3-flight default = outer rails terminating at landings; perimeter ON + outer balusters OFF = bare perimeter bars, posted inner rail.
- v4.23.2 — **Independent landing material.** `StairDef` += `landingMaterial?`/`landingMaterialOverrides?` (absent → body material, same fallback chain as risers). Landing slab faces moved from the body accumulator into their own accumulator/mesh (`landAcc`, emitted only when landings exist — plain stairs still produce exactly two meshes), selectable, own tileScale/UV offsets. `StairMatView` gains a LANDING MaterialSection (shown only when `stair.landing` is set); App.tsx material preloader includes `landingMaterial`. Verified in-browser on the user's 4-flight stairwell: white landings over concrete treads.
- v4.23.3 — **Stair railings: colliders + material.** (1) Rails were visual-only; characters walked through them. `StairBuilder` now collects one thin barrier-wall descriptor per rail run (`StairRailBarrier` in ColliderBuilder) — an oriented cuboid from the walking surface up to handrail height, along each run's line, built regardless of the topRail/baluster visual toggles — and `ColliderBuilder.registerStairRailings` registers them via the same `createStaticCollider` path as walls/steps/landings. Merged into the stair's returned colliders, so they're tracked and removed on rebuild (verified: toggling `hasRailing` moved the collider count 60↔72 on a 4-flight stair = 12 barriers; both the legacy plain-stair rails and the Phase-29 path rails emit barriers from the same slope basis the visible bars use). (2) `StairDef` += `railingMaterial?`/`railingMaterialOverrides?` (absent → built-in metal grey `0x9aabb8`; authored material uses the shared cached instance, overrides clone/own). `StairMatView` gains a RAILING MaterialSection when `hasRailing`; App.tsx preloader includes `railingMaterial`. Verified in-browser: rails/posts render with an assigned material (brick) as thin bars. NOTE: the live walk-through was not cleanly scripted — the console real-time input harness produced non-physical speeds (70+ m/s teleport-slide) that clip/fall regardless of collision, so blocking rests on the barriers being byte-identical static cuboids to the world's other (proven-blocking) colliders.
- v4.23.5 — **Rail posts: doubled end/corner balusters removed.** `computeRailPaths` placed a post at every path vertex including the free overhang tip (0.15m from tread-anchor 0, floating off the stringer) and kept the legacy "always include the top step" anchor half a step from the landing-corner post — crammed pairs at both ends of every sloped run. Paths are now tagged `freeStart` (first vertex = overhang tip → no post; the rail still overhangs, matching the legacy plain-stair look) and sloped segments skip tread anchors that crowd a corner post half a step away: the top anchor always (segment tops are landing corners), the bottom anchor unless that end is a free tip (anchor loop = `first..max(1, numSteps−1)` step `stepEvery`, `first = freeStart && i===0 ? 0 : stepEvery`). Verified numerically on the user's 4-flight stair: flight posts even at ~stepDepth spacing from anchor 0 to the flight top, then a single corner post at the landing edge.
- v4.23.6 — **Tapered rail ends on sloped runs** (user sketch: "a couple extra angles on the end instead of square"). Free ends of diagonal top rails were square cuts perpendicular to the slope, so the bottom corner jutted past the last post. New `railBarGeo(len, taperStart, taperEnd)` in StairBuilder: rail bars become `ExtrudeGeometry` of a side profile (x along bar, y up, extruded barT deep, z-centred) when either end tapers — a **raked end face** (tip keeps the full top edge; face sets back `0.4·barT` down to a chamfer point at `0.35·barT` above the underside) meeting an **underside chamfer** (`min(1.2·barT, 0.35·len)`, clamped ≥ rake). Non-tapered ends keep the `+barT/2` miter extension; both-square short-circuits to the old `BoxGeometry(len + barT)`. Applied: legacy plain branch tapers both ends (span already `anchors + 2·overhang`, unchanged); Phase-29 path branch tapers only **sloped** segments (`|segY| > 1e-6`) at **unconnected** ends (`i === 0` / `i === path.length − 2`) — level runs and slope→level miters stay square. Rail barrier colliders unchanged. Verified in-browser (Chrome MCP): bottom free ends and per-flight outer rail ends at landings show the two-angle taper; miters intact.
- v4.23.7 — **Rail-end taper corrected** (v4.23.6 shipped the wrong shape — a 1.6·barT knife wedge — and tapered free ends silently lost the path branch's `+barT/2` extension, so rails stopped visibly short of their landing corner posts). `railBarGeo` now spans exactly ±len/2 with callers baking the miter extension into `len` (path branch passes `len + railBarT` for **every** segment, restoring pre-taper reach; legacy passes its `anchors + 2·overhang` span unchanged), and a tapered tip stays where the square end was — only the corner is eased: end face raked `0.15·barT`, meeting a 45° bottom-corner chamfer `0.4·barT` (kink at 40% of face height; bars shorter than `2.5·(rake+chamfer)` stay square). Verified in-browser: tip x-extent byte-equal to the old square end; landing corner posts met flush again.
- v4.23.8 — **Rail-end taper shape v3:** user feedback on v4.23.7 — the cut sat only on the bottom corner and was still a bit big. A tapered end is now a square end with **both** tip corners clipped by 45° chamfers of `0.3·barT` (top and bottom, shorter vertical end face between them); reach unchanged. Same application rule: unconnected ends of sloped runs, inner and outer sides.
- v4.23.9 — **Chamfer all free rail ends:** the sloped-only gate left the inner rail's level top-landing crossing square; free path ends (no adjacent segment) now always chamfer, sloped or level. Mitered interior corners stay square. Verified in-browser on the user's 4-flight `worlds/stairs.json` stair.
- v4.23.18 — **Invisible climb ramps over stair flights.** New pure helper `computeStairRamps(layout)` in stairLayout (+ `STAIR_RAMP_THICK` 0.12 / `STAIR_RAMP_LIFT` 0.01): per flight, an inclined line on the step-nosing plane, starting one tread-depth before the bottom step (meeting the floor) and stopping one tread short of the top (last tread + landing are flat). `ColliderBuilder.registerStairSteps` adds one thin oriented cuboid per ramp whose top face sits `LIFT` above the nosing line — the character glides up/down stairs like a ramp instead of bumping over the per-step boxes (which stay, for side/underside collision and tread support). StairBuilder renders an editor-only cyan wireframe of each ramp (`editorOnly: true`, hidden in preview/play) — kept permanently per user approval. Verified in-browser: wireframes graze every nosing and extend one tread onto the floor.
- v4.23.17 — **Octagonal rail sections (the hex-prism step of the cheap-cylinder trick).** All rail bars switch from square to a regular **octagon** cross-section (across-flats = `barThickness`, flat top; `SEC`/`SEC_R` in StairBuilder) and posts become 8-sided `CylinderGeometry` prisms (across-flats = `postThickness`; cylinder side normals are already smooth). Combined with v4.23.16's radial normals the silhouette now reads round even at extreme closeups. Free-end tips chamfer **all around** (tip section scaled toward the axis over the last `0.3·barT`) instead of clipping just top/bottom corners; miter/butt/run cuts intersect all 8 long edges with the same planes. Legacy `railBarGeo` rebuilt on the same section via ConvexGeometry (Shape/Extrude profile dropped). Verified in-browser: bars and posts read as tubes point-blank; tips taper like capped tube ends.
- v4.23.16 — **Fake-round rail shading.** `roundNormals(geo, axis)` in StairBuilder bends side-face vertex normals radially outward from a bar's long axis (the classic cheap-cylinder trick), so square rail bars and balusters light like tubes while their silhouettes stay boxy. Faces whose normal points mostly along the axis (|n·axis| > 0.5 — end caps, tip chamfers, miter cuts) keep flat shading so ends still read as cut. Applied to every rail piece in both branches: path-mode `railBar` ConvexGeometry (axis = segment dir), legacy `railBarGeo` extrusions and its box short-circuit (local X), and all posts via the shared `postGeo()` (local Y). Verified in-browser: bars and posts show a smooth cylindrical highlight.
- v4.23.15 — **Per-edge TOP-landing rail toggles + stairwell-mouth rail.** `StairRailingDef` += `topLanding?: { sideArrive?, far?, sideExit?, close? }` — the top landing's three perimeter edges become individually toggleable (each defaults to `landingPerimeter`) plus a new 4th **close** rail (default off) spanning the stairwell mouth: from the exit corner across the phantom-flight opening and void to the arriving flight's inner rail line, where it T's into the inner rail's elbow. `computeRailPaths` builds the top landing from these toggles: consecutive ON edges share a polyline (mitered corners) and the first edge glues onto the outer path arriving up the last flight (continuous wrap); OFF edges split the chain into separate free-ended pieces (chamfered tips, tucked end posts). Perimeter ON/OFF defaults reproduce the previous geometry exactly. Panel: RAILING gains a TOP LANDING RAILS row (Arrive side / Far / Exit side / Stairwell, shown when railing on and flights > 1) writing through `updateRailing` (patch type widened to `Partial<StairRailingDef>`). Verified in-browser through the real UI: selected the stair, toggled Stairwell — the rail renders across the void mouth (matching the user's red-line sketch) and round-trips `toJSON()`.
- v4.23.14 — **End posts tuck under the rail tip:** posts at a rail's free END sat centered on the tip vertex, so half the post poked past the chamfered end face. `computeRailPaths` now pulls end-of-path posts inward along the last segment by `postT/2 + 0.3·barT` (skipped when the segment is too short), so the post sits under the bar's full section. Applies to both path endpoints (top extensions, per-flight outer rail ends, perimeter exit corners); free overhang tips still carry no post.
- v4.23.13 — **Straight handrail extension at the top landing** (user feedback — the void hook at the TOP of the stair ended in a crammed post pair + dangling tip next to the top floor/platform). The inner path's LAST landing no longer wraps behind the void: the rail levels out at the landing edge and runs one straight tread-depth (`min(stepDepth, 0.9·D)`) onto the landing, ending free with the chamfered tip over its end post — the classic top-of-stairs handrail extension. Intermediate landings keep the v4.23.12 wrap. Verified in-browser on the user's 2-flight perimeter-on stair.
- v4.23.12 — **Planar rail bends via landing ease** (user feedback on v4.23.11 — miters at the 3D void-crossing corners looked skewed, “the angles don't match”; their suggestion: level the diagonal out at the top). `computeRailPaths`' inner path now levels out at the landing edge and eases a short horizontal run (`ease = min(0.3, 0.4·D)`) onto the landing before turning: slope→level same-heading bend, flat 90° behind the void, ease back down the next flight — every bend is planar so miter sections always line up. StairBuilder classifies corners with `planarBend` (both level, or same horizontal heading) and only miters those; a genuinely 3D bend (possible only in hand-edited data now) falls back to separate pieces — the level bar runs through (+railH square extension), the sloped bar butts into its side with a vertical cut. Verified in-browser: the void wrap is clean picture-frame seams; top-landing crossing still ends in a chamfered tip.
- v4.23.11 — **Mitered rail corner joints** (user feedback on v4.23.10 — chamfered stubs on the horizontal landing rails looked wrong; joints should be “accurately joined”). Path-railing bars are now built per segment in world space via `ConvexGeometry` (`railBar` in StairBuilder; same addons import as ShapeBuilder): an **interior corner** end is cut on the bisector plane `n = normalize(d_in + d_out)` through the shared vertex — both adjacent bars use the same plane, so the seam closes with no stubs or overlap (verified numerically: all 8 cut vertices coplanar within 1e-15 for level-90°, slope→level, and slope→lateral-3D corners) — and a **free path end** keeps the v4.23.8 chamfered tip (45° clips of `0.3·barT` on both tip corners; square when the bar is shorter than `3·chamf`, or on a degenerate 180° corner). Meshes carry no rotation (vertices are pre-oriented, positioned at the segment midpoint); rail barriers keep the old quat basis; the legacy plain-stair branch keeps `railBarGeo`. Verified in-browser on the user's 4-flight stair: landing joints are clean picture-frame seams, bottom tips + the top-landing crossing's free end chamfered.
- v4.23.10 — **Chamfer corner stubs too:** the `+barT/2` miter stubs protruding past landing corner joints were still square and read as unchamfered ends. Every rail-bar end now chamfers (`railBarGeo(len + barT, true, true)` for all path segments); the full-thickness overlap still closes the corner. Verified in-browser at a landing corner joint.
- v4.24.0 — **Phase 30 — Branching dialogue trees.** Replaces the linear `lines[]` dialogue stub (the "Branching dialogue → Phase 12" limitation) with a real conversation system: multiple response options, options gated by conditions on gameState flags, options that run script actions when picked (set flags / give-receive "items" as gameState counters — no inventory system, per the v4.1 design), chained nodes. **Types** (`src/types.ts`): `DialogueTreeDef { id (dlg_<uuid8>), label, speaker, portrait?, startNode, nodes }`, `DialogueNode { id, lines[], speaker?/portrait? overrides, options[] }`, `DialogueOption { id, text, conditions?: ScriptCondition[] (ALL must pass or hidden), actions?: ScriptAction[] (run on pick), next?: node id (absent or missing node = end) }` — branching happens only via options; a node with zero visible options ends after its last line. Storage: **zone-level registry** `ZoneDef.dialogues?`; `ScriptAction.dialogueId?` references it (`dialogue?: DialogueDef` kept as a deprecated runtime fallback). New trigger **`on_dialogue_end`** (targetId = dialogue id; fires on close, including cancel — but not for legacy inline dialogues). Bus: `dialogue:show` payload += `options?: { text, hasNext }[]` (condition-pre-filtered; `hasNext` computed against existing nodes so a dangling `next` degrades to "end"); new `dialogue:choose { index }`. **Runtime**: new **`src/scripting/DialogueRunner.ts`** owned by ScriptEngine (attach/detach in `activate`/`deactivate`) walks the tree — emits `dialogue:show` per node, hears `dialogue:choose`, dispatches the option's actions through the engine (guards made public as `checkConditions`/`runActions`), advances or lets the overlay close; on `dialogue:closed` fires `on_dialogue_end` (`wrapLegacyDialogue` wraps inline data with id `""` → no end trigger). Conditions re-checked per node display, so a flag set mid-conversation gates later options in the same dialogue; an option effect that itself shows a dialogue restarts the runner (last-writer-wins). `ScriptEngine.findDialogue(id)` scans all zones at dispatch (cross-zone/world-script safe). **DialogueOverlay** shows the option list once the last line renders: `menu:nav` moves the highlight (wrap), `action:confirm`/row-click emits `dialogue:choose` (box-click advance disabled while options are up), `hasNext:false` selection also closes. Zero input-layer work — ControlSchemeManager's dialogue menu-mode already emits both events for kbm/gamepad/touch; RuntimeApp needed no change (types dialogue state off `DialogueOverlayProps["dialogue"]`). **Migration** `migrateDialogues(file)` in WorldLoader, called at both pipeline sites (App.tsx load + SceneRouter): shape-guarded per action (`dialogue && !dialogueId`, no version bump), wraps each legacy inline dialogue into a single-node tree in the owning zone (world-script dialogues park in zones[0]). **Editor**: ScriptPanel gains a 4th **DIALOGUE** tab — DialogueList/DialogueEditor mirroring ScriptList/ScriptEditor; node cards (lines textarea, speaker override, delete disabled on the start node) with per-node OptionRows (response text; next-node dropdown incl. "— end conversation —" and red `(missing!)` preservation; nested Show-if reusing `ConditionRow`; On-pick reusing `ActionRow`); render-time-only validation (dangling-`next` badge/warning + unreachable-nodes note — never blocks saves); the `show_dialogue` ActionFields case is now a dialogue-picker dropdown (custom id preserved) and `on_dialogue_end` joins TRIGGER_TYPES with a dialogue TargetPicker case. Editor persistence mirrors the scripts pattern (App `zoneDialogues` state + `handleZoneDialoguesChange` direct mutation + `setIsDirty`, threaded through LeftPanel; serialization free via `toJSON()`). Verified in-browser end-to-end: gated option hidden on first pass, visible after its flag is set mid-conversation; option effects set `met_npc` and granted coins +5 via `adjust_number`; `on_dialogue_end` fired on end-option and on cancel; pause menu stayed closed on cancel-with-dialogue-open (Phase 24b invariant); migration verified on a synthetic legacy file; DIALOGUE-tab UI exercised via real clicks. Plan: `plans/phase-30-dialogue-trees.md`.
- v4.24.1 — **Dialogue: demo scenes converted to the registry format; runtime inline fallback removed; authoring guide.** The only real legacy data — `public/demo/scenes/level_01/02.json`'s inline `show_dialogue` dialogues — now uses `ZoneDef.dialogues` + `dialogueId` natively (level_01's greeter upgraded to a two-node **branching** tree, `dlg_l1_welcome`, so the demo showcases Phase 30; level_02's carryover dialogue converted 1:1). With both load pipelines running `migrateDialogues`, the runtime inline fallback was dead code and is removed: `wrapLegacyDialogue` deleted from DialogueRunner, `show_dialogue` dispatch no longer reads `action.dialogue` (resolves `dialogueId` or warns), and the runner's fire of `on_dialogue_end` is unconditional (no more id-`""` legacy case). `ScriptAction.dialogue?` stays as a deprecated type field — it's the migration's *input* — but nothing at runtime reads it. New **`DIALOGUES.md`**: human-friendly authoring guide (mental model, DIALOGUE-tab walkthrough, NPC hookup, items-as-counters pattern, validation gotchas, JSON reference). Verified in-browser in the runtime shell: New Game → greeter fires → both options render → "What's the purple box?" chains to n2 → close sets nothing extra; `router.go("level_02")` → carryover dialogue resolves from the new registry; console clean.
- v4.25.1 — **Mover push-out + phase-31 performance pass.** Moving geometry now **pushes the player** instead of sweeping through a stationary capsule (user report: the spinning wall "goes right through me" — kinematic-vs-kinematic pairs generate no solver contacts, and the KCC only resolves the player's own attempted movement). **Push**: mover colliders (`PhysicsWorld.createColliderOn` — only movers use it) and the player capsule (`CharacterBody.init`) enable `ActiveCollisionTypes.KINEMATIC_KINEMATIC`, so Rapier's narrow phase produces real contact manifolds for capsule↔mover pairs — still **broad-phase gated** (zero narrow-phase work until AABBs touch). New `CharacterBody.moverPush(isMoverBody)`: scans `contactPairsWith(capsule)` post-step via **persistent callback fields + instance scratch** (no per-frame closures/allocations), filters to mover bodies, accumulates depenetration along the manifold normal (deepest `contactDist < 0` per manifold, flip-aware sign), clamps to `MAX_PUSH_PER_FRAME = 0.3`; `CharacterController` adds it into `dir` **before** `computeColliderMovement` so walls still block the shove. **Perf pass over phase 31**: (1) the whole carry+push block in `CharacterController.update` is gated on new `MoverSystem.anyRunning()` — a world with no live movers pays **zero** (no ground raycast, no contact scan); (2) `carryDelta` linear scan → O(1) `_byHandle` Map (maintained in register/unregister, also backs the bound `isMoverBody` predicate — no per-frame closure); (3) `MoverSystem.update` **skips idle entries entirely** (pose applied on the stopping frame; carry `delta` zeroed on every running→stopped transition — `once`-end clamp, `stop` op, pause toggle — so a rider never inherits a stale delta); (4) `setNextKinematicTranslation/Rotation` object literals → module-level reused `{x,y,z}`/`{x,y,z,w}` (Rapier copies into WASM synchronously), killing 2 allocations per mover per frame. Verified in-browser (manual stepping, live `physicsWorld` via HMR-stamped URL): spinning wall shoves a player standing in its sweep from r=1.2 around and out past r=2.32 (no pass-through; max transient center-dip 2cm on single frames); closing demo door bulldozes a doorway-standing player from x=2 to x=0.49 — flush against the end face, never inside the panel; lift riding unchanged with contacts active (foot-vs-slab −1mm…+45mm, grounded throughout — no carry/push fight); `anyRunning` false in editor and after stopping all four demo movers; console clean; autosave byte-identical (no world mutations).
- v4.25.0 — **Phase 31 — Moving geometry / animated world objects.** Authored, scripted movement for placed geometry — rising/falling platforms, spinning walls, sliding doors, oscillating hazards — with **Rapier kinematic bodies updated each frame to match the mesh**, plus player translation-carry so moving platforms are rideable. **Schema** (`src/types.ts`, additive — no migration): `MoverDef { enabled, kind: "slide"|"spin", axis (entity-local), distance?/duration?/dwell?/mode?("loop" ping-pong | "once" stop-at-far-end)/phase? (slide), speed? deg/s (spin), autoStart? }` as `mover?` on **WorldObject / PlatformDef / ShapeDef** (walls/floors/stairs excluded; spinning walls & door panels are authored as box shapes/platforms). The authored `position`/`rotation` is the **rest pose**; movers never write WorldState — they drive mesh + kinematic body only, run **only between `preview:start`/`preview:stop`** (both modes), and snap everything back to rest on stop. Slide travels along the entity-LOCAL axis (a rotated door slides along its own width) with sinusoidal ease-in-out + optional end dwell; spin is linear deg/s about the local axis. **Physics**: `PhysicsWorld.createKinematicBody(pos, rot?)` (`kinematicPositionBased`, carries the full rest pose) + `createColliderOn(desc, body)`; `removeCollider`'s empty-parent cleanup frees kinematic bodies too. `ColliderBuilder.registerPlatform/registerShape/registerShapeTrimesh` take an optional `body` and then build the desc **body-relative** (platform: slab lift only; shapes: identity — points already local); `registerAttachedColliders(obj, colliders, body?)` builds descs from a zero-pose clone of the object through the same `colliderWorldTransform` math (solid colliders share ONE kinematic body per object; **sensors stay on their own fixed body**). `PlatformBuilder`/`ShapeBuilder` create the body when `mover?.enabled` and return it as `moverBody` in the build output — **CSG-cut and polygon/node-backed platforms never get one** (world-space-baked geometry can't animate; the panel hides MOTION for polygon platforms). **New `src/world/MoverSystem.ts`**: registry keyed by entity id (`register` captures per-mesh rest transforms — off-origin meshes like platform railings orbit correctly under spin via delta-rotation-about-origin; `register` overwrites so rebuilds re-register), `update(dt)` runs **before `physicsWorld.step`** in BOTH shells (App.tsx + RuntimeApp.tsx register it first; the step consumes fresh `setNextKinematicTranslation/Rotation` targets), zero per-frame allocations (module scratch objects), `mover:set { targetId, op }` bus handler (`toggle` on a `once` slide heads for the other end = door open/close), per-body `carryDelta` map, full rest reset + hard body teleport on `preview:stop`. **ZoneManager** (ctor gains `MoverSystem`): build paths register (`_syncPlatformMover`/`_syncShapeMover`/object path inside `_buildObjectColliders`, which also creates the object's kinematic body), remove/unload paths unregister; the `object:updated` collider-rebuild condition extended with `changes.mover`; the shape-move fast path (`move_object` on shapes) is **skipped for mover shapes** (their collider is body-parented — `setTranslation` would fight the mover). **Player carry** (translation only — spinning platforms don't rotate the player, deferred): `CharacterBody.groundBodyHandle()` (one short downward ray, sensors+self excluded) → `CharacterController.update` adds the mover's per-frame delta into the desired move **before** `computeColliderMovement`, so the KCC still resolves walls while carried; `MoverSystem` is threaded App→PreviewController→CharacterController. **Scripting**: `ActionType` += `start_mover`/`stop_mover`/`toggle_mover` → one dispatch case emitting `mover:set` per `_resolveTargets` id (group fan-out); ScriptPanel offers them with an object+group+platform+shape target picker — `ActionTargetPicker` gained a **Shapes optgroup** (`zoneShapes` threaded through the App→LeftPanel→ScriptPanel chain; the despawn picker now lists shapes too, which `_setEntityHidden` already supported at runtime). **Editor UI**: shared `MoverSection` (LANDING & FLIGHTS pattern) in the Platform/Shape/Object geometry screens — MOTION checkbox, Slide/Spin + axis + Loop/Once segmented buttons, debounced distance/duration/dwell/phase/speed fields, auto-start; always commits the **whole** `mover` object (nested-field shallow-merge hazard). `window.__movers` DEV global in both shells. Verified in-browser (hidden-tab manual stepping — note: `import('/src/physics/PhysicsWorld.ts')` returned a DEAD duplicate module this session; the live instance needs the HMR-versioned URL from `performance.getEntriesByType('resource')`): slide eases rest→rest+distance with dwell and the body tracking the mesh exactly; spin quaternions advance in lockstep; a `once` door toggles open exactly `distance` and back, via `runAction` AND via a trigger-volume script through the real index; preview:stop resets poses/timers exactly; the player rides the ferry through a full cycle incl. reversal and rides the lift up AND down grounded (no micro-falls); platform edit → rebuild re-registers at the new origin with zero body leak (52→52); a real click→Geometry→MOTION panel edit persisted the full mover object; a cold reload re-registers all movers from the autosave; the runtime shell boots MoverSystem clean. Demo movers (lift, ferry, spinning wall, trigger-toggled sliding door) left in the working world by user request. Plan: `plans/phase-31-moving-geometry.md`.
- v4.24.2 — **Keyboard + gamepad-stick menu navigation** (gap found answering "how do I select dialogue options with the keyboard": you couldn't — `menuNav` was only ever produced by the gamepad d-pad, so kbm players could only pick the highlighted/first option or use the mouse). (1) **kbm**: `BindingsConfig.kbm` += `menuNav: { up, down }` (defaults `ArrowUp`/`KeyW` and `ArrowDown`/`KeyS` — movement keys are safe to reuse since movement is zeroed in menu mode and `menuNav` is ignored outside it); `KeyboardMouseSource` queues nav edges on keydown exactly like `confirm` (OS key-repeat re-queues, so a held arrow scrolls); `loadBindings` deep-merges the new nested field so stored configs pick up defaults. (2) **Gamepad left stick**: `GamepadSource` fires `menuNav` when raw LY crosses ±`STICK_NAV_THRESHOLD` (0.5) — edge-only with re-arm on return to center (one step per flick, no per-frame repeat), prev-Y cleared on detach/disconnect like button edges. Touch had no gap (option rows / menu buttons are tappable). Benefits both consumers of `menu:nav`: DialogueOverlay options **and** PauseMenu (Resume/Exit is now keyboard-navigable too). Verified in-browser through the real listener chain (real `KeyboardEvent`s on `document` + manually stepped `__preview.input.update()` on the hidden tab; stubbed `navigator.getGamepads` for the stick): ArrowDown/KeyW moved the dialogue highlight, E selected, pause menu arrowed Exit↔Resume and Enter resumed, stick flick emitted exactly one nav per crossing across held frames. Watch out when testing this synthetically: nav + confirm dispatched in the SAME synchronous snippet reads a stale React closure (confirm fires against the pre-nav selection) — real key presses span renders; drive them in separate tool calls.
- v4.26.0 — **Phase 32 — Item registry + inventory (bag) system.** The presentation/ergonomics layer over Phase 30's "items = gameState counters" model — nothing changes underneath: an item's count still lives at gameplay-state key **`inv.<itemId>`**, so saves, `on_state_changed`, STATE-tab defaults, and dialogue-option effects work unchanged. **Types** (`src/types.ts`): `ItemDef { id (itm_<uuid8>), label, icon? (bare URL/path → <img src>), description?, stackSize? }`; **world-level registry** `WorldConfig.items?` (serializes free via `toJSON()`); `ActionType` += `give_item`/`take_item` (`ScriptAction.itemId`/`count`, default 1); `ConditionType` += `has_item` (`ScriptCondition.itemId`/`count` — owned ≥ count); `PlayerSettings.bagStyle?` (bag style-registry key, default "list"); bus `bag:toggle` (manager → shells) / `bag:show`/`bag:closed` (shells → ControlSchemeManager); `ActionState.bagPressed` edge. **Engine**: new `src/scripting/inventory.ts` (`INV_PREFIX`/`invKey`, pure `ownedItems(world)` — snapshot scan joined against the registry, registry-ordered, unregistered ids as `def:null` stragglers); ScriptEngine dispatch clamps **inline** (gameState only clamps registered keys): give = `min(cur+n, stackSize ?? ∞)`, take = `max(cur−n, 0)` (no failure signal — authors gate with `has_item`); unknown itemId warns but still operates on the raw key (the "(custom)" picker philosophy). Dialogue options get all three for free (plain ScriptCondition/ScriptAction). **Input** (bindings deep-merge per the v4.24.2 precedent): kbm `bag: ["KeyI","Tab"]` (edge-queued, `e.repeat` ignored, `preventDefault` so Tab doesn't move focus), gamepad `buttons.bag: [3]` (Y), touch 🎒 button in TouchControlsOverlay (below ⚙, `shared.bagQueued`); ControlSchemeManager gains a **third menu-mode client** (`_bagOpen` via bag:show/closed) and always emits `bag:toggle` on the edge (preserved through menu-mode zeroing like cancel/menuNav so the same key closes the bag) — the **shells decide**: toggle ignored while a dialogue/pause is open and in occlusion mode (Tab = vantage switch there); `action:cancel` cascade order is dialogue → bag → pause; bag state cleared on `preview:stop`. **Bag UI** `src/ui/BagOverlay.tsx` (view-only v1), deliberately split for future per-game bag styles: *data* (`ownedItems`) / *container* (bus wiring: `menu:nav` highlight wrap, `action:confirm` closes, `state:changed` live-refresh — a give_item behind the open bag updates rows live) / *style renderer* (pure props `{items, selectedIndex, onSelect, onClose}`) picked from `BAG_STYLES[playerSettings.bagStyle ?? "list"]` — one entry ships (`list`: icon/label/×count rows, highlighted row's description below, "Nothing yet." empty state, unregistered ids dimmed-italic raw-key rows); adding a style later = component + registry entry + (once ≥2) a PlayerSettings dropdown, zero plumbing. Mounted in both shells; PreviewHUD hints gain `I · bag` / `Y · bag`. **Editor**: ScriptPanel gains a 5th **ITEMS** tab (`ItemsEditor` mirroring SchemaEditor: label/icon/stackSize/description rows + id badge showing the `inv.<id>` key; delete-confirm notes scripts keep the raw id); persistence mirrors the *stateSchema* pattern (App `worldItems` state + `handleWorldItemsChange` `world.transaction`, NOT the zone-dialogues pattern — items are world data); `worldItems` threads the whole App→LeftPanel→ScriptPanel→ScriptEditor→ActionRow→ActionFields chain **plus ConditionRow** (first list prop it's needed); shared `ItemPicker` dropdown (custom-id preservation) in give/take ActionFields cases (+ count field) and the has_item ConditionRow case. **Pickups are scripts** (recipe: interactable object, `on_interact` → `give_item` + `despawn_object`, oneShot). Verified in-browser end-to-end: 2 items authored via the real ITEMS tab (round-trip in `toJSON().world.items`); pickup script gave ×2, despawned, oneShot held; stackSize capped 99→5, take floored →0; `has_item` ≥ semantics exact; real `KeyI` opened the bag (rows/counts/description), live-updated ×3→×4 behind the open bag, `menu:nav` moved the highlight, real `Tab` closed, Enter-as-confirm closed **without** opening pause behind; toggle correctly suppressed during dialogue AND pause; stubbed gamepad Y toggled; bag cleared on preview exit; runtime shell: I opens, "Nothing yet.", HUD hint, unregistered-id fallback row live. Plan: `plans/phase-32-inventory.md`.
- v4.27.0 — **Phase 33 — Projects: multi-scene games, auto-generated manifest, shared game.json.** Opt-in project layer over the single-scene editor (nothing changes without one): a project = a folder — default home **`public/games/<id>/`**, dev-server-served at `/games/<id>/…` so **save = instantly playable** in the runtime shell (automates PUBLISHING_GUIDE §0) — holding an auto-generated `manifest.json` (`assetsBase:"/"`, `game:"game.json"`), a shared **`game.json`** (`GameConfig { gameVersion:1, items?, stateSchema? }` — the fix for "common items shouldn't be re-made per level"), and `scenes/<sceneId>.json` (exact editor save format; scene id = manifest key = filename slug — `SceneFile` stays id-free). **Merge seam**: `WorldState` gains session-only `gameItems`/`gameStateSchema` (never serialized — `toJSON()` hand-builds output, `activeZoneId` precedent), set by App (project open) and SceneRouter (runtime); `itemRegistry(world)` in `scripting/inventory.ts` merges game-under-scene (scene wins by id) and is now the registry read for both `ownedItems` (bag) and ScriptEngine give/take; state schema merges the same way at both `configureSchema` sites (App preview:start + SceneRouter, game spread under scene, classic DEFAULT only when neither exists). **Runtime**: `RuntimeManifest.game?` + `LoadedManifest.game` — `loadManifest` fetches it best-effort (a broken game.json warns, never bricks); SceneRouter injects after `loadFromJSON`. Committed regression fixture **`public/games/pj-fixture/`** (2 scenes, shared `itm_key` w/ stackSize, `quest.stage` schema overridden by scene 2). **`src/project/ProjectStore.ts`** (new dir): ALL project file IO — create (makes `<id>/` inside the picked parent)/open (loud manifest validation, forgiving game.json)/loadScene/saveScene/addScene/removeScene/writeManifest/writeGame/`publishTo(target)` (copies manifest+game+scenes INTO the picked folder; assets deliberately not copied), plus `slugifyId`/`uniqueSceneId` and IDB session persistence (`lastProject = {dir, name, sceneId}` via fileHandleStore; `queryPermission` on boot, **`requestPermission` from a user gesture** — first use in the codebase, shimmed in fsa.d.ts alongside queryPermission). **Editor wiring (App.tsx)**: `project` ctx + ref; Save routes write-through to the project (scene+game+manifest — the single-file picker path is skipped); scene switch auto-saves current then loads target (no prompt; undo clears on world:loaded as usual); New/Load close the project (saving first); boot restores the last project silently when permission is still granted (keeping the autosave-restored world when there is one — it may be fresher than the file — but **loading the scene from disk when the autosave did not restore**; adopting the demo-zone fallback over a real scene id was the v4.29.4 data-loss bug) or shows an amber REOPEN button (the requestPermission gesture) when not; ITEMS tab edits the **game** registry while a project is open (scene-level `WorldConfig.items` still honored via the merge, not editable v1; game config is outside the undo journal). **TopBar**: PROJ ▾ popover (New/Open Project — first popover pattern in the codebase) or, with a project open: name label + scene `<select>` (entry marked ★) + `+` add scene + green `▶` Play (saves, probes `/games/<id>/manifest.json`, id-checks to dodge a shadowing folder, opens the runtime; helpful alert when the project isn't under `public/games`) + `⋯` menu (entry-scene select, Publish…, Delete scene [entry/last blocked], Close). **ScriptPanel**: `load_scene` becomes a scene-id dropdown when a project is open (`projectSceneIds` threaded down the worldItems chain incl. dialogue-option effects; "(not in project)" preservation; free text otherwise). Scene **rename deferred** (needs cross-scene `load_scene` ref rewriting). Verified in-browser end-to-end (FSA pickers stubbed with OPFS per TESTING.md §9; runtime against the committed fixture): New Project through the real UI produced correct manifest/game/scene bytes (scene file == `toJSON()`); add-scene switched to a fresh scene and back with write-through both ways; ITEMS wrote `game.json` only (not the scene); load_scene dropdown listed both ids; Publish copied 4 files + assets warning; **page reload silently re-adopted the project from IDB** with merged items intact; Play fallback alerted for the non-served OPFS project; close-project restored classic mode; fixture boot: `quest.stage` seeded 0, shared item def resolved cross-scene with stackSize clamp, scene-2 schema override won while values persisted. Plan: `plans/phase-33-projects.md`.
- v4.27.1 — **New Project / Publish: folder picker before any prompt** (user report: "named the project… it said it would prompt me to choose a folder but it did not"). `window.prompt()`/`alert()`/`confirm()` **consume Chrome's transient user activation**, so calling `showDirectoryPicker` after them throws a gesture SecurityError — which only landed in the console, so the flow looked like a silent no-op. New Project now opens the picker FIRST (fresh click activation), then prompts for the name (the prompt names the picked folder); Publish reordered the same way (picker → save → copy); both flows now `alert()` real failures instead of console-only. The picker-destination hint moved to the popover items' tooltips. **Testing lesson (recorded in TESTING.md-adjacent memory): stubbing BOTH the prompt and the picker in automation hides the user-activation rule — the dialog ordering needs a real-click check.** Verified: stubbed-order assertion (picker fires before prompt) + flow completes; real-click check by the user.
- v4.27.2 — **New Project gets a real modal** (user feedback on v4.27.1: the name prompt still appeared before you knew which folder to pick). New **`src/ui/NewProjectModal.tsx`** (ZoneNamingDialog idiom): NAME input + LOCATION row with a "Choose folder…" button (shows the picked folder, `public/games` guidance text visible in the dialog), Create gated on name+folder, inline error display. The directory picker runs off its own button click — every native dialog gets its own fresh user activation, so the v4.27.1 gesture ordering can never regress. App: `handleProjectNew` just opens the modal; creation logic moved to `handleProjectCreate(name, parentDir)`. Verified in-browser through the real modal (stubbed picker): Create disabled → name+folder → enabled → project created and adopted.
- v4.27.3 — **New Project modal: SCENE 1 choice** (user feedback: created a project and "it's just the same level/scene" — the always-adopt-current-world behavior surprised when a fresh start was expected). The modal gains a segmented **SCENE 1** selector: **Current world** (default — the safe single-scene→project migration path, nothing can be lost) or **Blank scene** (fresh `scene_01` "Scene 1" via `makeFreshScene`, the New-button semantics, with an amber in-dialog warning that the currently edited world gets replaced). `onConfirm` gains `startBlank`; `handleProjectCreate` branches. Verified in-browser (OPFS-stubbed picker; the user's live project pointer was IDB-stashed and restored around the test): blank path produced `scene_01` + an empty "Scene 1" world; warning renders on selecting Blank.
- v4.27.4 — **New Project modal: editable SCENE 1 ID** (user: "I don't remember naming it new-world" — the id was auto-slugified from the world's default `metadata.name` "New World", which is not editable anywhere in the UI, so the first scene's permanent id came from a name the user never chose). The modal gains a **SCENE 1 ID** field, prefilled from the current world's name slug (or `scene_01` when Blank is selected, while untouched) with a live `scenes/<slug>.json` preview and a note that renaming isn't supported yet; the confirm passes the sanitized id through (`onConfirm` gains `sceneId`; `handleProjectCreate` uses it for both modes). Create is gated on a non-empty slug.
- v4.27.5 — **Per-scene editor camera persistence** (user report: loading a scene/project scene leaves the camera at the near-origin default). `SceneMetadata.editorCamera?: EditorCameraPose { focus, radius, phi, theta }` — editor-only convenience data, ignored by the runtime. `EditorCamera` gains `getPose()`/`setPose()` (set both current AND target orbit state → snap, not lerp; `_applyCamera()` immediately). **Stamped on every explicit save** (`stampCameraPose()` in App: handleSave, project scene switch/add/close, project create adopt path) and **restored at the end of `handleLoadFromJSON`** — which every load path funnels through (boot autosave restore, file Load, project open/scene switch/blank create), so one restore point covers them all. Deliberately NOT stamped by the periodic autosave tick: a camera-only change must not defeat the v4.14.1 "unchanged tab never writes" stale-tab gate (the autosave still carries whatever pose the last explicit save stamped). Old files without the field keep today's behavior. Verified in-browser on a real 2-scene project: moved the camera to a distinctive pose, switched scenes and back — pose snapped back exactly (focus/radius/phi/theta round-trip), stamp visible in metadata.
- v4.28.0 — **Phase 34 — Ladders**: first-class `LadderDef` zone entity (rails+rungs `LadderBuilder`, thin solid collider, auto-built climb-column + top-lip **sensor pair** registered handle→ladderId in ZoneManager's `ladderSensorMap`); TriggerSystem emits deduped `ladder:zone-enter/exit`; CharacterController gains a **climb movement mode** (auto-mount on move-toward dot ≥ 0.5, KCC bypassed via `CharacterBody.setClimbTranslation`, X/Z lerped onto the climb line, W/S vertical at `PlayerSettings.climbSpeed`, jump-release + 0.4s re-grab cooldown, fixed-marker top dismount, top-zone auto-remount AND "Climb down" interact prompt, unconditional `_exitClimb()` wired to teleport/rebuild/delete/dispose — no soft locks); `LocomotionState` gains `"climb"` (plays the Climb clip at input-proportional `timeScale`, 0 = hanging); editor: Ladder variant under the Stair toolbar button, `LadderTool` click-place, LADDER PropertiesPanel geo/mat screens, undo via journal `"ladder"` kind. Plan: `plans/phase-34-ladders.md`; acceptance: `test-plans/phase-34-ladders.md`.
- v4.32.7 — **Tread (step-top) texture variation — the riser jitter, now on the walking surface too.** User: "the risers now have a texture variation, but the steps should too." New `StairDef.treadUvJitter?` (0–1, absent → 0 = uniform, existing stairs unchanged) mirrors `riserUvJitter`: in `StairBuilder`, the `+Y` tread face of each step switches from `pushQuad` to `pushQuadUV` with a deterministic per-step offset from `hash01(stair.id, flightIdx, stepIdx, lane)` — using **lanes 2/3** (the riser uses 0/1) so a step's tread and riser don't shift by the same amount. Only the tread top is varied; the stringer sides/soffit/caps keep their continuous world-space UVs (jitter would break the flow). New stairs from `StairTool` start at `treadUvJitter: 0.5` (matching the riser default). Panel: a **TEXTURE VARIATION** slider in the **BODY** `MaterialSection` (via the existing `extraTilingControls` slot, same as the RISERS slider). Verified in-browser on the user's 19-step stair: with jitter unset every tread UV started at (0,0); setting it to 0.8 gave 19 distinct per-step offsets all within 0–0.8; the BODY-section slider reflected the value and a real slider drag persisted `treadUvJitter: 0.3` through `toJSON`.
- v4.29.16 — **Riser TEXTURE VARIATION slider moved inside the RISERS material section + 50% default on new stairs.** User feedback: the slider sat outside the collapsible RISERS `MaterialSection`, so with the section collapsed it looked like the only riser control ("suddenly texture-variation is the ONLY option I have for riser materials"). `MaterialSection` gains an optional `extraTilingControls` render slot (rendered with the TILE/OFFSET cluster, before MAPS); StairMatView passes the slider through it. New stairs from StairTool now start with `riserUvJitter: 0.5` so the anti-repetition effect is on by default (existing stairs unchanged: absent → 0).
- v4.29.15 — **Riser texture variation (per-step UV jitter).** User report: every riser shows the identical crop of the texture ("the same five inches over and over"), so a stair front looks artificially repetitive. New `StairDef.riserUvJitter?` (0–1, absent → 0 = exact previous output): each riser face gets a pseudo-random UV offset (tiling offset only, never scale) so it shows a different window of the same texture — baked into UVs at build time, zero runtime cost, safe under the project-wide RepeatWrapping. Deterministic by construction: offsets come from new `hash01(key, ...lanes)` in UVUtils (FNV-1a + avalanche; builders must never use `Math.random`) keyed on `stair.id` + flight index + step index, and both shells build stairs through the same `StairBuilder` — editor and running game always match. `emitFlight` gains a `flightIdx` param (else flight 2 would repeat flight 1's offsets); the riser quad now emits via `pushQuadUV` with the offset added to all four corners. Panel: TEXTURE VARIATION percent slider under the RISERS material section (debounced commit). Treads, stringer/soffit (continuous UVs), caps, and landings deliberately untouched.
- v4.29.14 — **Streaked landing side textures (fix).** User report: landing/platform side faces sometimes render with badly stretched texture streaks while the tops tile fine, inconsistently between landings. Cause: `emitLanding`'s `quadN` corrects face winding on mirrored ("left"-turn) stairwell frames by swapping quad corners `b`/`d`, but `pushQuad` assigns UVs by push order — so every flipped face got its U/V tiling axes **transposed**. Sides are `du × dh` (meters × ~0.2m slab thickness), so the meter-scale repeat was crushed onto the thickness axis and stretched across the length → streaks; tops (`du × dv`, both meter-scale) barely showed it, and only mirrored frames flip — hence "some landings good, some streaked". Fix: when flipping, emit via `pushQuadUV` with reversed corner order `(a, d, c, b)` and each corner keeping its own UV, preserving both the winding correction and world-scale tiling. Steps/stringers were never affected (fixed-winding `pushQuad`/`pushQuadUV` paths).
- v4.29.9 — **Mover carry fix: GROUND_STICK × moving ground = stutter + slide-off (user report: standing on the horizontal ferry "feels like it's stuttering… and I kind of slide", FPS, runtime).** Root cause bisected empirically: v4.28.14's GROUND_STICK downward bias, applied every grounded frame, presses the capsule into its ground contact — and when that ground is a MOVING kinematic mover body, Rapier's `computeColliderMovement` injects the platform's own per-step motion into the resolve: applied movement oscillates **0× / 2×** of desired (desired was verified exact every frame; net ≈ half-to-double the platform travel) ⇒ visible stutter + slow drift off the platform. Platform stopped ⇒ KCC exact; platform moving ⇒ corrupted — reproduced identically in BOTH shells via faithful full-callback-chain stepping (the July-10 "clean" verifications predate v4.28.14). Fix in `CharacterController.update`: **never apply the stick while riding a mover**; the mover ground handle is cached (`_moverGroundHandle`, refreshed on grounded frames, kept through the coyote window) so walking-induced `computedGrounded` flicker — the thing the stick fixed — can't drop carry frames on a platform either. Verified (editor + runtime shells, full-chain stepping): standing ride exact over 4s (Σplayer 4.6318 vs Σplatform 4.6194) and over a full 8s ping-pong cycle (net 0 vs 0, max relative excursion 2.6cm = the one-frame lag); W/S shuffle-walking on the moving ferry drifts 2cm over 208 frames, grounded 100%; jumps fire + land on the ferry (landing back on it) and on static floor (stick path untouched). **Debugging gotchas recorded:** `__test.enterGame()` before the runtime's real New Game button creates a SECOND kinematic capsule co-located with the player (the orphan intercepts the carry ray → fake total-carry-failure — use the real menu button, then verify exactly one non-mover kinematic body); out-of-band `kcc.computeColliderMovement` probes are frame-phase-dependent on moving ground — only trust in-chain measurements.
- v4.29.8 — **Authored light flicker (flame / electric).** `LightDef.flicker?: { style: "flame"|"electric", amount, speed }` + a FLICKER segmented row (None/🔥 Flame/⚡ Electric + AMOUNT/SPEED) in LightView. Driven by new `ZoneManager.updateLights(dt)` registered in both shells' `scene.onUpdate` — intensity-only per frame (shader-stable, frozen static shadows untouched), zero allocations (state on LightEntry), gated to preview/game like movers (`_flickerActive` on preview:start/stop; editor shows steady authored intensity; `_restoreLightStates` resets). flame = layered incommensurate sines (smooth wobble, never off; amount = depth); electric = hard on/off with random irregular durations (lit 0.3–1.5s, dark blips 0.04–0.34s, ÷speed; amount = off-darkness). `light_off` scripts pause flicker via the entry's `scriptOff` flag. Frame-step verified: flame wobbled 31–49 around base 50, electric blipped 120/0 at irregular cadence, both restored on exit. Demo: level-2 spot → electric, new "Demo flame torch" point; the v4.29.7 timer-toggle demo script removed (superseded — a toggle script fighting an authored flicker on the same light pauses it half the time).
- v4.29.7 — **Flicker-proof static shadows.** `light:set` no longer pokes `needsUpdate` on turn-on for `staticShadow` lights (each blink of a flickering light was re-rendering the frozen map — the exact cost static shadows avoid); instead `_refreshStaticShadows` now pokes switched-off lights too (dropped the `intensity > 0` guard), so a light that flicks back on always has a fresh map at zero per-blink cost. Verified: `on_timer`(0.4s, repeat) + `toggle_light` alternated 120/0 for 6s with `shadow.autoUpdate` false throughout; preview-exit restored. Demo flicker script left in level-2. (Note for hand-authored scripts: `ScriptDef.enabled: true` is required — `_evalAndRun` silently skips scripts without it; the UI always sets it.)
- v4.29.6 — **Static shadow maps + light on/off script actions.** `LightDef.staticShadow?` (STATIC SHADOWS checkbox under CAST SHADOWS): the shadow map renders once and freezes (`shadow.autoUpdate=false` + one-shot `needsUpdate`) — near-free per frame; ZoneManager re-pokes frozen maps on `*:rebuilt`/object add/remove so editor edits stay WYSIWYG (runtime movers deliberately don't refresh them). New `ActionType`s `light_on`/`light_off`/`toggle_light` → `light:set` bus event → ZoneManager drives **intensity only** (light counts never change → zero shader recompiles; an off shadow-light also stops its shadow passes via `autoUpdate=false`); runtime-only like all script effects, reset on `preview:stop`. ScriptPanel: `zoneLights` threaded through the panel chain, Lights optgroup in the target picker. Pixel-verified: frozen shadow stayed put while the mesh moved, refreshed on demand and on editor rebuild; actions verified through real dispatch + preview-exit restore.
- v4.29.5 — **True darkness: fill/rim follow the sun + ENVIRONMENT intensity control.** The two hardcoded fill/rim directionals now scale with sun intensity (0.3×/0.15× — identical look at the default sun 2.0), and new `WorldConfig.envIntensity?` (absent = 1) drives `scene.environmentIntensity` (the IBL term), carried on `world:lighting` and edited via a new ENVIRONMENT row in WORLD LIGHT. Ambient 0 + sun 0 + environment 0 = a truly dark scene lit only by placed lights (pixel-verified [32,42,50]→[5,8,9]; placed point light lights its pool in the dark). No migration needed (absent field = previous behavior).
- v4.29.4 — **Scene-file data loss on project restore (fix).** User report: a project scene ("a level full of ladder tests") was found blank. Forensics: the file was a byte-exact `WorldState.toJSON()` of a world with **null metadata** (the `"Untitled"` / `version "1"` shell, `moveSpeed: 5` — the WorldState fallback, not `makeFreshScene`'s `moveSpeed: 6`). Cause: boot restores the world from the `worldeditor_autosave` localStorage key, but **drops it when older than 24h** and falls back to `zones.loadZone(DEMO_ZONE_ID)` — which sets no metadata. Project restore then adopted the last project at its saved `sceneId` **without reloading the scene**, on the v4.27.0 assumption that "the autosave already restored the active scene". That assumption is only true when the restore actually ran; it ignored the `restored` flag the same function had already computed. So after >24h away, the editor sat on an empty demo world pointing at a real scene id, and the **next write-through save flushed the empty world onto the scene file** (FSA `createWritable` truncates → unrecoverable; the file was untracked in git). Two fixes: (1) both adopt paths now load the scene from disk when the autosave did not restore — boot keys off `!restored` (and re-baselines the autosave gate), `handleProjectReopen` keys off `world.metadata == null`; (2) **`canOverwriteScene(sceneId)`** guards every write-through `saveScene` (handleSave, closeProject, scene switch, scene add) — a null metadata means "never loaded from a scene file", so the overwrite is refused with a console warning and the file is kept. Only overwrites are guarded: `addScene` creates a new file, so the "New Project → adopt current world" path still works (it now also adopts the synthesized metadata onto the world, so later saves of that scene aren't refused). `window.__test.world` exposed for automation. Process: **`public/games/**` is now committed** and CLAUDE.md §5 requires committing scene files before/after editor writes — an untracked scene file has no recovery path. Verified in-browser against the real `test-project2` (permission still granted in IDB): with the autosave cleared, boot loaded `new-world` from disk (4 nodes / 1 floor / 2 platforms / 1 stairs / 1 object / 2 shapes) instead of the demo zone, a real Cmd+S write-through left the file byte-identical, and forcing `metadata = null` made the same save refuse (`[project] refusing to overwrite scene "new-world" with an unloaded (empty) world`) with the file untouched. The lost level was **not recoverable** (untracked; no Time Machine destination, no data APFS snapshot).
- v4.29.3 — **Lights as a nested panel page.** The nothing-selected panel now shows a "Lights" CategoryRow (every tool; summary `sun + ambient · N placed`) that drills into a `"lights"` screen — the first no-selection screen on the drilldown stack — containing WORLD LIGHT (sun + ambient, moved out of the Light-tool ToolView) above PLACED LIGHTS. Row click still selects; tool switch with nothing selected resets the stack.
- v4.29.2 — **Lights list always visible.** LIGHTS IN THIS ZONE now renders in the nothing-selected ToolView under every tool whenever the zone has lights (empty state stays Light-tool-only, WORLD LIGHT stays Light-tool-only).
- v4.29.1 — **Lights list.** LIGHTS IN THIS ZONE section under the Light tool (above WORLD LIGHT): a row per placed light (color swatch, label/id, kind, shadow tag); clicking a row switches to Select and selects that light (panel + gizmo). App `zoneLights` state synced from `light:*` events like `checkpoints`.
- v4.29.0 — **Phase 35 — Light controls**: placeable per-zone `LightDef` entities (point / spot / directional) built by ZoneManager as real THREE lights (editor + preview + game + runtime) with an editor pick-marker (`hideInGame`); Light toolbar button with three variants, `LightTool` click-place, LIGHT PropertiesPanel view (color, intensity, range, spot cone angle, pitch/yaw aim, CAST SHADOWS toggle, position, delete), gizmo translate, undo via journal `"light"` kind (added the missing `light` case to `_emitChange`). **World ambient/sun finally honored**: `WorldConfig.ambientLight`/`sunLight` were serialized since day one but never applied — SceneManager now applies them via a new `world:lighting` bus event (emitted by `loadFromJSON` + `updateWorldLighting`), editable in a WORLD LIGHT section under the Light tool; `migrateWorldLighting` rewrites the never-honored legacy defaults (1.2/3.0) to visual-parity values (0.5/2.0) so existing worlds look identical. Acceptance: `test-plans/phase-35-lights.md`.
- v4.30.0 — **Phase 36 — Audio System**: sound-asset manifest, ambient/background music, positional/spatial audio, and a 4-bus mixer — the missing consumer for the long-stubbed `play_sound`/`audio:play`. **Manifest** mirrors models/materials: `public/assets/audio/manifest.json` (`SoundManifest { version, sounds: SoundDef[] }`; `SoundDef { id, label, category('Music'|'Ambient'|'SFX'), path, loop?, volume?, spatial?, tags, dateAdded, attribution? }`), loaded by `AssetManager.initAudio()` (+ `getSoundList`/`getSoundDef`/`updateSound`/`removeSounds`/`loadSound` → cached `AudioBuffer` via `THREE.AudioLoader`, `_resolve` base-url like the other loaders). **New `src/audio/AudioSystem.ts`** is the consumer, constructed in BOTH roots (App + RuntimeApp) and self-managing on the bus like MoverSystem — a `THREE.AudioListener` attaches to `SceneManager.activeRenderCamera` on `preview:start` and detaches on `preview:stop` (sound plays only in preview/game). It handles `audio:play`(one-shot; positional when `position` given) / `audio:stop` / `music:play` / `music:stop` / `world:audio` / `audio:player-mix`, and `object:added/updated/removed` for **object-attached `PositionalAudio` emitters parented to the mesh** (follow movers). **Mixer**: four gain buses (master/music/sfx/ambient); effective per-sound gain = base × authoredMix[bus] × playerMix[bus], master via `listener.setMasterVolume`; a sound's bus is derived from its `SoundDef.category`. Authored defaults live per-scene in `WorldConfig.audio { music?, ambient?, mix? }` (`WorldState.updateWorldAudio` → `world:audio`, serialized wholesale with `world`, non-journaled like lighting); player prefs are PauseMenu sliders persisted to `localStorage.audio_mix` → `audio:player-mix`. **Data model** (additive, no migration): `WorldConfig.audio`, `WorldObject.sound { soundId, volume?, loop?, refDistance?, maxDistance? }`. **Scripting**: `ActionType` += `stop_sound`/`play_music`/`stop_music` (kept `play_sound`, now positional via `_resolveTargets`/`_resolveObjectPose`); `ScriptAction` += `music?`/`volume?`/`loop?`/`fadeSeconds?`. **Editor UI**: SOUNDS toolbar panel (`AudioBrowser` list+preview+manage, `AudioImporterModal` FSA import → dedupe-splice manifest), reusable `SoundPicker`, PropertiesPanel **Audio** mixer tool-screen (cloned from the Lights screen) and an object **Sound** drilldown. **Gotcha**: `THREE.Audio.setVolume` uses `setTargetAtTime`, frozen while the `AudioContext` is suspended (autoplay policy) — gains converge only after a real user gesture resumes it (the Play button). Verified in-browser end-to-end. Plan: `plans/phase-36-audio.md`; acceptance: `test-plans/phase-36-audio.md`.
- v4.30.1 — **Phase 36 follow-up — attached emitters on platforms & shapes.** The `sound` field (renamed `ObjectSound` → **`AttachedSound`**) now lives on the three **movable** entity types — `WorldObject`, `PlatformDef`, `ShapeDef` — mirroring where `mover?` lives. `AudioSystem` listens to `platform:*` / `shape:*` (as well as `object:*`) and its emitter lookup (`_findEntity` / `_findEntityMesh`, no longer object-only) parents the `PositionalAudio` to whatever mesh carries the id, so **a sound on a moving platform/shape rides its mover** (verified: the demo ferry's emitter tracks the slide exactly, world-pos locked to the platform mesh). PropertiesPanel `EntitySoundScreen` (was `ObjectSoundScreen`) is type-agnostic; the **Sound** drilldown is added to the platform and shape inspectors. Zero new per-frame cost — the follow is via the scene-graph matrix during render, so `AudioSystem.update()` still only runs fades.
- v4.30.2 — **Phase 36 follow-up — character locomotion audio (footsteps / jump / land).** `PlayerSettings` gains `jumpSound` / `landSound` / `footstepSound` (SoundDef ids) + `footstepDistance` (stride, default 1.8 m). `CharacterController` emits them as non-positional SFX-bus `audio:play` one-shots: **jump** at takeoff (in the physics jump block), **footsteps** every `footstepDistance` metres of *actual* horizontal travel while grounded + moving, **land** on the airborne→grounded transition. Land is **physics-based** (gated on air-time > `COYOTE_SEC` so ground-stick flicker while walking never false-triggers it) — deliberately NOT in the anim state machine, so it works even with no animated model (`_updateAnim` early-returns without a mixer). Edited in a **CHARACTER SOUNDS** section on the Audio tool-screen (backed by `playerSettings` / `onPlayerSettingsChange`). Verified with deterministic frame-stepping: 4 footsteps over 6.9 m (1.5 m stride) with **zero** false lands while walking; jump + land each fire exactly once per hop; both mixer-independent. No combat/death hooks — there is no player health/damage system (`on_health_zero` remains an unfired stub).
- v4.30.3 — **Phase 36 follow-up — runtime footstep swap + `AUDIO.md`.** New `set_footstep` script action → `character:set-footstep { sound? }`; `CharacterController` holds a `_footstepOverride` (override ?? authored default; empty reverts). Canonical use: `on_player_enter`/`on_player_exit` on a surface trigger volume (wood → gravel → wood). Verified through the real dispatch with deterministic stepping: default `blip_test`×4 → override `music_test`×4 → cleared `blip_test`×4. New consolidated feature doc **`AUDIO.md`** (library / ambient+music / positional emitters / character sounds / actions / mixer) — includes a **"Not built: combat/death"** section documenting that there is no player health/damage system (`on_health_zero` is an unfired stub) and how to script hit/death *reactions* out of existing pieces (`health` state + `on_state_changed` + `compare_number` + `play_animation`/`play_sound`).
- v4.30.4 — **Phase 36 follow-up — sound metadata editing + attribution + credits.** Sounds reach parity with models/materials: the `AudioImporterModal` gains an **`AttributionFields`** block (shared per batch, written into each `SoundDef.attribution`); the AudioBrowser Manage mode gains an **Edit** button → the shared `EditMetadataDialog` (`noun` union += `"sound"`) for rename / recategorize / attribution (single + multi-select), wired via `handleRequestSoundEdit` / `handleConfirmSoundEdit` (read-modify-write `audio/manifest.json` + `assetManager.updateSound`, mirroring the material edit flow). **`CreditsModal`** takes a `sounds` prop and groups them alongside materials/assets (author → pack, license badges, `N sounds` count); `PropertiesPanel` threads `sounds` through. Verified in-browser: Credits shows "Synthesized fixture · CC0 · 3 sounds"; `updateSound` merges label/category/attribution; the EDIT SOUND dialog renders LABEL/CATEGORY/AUTHOR/LICENSE.
- v4.31.0 — **Phase 37 — Skyboxes (selectable/importable image backgrounds).** Made the long-dead `WorldConfig.skybox` field real: it now discriminates `"sky"` (the built-in procedural `three/addons/objects/Sky.js`, default) from a **SkyboxDef id** (an equirectangular image that becomes `scene.background` **and** `scene.environment`). **Manifest** mirrors audio/decals: `public/assets/skyboxes/manifest.json` (`SkyboxManifest { version, skyboxes: SkyboxDef[] }`; `SkyboxDef { id, label, category, path, format:'ldr'|'hdr', thumbnail?, tags, dateAdded, attribution? }`), loaded by **`AssetManager.initSkyboxes()`** (+ `getSkyboxList`/`getSkyboxDef`/`updateSkybox`/`removeSkyboxes`, and **`loadSkybox(id)`** → cached equirect `THREE.Texture`: LDR via the shared `TextureLoader` (`SRGBColorSpace`), HDR via a lazily-imported **`RGBELoader`**; both tagged `EquirectangularReflectionMapping`. Skybox textures are quality-independent so — unlike material textures — they're NOT cleared in `setQuality`, only on `dispose`). **Application** lives in `SceneManager` (see its section): a `world:sky` ctor subscription + `_applySkybox` that toggles the procedural `Sky` mesh vs an image background, regenerates the PMREM env map from the image (old one disposed), and guards stale async loads with `_skyReqToken`; `environmentIntensity` still multiplies the active env map. Because both roots build a `SceneManager` and `WorldState.loadFromJSON` re-emits `world:sky`, it works in editor **and** runtime with one implementation (RuntimeApp awaits `initSkyboxes` alongside `initMaterials` so the registry is ready before the scene's `world:sky` fires; the editor does the same before its scene load — otherwise a saved image skybox would fail to load cold and fall back to procedural). **Data/bus** (additive, no migration): `WorldState.updateWorldSky(skybox)` (non-journaled, like lighting/audio), events `world:sky { skybox }` + `skyboxes:loaded { skyboxes }`. **Editor UI**: SKYBOX toolbar panel (`IconSkybox`) → **`SkyboxBrowser`** (thumbnail grid — a leading "Procedural Sky" tile + one per SkyboxDef, active tile highlighted; Import + Manage/Edit/Delete, mirroring `AudioBrowser`) and **`SkyboxImporterModal`** (FSA import of `.jpg/.png/.hdr` → dedupe-splice `manifest.json`, cloned from `AudioImporterModal`); metadata edit via the shared `EditMetadataDialog` (`noun` += `"skybox"`). Ships **3 procedural starter equirects** (`clear_day`/`sunset`/`night_sky`, generated with a zero-dep PNG encoder). Deliberately **not** wired: `fogColor`/`fogDensity` (still dead, hardcoded sky-blue fog) and 6-face cubemaps. Verified in-browser end-to-end (real toolbar/tile clicks): sunset applies live (bg=Texture @ EquirectReflection, env regenerated, Sky mesh hidden) + persists to `toJSON`, renders in preview/game mode, revert to Procedural Sky restores bg=null + Sky visible + RoomEnvironment; zero console errors. Plan: `plans/phase-37-skyboxes.md`; acceptance: `test-plans/phase-37-skyboxes.md`.
- v4.32.0 — **Phase 38 — Ceilings (platform bottom material + "Add ceiling" on closed wall runs).** A ceiling is deliberately **not a new entity** — it's a **thin node-backed polygon platform**, which already had a bottom cap visible from below, perimeter sides with `sideMaterial`, thickness, node-following points, and a collider. **Part A — `PlatformDef.bottomMaterial?` / `bottomMaterialOverrides?`** (additive, no migration): the bottom cap splits into its own `THREE.Mesh` **only when one of them is set** — otherwise the merged top+bottom cap path is byte-for-byte unchanged (same mesh count / draw calls / single CSG pass), so existing worlds have zero regression surface. `PlatformBuilder`: new `CapFaces = "both"|"top"|"bottom"` param on `buildSlabCapGeo` (gates the ±Y quads) and `buildPolygonCapGeo` (early-returns one cap before the merge); the CSG cut loop was extracted into a `cutWorldGeo` helper applied to both caps; the bottom mesh is `selectable: true` (ceilings are clicked from below); overrides-only (`bottomMaterialOverrides` without `bottomMaterial`) falls back to the top material id — deliberately better than the sides quirk where overrides-only is ignored. PropertiesPanel platform material view: "TOP / BOTTOM" renamed **"TOP"**, new **"BOTTOM"** `MaterialSection` (value falls back to `material`) wired like SIDES. Material-delete usage scan counts `p.bottomMaterial`. **Part B — "Add ceiling (cap closed loop)"** button in the wall-run Actions accordion beside "Fill closed loop with floor", gated by the same `isWallRunClosed()`. `handleAddCeilingToRun` (App.tsx) mirrors `handleFillRunWithFloor` but commits a polygon `PlatformDef` with `PolygonPlatformTool._commit`'s exact field set, **reusing the run's node IDs** (no duplication — ZoneManager's node-move rebuild keeps the lid glued to wall edits) at `position.y = wall.elevation + wall.height` (slab bottom flush with the wall top — the lid sits ON the walls; runs merge only with uniform elevation/height so reading `selected.data` is safe), `thickness 0.2`, `material "concrete_01"`, `bottomMaterial` unset. Accepted parity edge cases: AABB collider over concave loops, underside-only selection tint, BOTTOM not resettable to follow-top (like SIDES), node loss on run delete falls back to cached `points`, double-click stacks two lids. Plan: `plans/phase-38-ceilings.md`; acceptance: `test-plans/phase-38-ceilings.md`.
- v4.32.1 — **Phase 38 follow-up — ghost ceilings + loop-fill button gating.** (a) **`PlatformDef.editorGhost?: boolean`** (persisted): the platform renders as a translucent (0.15) **click-through** ghost in the editor — so a capped room stays viewable/editable from outside — but is fully solid in preview/game and in the runtime shell. Implemented as an editor-only material-swap pass `ZoneManager._applyGhosts()` (mirrors `_applyDimming`; chained from its tail so every build path reapplies it; guards make ghost/dim mesh sets disjoint): swaps in a transparent clone + sets `userData.ghostPick`, so the existing hidden-wall pick rule (`SelectionManager._cast`: ghosts picked only when nothing solid is under the cursor) provides the click-through. Gated by `enableEditorGhosts()`, called **only** by the editor shell (App.tsx) — the runtime never ghosts; `preview:start/stop` set `_ghostsSolid` and re-run the pass, so ghosts are solid while playing. Colliders are untouched (physics only runs in preview, where ghosts are solid anyway). Toggled from the wall-run Actions button ("Hide ceiling (ghost)" / "Show ceiling (un-ghost)", shown when a node-matched ceiling exists) and a **GHOST IN EDITOR** checkbox on the platform Geometry screen (covers hand-placed ceilings). (b) **Gating**: "Fill closed loop with floor" hides when a floor with the run's exact node set exists at the run's level; "Add ceiling" hides when a platform with that node set exists (replaced by the ghost toggle) — no more double-stacked lids/floors. Detection = `getRunLoopNodeIds()` + order-insensitive node-set compare in App.tsx. The three mutating handlers bump `setSelected(s => ({...s}))` after committing because `syncHistory()` alone doesn't re-render when canUndo was already true — without it the buttons went stale until the next selection change (caught in browser verification).
- v4.32.2 — **Ceilings follow vertical wall-run moves.** `GizmoManager`'s wall-case Y-move commit bumped each wall's `elevation` and elevated **floors** whose `nodeIds` were entirely within the moved node set — but had no platform equivalent, so a ceiling followed the run horizontally (nodes are X/Z-only; the polygon re-derives) but was left behind vertically. Added the mirrored loop: node-backed **platforms** whose `nodeIds` ⊆ moved set get `position.y += delta.y` via `updatePlatform`. Verified with a real gizmo Y-drag: wall elevation, fill-floor elevation, and ceiling `position.y` all moved by the identical delta (+1.693), room + lid traveling as one unit.
- v4.32.3 — **StairTool bases the stair on the clicked surface.** User-reported: stairs placed "high, like floor 2" on any floor over any surface. Root cause: `StairTool._getElevationForLevel` took **`Math.max` over every floor at the active level zone-wide**, and the user's level-2 scene had a level-0 floor gizmo-dragged to elevation 8.43 — so every ground-floor stair started at 8.43 regardless of where it was drawn. Fix: the start click now uses **`surfacePos.y`** (InputManager's real raycast against buildable geometry, ghostPick excluded — the ShapeTool precedent; the original StairTool spec in this doc even called for surface snapping, but the implementation never did it), keeping the level heuristic only as the fallback for clicks over the void. Verified in the user's actual level-2 world with the rogue floor present: ground stair starts at 0.004 (floor surface), room-stack stair at 3.004 (level-1 fill floor — the ghosted lid correctly lets placement fall through). End-Y logic unchanged (auto-rise to next level else stepped).
- v4.32.4 — **Placement raycast ignores inactive-level geometry + stair uses the surface hit's XZ + cut-box negative-face handle fix.** Three user-reported follow-ups. (1) `InputManager._computePositions`'s `surfacePos` raycast now skips any mesh whose `userData.floorLevel` ≠ the active floor level (tracks `floor:select`), mirroring the dimming/selection semantics — previously an overhead level-1 floor or wall top (dimmed to a see-through ghost) caught a ground-level stair start inside a room stack. (2) `StairTool` uses the surface hit's own **XZ** (and the preview follows `surfacePos ?? worldPos`): `worldPos` is the y=0 ground-plane intersection, which sits at a *different* spot along a tilted view ray than the elevated surface actually clicked — mixing worldPos XZ with surfacePos Y produced stairs starting at e.g. a wall-top Y over an interior XZ. (3) **`StairCutterResizer` negative-face drag fix**: `FACE_LOCAL` already encodes the face direction in the normal (e.g. `-x` → −x̂), but `_onDragMove` *also* multiplied by a `faceSign` — a double-flip that made `fixed` pin the **dragged face itself** instead of the opposite face for `-x`/`-y`/`-z` handles, so one handle of each pair worked and its opposite dragged the wrong way. Dropped `faceSign` (measure everything along the outward normal), and subtracted the handle's resting `GAP` (0.3) from the projection so a grab-without-move no longer grows the box by a snap step. Verified with real drags on the user's cut-box stair: `+x` outward 1m → width 2.5→3.5 with the −x face pinned; `-x` outward 1m → width 3.5→4.5 with the +x face pinned (previously inverted); stair drawn inside the room stack on floor G starts at 0.004 on the ground floor at the exact clicked XZ, through the ghosted lid and past the dimmed level-1 walls/floor.
- v4.32.5 — **CSG stair cutout is a physical hole + cut-box face handles win the pick.** Two user-reported follow-ups on the stair cut box. (1) **The cutout was visual-only** — the CSG hole was subtracted from the floor/platform *mesh*, but the collider stayed the AABB cuboid, so the character couldn't pass through it. `ColliderBuilder` gained **`trimeshData(meshes)`** (world-space triangle soup — each built mesh's local matrix applied) and **`registerCutTrimesh(id, verts, idx)`** (Rapier `trimesh` + `FIX_INTERNAL_EDGES`, matching `registerShapeTrimesh`; returns null on degenerate input → caller falls back to the box collider). `PlatformBuilder` tracks its slab meshes in a `physMeshes` array (cap/bottom/sides/inner faces — **not** railings) and, when `capInWorldSpace` (i.e. a stair cutter actually intersected, `cuts.length > 0`), registers the exact trimesh instead of the cuboid; `FloorBuilder` does the same when `cutterMeshes.length > 0`. Only CSG-cut slabs pay for the trimesh — uncut floors/platforms keep the cheap cuboid, so zero regression surface. Verified in preview on the user's stair: the character over the cutout falls through to the ground floor (`body.y` ~3.135), and over the solid slab stands on top (`body.y` ~4.11). (2) **Face-handle drags passed through to whatever was behind** — grabbing a cut-box face square selected/moved the object behind (the stair's own move gizmo's invisible TransformControls picker planes stealing the pick) instead of resizing the box. `StairCutterResizer._onHover` now emits **`collider:handle-hover { hovering }`** (and `_clearHandles` emits `false` if it was hot), the same idiom `ShapeResizer`/`ColliderEditor` use — `GizmoManager` sets `_hoverMute` → `_controls.enabled = false`, so the hovered handle wins the pick; selection of the object behind was already blocked by the existing `gizmo:dragging` → SelectionManager `_suppressNextClick` path. Verified with a real drag: hovering a face handle fires `collider:handle-hover {hovering:true}`, and dragging it resized the cut box (width 2.5→3.7) while the panel kept the stair selected (no pass-through to the lid platform behind).
- v4.32.6 — **Cut-box handle drags no longer grab wall nodes/edges underneath.** The v4.32.5 handle fix only covered the stair's own move gizmo (TransformControls, via `collider:handle-hover` → `GizmoManager._hoverMute`) and the SelectionManager click-suppress — but **`NodeDragger`** (wall/floor nodes + edges, and rect-platform corners/edges) has its own raycast picking on `input:mousedown`/`mousemove` and was **not** muted, so grabbing a cut-box face square that sat over a wall edge dragged the edge instead of resizing the box (both were even hover-highlighted at once). `NodeDragger` now tracks a `_handleHot` flag from `collider:handle-hover` (mirroring its existing `_gizmoActive` gate): while a face/collider/cut-box handle is hovered it skips hover **and** mousedown picking, and a new lightweight `_clearHover()` (resets highlight styling without disposing the dots/lines) drops any lit node/edge so the two aren't both highlighted. (`OpeningDragHandler` is armed only when an opening is selected — never while a stair's cut box is active — and `WallSplitter` is right-click only, so neither needed the guard.) Verified from a top-down view on the user's deep (depth 6.6, ~12° yaw) cut box with a wall segment confirmed directly under the −z handle: hovering fired `collider:handle-hover {true}`, and dragging the −z handle resized the box (depth 6.6→8.6) with the stair still selected and **all 42 zone nodes byte-identical** before/after (no edge moved).
- v4.32.7 — **Removed the dead "+ Add corner" brush button.** The v4.10.0 armed-click corner insertion (Geometry panel button → `shape:add-corner` bus event → `BrushVertexEditor._onAddCorner`) had been unreachable since Phase 23: the click handler was gated to `select-vertex` mode while the button rendered in object mode, `_onAddCorner` bailed on face-brushes (v1 restriction — a loose vertex has no face loop to live in), and Convert to Brush has baked face loops via `facesFromCloud` since v4.11.0, so cloud brushes (the only kind it worked on) no longer occur. Removed the button + arming state (PropertiesPanel `ShapeGeoView`), the `shape:add-corner` event (types.ts), and `_onAddCorner`/`_addArmed` (BrushVertexEditor). Corner *deletion* (right-click, cloud brushes) and all face-brush topology tools (SPLIT/EXTRUDE) are unchanged; the v4.10.0/v4.11.0 entries above describe the feature historically.
- v4.33.0 — **Phase 39 — Brush inset / edge split / recess (SketchUp-style push-pull).** Three new pure topology ops in `brushOps.ts`, all returning `BrushMeshData` and gated by `validateMesh`, wired as panel buttons through the existing `run() → onObjectUpdate({ mesh })` single-transaction path; zero builder/collider/WorldState/SelectionManager changes (face-brush rebuild, trimesh collider, undo, and sub-selection clamping are generic). **(1) `insetFace(mesh, faceIdx, margin=0.25)`** — replaces a face with a border ring of quads + a new inner face at **uniform width**: each corner moves inward along its angle bisector with miter length `margin/sin(θ/2)` (in-plane edge normals `n × d`; a centroid scale would give non-uniform borders on elongated faces — verified: a 6×2.5 wall face insets to 5.5×2.0, exactly 0.25 on all sides). Inner verts are pushed fresh (never `addOrReuse` — welding onto the outer ring would corrupt topology); guards reject margins too large (collapsed inner edge, inverted/degenerate raw-Newell inner loop — verified: repeated INSET on a shrinking face aborts with a warn, state unchanged) and near-degenerate corners (`sin(θ/2) < 0.05`). The inner face takes over `faces[faceIdx]` (keeps material/overrides, stays selected — the SketchUp flow: INSET then immediately EXTRUDE/RECESS acts on it). Outer ring untouched → no T-junction propagation needed. **(2) `splitEdge(mesh, [a,b])`** — the arbitrary-polygon generalization of `splitFaceQuad`'s edge cut: midpoint via `addOrReuse`, spliced into **both** loops traversing the edge by the new shared `spliceMidpoint` helper (extracted from `splitFaceQuad`, which now calls it twice — behavior identical); defensive `count === 2` check (manifold invariant + catches midpoint-welding collisions). Returns `SplitEdgeResult { mesh, mid }` — the caller needs `mid` because the old edge pair is no longer traversed (SelectionManager's liveness clamp would drop the selection). **(3) Negative `extrudeFace` dist** — guard relaxed from `dist <= 0` to `dist === 0 || !isFinite`; the side-quad winding `[p, q, qd, pd]` is **sign-agnostic by directed-edge pairing** (the band must supply p→q against the neighbor's q→p and qd→pd against the moved cap's pd→qd whichever way the ring moved — commented in code so nobody "fixes" it) — the entire diff is the guard line. **Panel:** `ShapeFaceOps` gains INSET + RECESS (−0.25) in a second button row (`OP_BTN` styles hoisted to module scope); new **`EdgesList`** view (`ShapeGeoView` now routes `select-edge` for face-brushes, which previously fell through to the transform view) — a single card for `selected.edgeVerts` (edges have no stored identity) with endpoint coords and **SPLIT EDGE**, which commits and then re-emits `shape:sub-select` with the surviving sub-edge `[min(a,mid),max(a,mid)]` so the edge selection + TC gizmo stay live (verified: panel card updates to the half-edge after splitting). Known v1 limits: strongly concave inset can self-intersect past the guards (validateMesh catches many); a shallow recess punch-through of a large solid can validate (net volume still positive) — user undoes; recess of a full un-inset face makes a valid zero-thickness rim (tooltip steers to inset first); split is midpoint-only. Verified in-browser end-to-end through real panel buttons on a converted box brush: INSET 12v/10f → RECESS 16v/14f (cap exactly −0.25), edge-pairing probe manifold after every op, EXTRUDE + SPLIT ─ regressions pass, Cmd+Z walks back exactly one op per press. A labeled demo brush (`demo_p39_carved_wall`, brick) with a window recess, an end boss, and a split-edge roof peak is left in the level-2 world. Plan: `plans/phase-39-brush-inset-carve.md`; acceptance: `test-plans/phase-39-brush-inset-carve.md`.
- v4.33.1 — **Follow-the-camera sun shadows + PCFSoft (fixes blocky recess shadows).** User report: stair-stepped blocky shadow inside a carved brush alcove. Root cause wasn't the brush geometry — the sun's shadow map was 1024² stretched over a static ±40m ortho box (≈8cm/texel, smearing into big blocks where a rim shadow crosses a wall at a grazing angle), and the box couldn't cover the whole level anyway (content at x −55 cast no sun shadow at all; the user's carved structure sat right at the x −40 clip edge). Fix in `SceneManager`: box shrunk to **±25m** and re-centered every frame on the editor focus / 15m ahead of the play camera, texel-snapped in the (fixed) shadow-camera basis so edges don't shimmer when panning — ~1.6× sharper AND full-world coverage; plus `PCFShadowMap` → `PCFSoftShadowMap`, A/B-measured free on the user's level (98–112 vs 101–113 FPS, same worst-ms). Details in the SceneManager section.
- v4.33.2 — **Dimmed off-level geometry is click-through (the ghost-ceiling rule, generalized).** User report: on floor G, level-1 walls (dimmed by the floor-level pass) still ate selection clicks — unlike ghost ceilings. `SelectionManager._cast`'s solid-tier filter now also demotes any hit whose `userData.floorLevel` ≠ the active floor level (alongside `ghostPick`): off-level geometry is picked **only when nothing active-level is under the cursor**, so it stays selectable on empty space (clicking a level-1 wall against the sky still selects it; with floor 1 active it selects normally). Off-level *floors* keep their existing hard skip (`editorType === "floor"` check). Verified in-browser on the user's room stack: on floor G a click on the level-1 front wall's face selects the ground room's polygon floor behind it; sky-backed and floor-1-active clicks select the wall.
- v4.33.11 — **Dialogue option "Leads to" label + end-conversation marked as the default.** User feedback on the v4.33.10 branching screenshot: the next-node dropdown was the only unlabeled control on the option card — a collapsed "— end conversation —" said neither what the dropdown is (a potential-next-page-node picker) nor that ending is just the default. `DialogueOptionRow`'s select is now wrapped in a labeled row matching the Show if / On pick idiom — **"Leads to"** (user-picked over "Next page-node"/"Then") — with the empty-value option reading **"— end conversation (default) —"** and the tooltip rewritten ("The page node this response jumps to — leave the default to end the conversation"). DIALOGUES_GUIDE.md aligned ("Leads to" naming in Adding responses / branching section / recipe / gotchas; Adding-responses bullet now leads with the default-ends behavior), and **both dialogue screenshots retaken** with the labeled row (dialogue-branching.png restitched via pixel-autoaligned two-shot capture; dialogue-editor.png reframed on the Guard-intro example showing a complete option's anatomy).
- v4.33.15 — **A ceiling no longer hides its wall run's node dots and edge lines.** User report: one run "lost its corner node-dots and draggable edge-lines" while the run beside it kept both, and a reload didn't bring them back. Not lost — **relocated to roof height**. `NodeDragger._refresh` builds a nodeId→Y anchor map whose wall and floor passes take the *max*, but whose platform pass did a blind `nodeY.set(id, y)`. A node-backed ceiling (Add ceiling → platform carrying the run's own `nodeIds`) therefore overwrote each corner's wall-base anchor (y 0.12) with the ceiling top (y 3.26), and the platform edge loop likewise drew that run's edges at 3.24 — both then sitting under the ceiling and any dimmed upper floor, invisible. The neighbouring run had no ceiling, so it was unaffected; the trigger was simply the next `_refresh` (any drag, or a reload), which is why it looked drag-induced and survived reloads. Fix: the platform pass anchors only nodes nothing else claimed (`if (!nodeY.has(id))`), so the lowest anchor wins and run corners stay grabbable; platform edge lines derive their Y from the two endpoints' resolved dot heights (`min(dotY) − 0.08`, matching the floor edges' `+0.04` convention) and fall back to the platform top only for platform-only nodes. Dragging those corners still moves the ceiling, since it is the same node. Verified on the user's level: the ceiling's four corners report dots at **0.12** (were 3.26), the whole scene's 54 dots resolve to 0.12/3.12 with none at 3.26, all 40 edge-line vertices sit at 0.04, and the linked level-1 corners correctly stay at 3.12.
- v4.33.14 — **Walls get flat per-face normals (fixes the lit seam where two floors' runs stack).** Follow-up to v4.33.13: with UVs continuous the brick courses lined up, but a hard lighting band remained at the junction. Diagnosed in-browser by elimination — sun `castShadow = false` left the band untouched (not shadow acne), and the two runs' outer faces measured 7mm apart (not an exposed ledge). Cause: `WallBuilder` calls `computeVertexNormals()` on an **indexed** strip whose 4 vertices per polyline point are shared between the side faces and the top/bottom/cap faces, so every side face's normal is averaged with the caps' — measured `n.y ≈ −0.07…−0.11` on the bottom row and `+0.06…+0.13` on the top row, smearing a fake vertical shading gradient up each wall (and rounding the shading across mitered corners — the soft cube corners and glossy smears in the user's screenshots). Invisible on a lone wall; where two runs stack, the lower run's top row (+0.13) abuts the upper run's bottom row (−0.07) and the discontinuity reads as a lit seam across the facade. Fix: new `withFlatNormals(geo)` helper — `toNonIndexed()` + `computeVertexNormals()` + dispose of the indexed original — applied in **both** solid build paths (`build`, `buildRun`) right before `applyUVOffset`. The editor-only translucent ghost mesh keeps its indexed/smoothed geometry (cosmetically irrelevant at 0.12 opacity). Verified in the live preview: side-face normals now exactly `n.y = 0` on every wall **including the CSG'd door run** (three-bvh-csg re-indexes but preserves them), the seam and the corner smearing are gone, vertex count ~5× on wall meshes only (20→96 simple run, 158→516 the big one) with draw calls unchanged (29dc·4k) and FPS 105→110.
- v4.33.13 — **Copy-to-floor links corners across floors + walls tile continuously up a stack.** Two user reports about stacked runs. (1) **Vertical UV continuity**: `WallBuilder` emitted V from `0`→`H/tileY` on every run while positioning the mesh at `y = elevation`, so a run copied to level 1 restarted its brick course at its own base — a visible horizontal break mid-facade. V is now world-space like U already was (`elevation/tileY` → `(elevation+H)/tileY`) in **both** build paths (single-wall `build` and merged `buildRun`, incl. the closed-loop wrap-around vertex); walls at elevation 0 are byte-identical, so only stacked runs change. (2) **Linked corners**: new **`WallNode.linkId?: string`** (persisted). `handleCopyRunToFloor` no longer orphans the duplicated nodes — the source node adopts a `linkId` on its first copy and each copy joins that group, so a third-floor copy made *from* the second floor joins the same group (all three stay in sync). `WorldState.updateNode` delegates to a new public **`propagateNodeLink(zoneId, nodeId)`** that writes the position onto every link-mate and emits a **separate `node:updated` per mate** — required because `ZoneManager`'s handler rebuilds by node reference, and a mate's walls live on another floor that the dragged node's own rebuild never touches (fill floors / ghosted ceilings sharing the mate rebuild too, for free). Centralizing it in `updateNode` covers every drag path (NodeDragger corner + edge drags, GizmoManager, panel numeric fields) with one hook; the one bypass — `NodeDragger._syncRectCorner`, which mutates `zone.nodes` directly to collapse rect-floor rebuilds — calls `propagateNodeLink` explicitly. **Why not just share one node between floors:** `groupWallRuns`'s `canMerge` requires the shared node to be degree-2 counting walls across the whole zone regardless of floor, so a genuinely shared corner would read as degree-4 and shatter both runs into unmerged single walls, losing the mitered corners. Linking is therefore a *sync* relation, not identity. **Unlink** (user-chosen: per-run button over a copy-time checkbox): the wall-run Actions block shows `⛓ Corners linked to: G, 1` (levels derived from the walls referencing each link-mate — a node carries no level of its own) plus an "Unlink corners from other floors" button → `WorldState.unlinkNodes` drops `linkId` on that run's nodes only, leaving the other floors linked to each other. Scope is position-only by design: height/material/openings stay per-floor, consistent with copy-to-floor already dropping openings.
- v4.36.3 — **Scripts button gets its own list icon + Trigger tool moved to sit just above Scripts.** (a) The Scripts panel button had always reused `IconTriggerVolume` (dashed box + dot) — identical to the Trigger tool's (user request; a gear draft was rejected in favor of a list). New `IconScript` in icons.tsx: a bulleted list (three dot+line rows, house stroke style), 22px like the other panel icons. `IconTriggerVolume` remains the Trigger tool's icon via `TOOL_ICONS`; Toolbar no longer imports it directly. (b) The Trigger tool button moved out of the `TOOLS` list (now 9 entries, ends at Light) to render **between Assets and Scripts** (user request — trigger volumes host their scripts in that panel, so the trio reads as one scripting cluster). Mechanically: the `TOOLS.map` callback was hoisted to a component-scope `renderTool(tool)` and the button is `renderTool(TRIGGER_TOOL)` (a module const) placed before the Scripts block — same JSX, same highlight rule (`openPanel === "scripts" && activeTool === "trigger-volume"`), no App changes. Verified in-browser: bar order Select…Light, Assets, Trigger, Scripts; Trigger click arms placement ("Click and drag to place a trigger volume"); autosave untouched.
- v4.36.2 — **Assets/Scripts buttons sized like tools + moved up under the tool list.** User follow-up on Phase 42: the two panel buttons were visibly smaller (48×36, 6px caps label) than the 48×48/8px tool buttons, and sat pinned to the bar's bottom — which was only a `flex:1` spacer between the tool list and the bottom cluster, a stylistic "tools vs panels" split, not anything structural. Both buttons are now 48×48 with the exact tool-label span style (8px, opacity 0.7, title-case "Assets"/"Scripts"), rendered directly below Light; the spacer moved below them so only the divider + Play row stay anchored at the viewport bottom. The ASSETS flyout keeps its `bottom: 0` anchor (now opens upward-aligned from the button — still can't clip on short windows). Verified in-browser: buttons match tool sizing, flyout fully on-screen at the new position, autosave untouched.
- v4.36.1 — **Dialogue panel: continuous rail ties a response to its nested page.** At deep levels (≥2) the child card breaks out LEFT of its response well (anti-runaway-indent), which left no visible relation between them (user screenshot: "no visible nesting or relation"). Now, when a response hosts a page, the child's rail hue extends **up along the well's left edge** (2px border wrapper, `marginLeft:-4/paddingLeft:2` so the rail is collinear with the child card's own rail) and a 2×9px stub bridges the gap — one unbroken colored line from response → page. First level keeps its plain inset. Chosen over a tinted-bracket alternative (a faint hue-tinted rounded box wrapping well + page) after trying both live; the bracket variant was removed with its `NEST_LINK` switch.
- v4.36.0 — **Phase 42 — Toolbar ASSETS flyout group (vertical-space reclaim).** The left toolbar overflowed on shorter windows (12 tool buttons + 4 panel buttons + Play row). One **ASSETS** button now replaces the MATS/SOUNDS/SKYBOX panel buttons **and** absorbs the Object and Decal tools — rationale: both are already browse-then-place two-step tools (clicking Object only opened the model browser; a model pick was required before placing), and menu-first two-click is the toolbar's existing variant-group grammar, so the flyout adds one click to *entering* the mode, not per placement. Tool list is now 10 (Select, Floor, Wall, Platform, Stair, Shape, Groups, Spawn, Trigger, Light); bottom cluster is ASSETS + SCRIPTS + Play (~170px reclaimed). The flyout (right-anchored, **`bottom: 0`** so it can't clip below the viewport; reuses the variant-popover styling + shared Esc/any-click close effect via `openMenu` sentinel `"assets-menu"`, state widened to `ToolId | "assets-menu" | null`) lists **Models** → `onToolSelect("object")`, **Materials** → `onPanelToggle("materials")`, **Decals** → `onToolSelect("decal")`, **Sounds** → `onPanelToggle("audio")`, **Skybox** → `onPanelToggle("skybox")` — the tool rows lean on App.tsx's existing tool→panel coupling (object→assets, decal→decals), so **zero App.tsx changes**. The ASSETS button highlights when any of its panels/tools is active (`openPanel ∈ {assets, materials, decals, audio, skybox}` or `activeTool ∈ {object, decal}`) and swaps its icon to the active entry's (variant-group precedent) so the armed mode stays glanceable; active flyout row highlighted; panel rows toggle closed on re-pick. SCRIPTS (amber, gameplay logic) and the Play row are untouched, as is the trigger-volume→SCRIPTS force-open. Verified in-browser via real clicks: all five entries open the right panel (ASSETS/MATERIALS/DECALS/AUDIO/SKYBOX headers), Models arms placement ("Choose an asset below, click to place"), icon swap tracks Models/Materials/Skybox, Esc closes the menu, re-picking Skybox toggles its panel closed and clears the highlight, zero console errors, user autosave byte-identical. Plan: `plans/phase-42-toolbar-assets-menu.md`; acceptance: `test-plans/phase-42-toolbar-assets-menu.md`.
- v4.35.5 — **Dialogue panel: nested pages inset on the right too.** The deep-level wrapper's `-7px` right margin cancelled the host card's right padding, so a nested page sat flush with (slightly past) its parent's right border (user screenshot). Right margin → 0: each level tucks ~7px inside its host on the right (measured n1/n5/n4 right edges 450/441/434), matching the left-side rail steps. User-confirmed.
- v4.35.4 — **Dialogue panel: wider per-level nesting offset.** The deep-level breakout margin went −22 → −16px, so each nesting level ≥2 steps in ~10px instead of ~4px — the colored rails get clear daylight between them instead of touching (user screenshot). First-level inset unchanged (+21); measured n1→n5→n4: 76/97/107.
- v4.35.3 — **Flowchart: response wells + card breathing room.** Each response row in a node box is now a full-width **well** (hairline border, radius 5, 26px, `rgba(255,255,255,0.05)`) whose port dot straddles the card's right border (`marginRight: -25` = well pad 8 + border 1 + card pad 12 + half-dot) — the row visually reaches its arrow (user mockup; chosen over right-aligning short text). Sections breathe: card is a flex column with an 8px gap (header / lines / wells), wells 6px apart, card padding 10→12. `boxHeight()`/`portY()` updated in lockstep (they drive edge endpoints, chips, layout) — verified in-browser that every edge start sits exactly on its dot center (±0px) and the dot centers ride the card edge.
- v4.35.2 — **Flowchart: direction-aware edge entry.** Arrows now land on the target side facing the source (user mockup): target roughly **level** with the source port (port height inside the target's vertical span, target to the right) → enter the **left edge** with a near-straight horizontal curve; target **above** the port → curve up and enter the **bottom**, arrowhead pointing up (replaces v4.35.1's wide top-entry sweep for loop-backs; option-less targets shift the entry −50px left of their hanging `end` chip); otherwise top entry as before. Verified on Blue Bunny Talk — all three styles in one view.
- v4.35.1 — **Flowchart: adaptive edge curvature.** Bezier control-point reach was a fixed 60px, so a loop-back (target above the source port) hairpinned at the port and sliced across boxes (user screenshot on the Gate-rumor loop demo). Reach now scales with endpoint distance — forward edges `min(160, 40 + dist·0.25)`, back-edges `min(280, 80 + dist·0.5)` — so loop-backs arc wide and round over the cards. Verified on the same tree.
- v4.35.0 — **Phase 41 — Dialogue flowchart view (secondary, docked beside the panel).** The superseded Phase 40 flowchart plan revived in modified form (user request): the nested card stack in the left panel stays the **primary** editor; a **Flowchart** button in the dialogue header opens `src/ui/DialogueFlowchart.tsx` — a read-mostly node-and-arrow chart of the same `DialogueTreeDef` covering **everything to the right of the left panel** (`position:fixed`, left = live `#wb-leftpanel` right edge via ResizeObserver, top 48, zIndex 55, **portaled to `<body>`** — rendered in place it inherits LeftPanel's stacking context (z 9) and the PropertiesPanel (z 10) draws over it). Boxes show id badge/`· start`, effective speaker, line preview, one **port row per response** (dot: blue = wired, grey = ends, red = dangling); SVG cubic-bezier edges land on the destination's top with arrowheads; `end` chips for ending responses and option-less nodes, red `⚠ missing` chips for dangling `next`, **amber outline** for unreachable nodes (same walks the panel uses). **Click a box → `jumpToNode`** scrolls + flashes that card in the panel (chart never edits text/wiring); panel edits redraw the chart live (same `dialogue` prop). **Drag a box** to persist `DialogueNode.editorPos?: {x,y}` (new field in types.ts — editor-only semantics, runtime ignores it, serializes free with the zone; precedent `PlatformDef.editorGhost`); layered-BFS auto-layout used when absent; **Auto-arrange** writes all positions; pan (background drag) / zoom (native non-passive wheel listener, 0.4–1.6, cursor-anchored); Esc/✕ close. Gotchas fixed during verification: drag commit recomputes from event coords (the `drag` state lags a render and can miss a fast drag entirely); `left` is **seeded synchronously** from the panel rect so the mount-time fit measures the real canvas width; `set/releasePointerCapture` wrapped in try/catch (synthetic pointer events have no live pointer). Verified in-browser against the user's real 6-node tree: real-mouse click/drag/scroll (drag landed within 1px), counts (6 boxes / 8 edges / 3 end chips) match the data, live redraw on panel add/delete, close/reopen keeps dragged positions, autosave protocol observed. Plan: `plans/phase-41-dialogue-flowchart-view.md`; acceptance: `test-plans/phase-41-dialogue-flowchart-view.md`; DIALOGUES_GUIDE "The flowchart view" + `docs/images/dialogue-flowchart.png`.
- v4.34.5 — **Dialogue editor: every page names its speaker + the override hides behind ✎ + PLAYER RESPONSES + more air around the rails.** User feedback: "make it more clear who is talking and which thread we're in… I keep typing my messages into the speaker override box." (1) The node card header now reads **`n1 · start` GUARD SAYS** — the effective speaker (node override ?? dialogue speaker ?? "NPC") as a bright uppercase label, so every page announces whose words it holds; the lines textarea placeholder follows suit ("What Guard says — one line per row"). (2) The **speaker-override input is gone from the header** — it was a full-width text field sitting right where dialogue wants to be typed. It now appears only behind a small **✎** (or automatically when an override is set), placeholder "Speaker for this page only (blank = Guard)"; the SAYS label live-updates (verified: type "Captain" → CAPTAIN SAYS; clear → GUARD SAYS, input hides). (3) **RESPONSES → PLAYER RESPONSES**, and the response text placeholder is now "Player response…" — the NPC-vs-player split is labeled on both halves of the card. (4) More padding inside and outside the nesting rails: gutter 8→12px before the rail, nested-card left padding 8→12px inside it, vertical margins 4/8→6/10 (breakout retuned −14→−22, still ~+4px/level; measured n1→n2 = +21). Guide + both screenshots updated.
- v4.34.4 — **Dialogue: already-picked responses dim on loops (runtime) + grouped response wells with a slight nesting inset (editor).** (1) Runtime: `DialogueRunner` tracks the option ids picked during the CURRENT conversation (`_picked`, reset on start/end/detach); the `dialogue:show` payload gains `picked?: boolean` per option and `DialogueOverlay` renders picked rows de-emphasized (muted `#5a6474`, 0.75 opacity, trailing ✓) while still selectable — so looping back to a hub node shows which responses you've already exhausted. Per-conversation only; nothing persists to gameState. (2) Editor: nested pages stay **directly below the response that leads to them** (a grouped-wells experiment moved them further away and needed a `↳ after "…"` crutch label — user rejected it, reverted same session). The "+ Add lands way at the bottom" complaint is solved at the interaction level instead: `addOption` now **scrolls the fresh response into view and focuses its text input** (`wb-dlgopt-<id>` anchor + rAF), so the author lands on it no matter how long the preceding subtree is. Accordion state stayed lifted into `DialogueNodeCard` (`openIds` map) from the experiment — the interleaved render is now a keyed `<Fragment>` of [well, subtree] pairs. **Self-collapse bug found & fixed during verification:** the open-default was DERIVED per render ("empty option ⇒ open"), so the first character typed into a fresh response flipped "empty" false and slammed the accordion shut — the mysterious "phantom collapse" from earlier sessions. The default is now a per-option **sticky seed** (`seedOpen` ref, evaluated once per option id); explicit toggles still win via `openIds`. (3) Nesting regains **the slightest inset**: the deep-level pull-back went −18px → −14px, so every level (pages and their child responses) steps in ~4px instead of rendering dead flat — rail hues still carry most of the depth signal.
- v4.34.3 — **ScriptPanel tab blurbs tucked behind a (?) in each view's header row + HelpTooltip contrast fix.** The per-tab description paragraph (5 lines at the top of every SCRIPTS tab) no longer renders inline (user request: "hidden behind a (?) icon") — and per the follow-up ("barely visible, wastes a new line — move it into the title/back-arrow header"), the (?) costs **zero rows**: it sits inside rows that already exist — the ← label header in ScriptEditor/DialogueEditor, and beside "+ New"/"+ Add key" in ScriptList/DialogueList/SchemaEditor/ItemsEditor (`tabHelp` computed once in ScriptPanel, threaded as an optional `help` prop). `HelpTooltip` gained `side: "above"|"below"` / `align: "center"|"right"` props (defaults preserve PropertiesPanel usages) and — per the standing "no dark-grey on darker-grey" rule — its (?) went `#505070`→`#dde3f0` with a brighter ring, popover text `#909090`→`#c2cadb` (brightens every PropertiesPanel (?) too); inactive ScriptPanel tab labels `#606070`→`#8b94a8`, active `#c0c0e0`→`#dde3f0`.
- v4.34.2 — **Dialogue response: routing moves to the bottom as a THEN row with a one-click "＋ Next page" + a real type/spacing scale.** Two user-feedback items. (1) *"What if the leads-to dropdown was at the bottom, so add-and-pick could be combined? Leads-to is rarely re-used across nodes — they're nested."* The LEADS TO row is gone from the top; the response now ends with a hairline + **THEN** row: when the response has no destination it shows a prominent **＋ Next page** button (one click creates the next page node, wires it, and nests it directly below — the button IS the add+pick combined) beside a demoted dropdown reading "— ends the conversation —" (kept for the legitimate rare cases: loop back to an earlier page, share a destination, or return to ending — the ↩ jump-chip rendering makes those still work). Routing-at-the-bottom also means the nested destination card physically follows the row that points at it. (2) *"2px changed to 3px? that's not standard css design-system increments"* — all dialogue-editor styles snapped to a real scale: spacing on 4px increments (4/8/12/16), whole-number type scale (10 micro-labels / 11 hints & ghost actions / 12 body, fields, group headers); `S.field`/`S.select` bumped panel-wide to 12px text, 6×8 padding, brighter `#d4d8e2` text; option-well header 28px min-height; chips 10px. Guide rewritten to THEN terminology; both screenshots re-shot at the new density.
- v4.34.1 — **Dialogue response layout matches the user's mockup: one toggle, two labeled groups.** The v4.34.0 "▸ Show if / On pick · counts" umbrella sub-row is gone (user supplied a design mockup — "Option A: one toggle, two labeled groups"): an expanded response now shows LEADS TO, a **hairline divider**, then two always-visible labeled groups — **Show if** with a right-aligned ghost **`+ Add condition`**, and **On pick** with **`+ Add effect`** (bold 11px group labels, `#b6bfd0`). Empty groups read quietly — *Always shown* / *No effects* (replacing the long parenthetical teaching copy, which is what made always-showing the groups affordable). The response caret remains the only toggle; `detailsOpen` state removed. Guide bullets + both screenshots re-shot (both response states visible: populated groups on the gated option, empty-state words on the other).
- v4.34.0 — **Phase 40 — Nested dialogue tree view (accordion responses).** The DIALOGUE tab's flat page-node stack becomes an actual tree: each response option is now an **accordion row** (▸/▾ caret, ellipsized text, a route tag `→ n2` / `⏹ ends` / `↩ n1` / `⚠ missing`, ×), and the page node a response leads to renders **nested inside that response** — the branching is shown as physical containment instead of hiding in dropdowns. (User feedback: "the nodes don't actually feel nested or branching"; the fullscreen-flowchart plan `plans/phase-40-dialogue-flowchart.md` was superseded by `plans/phase-40-dialogue-nested-tree.md` — no chart view, no new data fields, runtime untouched.) Mechanics: a **pure precomputed walk** in `DialogueEditor` (depth-first from `startNode`, StrictMode-safe — no render-time mutation) builds a `hosted` map (option id → node it nests); a node's full card renders exactly once, under the *first* response that leads to it — any other reference (second parent, loop) renders a **`↩ continues at nX`** jump chip that scrolls to + flashes the card (WAAPI box-shadow pulse on `#wb-dlgnode-<id>`). Unwired nodes render in a labeled **Unreachable page nodes** section at the bottom (replacing the ⚠ text row) and walk their own subtrees. **Indent policy** (user requirement, asked three times: "adding multiple must not add increasing horizontal spacing"): nested node cards render as **rail-connected SIBLINGS below the option well** (threaded-comments layout — a fragment of [well, nested card], not box-in-box), each with a 2px left rail cycling 3 muted hues; only the FIRST nesting level shows an inset — every deeper wrapper cancels the host card's per-level padding (−18px left / −5px right margins) — verified n1→n5 chain: left edges 76/93/93/93/93, widths 295/269/269/269/269 (dead flat). **Option-well design** (third user pass: "no separation, context, minimalism… use a frontend design skill"): the response text input lives IN the accordion header (transparent, underlined — no duplicate text row); the route indicator is a **pill chip** (blue tint `→ n2`/`↩ n1`, neutral `⏹ ends`, red `⚠ missing`); LEADS TO gets the app's micro-label idiom (10px uppercase, letterspaced, nowrap); Show if / On pick tuck behind a compact **`▸ Show if / On pick · 1 cond · 2 effects`** sub-row (`detailsOpen`, default collapsed, `· none` when empty, single line — `nowrap`+ellipsis, it can never wrap again) so the nested destination card sits directly under the Leads to dropdown; option × and the section "+ Add"s are ghost buttons; RESPONSE OPTIONS header → **RESPONSES**; node cards `rgba(255,255,255,0.04)` radius 6 with a single hairline (no double borders); spacing on an 8px rhythm. **Resizable left panel** (`LeftPanel.tsx`, user request): a 6px `col-resize` drag strip on the panel's right edge — pointer-captured drag, width clamped 280–600, persisted to `localStorage.wb_leftpanel_w`, `width` transition disabled while dragging; benefits every left panel (assets/materials/scripts). **Accordion defaults**: hosted options open through depth 2, "ends" options collapsed, untouched empty options open (fresh "+ Add" is ready to type); collapse hides the option's fields *and* its nested subtree; state is component-local, nothing persisted. **Authoring flow**: the Leads to dropdown gains **"＋ new page node…"** — creates the node, wires the option, and opens it nested in place, so writing a conversation is type response → new page node → type reply → repeat; the top-level "+ Add page node" button remains for unwired nodes (tooltip explains both). All editing UI (lines, per-node speaker, Show if / On pick, validations, delete/start guards) is unchanged — `DialogueNodeCard` gained `depth`/`renderNested`/`onCreateNext` props, `DialogueOptionRow` became the accordion, and everything still flows through the same `onChange(dialogue)` path. Verified in-browser end-to-end (nesting via sentinel, diamond → chip, loop → chip + no recursion, depth cap, unreachable section, collapse/expand, jump-chip scroll, v4.33.10 scroll fix intact, console clean); DIALOGUES_GUIDE.md rewritten around the nested view with both screenshots retaken. Plan: `plans/phase-40-dialogue-nested-tree.md`; acceptance: `test-plans/phase-40-dialogue-nested-tree.md`.
- v4.33.12 — **Floor-level dimming is editor-only (was ghosting off-level floors in game mode and the runtime shell).** User report: in game-start mode and in the standalone runtime, floors on non-active levels rendered at the editor's 0.15 translucency. `ZoneManager._applyDimming()` had neither of the two gates its sibling `_applyGhosts()` has: it ran in any shell, and nothing suspended it during play. Two causes, both fixed the same way as ghosts (v4.32.1): (a) new **`enableLevelDimming()`** opt-in (`_levelDimming`), called only by the editor shell in `App.tsx` beside `enableEditorGhosts()` — the runtime shell never enables it, so it no longer dims everything above level 0 (its `_activeLevel` sits at 0 forever, since nothing emits `floor:select` there); (b) `preview:start`/`preview:stop` now set **`_dimSuspended`** and re-run the pass, so both Preview and Game render every level solid. `_applyDimming` early-returns after the restore loop when either gate is off, still chaining to `_applyGhosts()` so ghost handling is unaffected. Nothing about selection/picking semantics changes — `_activeLevel` and the off-level click-through rule (v4.33.2) are untouched, and those paths are editor-only anyway.
- v4.33.10 — **ScriptPanel tab-content scroll fix (dialogue editor unreachable bottom) + DIALOGUES_GUIDE branching section.** User report: after adding a couple of page nodes / response options the dialogue editor grew too tall and the bottom could never be scrolled to. Root cause: every ScriptPanel tab-content root (`DialogueEditor`, `ScriptEditor`, `SchemaEditor`, `DialogueList`, `ItemsEditor`, `ScriptList`) was a flex column with `height:"100%"` and no `minHeight:0` inside `S.root` — a flex item's default `min-height:auto` blocks shrinking below content height, so the root overflowed `S.root`'s `overflow:hidden` clip edge and the inner `flex:1/overflowY:auto` scroller was never actually height-constrained (measured pre-fix: scroll container bottom at y=1569 with the panel clipping at 883 — 686px of content unreachable). Fix: all six roots → `flex:1, minHeight:0` (verified post-fix: scroller bottom == panel bottom, max scrollTop shows the editor's last button). **Guide:** new "What that looks like in the editor" subsection in the mental-model section of DIALOGUES_GUIDE.md — compact flowchart paired directly with a new stitched full-height screenshot (`docs/images/dialogue-branching.png`) of the exact same Guard-intro conversation authored in the PAGE NODES section (n1's two next-node dropdowns = the chart's two arrows, gated option's Show if/On pick called out, n2 card below), plus a chart→UI reading key; "Adding more page nodes" expanded into a numbered **making-it-branch recipe** (add node → add option → the dropdown pick IS the branch — no separate connect step) ending with a tiny chart of what the steps built.
- v4.33.9 — **Dialogue editor: PAGE NODES naming + label-only dialogue pickers** (user feedback on v4.33.8: "'plays one by id' — what id? aren't we label-based now?"). The two remaining `(dlg_…)` id leaks — the show_dialogue ActionFields picker and the on_dialogue_end TargetPicker — now show labels only (custom-id preservation unchanged); the DIALOGUE tab blurb rewritten without "id" ("Any script can play one with a show_dialogue action — picked by name"). User-chosen terminology applied through the editor: **NODES → PAGE NODES**, **START NODE → START PAGE-NODE**, "+ Add page node", explainer/warnings/tooltips/list-row counts aligned ("one 'page' of the conversation"). DIALOGUES_GUIDE terminology updated (mental-model table row = Page node; "Why 'node'?" aside notes the editor label) and the editor screenshot retaken to match.
- v4.33.8 — **Dialogue editor de-jargoning + wider left panel** (user feedback continuing the "(always shown)" thread: "lots of implicit stuff here — nodes? n1? speaker override?"). ScriptPanel DIALOGUE editor: NODES section gains an inline explainer ("a node is one 'screen' of the conversation… options jump to other nodes — that's how conversations branch"); the **OPTIONS** section header is now **RESPONSE OPTIONS** (+ tooltip); the `n1 · start` id badge and the next-node dropdown get explanatory tooltips; `Speaker (override)` placeholder → "Speaker for this node (optional)" with a tooltip; empty-options note → "(no responses — the conversation ends after this node's last line)". **LeftPanel width 280 → 320px** — the dialogue/condition rows were the tightest UI in the app (the has_item wrap of v4.33.5 was a symptom); every left-panel browser benefits. `DIALOGUES_GUIDE.md`: "Why 'node'?" aside (graph/flowchart origin, Twine/Ink/Yarn convention, "read it as one screen of talk"), node-card anatomy paragraph (badge + per-node speaker), RESPONSE OPTIONS terminology aligned, the new empty-state texts quoted so guide and UI match; the editor screenshot **retaken** with all the new copy + wider panel (the previous shot showed the pre-v4.33.7 "(always shown)" text).
- v4.33.7 — **Guides pass: DIALOGUES.md → `DIALOGUES_GUIDE.md` (matching the *_GUIDE.md convention) with two real screenshots** (the full DIALOGUE-tab editor with a staged tree, and the in-game overlay mid-options — docs/images/dialogue-editor.png / dialogue-ingame.png); its items callout updated to the Phase-32+ reality (Starting count field, has_item comparisons, no `inv.<id>` exposition — defers to STATE_ITEMS_GUIDE). **STATE_ITEMS_GUIDE.md inventory deep-dive**: new "The bag (the player's inventory view)" (open/close keys, dialogue/pause suppression, live count updates, unregistered-item fallback, explicit view-only-v1 scope), "How the numbers behave" (give clamps to stackSize, take floors at 0 and never fails, persistence matrix, one-counter-per-item), and "A complete inventory loop" ten-minute walkthrough wiring pickup → shop → gated door → LIVE VALUES. Live references updated (HUMAN_TESTING, arch future-systems row); historical changelog/plan mentions left as written.
- v4.33.6 — **STATE tab live-values pane + teaching empty states.** (1) While a preview session runs, the STATE tab shows a green read-only **LIVE VALUES** pane (new `LiveValues` component in ScriptPanel): every current gameState entry, refreshed on a 500ms tick (gated to previewing + STATE tab visible — a watch pane, not a per-frame HUD), item counters displayed by item label with a 🎒 (raw key fallback for unregistered), `__`-prefixed engine keys hidden. Answers "why isn't my condition firing" without the browser console. **Preview-mode only by architecture**: game mode hides all editor UI (`!isGame` gate around Toolbar/LeftPanel), so the pane's audience is ▶ Preview — documented in the guide. Threading: `isPreviewing` prop App→LeftPanel→ScriptPanel. (2) All four SCRIPTS-panel empty states (state keys, items, scripts, dialogues) now teach instead of shrug — e.g. "Nothing registered yet — scripts can use any key without registering it…". Guide gains a "Watching values live" section + screenshot (docs/images/live-values.png). Verified in-browser: pane hidden while not playing, appears in preview with health/flag/counter/item-by-label rows updating, stale keys removable via delete_state.
- v4.33.5 — **Items/state UX pass: Starting count, `inv.<id>` de-plumbing, `has_item` comparisons, key suggestions, readable hint text** (driven by user feedback: "the UX on items and state are not as obvious to me" / "the editor user should never have to think about `inv.<id>`"). (1) **Starting count on items** — `ItemDef.startCount?`; new `seedStartingInventory(world)` in `scripting/inventory.ts` runs right after every New Game reset (App preview:start reset branch + SceneRouter `newGame` — never on scene transitions, so no re-granting; clamped to stackSize). Replaces the hidden-key dance (STATE tab → hand-typed `inv.<id>` default) as the starting-inventory story. (2) **`inv.<id>` removed from authoring UX**: item rows drop the `state key inv.…` footer, ItemPicker options show label only (custom-id preservation unchanged), ITEMS blurb rewritten in intent language. (3) **`has_item` gains a comparison dropdown** — `ScriptCondition.compareOp` now applies (`owned <op> count`, default `>=` preserving all existing conditions; engine uses `compareNum`) — "fewer than 5 coins" and "has none" (`== 0`) are picker-expressible, closing the last realistic need to type an item's raw key. ConditionRow wraps the has_item fields onto a second line (4 controls don't fit one 280px row; root gains flexWrap). (4) **State-key suggestions**: one shared `<datalist id="wb-state-keys">` at the ScriptPanel root (registered keys from BOTH schema scopes + every item's counter listed by item label) wired into all 8 state-key inputs (conditions, set/adjust/delete_state, on_state_changed target, store_position) — native type-or-pick, free text still allowed. (5) **Contrast pass**: ScriptPanel's `#555`/`#606070`-on-dark hint/blurb text lifted to `#98a2b8`/`#8b94a8` at 11px; per-tab blurbs 11.5px non-italic (user: "no more dark grey text on darker grey"). Verified in-browser: New Game seeds startCount (bag ×5) in editor preview; has_item semantics exact (`<5` true at 3, `<3` false, `==3` true, `==0` true unowned, legacy `≥` default intact); datalist present with schema keys; has_item row renders item/op/count wrapped; no `inv.` text anywhere in the panel. Companion user guide: `STATE_ITEMS_GUIDE.md` (5 real screenshots in docs/images/).
- v4.33.4 — **STATE tab: GAME / THIS SCENE scope toggle** (closing the Phase 33 asymmetry — ITEMS switched to the shared game.json registry when a project is open, but the STATE tab silently kept editing the scene's schema, leaving game-level schema hand-edit-only). With a project open the STATE tab shows a segmented **GAME / THIS SCENE** toggle (no project → exactly the old single-scope UI): GAME edits `game.json.stateSchema` via new `handleGameSchemaChange` (mirrors the game-items path — writes `store.game.stateSchema` + `world.gameStateSchema` + a `gameSchema` React mirror, dirty-flagged, persisted by Save's `writeGame()`, outside the undo journal; **empty schema normalizes to `undefined`** so the game-under-scene `configureSchema` fallback semantics and the serialized game.json stay clean); THIS SCENE keeps the existing transaction-backed `WorldConfig.stateSchema` path. `gameSchema` mirror set at every project adopt site (adoptProject, boot restore) and cleared on close; scope-aware blurbs explain override precedence. Threading: optional `gameStateSchema`/`onGameStateSchemaChange` App→LeftPanel→ScriptPanel (absent = no toggle). Verified in-browser on the live project: GAME-scope `+ Add key` landed in `world.gameStateSchema` with the scene's schema byte-untouched, Save wrote it into `public/games/<id>/game.json` on disk, deleting the key normalized `gameStateSchema` back to `undefined` and Save round-tripped game.json to its original form (no dirty files); THIS SCENE scope showed the scene's `health` key.
- v4.33.3 — **Trigger volumes: MOVE / RESIZE edit-mode toggle.** User request: the face resize handles and the move gizmo both showed at once and fought for the pick — "I need one or the other, never both." `TriggerVolumeView` gains a segmented **EDIT MODE** control (MOVE default): a module-scoped sticky (`TRIGGER_EDIT_MODE`, session-only) so a resize pass over several volumes keeps the mode across selections. Wiring is two existing idioms: new `trigger:resize-toggle { enabled }` event (types.ts) gates `TriggerVolumeResizer._shouldShow()` (handles hidden until enabled — the ShapeResizer `shape:resize-toggle` pattern), and `gizmo:suspend { source: "trigger-edit-mode" }` hides the entity gizmo while resizing. The panel broadcasts on selection change + toggle and clears both on unmount, so deselecting or selecting a different entity type restores the normal gizmo. Verified in-browser: RESIZE shows exactly the 6 face handles with every TransformControls hidden; MOVE restores the gizmo and clears handles; switching to a shape while in RESIZE re-enables that entity's gizmo. Behavior change: handles no longer appear automatically on trigger selection — toggle RESIZE in the panel.
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
  "scene:load-request":    { sceneId: string };   // load_scene action → runtime SceneRouter (no editor listener)
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

// ⚠️ NEVER IMPLEMENTED as written. The procedural Sky's turbidity/rayleigh/sun-angle
// stay hardcoded in SceneManager._setupSky(). Phase 37 (v4.31.0) instead shipped
// *selectable image skyboxes*: WorldConfig.skybox is a real value now — "sky" = the
// procedural sky, any other string = a SkyboxDef id (see below). This SkyConfig
// scrubbing interface was never built and is kept only as a historical marker.
export interface SkyConfig {
  turbidity:        number;
  rayleigh:         number;
  mieCoefficient:   number;
  mieDirectionalG:  number;
  sunElevation:     number;
  sunAzimuth:       number;
}

// Phase 37 (v4.31.0) — selectable/importable skybox library. Manifest at
// public/assets/skyboxes/manifest.json, loaded by AssetManager.initSkyboxes().
export interface SkyboxDef {
  id:        string;
  label:     string;
  category:  string;                // 'Day' | 'Sunset' | 'Night' | 'Space' | 'Studio' | 'Other'
  path:      string;                // equirectangular image (/assets/skyboxes/*.jpg|png|hdr)
  format:    'ldr' | 'hdr';         // ldr = TextureLoader; hdr = RGBELoader (lazy import)
  thumbnail?: string;
  tags:      string[];
  dateAdded: string;
  attribution?: Attribution;
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
  skybox:         string;        // Phase 37: "sky" = procedural, else a SkyboxDef id (image bg + IBL)
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
  linkId?: string;   // cross-floor corner link (copy-to-floor) — mates keep the same x/z
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
  bottomMaterial?:          string;             // Phase 38 — bottom cap; falls back to `material`
  bottomMaterialOverrides?: MaterialOverrides;  // Phase 38
  editorGhost?:           boolean;    // Phase 38 — translucent click-through in the EDITOR only; solid in preview/game/runtime
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
  | 'run_script'         // JavaScript escape hatch
  | 'load_scene';        // runtime shell: route to another manifest scene (no-op in editor preview)

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
├── runtime.html                    ← second Vite entry: the standalone runtime shell (Phase 25)
├── vite.config.ts                  ← build.rollupOptions.input = { main, runtime }
├── package.json
├── WORLD_EDITOR_ARCHITECTURE.md
├── public/
│   └── demo/                       ← committed runtime demo: manifest.json + scenes/level_01/02 (Phase 25)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── project/                    ← Phase 33 — project layer (multi-scene games)
│   │   └── ProjectStore.ts         ← ALL project file IO: manifest/game.json/scenes CRUD, publishTo, IDB session persistence
│   ├── runtime/                    ← runtime shell composition root (Phase 25; editor-free)
│   │   ├── main.tsx                ← createRoot(<RuntimeApp/>)
│   │   ├── RuntimeApp.tsx          ← the "small App.tsx": engine construction + shell states + overlays
│   │   ├── manifest.ts             ← RuntimeManifest schema, loadManifest(url), relative-URL resolution
│   │   ├── SceneRouter.ts          ← file-level scene routing (teardown → fetch → migrate → load → enter)
│   │   ├── saveGame.ts             ← runtime_gamesave:<manifest.id> blob (sceneId + state + oneShots + pose)
│   │   └── ui/                     ← MainMenu / LoadingScreen / ErrorScreen (DOM overlays)
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
│   │   ├── MoverSystem.ts          ← scripted geometry motion: kinematic bodies follow mover defs each frame (Phase 31)
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
│   │   ├── PhysicsWorld.ts         ← Rapier world singleton, step loop, debug draw; kinematic mover bodies (Phase 31)
│   │   ├── ColliderBuilder.ts      ← mesh → Rapier collider (called by every builder); body-relative mover paths (Phase 31)
│   │   └── CharacterBody.ts        ← Rapier KinematicCharacterController wrapper + groundBodyHandle() (Phase 31)
│   ├── scripting/
│   │   ├── ScriptEngine.ts         ← Runtime: trigger index, condition eval, action dispatch
│   │   └── GameState.ts            ← Generic runtime state store (see GAMEPLAY_STATE.md; replaced GameStateManager)
│   ├── audio/                      ← Phase 36 — audio system
│   │   └── AudioSystem.ts          ← AudioListener + music/ambient/positional playback + 4-bus mixer (both roots)
│   ├── input/                      ← preview-mode input (Phase 24; editor input = core/InputManager)
│   │   ├── actions.ts              ← ActionState struct + InputSource interface
│   │   ├── bindings.ts             ← BindingsConfig, defaults, localStorage load/save
│   │   ├── ControlSchemeManager.ts ← per-frame source merge, scheme label, menu mode
│   │   ├── KeyboardMouseSource.ts
│   │   ├── GamepadSource.ts        ← navigator.getGamepads() polling, deadzone+rescale
│   │   └── TouchSource.ts          ← shared store written by TouchControlsOverlay
│   ├── preview/
│   │   ├── PreviewController.ts    ← owns the ControlSchemeManager session (Phase 24)
│   │   ├── CharacterController.ts  ← consumes ActionState (no DOM listeners); physics via CharacterBody
│   │   ├── FadeOverlay.tsx         ← fade_screen renderer (overlay:fade-in)
│   │   └── TriggerSystem.ts        ← door/zone trigger detection via Rapier sensors
│   ├── dev/
│   │   └── testHelpers.ts          ← DEV-only window.__test harness (preview/scripts/spawns)
│   ├── ui/
│   │   ├── EditorUI.tsx
│   │   ├── Toolbar.tsx
│   │   ├── TouchControlsOverlay.tsx ← virtual joystick / jump / ✕ / 🎒 (Phase 24, bag Phase 32)
│   │   ├── BagOverlay.tsx          ← inventory bag (Phase 32) — container + swappable style renderers (BAG_STYLES)
│   │   ├── ControlsSection.tsx     ← device-local bindings knobs (Phase 24)
│   │   ├── PropertiesPanel.tsx
│   │   ├── FloorLevelSelector.tsx
│   │   ├── ZonePanel.tsx
│   │   ├── AssetBrowser.tsx
│   │   ├── ScriptPanel.tsx         ← LEVEL/SELECTED/DIALOGUE/STATE/ITEMS tabs, script + dialogue-tree + item-registry list/editor drill-down
│   │   ├── DialogueFlowchart.tsx   ← secondary node-and-arrow chart of a dialogue tree, docked right of the panel (Phase 41)
│   │   ├── DecalBrowser.tsx        ← decal texture picker (Overlay/Surface toggle, category pills)
│   │   ├── DialogueOverlay.tsx     ← in-game dialogue box (per-node lines + response options; confirm advances/selects, menu:nav highlights — Phase 30)
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

**Phase 25:** the ctor takes `opts?: { mode?: "editor" | "game" }` (default
`"editor"`). Game mode — used by the runtime shell — skips the EditorCamera
(the `editorCamera` field is `EditorCamera | null`), the ViewHelper, and
`_setupGrid()` (grid helpers + the demo ground plane); the RAF loop guards all
three with `?.`. Before a character camera is set, a game-mode canvas renders
just sky + lighting with the static default camera.

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

> ⚠️ **Zones & transitions are effectively single-zone now — read this before trusting the multi-zone examples below.**
> The original design (shown in the JSON below with a `zones[]` array and a `transitions[]`
> array of door/loading-zone links between zones) described a **multi-zone-per-scene** world
> where the player walked between "rooms" via `TransitionDef`s. **That layer was removed and
> superseded by the scene/level model (Phase 25 runtime shell + Phase 33 projects).** In the
> shipped code:
> - **Every scene has exactly one zone**, always created by `createDemoZone()` (`App.tsx`). There
>   is **no working UI to create a second zone** — `ZoneTool` never activates (the `"zone"`
>   ToolId toggles the Groups panel instead and never emits `tool:select`), and its
>   `zonetool:awaiting-name` event has no handler. `ZonePanel` / `ZoneNamingDialog` are
>   unmounted. (`ZoneTool` + those panels were **deleted** in the Phase 36 cleanup; this doc's
>   `### ZoneTool.ts` section is retained only as history.)
> - **There is no `TransitionManager`** (never built as a file). `TransitionDef` /
>   `world.transitions` / openings' `linkedZoneId` survive as **vestigial data** in the schema
>   (serialized as empty arrays, no runtime consumer) — kept for save-format stability, not
>   because anything drives them. The `## TransitionManager.ts` and `### TransitionTool.ts`
>   sections below describe code that does not exist.
> - **Moving the player between areas** is done two ways: **across levels** via the `load_scene`
>   action → runtime `SceneRouter` (a different scene `.json`), and **within a level** via
>   trigger volumes + scripts. There are no sub-zones to move between.
>
> So read `zones[]` below as "always length 1" and `transitions[]` as "always empty".

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
    },
    "audio": {
      "music":   { "soundId": "theme_01", "volume": 0.7, "loop": true },
      "ambient": { "soundId": "wind_loop", "volume": 0.5 },
      "mix":     { "master": 1, "music": 1, "sfx": 1, "ambient": 1 }
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
          },
          "sound": { "soundId": "campfire_loop", "volume": 0.8, "loop": true, "refDistance": 2, "maxDistance": 15 }
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
>
> **v4.28.0 (Phase 34):** `addLadder` / `updateLadder` / `removeLadder` — the same
> optional-array pattern (`zone.ladders ??= []`), `"ladder"` ChangeKind, emits
> `ladder:added/updated/removed`. Serialization is wholesale (zones round-trip whole),
> so no WorldLoader changes were needed.
>
> **v4.29.0 (Phase 35):** `addLight` / `updateLight` / `removeLight` — same pattern
> (`zone.lights ??= []`, `"light"` ChangeKind, `light:added/updated/removed`), **plus
> the `light` case in `_emitChange`** so undo/redo replays reach ZoneManager (a kind
> without a case there silently skips the scene rebuild — checkpoints still have this
> gap). Also `updateWorldLighting({ ambient?, sun?, envIntensity? })`: mutates
> `world.ambientLight` / `world.sunLight` / `world.envIntensity` (seeding the default
> WorldConfig when null — fresh sessions) and emits **`world:lighting`** (payload
> includes `envIntensity ?? 1` since v4.29.5); `loadFromJSON` emits the same event
> after `world:loaded` so SceneManager applies saved values on every load. NOT
> journaled (matches playerSettings edits).

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

1. `opening` / `object` / `checkpoint` / `light` / `spawn` — props, markers, openings (light markers v4.29.0)
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
| `scene:load-request` | ScriptEngine (`load_scene`) → runtime SceneRouter | `{ sceneId }` — no editor listener; no-op in editor preview |
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
| `input:scheme-changed` | ControlSchemeManager → React | `{ scheme: "kbm"\|"gamepad"\|"touch" }` — label flip: HUD prompts, touch overlay, pointer-lock policy |
| `action:confirm` | ControlSchemeManager → DialogueOverlay | `{}` — dialogue advance / option select (any scheme); emitted only while a dialogue is open |
| `action:cancel` | ControlSchemeManager → App | `{}` — Start/✕: close dialogue else exit preview |
| `dialogue:closed` | App → ControlSchemeManager, DialogueRunner | `{}` — menu-mode gate off; DialogueRunner fires `on_dialogue_end` (Phase 30) |
| `dialogue:choose` | DialogueOverlay → DialogueRunner | `{ index }` — picked option (into the filtered options shown; Phase 30) |
| `mover:set` | ScriptEngine → MoverSystem | `{ targetId, op: "start"\|"stop"\|"toggle" }` — start/stop/toggle_mover actions, targetId pre-expanded from groups (Phase 31) |
| `pause:show` / `pause:closed` | App ↔ ControlSchemeManager/PreviewController | `{}` — pause menu open/close (menu-mode gate; pointer lock released/re-acquired) |
| `menu:nav` | ControlSchemeManager → PauseMenu, DialogueOverlay, BagOverlay | `{ dir: -1\|1 }` — menu/option highlight (menu mode only): kbm arrows/W/S, gamepad d-pad or left-stick flick (v4.24.2) |
| `bag:toggle` | ControlSchemeManager → App/RuntimeApp | `{}` — bag key edge (kbm I/Tab, gamepad Y, touch 🎒); shells ignore it behind dialogue/pause and in occlusion mode (Phase 32) |
| `bag:show` / `bag:closed` | App/RuntimeApp → ControlSchemeManager | `{}` — inventory bag open/close (third menu-mode gate after dialogue/pause; Phase 32) |
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

**Editor-mode only.** Preview/game-mode input lives in `src/input/`
(ControlSchemeManager, Phase 24) — a sibling with the same idioms (typed bus
events, fade suppression), not a consumer of these events.

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

## SceneManager.ts

Owns the renderer, scene, RAF loop, lighting/sky/grid setup, and camera selection.

> **v4.29.0 (Phase 35):** the base lighting (`_ambientLight` field + `_sunLight`) is
> no longer edit-proof — a ctor subscription to **`world:lighting`** applies
> `WorldConfig.ambientLight`/`sunLight` color+intensity (both editor and runtime
> SceneManagers, since WorldState emits it on load and on WORLD LIGHT panel edits).
> Hardcoded defaults stay ambient `#aabbcc @ 0.5` / sun `#fff4e0 @ 2.0` — the values
> `migrateWorldLighting` normalizes old saves to. The sky-linked sun *position*
> remains hardcoded.
>
> **v4.29.5:** true-darkness support. The fill/rim directionals (now `_fillLight`/
> `_rimLight` fields) **scale with sun intensity** in the `world:lighting` handler
> (baseline ratios 0.3× and 0.15× of sun — exactly 0.6/0.3 at the default sun 2.0),
> and `scene.environmentIntensity` is driven by the event's `envIntensity` (the IBL
> term from the PMREM RoomEnvironment). Ambient 0 + sun 0 + environment 0 = a truly
> dark scene lit only by placed lights (verified: center-floor pixel [32,42,50] →
> [5,8,9]).
>
> **v4.31.0 (Phase 37):** skybox selection. The ctor also subscribes to **`world:sky`**
> (`{ skybox }`, emitted by `WorldState.updateWorldSky` on edit and by `loadFromJSON` on
> load). `_applySkybox(id)`: `"sky"` shows the procedural `Sky` mesh, `scene.background =
> null`, and restores the RoomEnvironment env map; any other id `assetManager.loadSkybox`s
> an equirectangular image → hides the `Sky` mesh, sets `scene.background = tex`, and
> `scene.environment = PMREMGenerator.fromEquirectangular(tex)` (regenerated, old one
> disposed). A `_skyReqToken` guards against a slow load clobbering a newer selection;
> `environmentIntensity` (from `world:lighting`) still multiplies whichever env map is
> active. Both roots get it (App + RuntimeApp share SceneManager).
>
> **v4.33.1:** follow-the-camera sun shadow frustum + `PCFSoftShadowMap`. The sun's
> ortho shadow box shrank ±40 → **±25** (`SHADOW_HALF`) and `_updateSunShadow()`
> (called each `_loop` tick) re-centers it on the **editor camera's `focus`** (or
> `SHADOW_AHEAD`=15m along the preview/game camera's view direction), moving
> `sun.position` and `sun.target` by the same delta so the light *direction* never
> changes. The center is snapped to whole shadow-map texels in the shadow camera's
> basis (captured lazily once — the direction is fixed after `_setupSky`) so shadow
> edges don't crawl when panning; `sun.target` is added to the scene so its matrix
> updates. Net: ~1.6× sharper texel density AND whole-world coverage (the old static
> ±40 box clipped shadows past x≈±40 — user content at x −55 cast none), all scratch
> preallocated. `shadowMap.type` is now `PCFSoftShadowMap` — A/B measured on the
> user's level-2 (same view, runtime type toggle + forced material recompile):
> PCF 98–112 FPS / 15–20ms worst vs PCFSoft 101–113 FPS / 15–19ms worst — identical
> within noise, so the softer filtering is free here. Motivation: blocky
> stair-stepped shadows inside a carved brush alcove (8cm texels at grazing angles).
>
> **Bias fix (same change set):** the sharper shadows exposed a light leak — a bright
> band in every floor/wall crease (user report, alcove interior). `shadow.bias` is in
> normalized [near,far] depth units, and the old near 0.5 / far 200 range made
> -0.001 ≈ **20cm** of world depth — fragments within 20cm of an occluder in light
> space tested "lit", detaching the shadow from wall bases. Fix: near/far tightened
> to **10/100** (brackets the follow box: light 50m out, box ±25, height slack) and
> acne control moved to **`normalBias = 0.03`** (offsets the sample along the surface
> normal — no depth detachment) with `bias = -0.0001` residual. Verified from inside
> the user's carved alcove: crease bands gone, no acne.
`_loop()` each frame: `editorCamera?.update(dt)` (only when no preview camera),
update callbacks (physics step, character, mixers), then
`renderer.render(scene, _previewCamera ?? camera)`. `setPreviewCamera(cam)` is the
preview/game camera swap: stores the character camera, disables editor-camera input,
hides the ViewHelper; `null` restores all three + editor aspect. Ctor `opts.mode:
"editor" | "game"` (Phase 25) — game mode (runtime shell) has no EditorCamera /
ViewHelper / grid.

**Cull-as-player override (Phase 28, occlusion-test mode only).**
`setCullOverrideCamera(logicCam | null)` arms a pre/post-render pass in `_loop`:

```ts
this._applyCullOverride();     // no-op unless armed (single null check otherwise)
this.renderer.clear();
this.renderer.render(this.scene, this._previewCamera ?? this.camera);
this._restoreCullOverride();   // restore before anything else reads .visible
```

The apply pass replicates the renderer's own culling test from the *logic* camera
(the character's unrendered camera): builds a `Frustum` from
`projectionMatrix × matrixWorldInverse`, then for every Mesh with
`userData.editorId` — skipping `hideInGame`/`editorOnly`, meshes already hidden
(script state is respected, never resurrected), and `frustumCulled === false`
opt-outs — tests the world-space bounding sphere and sets `visible = false` on
failures, recording exactly what it hid. Restore flips only those back right after
the render, so scripts/panels never observe the mutation. All scratch objects
(Frustum/Matrix4/Sphere/array) preallocated — no per-frame alloc. `cullStats`
getter exposes `{ tested, hidden }` (null when off); `activeRenderCamera` getter
exposes `_previewCamera ?? camera` for tests. Known accepted side effect: a mesh
hidden for the frame also drops out of that frame's shadow map.

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

`enabled` gates both the input handlers AND `update()` (early return) — so a
disabled editor camera is fully frozen, not just deaf. `setPreviewCamera` drives
it for preview/game; **occlusion-test mode (Phase 28) reuses this camera as the
rendered debug vantage** and toggles `enabled` per sub-mode: `camera` sub-mode =
live orbit controls, `player` sub-mode = frozen vantage while game input drives
the character. (Console reframing via the TESTING.md §3.5 recipe only applies
while `enabled` — i.e. in camera sub-mode.)

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

> **v4.25.0 (Phase 31):** when `platform.mover?.enabled` on a plain slab (NOT CSG-cut,
> NOT polygon — those bake world-space geometry a mover can't animate), `build()` creates
> a kinematic body carrying position+yaw via `physicsWorld.createKinematicBody`, registers
> the collider body-relative, and returns it as `moverBody` in `PlatformBuildOutput` so
> ZoneManager can register the mover.

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
- **capMesh**: top + bottom faces merged (custom geometry, not BoxGeometry). Polygon platforms use `ShapeGeometry`. Receives CSG cuts in world space. **Phase 38:** when `bottomMaterial` / `bottomMaterialOverrides` is set, the cap builders take a `CapFaces = "both"|"top"|"bottom"` param and the bottom face splits into its own **bottomMesh** (`selectable: true` — ceilings are clicked from below; own tileScale/UV-offset resolution falling back to the cap's; CSG-cut via the shared `cutWorldGeo` helper). Unset = merged path unchanged.
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
  colliders: RAPIER.Collider[];  // one per step (× flights) + one per landing slab
}
```

**Layout (Phase 29 — `src/builders/stairLayout.ts`):** all flight/landing/rail-path
math lives in a pure module consumed by BOTH `StairBuilder` and
`ColliderBuilder.registerStairSteps` (single source of truth — mesh and physics
cannot drift; imports only types, so no cycle). `computeStairLayout(stair)`
resolves the optional `landing`/`flights`/`turn`/`gap` fields (clamped
defensively — hand-edited JSON never throws) into `FlightSpec[]` (start/end per
flight; flight k repeats flight 1's run/rise at lateral pitch `width+gap`,
180°-alternated; flight 0 ≡ the def's own start/end) and `LandingSpec[]`
(u/v-frame slab bounds + topY/bottomY; a landing tops every flight when
`landing` is set — span = both flights + void for switchbacks, `landing.width`
for a single flight; thickness derives from the underside mode). A plain stair
(`isPlainStair`: flights ≤ 1, no landing) degenerates to exactly
`[{start,end}], []` — legacy geometry falls out unchanged. `build()` loops
`emitFlight(fStart, fEnd, mode)` (the pre-29 per-step loop, extracted verbatim)
over the flights and `emitLanding()` over the slabs (body accumulator, tread
material, per-face winding corrected for the mirrored "left"-turn frame — via
`pushQuadUV` with each corner keeping its own UV, so the mirrored faces don't
transpose the U/V tiling axes, v4.29.14);
upper flights/landings downgrade `closed` underside to the diagonal soffit.

**Mesh breakdown:**
- **bodyMesh**: single merged custom geometry for all step tops/sides/backs (one mesh per material — body material). `treadUvJitter` (0–1, v4.32.7) offsets **each step-top (tread) face's** UVs by a deterministic per-step hash (`hash01(stair.id, flightIdx, stepIdx, lane)` with lanes 2/3, distinct from the riser's 0/1 so treads and risers don't shift alike) — the tread quad emits via `pushQuadUV` instead of `pushQuad`; 0/absent = uniform (previous behavior). The sides/soffit/caps keep their continuous world-space UVs (jitter would break the flow), so only the tread top is varied. The underside is **mode-gated** by `stair.underside` (`StairUndersideDef`): `open` (default) = current free-floating per-step boxes; `diagonal` = a solid wedge — per-step side trapezoids + a single slanted soffit plane offset below the nosing line by `thickness` (a front cap fills the sub-floor nose, a back cap closes the top); `closed` = the same but the underside is flat at the floor (`y = start.y`) with a vertical back cap. Side-corner local y is constant across steps (`hh − effThk` / `3·hh − effThk`, or floor for closed), so the soffit tiles watertight. `thickness` is the **clearance below the steps** (visible stringer depth); the internal drop below the nosing line is `effThk = thickness + stepRise`, which is always `> stepRise` so the plane clears the inner step corners (the front nose dips `thickness` below the floor, closed off by the front cap). New faces reuse the **body material**, and the stringer side/underside faces use **continuous world-space UVs** (via `pushQuadUV` with explicit per-corner UVs — sides map u=run distance / v=world height, soffit maps u=run / v=width) so one large texture flows across the whole stringer instead of restarting per step (the per-step `pushQuad` restarts UVs at `(0,0)`, which is fine for separate treads but tiled visibly on a continuous panel). Colliders are unchanged (per-step) regardless of underside mode.
- **riserMesh**: single merged geometry for all step front faces (`riserMaterial` if set, else falls back to body material). `riserUvJitter` (0–1, v4.29.15) offsets each riser's UVs by a deterministic per-step hash (`hash01(stair.id, flightIdx, stepIdx, lane)` from UVUtils) so risers show different windows of the texture instead of the identical crop; 0/absent = uniform (previous behavior)
- **landingMesh** (v4.23.2, only when landings exist): single merged geometry for all landing slabs (`landingMaterial` if set, else body material), selectable like the body
- **railing meshes**: built when `hasRailing: true` — posts are `BoxGeometry`, top-rail bars come from `railBarGeo(len, taperStart, taperEnd)` (v4.23.6/7): spans exactly ±len/2 (callers bake the `+barT` miter extension into `len` — the path branch does so for every segment), square ends = `BoxGeometry`, used by the **plain-stair branch**; the Phase-29 path branch instead builds each bar with `railBar` (v4.23.11): world-space `ConvexGeometry`, interior corners cut on the bisector plane shared with the adjacent segment (true mitered seams, no stubs), free path ends chamfered (45° clips of `0.3·barT` on both tip corners). Config from `stair.railing` (`StairRailingDef`): `topRail`/`balusters` toggles, `height`, `stepInterval` (a post every N steps, top step always included), `barThickness`, `postThickness`, `sideInset`, `overhang`. Absent → defaults (0.9 / every step / 0.1 / 0.06 / 0.1 / 0.15). Two code paths:
  - **Plain stair** (`isPlainStair`): the pre-Phase-29 railing verbatim — per side, a sloped top rail plus vertical balusters anchored at the **centre of each step's tread** (local x = 0, outer edge), rail spanning first→last tread centre + a symmetric `overhang` each end (both ends tapered since v4.23.6, same span), built via a slope-aligned orthonormal basis (`makeBasis`): rail follows the diagonal, posts are world-vertical.
  - **Landing/switchback** (Phase 29): `computeRailPaths(stair, layout)` returns **side-tagged** (`RailSide`, inner/outer) walking-surface-height polylines — an **inner path** around the void (up flight k's void side → levels out at the landing edge and eases a short horizontal run onto the landing (v4.23.12, `ease = min(0.3, 0.4·D)`) → flat 90° across behind the void → ease back → straight up flight k+1 → …; every bend is planar so rail miters always line up. The TOP landing gets no wrap (v4.23.13): the rail runs one straight tread-depth onto the landing and ends free with the chamfered tip) and **outer rails** gated by `landingPerimeter` (v4.23.1, default **false**): OFF = per-flight sloped segments terminating at each landing boundary; ON = one continuous path wrapping every landing's three outer perimeter edges, the last leg lying on flight k+1's outer rail line, terminating at the top landing's open exit edge. flights=1 + landing = balcony: side rails stop at the landing edge, or (perimeter ON) wrap its 3 exposed edges with a lateral jog when `landing.width > width`; the entry edge stays open. `emitRailPath` renders each segment as an oriented bar `handrailH` above the path (`railBarGeo`: +`barThickness/2` overlap per connected end closes interior miters; unconnected ends of sloped segments get the v4.23.6 taper) and posts from the pure module's per-side deduped list — corner posts at every path vertex **except free overhang tips** (v4.23.5), end-of-path posts pulled inward by `postT/2 + 0.3·barT` so they tuck under the bar's full section (v4.23.14), per-step anchors on sloped runs **skipping anchors that crowd a corner post half a step away** (top always; bottom unless the end is a free tip — v4.23.5), `stepInterval × stepDepth` spacing on level runs — gated per side by `balustersInner`/`balustersOuter` (both default to `balusters`; inner = turn/void side, same mapping in the plain-stair branch).
- **CSG cutter wireframe**: `LineSegments` (EdgesGeometry of cutter box) if `stair.csgCutter` is set. Tagged `editorOnly: true` — hidden in preview mode.
- **railing material** (v4.23.3): rails/posts use `railingMaterial` if set (with `railingMaterialOverrides`), else the built-in metal grey. Same fallback chain as risers/landings.
- **railing colliders** (v4.23.3): one thin oriented barrier cuboid per rail run (surface→handrail height), collected during rail generation and registered by `ColliderBuilder.registerStairRailings` so characters can't walk through the rails. Built even when the topRail/baluster visuals are toggled off (the barrier follows the run, not the visible bars).

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

**Colliders:** `ColliderBuilder.registerStairSteps(stair)` → consumes the same `computeStairLayout` output: one box collider per step **per flight**, plus one thin inclined **climb-ramp** cuboid per flight (v4.23.18, top face just above the step-nosing line so characters glide instead of bumping over steps; cyan editor-only wireframe in StairBuilder), plus one cuboid per landing slab (frame-axis-aligned, rotated by the stair's `-angle` like the step boxes). Plain stairs emit byte-identical descriptors to pre-Phase-29.

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

> **v4.25.0 (Phase 31):** when `shape.mover?.enabled` (any kind, incl. face-brushes),
> `build()` creates a kinematic body at the shape's full rest pose and attaches the
> local-space hull/trimesh body-relative; returned as `moverBody` in `ShapeBuildOutput`.
> A degenerate hull (no collider) drops the orphan body — the mesh still animates.

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
  (facesFromCloud / splitFaceQuad / extrudeFace / insetFace / splitEdge /
  validateMesh — pure, fresh-array outputs for the undo journal; Phase 39 added
  insetFace, splitEdge, and negative extrudeFace distances — see the v-entry in
  the changelog).

## ZoneManager.ts

> **v4.25.0 (Phase 31):** ctor gains a 5th arg `movers: MoverSystem`. Every
> platform/shape/object build path registers an enabled mover after the builder poses the
> meshes (`_syncPlatformMover` — only when the builder returned a `moverBody`;
> `_syncShapeMover` — even with a null body; objects inside `_buildObjectColliders`, which
> also creates the object's kinematic body when it has solid colliders). Remove paths,
> `_removeObject` and `unloadZone` unregister; rebuilds re-register automatically because
> `register` overwrites. `object:updated` rebuilds colliders on `changes.mover` too, and
> its shape-move fast path is skipped for mover shapes (`_movers.has(id)`) — their collider
> is parented to the kinematic body.
>
> **v4.28.0 (Phase 34):** ladders join the entity lifecycle — `ladderEntries`
> (meshes + solid collider + 2 sensors + def) in each ZoneEntry with its own
> `laddersGroup`, `ladder:added/updated/removed` handlers mirroring the stair trio,
> and `ladderSensorMap` (collider handle → ladderId, both sensor boxes) exposed for
> `TriggerSystem.setLadderSensors`. Remove/rebuild/unload paths delete the handles
> before freeing the colliders.
>
> **v4.29.0 (Phase 35):** lights join too — `lightEntries` (`{ light, marker }`) per
> ZoneEntry in a `lightsGroup`, `light:added/updated/removed` handlers (update =
> remove + rebuild). `_buildLight` makes the real THREE Point/Spot/DirectionalLight
> (physical intensity, `range` → distance, spot `angleDeg` half-angle, penumbra 0.3
> fixed; castShadow → 512² map, spot/point `shadow.camera.far = range || 50`,
> directional ±20 ortho box) — so lights render in editor, preview, game AND the
> runtime shell for free. Spot/directional aim from `pitchDeg`/`yawDeg` via
> `lightAimDir()` (yaw 0 = -Z like facingDeg, pitch 90 = down); `light.target` is
> added to lightsGroup. The pick **marker** (octahedron bulb + wire halo + aim
> ArrowHelper for non-point) is tagged `editorType:"light"` + `hideInGame` (visible
> in editor + preview, hidden in game). Light + target also carry the editorId
> (selectable:false) so gizmo translate moves the actual light live during the drag.
> `unloadZone` calls `light.dispose()` (shadow map); marker geometry/materials go
> with the group traverse (`_ownsMaterial` on marker children).
>
> **v4.29.6:** `LightDef.staticShadow` → build freezes the map (`shadow.autoUpdate =
> false` + one-shot `needsUpdate`); `_refreshStaticShadows(zoneId)` re-pokes frozen
> maps on every `*:rebuilt` event and object add/remove (editor WYSIWYG — runtime
> movers deliberately don't refresh). `light:set` handler (`_setLightOp`): on/off/
> toggle via **intensity only** (shader-stable), off also halts the light's shadow
> passes; `_restoreLightStates()` resets all lights from their defs on preview:stop.

## MoverSystem.ts

`src/world/MoverSystem.ts` (Phase 31) — scripted geometry motion. Registry keyed by entity
id; each entry holds the `MoverDef`, the entity's kinematic body (nullable), and per-mesh
rest transforms captured at registration (off-origin meshes — e.g. a platform's railing —
orbit the entity origin correctly under spin via the world-space delta rotation).
`update(dt)` no-ops unless active (armed on `preview:start`, disarmed + full rest reset with
a hard body teleport on `preview:stop`) and runs **before `physicsWorld.step`** in both
shells so the step consumes fresh `setNextKinematicTranslation/Rotation` targets. Slide:
sinusoidal ease-in-out along the entity-local axis, `loop` ping-pong with optional `dwell`
and `phase` offset, or `once` (stops at either end; `toggle` heads for the other end —
doors). Spin: linear deg/s about the local axis. Zero per-frame allocations (module-level
scratch `Vector3`/`Quaternion`s **and reused plain `{x,y,z}`/`{x,y,z,w}` objects for the
Rapier setters** — v4.25.1). Subscribes `mover:set { targetId, op }` from the script
actions. `carryDelta(bodyHandle)` exposes each mover's per-frame world translation for the
CharacterController platform-carry — **O(1) via a `_byHandle` Map** (v4.25.1), which also
backs the bound `isMoverBody` predicate used by the push contact scan. `anyRunning()`
gates all of the controller's carry/push work. `update()` **skips idle entries** entirely:
a stopped mover's pose was applied on its stopping frame and its `delta` is zeroed on
every running→stopped transition (`once`-end clamp, `stop` op, pause toggle), so riders
never inherit a stale carry. DEV global: `window.__movers`.

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

**Editor-only, like ghosts (v4.33.12):** dimming is gated on `enableLevelDimming()` (called by App.tsx, never by the runtime shell) and suspended between `preview:start`/`preview:stop` via `_dimSuspended` — so Preview, Game, and the standalone runtime all render every level solid. When either gate is off, `_applyDimming` restores all dimmed meshes and returns early (still chaining to `_applyGhosts()`).

**Ghost ceilings (v4.32.1):** `_applyGhosts()` chains from `_applyDimming`'s tail (so every build path reapplies it) and does the same material-swap for platforms with `editorGhost: true` — transparent 0.15 clone + `userData.ghostPick` (click-through via the SelectionManager ghost rule). Editor-only: `enableEditorGhosts()` is called by App.tsx, never by the runtime shell; `preview:start/stop` toggle `_ghostsSolid` so ghosts play solid. Skip-guards keep the ghost and dim mesh sets disjoint; `_removePlatform` restores/disposes ghost clones like dim clones.

**CSG cutter integration**
`stair:added/updated/removed` → `_rebuildOverlapping(zoneId, stair)` computes the cutter's world AABB and rebuilds any floor/platform whose bounds overlap.
- `_getStairCuttersForFloor(zoneId, floor)` → `THREE.Mesh[]` (plain cutter meshes for FloorBuilder)
- `_getStairCuttersForPlatform(zoneId, platform)` → `CutInfo[]` (includes tiling + inner face data for PlatformBuilder)

**Preview toggle**
`preview:start` → iterate all stairEntries, set `mesh.visible = false` for any mesh with `userData.editorOnly === true` (CSG wireframes etc.). The grid/`hideInGame` hiding (`_setHideInGameVisible(false)`) fires for gameplay modes — `isGameplayMode(mode)` since Phase 28, i.e. game AND occlusion, not preview.
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

> ⚠️ **Does not exist.** No `TransitionManager` was ever built. Zone-to-zone transitions
> were superseded by scene-to-scene routing (`src/runtime/SceneRouter.ts`, Phase 25/33).
> `TransitionDef` / `world.transitions` remain as vestigial schema only. Section kept as
> history. See the zones disclaimer under **Data Model**.

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

> **v4.32.3 — synced to the actual implementation.** The original spec below said the
> cursor "snaps to nearest floor surface hit", but the shipped tool derived the start Y
> from the LEVEL instead — `max(elevation)` over ALL floors at the active level — which
> broke zone-wide as soon as any floor was gizmo-dragged off its level plane (a stray
> level-0 floor at y 8.43 made every ground-floor stair start at 8.43). Now the start Y
> uses the click's **`surfacePos.y`** (real raycast against buildable geometry, ghostPick
> excluded — ShapeTool precedent), with the level heuristic only as the void-click fallback.

```
States: IDLE → PLACING → IDLE

IDLE, on input:click:
  startY = surfacePos?.y                       // the surface actually under the cursor
           ?? max(floors at activeLevel).elevation ?? activeLevel * 3.0   // void fallback
  record startPos (XZ snapped 0.5), show start dot + preview line, enter PLACING

PLACING:
  Preview line startPos → mouse; end Y via _computeEndY:
    targetY = elevation of activeLevel+1 (same floor lookup)
    endY = targetY > startY ? targetY          // auto-rise to the next level's plane
                            : startY + numSteps * STEP_H   // stepped rise
  On input:click: commit StairDef { start, end, width, style: "straight", ... } via
    history.record("add stair"); return to IDLE
  Escape / tool switch: reset
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

> ⚠️ **Deleted (Phase 36 cleanup).** This tool never activated in the shipped app — the
> `"zone"` toolbar slot toggles the Groups panel and never emits `tool:select`, and
> `zonetool:awaiting-name` had no handler. `src/editor/ZoneTool.ts`, `ZonePanel.tsx`, and
> `ZoneNamingDialog.tsx` were removed. Section kept as history. See the zones disclaimer
> under **Data Model**.

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

> ⚠️ **Does not exist.** No `TransitionTool` was built (the `transitiontool:*` events and
> zone-destination linking below were never wired). The openings PropertiesPanel still has a
> vestigial "link to zone" picker, but with only one zone it is meaningless. Section kept as
> history. See the zones disclaimer under **Data Model**.

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

**Base-URL resolution (Phase 25):** `setBaseUrl(url)` + a private `_resolve(path)`
applied at **every** fetch/loader site — the three manifest fetches
(textures/models/decals), `_fileExists` HEAD checks, `loadTexture`, and the
GLB/OBJ/MTL loaders. Default base = document origin (no base set ⇒ paths pass
through unchanged, byte-identical editor behavior); the runtime shell sets it to
the manifest's `assetsBase` so the whole `/assets/**` tree resolves against a
remote origin. `initMaterials` / `initAssets` / `initDecals` also take
`opts?: { verifyFiles?: boolean }` — the runtime passes `false` because
cross-origin HEAD checks 405 on some static hosts, and a false negative hides
every asset (magenta world).

**Audio (Phase 36):** `initAudio(opts?)` fetches `/assets/audio/manifest.json` into a
`_soundRegistry` (same missing-file HEAD-filter pattern), with `getSoundDef` /
`getSoundList` / `updateSound` / `removeSounds` / `isSoundMissing` accessors and
`loadSound(id)` → cached `AudioBuffer` via `THREE.AudioLoader` (base-url resolved like the
other loaders). Consumed by `src/audio/AudioSystem.ts`.

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

Preview-mode player: movement, spring-arm/FPS camera, avatar animation state
machine, interact scanning. Physics is delegated to `CharacterBody` (Rapier
KCC). **Since Phase 24 it owns no DOM listeners** — the constructor takes the
session's `ControlSchemeManager` and `update(dt)` reads its per-frame
`ActionState`:

```ts
const actions = this._input.state;      // merged kbm/gamepad/touch
this._yaw   -= actions.look.x;          // per-frame radians delta (sources pre-scale)
this._pitch -= actions.look.y;          // clamped ±80°
this._desiredDist += actions.zoomDelta; // third-person zoom, clamped 1.5–12
if (actions.interactPressed && this._interactTargetId)
  this._bus.emit("character:interact", { objectId: this._interactTargetId });
const dir = _tmpDir.set(actions.move.x, 0, -actions.move.y);  // unit-clamped analog
if (dir.lengthSq() > 0) dir.multiplyScalar(speed * dt);        // magnitude scales speed
const jumpHeld = actions.jump;          // edge-arming stays here (_jumpArmed)
```

`move` magnitude < 1 (stick/joystick partial deflection) walks proportionally
slower; keyboard input always arrives at magnitude 1. Everything else — camera
Y smoothing, spring-arm occlusion, animation phases (ground/jump/airidle/land),
interact cache (rebuilt 4×/s), `character:teleport` / `character:save-position`
handlers — is unchanged from Phases 10–13.

Movement/facing derive from the controller's own `_yaw`/`_pitch`, never from a
rendered camera — which is why occlusion-test mode (Phase 28) works with **zero
changes to this file**: its `camera` simply isn't handed to the renderer and
becomes the "logic camera" (still written every frame, spring-arm included;
visualized by PreviewController's CameraHelper).

> **v4.28.0 (Phase 34 — ladders):** a second movement regime. `_nearLadders` tracks
> `ladder:zone-enter/exit`; while not climbing, `_tryMount(dir)` mounts when moving
> toward a near ladder (dot ≥ 0.5 against the climb-face normal; from the platform
> side only within the top zone, feet above `top − 0.5`). While `_climbLadder` is set
> the whole gravity/mover/KCC block is skipped: `_updateClimb` drives
> `CharacterBody.setClimbTranslation` directly (X/Z exp-lerped onto the climb line at
> 12/s, Y = `move.y × climbSpeed` clamped to [foot, top]); jump = let go (+0.4s
> re-grab cooldown); pushing up at the top teleports to the **fixed stand marker**
> (`topDismountOffset` inward — never physics-derived); pushing down at the foot
> exits. Anim phase `"climb"` loops the `climb` intent with
> `timeScale = |vy| / 2` (0 = hanging) and self-heals if the model loads after the
> mount. `_exitClimb()` is the single unconditional exit — called by teleport,
> `ladder:updated/removed`, and `dispose()`, so no path can soft-lock. The top zone
> also surfaces a `"Climb down"` `character:interact-range` prompt whose
> `interactPressed` mounts (`_interactLadder`), taking priority over object interacts
> only when no object prompt is active. Constructor gains an optional
> `_ladderLookup(id) → LadderDef|null` (PreviewController resolves via WorldState).

## PreviewController.ts

Enter/exit lifecycle for the three play modes — `enter(mode: PreviewMode)` where
`PreviewMode = "preview" | "game" | "occlusion"` (Phase 28). Owns the per-session
input stack (Phase 24):

```ts
enter(mode) {
  const input = new ControlSchemeManager(canvas, bus, loadBindings());
  input.init();                                    // attach sources, guess scheme
  const controller = new CharacterController(settings, scene, bus, input);
  controller.init(spawnPos, facingDeg);
  scene.onUpdate(dt => { input.update(dt); controller.update(dt); triggers.update(); });
  if (input.activeScheme === "kbm") canvas.requestPointerLock();   // kbm-only
}
```

- `input.update(dt)` MUST run before `controller.update(dt)` — the controller
  reads the state the manager just merged.
- **Pointer-lock policy:** requested only while the active scheme is `kbm`
  (mobile browsers throw on it; gamepad doesn't need it). On a live scheme
  switch away from kbm the lock is released; switching back can't re-lock from
  a keypress (needs a user gesture), so a canvas `mousedown` listener
  re-acquires it.
- `exit()` disposes controller + manager, unhooks the scheme/mousedown
  listeners, restores the editor camera, emits `preview:stop`.
- `get input()` exposes the manager so App can hand `TouchControlsOverlay` the
  touch shared store + bindings.
- Spawn: gameplay modes (`isGameplayMode` — game AND occlusion) use `defaultSpawn`
  (foot-level +capsuleBottom); preview falls back to editor-camera focus +1.5m.
  **Phase 25:** `SceneManager.editorCamera` is nullable (game-mode runtime shell),
  so the fallback chain is
  `defaultSpawn → editorCamera?.focus → origin soft-fail (console.warn)` — a
  runtime scene without a `defaultSpawn` spawns at (0, 1.5, 0) instead of crashing.

### Occlusion-test mode (Phase 28)

`enter("occlusion")` = New Game semantics with a detached rendered camera. It
**skips `setPreviewCamera()`** — SceneManager's null-preview-camera path keeps
rendering the editor camera (the vantage, holding whatever pose the user was
editing from) while the character camera runs unrendered as the *logic camera*
(spring-arm and all; CharacterController is unchanged). Runtime-shell guard: no
`editorCamera` → warn + fall back to `"game"`.

- **CameraHelper** on the logic camera (`frustumCulled = false`, plain userData so
  the cull pass ignores it and it can't leak into world state) added on enter,
  disposed on exit. The updateFn calls `controller.camera.updateMatrixWorld()`
  before `helper.update()` — nothing else refreshes an unrendered camera's matrix.
- **Tab sub-modes** (window keydown, capture phase, removed on exit):
  `player` — `editorCamera.enabled = false` (frozen vantage), pointer lock
  requested (valid: synchronous inside the real keydown), normal game input;
  `camera` — lock released, `editorCamera.enabled = true` (orbit/pan/zoom/WASD
  drive the vantage), and the updateFn calls `zeroActionState(input.state)` after
  `input.update` so the character holds still (KeyboardMouseSource listens on
  `document` regardless of lock — without zeroing, WASD would drive both at once).
  All three pointer-lock re-lock sites (enter, `pause:closed`, canvas mousedown)
  share `_wantsLock()` (`mode !== "occlusion" || subMode === "player"`) so an
  RMB-orbit click in camera sub-mode never re-locks.
- **C** toggles the cull-as-player view via `setCullView(on)` →
  `SceneManager.setCullOverrideCamera(controller.camera | null)`. Default OFF.
- Every sub-mode/cull change emits `occlusion:state { subMode, cullView }`
  (PreviewHUD badge). `mode` / `occlusionState` getters for tests.
- `exit()` additionally: `setCullOverrideCamera(null)`, dispose the helper,
  remove the Tab/C listener, reset mode state. The existing `setPreviewCamera(null)`
  call restores `editorCamera.enabled` + aspect (idempotent).
- Esc needs no new code: App's window keydown exits on the same press that
  releases pointer lock, exactly like game mode.

## React UI Components

### PropertiesPanel.tsx

> **v4.25.0 (Phase 31):** shared `MoverSection` component (LANDING & FLIGHTS pattern) added
> to `PlatformGeoView` (hidden for polygon platforms), `ShapeGeoView`, and `ObjectGeoView` —
> MOTION enable checkbox (seeds `MOVER_DEFAULTS`), Slide/Spin + X/Y/Z + Loop/Once segmented
> buttons, debounced distance/duration/dwell/phase/speed fields, auto-start checkbox. Every
> commit writes the **complete** `mover` object via `onObjectUpdate({ mover })` (nested-field
> shallow-merge hazard, same as `ShapeDef.mesh`).

Subscribes to `object:selected` and `object:deselected`. Renders a view based on `selected.type`:

**OpeningView** — type (door/window/arch/passage), offset along wall, width, height, elevation, trim toggle, inner tiling (T+B, L+R). Changes emit `wall:updated`.

**WallView** — height, thickness, interior material + overrides, exterior material. Openings list (add/edit/remove). **SegmentsSection** (when `runWalls.length > 1`): expandable list of run-mate wall segments with per-segment material overrides. Changes emit `wall:updated` or `wall:updated` with `segmentOnly:true`. (v4.5.0) Each `WallSegmentRow` also carries a **👁 visibility toggle** (writes `{ hidden }` via `updateWallSegment`; card dims + HIDDEN badge when off) and **row hover** emits `wall:segment-hover { zoneId, wallId|null }` (cleanup on unmount) → `SegmentHighlighter` overlays a translucent box on that segment in the canvas. The screen footer notes the canvas gesture: *right-click a wall to insert a vertex* (WallSplitter).

**FloorView** — elevation, material, material overrides (tile scale, roughness, displacement, map toggles). (v4.6.0) Floors also get a **Geometry screen** (`FloorGeoView`): rect node-backed floors show POSITION X/Z (centroid) + SIZE W/D fields that recompute all 4 node positions by min/max membership in one batched transaction (nodeIds order never reshuffled — NodeDragger's rect-corner constraints depend on it), with read-only corner rows; polygon node-backed floors show an editable vertex list (`FloorVertexRow`, X/Z per node → `updateNode` via App's `handleFloorNodesUpdate`); legacy floors (no/broken `nodeIds`) edit `floorMesh.points` directly via `updateFloor` (broken-node edits detach `nodeIds`, making points authoritative again — avoids the resolveFloorMesh `{0,0}` collapse). Each node-backed row shows a blue **LINKED** chip when `getNodeLinks` reports another entity sharing the node, and row hover emits `node:link-hover` → SegmentHighlighter overlays a node marker + boxes over every linked wall/floor/platform. `WallSegmentRow` gets the same LINKED chip when a wall node is shared with a floor/platform (wall–wall sharing ignored — chained walls always share nodes).

**PlatformView** — position XYZ, size (width/depth), thickness, railing toggle + height, two material sections: cap (top/bottom) and side, each with full overrides.

**StairView** — start/end vectors, an alternate **`H · L · R°` row** (height / horizontal length / bearing, two-way bindings that rewrite `end` from `start`), step count, width, railing toggle (when on, a `RAILING` sub-section exposes Top rail / Balusters checkboxes + Height / Post every N steps / Rail thickness / Post thickness / Side inset / Rail overhang inputs, writing `stair.railing`); an **UNDERSIDE section** (Open / Diagonal / To-floor segmented buttons + a Stringer-thickness input shown only for Diagonal, writing `stair.underside`), body material + overrides, riser material + overrides. **CUT BOX section**: enable/disable toggle; when enabled shows offset XYZ, rotation XYZ (deg), width/depth/height, inner tiling (T+B, L+R). Changes emit `stair:updated`.

**TransformView** — position XYZ, rotation XYZ, scale XYZ (for selected WorldObjects).

**ToolView** — active tool hint text. (v4.22.0) With the select tool active
(the nothing-selected empty state) it also renders an **EDITOR section** — the
home for global editor settings/links as they accrue — currently a CREDITS
button that opens `CreditsModal` (state lives in PropertiesPanel, fed by its
existing `materialList`/`assets` props).

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
Takes a `scheme` prop (App's `previewScheme`, fed by `input:scheme-changed`)
— prompts follow the active control scheme (Phase 24) — and an optional
`mode?: PreviewMode` prop (Phase 28; defaults to `"game"` so RuntimeApp needs
no edit).

- Centered crosshair: two 1px lines, 18px, rgba(255,255,255,0.75) — **hidden in
  occlusion mode** (the rendered view isn't the player's, a crosshair would lie)
- Zone-name toast on `preview:zone-entered` (3s), top-left zone label
- Interact prompt on `character:interact-range`: `[E]` / `[LB]` / `Tap ·` prefix per scheme
- Exit hint bottom-right: `Enter · menu   Esc · exit` (kbm) / `Start · menu` (gamepad) / hidden on touch (the overlay's ⚙ is the affordance); occlusion mode prepends `Tab · player/camera   C · cull view`
- **Occlusion badge** (Phase 28): amber top-center
  `OCCLUSION TEST — CONTROLLING: PLAYER|CAMERA · CULL VIEW ON|OFF`, driven by
  `occlusion:state`; local state defaults to `{ player, false }` to match
  PreviewController's enter state (the mount happens after the initial
  `preview:start`, so there's no missed emit)

### CreditsModal.tsx (v4.22.0)

Opened from the PropertiesPanel empty state (EDITOR → CREDITS). Pure derivation
from the imported registries: groups every `MaterialDef`/`AssetDef` that has an
`attribution` (author or sourceName) by **author → pack (`sourceName`)** — pack
cards show a `sourceUrl` link, license badges (`licenseOther` free text for
`Other`), and `N materials · N assets` counts; author headings link the
first-seen `patreonUrl`. Unattributed items skipped. ModelImporterModal overlay
conventions (fixed inset-0 z-100, 480px card); closes on backdrop click or ✕.

### PauseMenu.tsx (Phase 24b)

Resume/Exit overlay opened by `action:cancel` when nothing else is open
(gamepad Start, kbm Enter, touch ⚙). d-pad `menu:nav` moves the highlight,
`action:confirm` activates, backdrop-click resumes, Esc still exits preview
directly. App owns `pauseOpen` state and emits `pause:show`/`pause:closed`
(the ControlSchemeManager menu-mode gate + PreviewController pointer-lock
release/re-acquire).

### TouchControlsOverlay.tsx (Phase 24)

Mounted by App only while preview is active AND the scheme is `touch`
(`zIndex 60`, below DialogueOverlay's 100; `touch-action:none` so the browser
never scrolls/zooms mid-play). Writes the `TouchSource` shared store
imperatively — no bus traffic per pointer-move, no React re-render per frame
(the joystick knob is styled via ref; the origin lives in a ref AND state
because a pointermove can arrive before React re-renders).

- Floating joystick: pointerdown in the left 40% spawns the base at the touch
  point; offset/radius (clamped) → analog `move`; ghost hint circle when idle
- Look: any other pointer drags → `lookPx` accumulation; tracked by `pointerId`
  so joystick + look thumbs work simultaneously
- Tap (≤5px, ≤250ms) on the look region → `interactQueued` (+confirm)
- JUMP button (bottom, side per `bindings.touch.layout`) → `jumpHeld`;
  ⚙ button (top-right) → `cancelQueued` (opens the pause menu, Phase 24b);
  both `env(safe-area-inset-*)` padded

### ControlsSection.tsx (Phase 24)

`CONTROLS (THIS DEVICE)` block at the bottom of the spawn/player-settings view.
Edits `loadBindings()`/`saveBindings()` (localStorage `worldbuilder.bindings.v1`)
— a device preference, never SceneFile data; applies on the next preview enter.
Fields: mouse sensitivity, gamepad look rate + deadzone + invert-Y, touch
sensitivity + joystick radius + layout, reset-to-defaults.

### SaveLoadPanel.tsx (in TopBar)

- "Save" button: `bus.emit('scene:save', {})` → WorldSerializer downloads JSON
- "Load" button: `<input type="file" accept=".json">` hidden, triggered by button click
- On file selected: `FileReader.readAsText` → `bus.emit('scene:load', { json: parsed })`
- Bus listens for `scene:loaded` → shows toast "World loaded: [name]"

---

## WorldSerializer.js / WorldLoader.ts

> **Load-time migrations** (run in both pipelines — App `handleLoadFromJSON` and the
> runtime's `SceneRouter`): `migrateWallNodes` (legacy start/end walls → node graph),
> `migrateUVs` (pre-10.8 tileScale reset), `migrateDialogues` (inline dialogue →
> zone registry), `migrateWorldLighting` (v4.29.0 — never-honored ambient/sun
> defaults 1.2/3.0 → visual-parity 0.5/2.0), then `pruneOrphanNodes` per zone.

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

> **Reality vs the spec below:** the procedural sky shipped hardcoded (no `WorldConfig.sky`
> scrubbing UI was ever built), `scene.environment` comes from `RoomEnvironment` (not the
> sky), and `scene.fog` is a hardcoded `FogExp2(0x87ceeb, 0.006)` — `fogColor`/`fogDensity`
> remain dead fields. **Phase 37 (v4.31.0)** made `WorldConfig.skybox` real instead: an
> image-skybox layer on top of the procedural sky (see the v4.31.0 changelog entry and
> `SkyboxDef`). The `sky: {...}` block below was never added to `WorldConfig`.

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

**Cross-floor corner links (v4.33.13):** `WallNode` also carries an optional `linkId`. Nodes sharing one are kept at the same `x`/`z` by `WorldState.propagateNodeLink` (called from `updateNode`, so every drag path is covered), which emits a `node:updated` per mate so each floor's walls rebuild. This is a *sync* relation rather than genuine node sharing because `groupWallRuns`'s `canMerge` counts node degree across the whole zone regardless of floor — a shared corner would read as degree-4 and break run merging. `unlinkNodes` drops the link per run.

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
- **Suspend gating must be re-applied after every `attach()`** (`_applyControlsEnabled()` at the end of `_onSelect` AND `_reattachMeshes`): TransformControls' `attach()` forces the controls visible, which otherwise overrides an active `gizmo:suspend` source — `_reattachMeshes` runs on every `shape:rebuilt`, so during a face/vertex-mode drag the suspended entity gizmo used to pop back up mid-drag, inert (fixed v4.11.2).

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

**Add ceiling (cap closed loop)** — Phase 38. Same closed-loop gating as the floor fill. Creates a node-backed polygon `PlatformDef` (reusing the run's node IDs, so it follows wall-node drags — and since v4.32.2 the gizmo's wall Y-move also lifts `position.y` for platforms whose nodes are entirely within the moved run, matching the floor-elevation sync) at `position.y = wall.elevation + wall.height` — slab bottom flush with the wall top, lid resting ON the walls — with `thickness 0.2`. Retexture the underside via the platform's BOTTOM material section (`bottomMaterial`). **v4.32.1 gating:** the button hides when a platform with the run's exact node set already exists, replaced by **"Hide ceiling (ghost)" / "Show ceiling (un-ghost)"** which toggles that platform's `editorGhost` (translucent + click-through in the editor via the ghostPick pick rule; solid in preview/game). "Fill closed loop with floor" likewise hides when a floor with the run's node set exists at the run's level.

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
- Add ceiling (cap closed loop) — Phase 38, same closed-loop gating
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

Reads the per-frame `ActionState` from ControlSchemeManager (Phase 24 — kbm,
gamepad and touch all arrive pre-merged), computes movement, delegates physics
to `CharacterBody`, updates camera and optional model mesh.

> **v4.25.0 (Phase 31):** optional 5th ctor param `movers: MoverSystem | null` (threaded
> App/RuntimeApp → PreviewController). While grounded, `update()` resolves the ground
> body via `CharacterBody.groundBodyHandle()` and, if it's a registered mover, adds the
> mover's per-frame translation delta into `dir` **before** `body.move(dir)` — the KCC
> still collision-resolves the combined motion, so the player rides risers and sliders.
> Translation carry only: a spinning platform does not rotate/orbit the player (deferred).
> **v4.25.1:** the carry block plus new **push** (`body.moverPush(movers.isMoverBody)` added
> into `dir` — moving geometry overlapping the capsule shoves the player out; walls still
> block the shove) are both gated on `movers.anyRunning()`, so no live movers ⇒ zero
> per-frame cost (no raycast, no contact scan).
> **v4.29.9:** GROUND_STICK (v4.28.14) is **suppressed while riding a mover** — pressing the
> capsule into a MOVING kinematic ground makes Rapier's KCC inject the platform's own motion
> into `computedMovement` (0×/2× per-frame oscillation = visible stutter + slow slide-off;
> platform-still ⇒ exact, platform-moving ⇒ corrupted — empirically bisected). The mover
> ground handle is cached in `_moverGroundHandle` and kept alive through the coyote window,
> so grounded-flicker while walking on a platform never drops a carry frame (that was the
> stick's job); jump reliability on movers rides the existing buffer+coyote path.

```ts
update(dt: number): void {
  // 1. Read actions.move (unit-disc analog) → local direction
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

**Look** (mouse under pointer lock / right stick / touch drag — all arrive as `actions.look` radian deltas):
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
| `play_sound` | `bus.emit('audio:play', { id, position?, volume?, loop? })` → AudioSystem (Phase 36). Positional when the action has a target (`_resolveTargets` + `_resolveObjectPose` supply the position); otherwise a non-positional one-shot |
| `stop_sound` | `bus.emit('audio:stop', { id })` — stop live one-shots of that sound id (Phase 36) |
| `play_music` | `bus.emit('music:play', { soundId, volume?, loop?, fade? })` — AudioSystem swaps the current music track, optional crossfade (Phase 36) |
| `stop_music` | `bus.emit('music:stop', { fade? })` — AudioSystem fades out / stops music (Phase 36) |
| `set_footstep` | `bus.emit('character:set-footstep', { sound? })` → CharacterController overrides the live footstep sound; empty reverts to the authored `PlayerSettings.footstepSound` (surface swap, v4.30.3) |
| `show_dialogue` | resolves `action.dialogueId` via `findDialogue()` → `DialogueRunner.start(tree)`; the runner emits `dialogue:show` per node with condition-filtered `options[]` (Phase 30; legacy inline `action.dialogue` is handled by `migrateDialogues` on load — no runtime fallback since v4.24.1) |
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
| `load_scene` | `bus.emit('scene:load-request', { sceneId })` — runtime SceneRouter routes to another manifest scene; no editor listener, so a no-op in editor preview (Phase 25) |
| `start_mover` / `stop_mover` / `toggle_mover` | per `_resolveTargets(targetId)` id (group fan-out): `bus.emit('mover:set', { targetId, op })` — MoverSystem is the only listener; non-mover targets are ignored there (Phase 31) |
| `light_on` / `light_off` / `toggle_light` | per `_resolveTargets(targetId)` id: `bus.emit('light:set', { targetId, op })` — ZoneManager drives the placed light's intensity only (no shader recompile) and freezes/resumes its shadow passes; unknown targets ignored; reset on preview:stop (v4.29.6) |

---

#### New Files

```
src/
  scripting/
    ScriptEngine.ts         ← runtime execution
    GameState.ts            ← generic runtime state store + game save (see GAMEPLAY_STATE.md)
    DialogueRunner.ts       ← branching dialogue-tree walker (Phase 30; owned by ScriptEngine)
  ui/
    ScriptPanel.tsx         ← script + dialogue-tree list/editor, in left panel slot
    DialogueFlowchart.tsx   ← flowchart view of a dialogue tree (Phase 41; editor-only overlay)
    DialogueOverlay.tsx     ← in-game dialogue display (node lines + response options)
  editor/
    TriggerVolumeTool.ts    ← place/resize trigger volumes
```

---

#### Updated Bus Events

```ts
// Phase 10
"character:interact":       { objectId: string };
"character:interact-range": { objectId: string; label: string } | null;

// Phase 10.5 (consumer shipped Phase 36 — see the audio events below)
"audio:play":               { id: string; position?: Vec3; volume?: number; loop?: boolean; key?: string };
// Phase 36 — Audio System (consumed by src/audio/AudioSystem.ts)
"audio:stop":               { id?: string; key?: string };
"music:play":               { soundId: string; volume?: number; loop?: boolean; fade?: number };
"music:stop":               { fade?: number };
"world:audio":              { audio: WorldAudio };        // authored scene mix/ambient/music (editor) — mirrors world:lighting
"audio:player-mix":         { mix: AudioMix };            // PauseMenu player sliders (multiplies over authored)
"sounds:loaded":            { sounds: SoundDef[] };
"dialogue:show":            { speaker: string; lines: string[]; portrait?: string; options?: { text: string; hasNext: boolean }[] };  // options added Phase 30
"dialogue:choose":          { index: number };   // Phase 30 — overlay → DialogueRunner option pick
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
| `play_sound` | **implemented** | Phase 36 — shipped (AudioSystem consumes `audio:play`; sound manifest + positional audio) |
| `open_door` / `close_door` | console.warn | Phase 13 (NPC + door animation system) |
| `spawn_npc` | console.warn | Phase 13 (NPC system) |
| `on_health_zero` | never fires | Phase 13 (NPC/enemy health system) |
| Branching dialogue | **implemented** | Phase 30 — shipped (`DialogueTreeDef` zone registry + `DialogueRunner`; see v4.24.0) |

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

- **Item system** — **shipped Phase 32 (v4.26.0)** as an identity layer over gameState (`ItemDef` registry in `WorldConfig.items`, counts at `inv.<id>`, `give_item`/`take_item`/`has_item` with editor pickers, view-only bag overlay with swappable styles, stackable via `stackSize`, item icons). Still future: item *use*/consume/equip effects, pickup-object convenience property, loot tables.
- **Dialogue system** — **shipped Phase 30 (v4.24.0)**: branching dialogue trees (`DialogueTreeDef` zone registry + DialogueRunner), conversation UI with response options, DIALOGUE-tab editor. See `DIALOGUES_GUIDE.md`.
- **Quest system** — quest definitions, objectives, completion conditions, quest log UI.
- **Audio system** — **shipped Phase 36 (v4.30.0)**: sound-asset manifest (`public/assets/audio/manifest.json` + `AssetManager.initAudio`), `src/audio/AudioSystem.ts` (`THREE.AudioListener` on the player camera, `preview:start`/`stop` lifecycle), ambient loops + background music (`WorldConfig.audio`), positional/spatial audio (`AttachedSound` emitters on object/platform/shape — they follow movers — + positional `play_sound`), and a 4-bus mixer (authored `WorldConfig.audio.mix` + player PauseMenu sliders). Actions `play_sound`/`stop_sound`/`play_music`/`stop_music`/`set_footstep`, plus character locomotion sounds (footstep/jump/land). **Full reference: `AUDIO.md`.** Still future: reverb/audio zones, ducking, occlusion-aware attenuation, and combat/death audio (blocked on there being no player health/damage system — `on_health_zero` is an unfired stub).
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

> **v4.25.0 (Phase 31):** also `createKinematicBody(pos, rot?)` — one `kinematicPositionBased`
> body per mover entity, carrying the entity's full rest pose — and `createColliderOn(desc, body)`
> to attach body-relative colliders. `removeCollider`'s empty-parent cleanup frees these
> kinematic bodies exactly like the per-collider fixed bodies, so no teardown changes were needed.
> **v4.25.1:** `createColliderOn` also sets `ActiveCollisionTypes.DEFAULT | KINEMATIC_KINEMATIC`
> on the desc — mover colliders must produce contact manifolds with the kinematic player capsule
> for push-out. Broad-phase gated: no cost until AABBs touch.

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

  // Phase 25: each helper above allocates a DEDICATED fixed body per collider,
  // so removeCollider also removes the parent body once it's empty — without
  // this, every zone unload leaked one body per collider (invisible in the
  // editor's rare zone swaps; compounded per runtime scene transition).
  // removeRigidBody is idempotent (body.isValid() guard) so CharacterBody's
  // collider-then-body dispose order stays safe.
  removeCollider(collider: RAPIER.Collider): void {
    const parent = collider.parent();
    this._world.removeCollider(collider, true);
    if (parent && parent.numColliders() === 0) this._world.removeRigidBody(parent);
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

> **v4.32.5:** also `trimeshData(meshes: THREE.Mesh[])` → `{ vertices, indices }` (world-space
> triangle soup, each mesh's local matrix applied) and `registerCutTrimesh(id, vertices, indices):
> Collider | null` (`ColliderDesc.trimesh` + `FIX_INTERNAL_EDGES`; null → caller uses the box
> collider). `PlatformBuilder` (from its `physMeshes` = cap/bottom/sides/inner faces, no railings)
> and `FloorBuilder` register this **instead of the AABB cuboid when the slab was CSG-cut** by a
> stair cutter, so the visual hole is a physical hole. Uncut slabs keep `registerFloor`/
> `registerPlatform`'s cuboid.

> **v4.25.0 (Phase 31):** `registerPlatform`, `registerShape`, `registerShapeTrimesh` and
> `registerAttachedColliders` accept an optional kinematic `body`; when present the desc is
> built **body-relative** (platform: `(0, thickness/2, 0)` slab lift, no rotation — the body
> carries position+yaw; shapes: identity — hull/trimesh points are already shape-local;
> attached colliders: a zero-pose clone of the object runs through the same
> `colliderWorldTransform`/local-points math) and attached via `physicsWorld.createColliderOn`.
> Sensors never join a mover body — they stay on their own fixed body.

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

> **v4.25.0 (Phase 31):** also `groundBodyHandle(): number | null` — one short downward
> Rapier ray from the capsule center (sensors + own collider excluded, reused `RAPIER.Ray`)
> returning the parent rigid-body handle of whatever the player stands on. CharacterController
> uses it to look up moving-platform carry deltas in MoverSystem.
> **v4.25.1:** the capsule collider enables `KINEMATIC_KINEMATIC` contacts, and
> `moverPush(isMoverBody): Vector3` reads the step's contact manifolds
> (`contactPairsWith` → `contactPair`, **persistent callback fields — zero per-frame
> allocations**), accumulating depenetration along the manifold normal (flip-aware sign,
> deepest `contactDist < 0`), clamped to `MAX_PUSH_PER_FRAME = 0.3`. Returns a reused
> scratch vector.
> **v4.28.0 (Phase 34):** `setClimbTranslation(pos)` — writes
> `setNextKinematicTranslation` directly, bypassing the KCC (its snap-to-ground and
> slope clamps fight a wall climb). Only CharacterController's climb mode calls it.

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

> **Current shape (stale snippet below):** one `intersectionPairsWith` pass per frame
> over the character collider serves three sensor families — door/zone-transition
> sensors (`zone:enter`, 2s cooldown), trigger volumes (`setVolumeSensors`,
> enter/exit diff by collider handle → `trigger:volume-enter/exit`), and
> **ladders (v4.28.0)**: `setLadderSensors(map)` (handle → ladderId from
> `ZoneManager.ladderSensorMap`), deduped by ladderId since each ladder has two
> sensor boxes (climb column + top-lip zone), diffed the same set-swap
> zero-allocation way → `ladder:zone-enter/exit`.

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

- **Resizable width** (Phase 40): 6px `col-resize` strip on the right edge, clamped 280–600, persisted to `localStorage.wb_leftpanel_w`.
- Root div carries **`id="wb-leftpanel"`** (Phase 41) — `DialogueFlowchart` measures its live right edge (ResizeObserver) to dock the chart overlay beside it.

### `src/App.tsx`

- `groups` state replaces `zones`/`pendingZone` state for the left panel.
- `handleAddGroup`, `handleRemoveGroup`, `handleRenameGroup` handlers wire to `WorldState`.
- Z key toggles the groups panel (no tool activation).
- `ZoneNamingDialog` removed.
- Group bus listeners update `groups` state.
- `world:loaded` listener syncs `groups` from `world.groups`.

### `src/ui/Toolbar.tsx`

Zone button label changed from "Zone" to "Groups". Active state triggered by `openPanel === "groups"` instead of `"zones"`.

**Current shape (v4.36.3):** a 64px column with a 9-entry `TOOLS` list (Select, Floor, Wall, Platform, Stair, Shape, Groups, Spawn, Light — several are menu-first variant groups), followed directly by the **Assets** flyout button (Models / Materials / Decals / Sounds / Skybox — `ASSET_ENTRIES`; "tool" rows call `onToolSelect("object"|"decal")` and rely on App's tool→panel coupling, "panel" rows call `onPanelToggle`), then the **Trigger** tool (`TRIGGER_TOOL`, rendered via the hoisted `renderTool` — moved beside Scripts in v4.36.3 since trigger volumes host their scripts there), then the amber **Scripts** panel button (`IconScript`, a bulleted list — no longer sharing the Trigger tool's icon, v4.36.3) — panel buttons 48×48 with tool-style labels (v4.36.2). A `flex:1` spacer below them keeps only the divider + Play split-button row anchored at the bar's bottom. The Object and Decal tools live *only* in the Assets flyout (moved from the tool list in Phase 42, along with the removal of the separate MATS/SOUNDS/SKYBOX buttons). The flyout anchors `bottom: 0` and shares the variant-popover close plumbing via the `openMenu` sentinel `"assets-menu"`. Assets button active-state: any of its five panels/tools active; its icon swaps to the active entry's.

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

## Runtime Shell (src/runtime/) — Phase 25

> This section supersedes the old "Future: Scene Loader" note — the scene
> loader exists now, as the **SceneRouter** inside the standalone runtime shell.

A second Vite entry (`runtime.html` → `src/runtime/main.tsx`) that plays worlds
without the editor. Full design + phased acceptance record:
`plans/phase-25-runtime-shell.md` and `test-plans/phase-25-runtime-shell.md`.
Hosting a game remotely (bundle layout, S3/Netlify/GitHub Pages, CORS):
**`PUBLISHING_GUIDE.md`**.

### Pieces

| File | Role |
|---|---|
| `RuntimeApp.tsx` | Composition root (the "small App.tsx"): constructs SceneManager(`mode:"game"`), WorldState, ObjectPlacer, ZoneManager, PreviewController, ScriptEngine, `gameState.attach(bus)`; shell states `boot → menu → loading → playing → error`; mounts PreviewHUD(+scheme), DialogueOverlay(+`dialogue:closed`), FadeOverlay, TouchControlsOverlay (scheme-gated), PauseMenu (+`action:cancel` handler, exit → menu); Escape/pause-exit save-then-exit; 30s runtime autosave. Script re-index/activation across scene loads is owned by **SceneRouter**, not the `preview:start` handler (unlike App.tsx). |
| `manifest.ts` | `RuntimeManifest` v1 (`manifestVersion/id/name/entryScene/scenes/assetsBase` + display metadata); `loadManifest(url)` fetch + loud shallow validation; all relative URLs resolve against the manifest's own URL (`new URL(rel, manifestUrl)`); `assetsBase` default = manifest directory. |
| `SceneRouter.ts` | `go(sceneId, { newGame?, resume?, restore? })`: resolve URL (unknown id non-fatal) → fade/loading → capture one-shots → deactivate+clearIndex → `preview.exit()` → unload ALL zones → fetch + editor migration pipeline → `loadFromJSON` → `loadZone(zones[0])` → re-index → `configureSchema` (never `reset`) → activate + restore one-shots → `enter("game")` (+pose teleport on Continue) → `onGameStart` (newGame/resume only) → `fire("on_level_load", zoneId)`. Subscribes `scene:load-request`. Never synthesizes `zone:enter` (would trip ZoneManager's swap handler). Re-entrancy-guarded (`transitioning` getter — the shell's `preview:stop` handler checks it to avoid flashing the menu mid-swap). |
| `saveGame.ts` | `runtime_gamesave:<manifest.id>` = `{ version:1, ts, sceneId, state, firedOneShots, pose? }`. Pose rides the existing `character:save-position` mechanism (reserved gameState key `__runtime_pose`, foot-level, round-trips through `character:teleport`). |
| `ui/` | `MainMenu` (manifest metadata; Start / Continue / New Game; manifest-URL input when `?manifest=` absent — the launcher stand-in), `LoadingScreen`, `ErrorScreen` (names CORS explicitly on fetch TypeError). |

### Boot & conventions

- URL: `runtime.html?manifest=<url>` — any origin, CORS permitting. Asset base
  = manifest `assetsBase` via `assetManager.setBaseUrl` (set **before** any
  manifest fetch); `verifyFiles:false` (cross-origin HEAD 405s).
- Scene entry convention: first zone in the SceneFile is the entry zone
  (`loadFromJSON` sets `activeZoneId = zones[0]`); spawn = `world.defaultSpawn`
  (origin soft-fail if absent).
- Cross-scene state: the `gameState` singleton persists through `go()` by
  construction (`configureSchema` only seeds missing keys); fired one-shots are
  captured/restored around `activate()` so they never re-fire on revisit.
- Input: `PreviewController` owns `ControlSchemeManager` (phase 24), so
  kbm/gamepad/touch work unmodified; `worldbuilder.bindings.v1` is a shared
  device pref between editor and runtime (intentionally not namespaced).
- Bundle: the runtime chunk graph contains no editor UI (`main-*.js` is not
  referenced by `runtime.html`); DEV `installTestHelpers` loads via dynamic
  import (it statically imports `@/editor/bakeShapes`). Known accepted rider:
  `SceneManager`'s static `EditorCamera`/ViewHelper imports ride along unused.
- DEV globals: `window.__runtime = { bus, world, zones, preview, scriptEngine,
  gameState, physicsWorld, router, manifest }` + the classic `__scene`/`__world`/…
  set, so TESTING.md recipes work in a runtime tab.
- Demo fixture: `public/demo/` — two scenes wired by portal trigger volumes
  (`load_scene`), a state-gated dialogue in level_02 proving cross-scene state.
- Future work (see plan doc §13): launcher/library + registry, ref-counted
  asset cache + next-scene preloading, 3D menu scenes. ~~Editor "Export manifest"~~ —
  **superseded by Phase 33 Projects** (auto-generated manifest + game.json + Publish flow;
  see `src/project/ProjectStore.ts` and the v4.27.0 changelog entry).

---

## Occlusion Test Mode — Phase 28

> Shipped as v4.21.0. Plan: `plans/phase-28-occlusion-test-mode.md`; acceptance:
> `test-plans/phase-28-occlusion-test-mode.md`.

A third play mode (Toolbar ▶-menu → **Occlusion Test**): identical to New Game
except the **rendered camera is the editor orbit camera** — a detached debug
vantage — while the character runs normally with its camera updating unrendered
as the *logic camera*. Purpose: watch player-view-driven behavior (spring-arm
occlusion, frustum culling, zone hide/dim, trigger-driven despawns) from outside
the player's view, where observing it doesn't change it.

### Design in one paragraph

`PreviewMode = "preview" | "game" | "occlusion"` + `isGameplayMode()` (types.ts);
every `mode === "game"` branch that meant "gameplay semantics" now uses the
helper (ZoneManager / NodeDragger / GizmoManager / App — tautological for the
existing modes). `PreviewController.enter("occlusion")` skips
`setPreviewCamera()`, so SceneManager's null-preview path keeps rendering the
editor camera and running its orbit update; everything else about the session
(ControlSchemeManager, CharacterController, TriggerSystem, scripts, saves-load
flow) is the ordinary game-mode stack. A `THREE.CameraHelper` visualizes the
logic camera. **All player-driven systems run 100% natural code paths** — the
only synthetic piece is the opt-in cull view below.

### Controls

| Key | Action |
|---|---|
| **Tab** | Toggle what mouse/keys control: `player` (pointer lock, normal game input; vantage frozen — `EditorCamera.update()` gates on `enabled`) ↔ `camera` (lock released, RMB orbit / MMB pan / wheel / WASD drive the vantage; character input zeroed via `zeroActionState` so it holds still) |
| **C** | Toggle the cull-as-player view (below). Default OFF |
| **Esc** | Exit (same App handler as game mode — fires on the lock-release press) |

HUD: amber top-center badge `OCCLUSION TEST — CONTROLLING: … · CULL VIEW …`
(`occlusion:state` bus event), crosshair hidden, Tab/C hints by the exit hint.

### Cull-as-player view (C)

Three.js culls against the *rendered* camera inside `render()` — player-view
culling simply doesn't exist in a frame rendered from the vantage. The C toggle
recreates it: `SceneManager.setCullOverrideCamera(logicCam)` arms a pre-render
pass replicating the renderer's bounding-sphere-vs-frustum test from the logic
camera over world meshes (`userData.editorId`, skipping hideInGame/editorOnly/
already-hidden/`frustumCulled === false`), hides failures, renders, restores
immediately — script visibility state is never corrupted (verified: a despawned
mesh stays hidden through the pass). Same math as three.js internals, but a
parallel implementation — hence opt-in and labeled in the HUD. `cullStats`
exposes `{ tested, hidden }`. Side effect: culled meshes skip that frame's
shadow map.

### Deliberate deviations & guards

- **Game saves are never written by an occlusion run** (App gates the 30s
  interval and the exit save on the mode) — a debug session must not clobber
  the user's Continue save. Everything else matches New Game, including
  `on_game_start`.
- **Runtime shell**: `enter("occlusion")` without an `editorCamera` warns and
  falls back to `"game"`. RuntimeApp itself is untouched (PreviewHUD's `mode`
  prop is optional).
- **Perf**: with cull view off, the only always-running addition anywhere is a
  null-check early-return per frame in `_loop`; scratch objects preallocated.

### Files touched

`types.ts` (PreviewMode/isGameplayMode/`occlusion:state`), `SceneManager.ts`
(cull override + `cullStats`/`activeRenderCamera`), `PreviewController.ts`
(mode, Tab/C machine, `_wantsLock()`, helper lifecycle), `ZoneManager.ts` /
`NodeDragger.ts` / `GizmoManager.ts` (isGameplayMode flips), `App.tsx`
(handler, `previewMode` state, save gating, `__sceneManager`), `Toolbar.tsx`
(menu item), `PreviewHUD.tsx` (badge/hints/crosshair), `dev/testHelpers.ts`
(`enterOcclusion`/`occlusionState`/`setCullView`/`teleport`).

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

---

## Ladders — Phase 34 (v4.28.0)

First-class climbable entity + a locked climb movement mode. Full plan:
`plans/phase-34-ladders.md`; acceptance record: `test-plans/phase-34-ladders.md`.
Design follows the cross-engine survey (trigger volume + state flag, not physics;
fixed dismount markers; the top-remount problem solved twice — auto-snap AND prompt).

### Data & build

- `LadderDef` (`src/types.ts`): foot `position`, `rotationY` (climb face = local +Z),
  `height`, `width`, `rungSpacing`, `material`(+overrides), `topDismountOffset`,
  `floorLevel`, `groupIds`. `ZoneDef.ladders?` optional array.
- `src/builders/LadderBuilder.ts`: merged box geometry (2 rails + rungs every
  `rungSpacing`), one mesh with `editorType: "ladder"`; `resolveLadderParams(def)`
  clamps sparse defs. Colliders: one solid cuboid slab (0.16m deep) + **two sensors** —
  climb column (0.9m off the climb face, full height + margins) and top-lip zone
  (1.1m onto the platform side, 1.3m tall above the top) for remount-from-above.
- ZoneManager: `ladderEntries` per zone, `laddersGroup`, stair-style add/rebuild/remove
  handlers, `ladderSensorMap` (handle → ladderId).

### Runtime

- TriggerSystem: `setLadderSensors(map)`; same zero-allocation enter/exit diff as
  volumes, deduped by ladderId → `ladder:zone-enter/exit`.
- CharacterController climb mode: see the CharacterController.ts section (v4.28.0
  callout) — mount intent (dot ≥ 0.5), KCC bypass via `CharacterBody.setClimbTranslation`,
  W/S at `PlayerSettings.climbSpeed` (default 2), jump-release + 0.4s cooldown,
  fixed-marker top dismount, top-zone auto-remount + "Climb down" interact prompt,
  unconditional `_exitClimb()` (teleport/rebuild/delete/dispose) — no soft-lock paths.
- `LocomotionState` gains `"climb"`: plays the `Climb` clip (authored into
  character.gltf, see `.claude/skills/gltf-clip-authoring/`) at
  `timeScale = |vy| / 2` — hanging still pauses the clip.

### Editor

- Toolbar: Stair button gains variants (▤ Stair / ☰ Ladder); `IconLadder` in icons.tsx.
- `src/editor/LadderTool.ts`: single click places a default ladder (h 3, yaw 0) on the
  clicked surface; height/facing edited in the panel (`tool:placed` → auto-select).
- PropertiesPanel: LADDER geo screen (position/rotY/height/width/rung spacing/top
  dismount offset, plus per-ladder **PROMPT RANGE** and **AUTO-GRAB RANGE** — v4.28.4:
  `LadderDef.promptRange` sizes the top-lip sensor = "Climb down" reach, default 1.8;
  `autoGrabRange` gates the walk-toward top mount, default 0.7, clamped ≤ promptRange)
  + single-material mat screen; player panel gains CLIMB SPEED and a CLIMB (ladders)
  anim-override slot. Undo/redo generic via the `"ladder"` ChangeKind.
- Editor-only climb-side indicator (v4.28.4): a green arrow on the +Z face at
  mid-height, tip pointing into the ladder; hidden in preview/game via the
  `editorOnly` sweep (`_setEditorOnlyVisible` now covers `ladderEntries` too).
- **Invisible climbables** (v4.28.5, the Source-style "invisible ladder brush"):
  `LadderDef.invisible` tags the body mesh `editorOnly` (rails render only while
  editing — preview AND game hide them, unlike `hideInGame` which is game-only);
  `LadderDef.noCollider` skips the solid slab (the dressed rock/vine wall supplies
  its own collision — an extra invisible slab would snag the player). Both are
  LADDER panel checkboxes. Recipe: ladder flush against the visible geometry,
  both boxes checked; sensors/mount/ranges are unaffected.
- **Width-aware lateral behavior** (v4.28.7): ladders ≤ `CLIMB_FREE_X_WIDTH`
  (1.2m) snap to the centerline (normal-ladder feel); wider ones keep the
  grab-point lateral position (`_climbLocalX`, persistent state — deriving it
  from the body each frame makes the snap-lerp eat 90% of the shimmy speed)
  and **A/D shimmies** at climbSpeed, clamped `±(width/2 − 0.25)`. The top
  dismount marker preserves the lateral spot. One wide invisible ladder now
  covers a whole rock face.

### Verified (2026-07-11, frame-stepped + real clicks)

Mount frame-11, line snap exact, clip timeScale 1↔0, hang drift 0, jump-release +
cooldown gate, top dismount lands exactly on the fixed marker grounded, "Climb down"
prompt + E-mount, top auto-remount, bottom dismount, teleport/rebuild force-exits,
tool placement + panel edit + 2-level undo through the real UI. Solid collider blocks
walk-through. No new console errors; typecheck clean.

---

## Light Controls — Phase 35 (v4.29.0)

Placeable per-zone lights (point / spot / directional) plus honoring the world-level
ambient/sun config that had been serialized-but-ignored since day one. Acceptance
record: `test-plans/phase-35-lights.md`.

### Data & build

- `LightDef` (`src/types.ts`): `kind` (`"point" | "spot" | "directional"`), `position`,
  `color` (hex string), `intensity` (physical/candela-ish for point/spot; sun-like
  unit-less for directional), `range?` (point/spot distance, 0 = unlimited),
  `angleDeg?` (spot cone half-angle), `pitchDeg?`/`yawDeg?` (spot/directional aim —
  yaw 0° = -Z matching `facingDeg`, pitch 90° = straight down), `castShadow`,
  `label?`. `ZoneDef.lights?` optional array; `"light"` is a `ChangeKind` **and** has
  an `_emitChange` case (undo/redo replay — a kind missing there reverts data but
  never rebuilds the scene; found live when the first undo test didn't touch the
  THREE light).
- ZoneManager owns rendering (NOT an editor tool, so preview/game/runtime shell all
  get real lights): `lightEntries` + `lightsGroup` per zone, `_buildLight` /
  `_removeLight`, `light:*` handlers. Marker (bulb + wire halo + aim arrow) is
  `hideInGame`; the light + its `.target` carry the editorId (selectable:false) so
  gizmo drags move them live. `unloadZone` disposes shadow maps.
- Placement defaults (`LightTool`): point `#ffd9a0` @ 30 cd, range 15, +2.5m lift;
  spot white @ 60, range 20, cone 30°, aimed straight down, +3m; directional white
  @ 1.5, pitch 50°, +8m. Shadows default OFF (512² maps when enabled — they multiply,
  see TESTING.md §7).

### Editor

- **Light** toolbar button (bulb icon, `IconLight`) with Point / Spot / Directional
  variants → `ToolId`s `light-point` / `light-spot` / `light-directional`.
  `LightTool` (`src/editor/LightTool.ts`) turns one click into `addLight` +
  `light:placed`; App breaks out to Select + auto-selects (checkpoint flow).
- `LightView` in PropertiesPanel: kind help, color swatch, INTENSITY, RANGE (M)
  (point/spot), CONE ANGLE (spot), AIM PITCH/YAW (spot/directional), CAST SHADOWS
  checkbox (+ perf warning when on), POSITION, Delete. Renameable (label header).
- Selection: marker picking via `PRIORITY` (`light` after `checkpoint`);
  `_getDataRecord` case. Gizmo: translate only (aim edits live in the panel);
  `light:updated` → deferred `_reattachMeshes` (marker is rebuilt fresh).
- Multi-select delete handles `light` refs; copy/paste excludes lights (same as
  checkpoints/decals).

### World ambient/sun (the "existing light")

- `WorldConfig.ambientLight`/`sunLight` were never read by SceneManager — every scene
  rendered hardcoded ambient 0.5 / sun 2.0 while old saves *stored* 1.2 / 3.0.
  Now: WorldState emits **`world:lighting`** (on `loadFromJSON` and from
  `updateWorldLighting`); SceneManager subscribes and applies color+intensity to its
  ambient + sun (editor and runtime shell both, since SceneRouter loads through
  `loadFromJSON`). Sun *position* stays sky-linked; fill/rim stay hardcoded.
- **`migrateWorldLighting`** (WorldLoader, called in both load pipelines beside
  `migrateUVs`): rewrites exactly the never-honored serialization defaults
  (`#aabbcc`@1.2 / `#fff4e0`@3.0) to the visual-parity values (0.5 / 2.0) so
  existing worlds render identically the first time the config is actually applied.
  Hand-edited values pass through. Default literals in WorldState/App updated to
  match.
- UI: **WORLD LIGHT** section (ambient + sun color/intensity) renders under the
  Light tool's ToolView; writes via `handleWorldLightingChange` →
  `updateWorldLighting` (not journaled, matches playerSettings).
- **v4.29.5 — true darkness**: fill/rim scale with sun intensity (0.3×/0.15×,
  parity at sun 2.0) and `WorldConfig.envIntensity?` (absent = 1) drives
  `scene.environmentIntensity` via the same `world:lighting` event — a third
  ENVIRONMENT row in WORLD LIGHT. All three at 0 = scene lit only by placed lights.

### Lights list (v4.29.1, always-visible v4.29.2, nested page v4.29.3)

The nothing-selected ToolView shows a **Lights** `CategoryRow` under every tool
(summary `sun + ambient · N placed`). Pressing it pushes a `"lights"` screen onto
the existing drilldown stack — the first **no-selection** screen: `ScreenId` gains
`"lights"`, `headerTitle`/`headerSubtitle` and the header block render for it with
no selection, and a `!selected && currentScreen === "lights"` branch renders
`WorldLightSection` (world sun + ambient — moved here from the Light-tool ToolView)
above `LightListSection` (**PLACED LIGHTS (n)**: glowing color swatch,
label-or-id, kind glyph, `☑︎sh` when shadow-casting; empty-state hint). Row click
= App `handleSelectLight`: switches to the Select tool so the next canvas click
doesn't place, then emits `object:selected` → LightView + gizmo (this also resets
the stack via the selected-id effect). A tool switch with nothing selected clears
the stack so the new tool's view shows. Backing state: App `zoneLights`, synced
like `checkpoints` (`light:added/updated/removed` + `zone:activated` +
`world:loaded`).

### Verified (2026-07-12, real clicks + probes)

Toolbar → Point variant → canvas click placed at surface+2.5y and auto-selected;
warm glow pool visible in screenshot; INTENSITY input + CAST SHADOWS checkbox drove
the THREE light (80 cd, shadow map 512², far = range); undo/redo after the
`_emitChange` fix drives the scene light both ways; spot target exactly 5m below for
pitch 90, directional target matches pitch 50 / yaw 90 vector; game mode hides all
markers while lights stay lit; WORLD LIGHT ambient edit 0.5→1.0→0.5 applied to the
scene AmbientLight through the real inputs; migration confirmed on the user's world
(stored 1.2/3.0 → 0.5/2.0, look unchanged); lights persist through autosave reload.
Only console entry: the known pointer-lock automation artifact. Typecheck clean.
