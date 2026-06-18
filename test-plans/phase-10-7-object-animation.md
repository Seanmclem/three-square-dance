# Phase 10.7 — Object Animation Editor — Test Plan

## Prerequisites
- `npm run typecheck` and `npm run build` pass with zero errors.
- Dev server: `npm run dev -- --port 7373` → `http://localhost:7373`.
- **An animated GLB/GLTF asset is required to exercise the full path.** The repo ships
  only static furniture (`.obj`) and static plants (`.gltf`), so import an animated model
  (e.g. a rigged prop with named clips) via the Model Importer first.

> **Scope notes (verified against code, spec was stale):**
> - The PropertiesPanel has **no `src/ui/screens/` folder**. Screens are inline components
>   switched via the `ScreenId` union + `OBJECT_SCREENS` map. `AnimationsScreen` follows that
>   pattern and `"animations"` is appended to an object's screen list **only when its asset
>   has clips** (`assetDef.animations?.length`).
> - There is **no `WorldLoader._migrate()`**. `autoPlayAnimation?` is optional, so old scene
>   files read as `undefined` ("none") — no migration pass needed. Clip names for assets
>   imported before this phase are **lazily back-filled** by `ObjectPlacer` when it loads the
>   GLTF (plus stored in `manifest.json` at import going forward).
> - Object lifecycle was **fully extracted** from `ZoneManager._loadObjectMesh` into
>   `src/preview/ObjectPlacer.ts` (Option B). ZoneManager now only parents the returned mesh
>   into the per-zone `objectsGroup`/`objectMeshes` and disposes geometry; mesh building +
>   the animation subsystem live in ObjectPlacer.

---

## 0. Refactor regression — object placement & selection unchanged (gate)

The extraction must not change how static objects load or select.

- [ ] Place a static **OBJ** prop (e.g. `closet`) via the Object tool → it appears, casts
      shadow, is selectable; the gizmo grabs the **root** (move/rotate/scale behave as before).
- [ ] Place a static **GLTF** prop (e.g. `bush`) → same. (GLTF now clones via
      `SkeletonUtils.clone`; static meshes clone identically.)
- [ ] Select a placed object → PropertiesPanel shows **Geometry** and **Material** rows; for a
      static asset there is **no Animations row**.
- [ ] Delete an object → mesh + colliders gone, no leftover in the scene.
- [ ] Switch zones / reload → objects reload correctly (loadZone path delegates to ObjectPlacer).

Programmatic check (dev globals — run in a **foreground** tab; hidden tabs freeze `fetch`):

```js
const w = window.__world, zm = window.__zones, z = w.activeZoneId;
const mk = (id, assetId, x) => ({ id, assetId, position:{x,y:0,z:0}, rotation:{x:0,y:30,z:0},
  scale:{x:1,y:1,z:1}, floor:0,
  properties:{ interactable:false, interactLabel:"Interact", npcSpawn:false, lootTableId:null, triggerEventId:null }});
w.addObject(z, mk("t_obj","closet",-3));
w.addObject(z, mk("t_gltf","bush",3));
// after ~400ms:
const e = zm._loadedZones.get(z);
const m = e.objectMeshes.get("t_gltf");
console.log("loaded:", !!m, "rotY≈0.5236:", m && m.rotation.y, "editorId:", m && m.userData.editorId);
let cpid; m.traverse(c => { if (c.isMesh && !cpid) cpid = c.userData._parentId; });
console.log("child _parentId === id:", cpid === "t_gltf");   // selection resolves to root
```

- [ ] Both load; `rotation.y ≈ 0.5236` (30°); child meshes carry `_parentId` for selection.

---

## 1. Clip discovery at import

- [ ] Import an animated GLB. After import, its entry in `public/assets/models/manifest.json`
      has `"animations": ["clipA", "clipB", ...]` matching the GLTF's clip names.
- [ ] A static OBJ/GLTF import writes **no** `animations` key (or `[]` omitted).

## 2. Animations screen appears only for animated assets

- [ ] Place the animated prop, select it → PropertiesPanel root shows an **Animations** row
      with summary "N clips". Static props show no such row.
- [ ] Drill into Animations → AUTO-PLAY dropdown (None + each clip) and a CLIPS list with a
      `▶ Preview` button per clip.

## 3. Editor clip preview (no preview mode)

- [ ] Click `▶ Preview` on a clip → the mesh animates once in the **editor** scene; button
      becomes `■ Stop`; other clips' buttons disable.
- [ ] On clip completion → button auto-resets to `▶ Preview`; mesh returns to auto-play clip
      (if set) or bind pose.
- [ ] Click `■ Stop` mid-clip → animation stops, returns to auto-play/bind pose.
- [ ] Preview a clip on object A, then on object B → A's preview stops first (only one preview
      at a time).

## 4. Auto-play

- [ ] Set AUTO-PLAY to a clip → the mesh immediately starts looping that clip in the editor.
- [ ] Set AUTO-PLAY back to None → looping stops, returns to bind pose.
- [ ] `autoPlayAnimation` persists: save the scene, reload → the clip is still set and loops.
- [ ] Auto-play also runs in **preview/game mode** (resting state).

Programmatic check:

```js
const o = window.__zones._objectPlacer;   // mixers keyed by objectId
// after setting auto-play in the UI for the selected object:
console.log("mixer exists:", !!o);        // subsystem present
```

## 5. Lifecycle / cleanup

- [ ] Delete an animated object → its mixer is torn down (no console errors; `update(dt)` no
      longer advances it).
- [ ] Switch/unload a zone with animated objects → all their mixers are removed.

## 6. Always

- [ ] `npm run build` and `npm run typecheck` → 0 errors.
- [ ] Console clean; no Vite overlay.

---

## Known scope boundaries (not bugs)

- Auto-play changes persist via `worldState.updateObject` but are **not** recorded in undo
  history (consistent with treating it as a lightweight property, not geometry).
- CSG-cut / collider behavior for objects is unchanged — objects still have no per-instance
  colliders (a future phase; the extraction makes ObjectPlacer the natural home for it).
