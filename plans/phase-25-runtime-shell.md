# Phase 25 — Standalone Runtime Shell (manifest + SceneRouter)

> Status: **IMPLEMENTED** — shipped as **v4.20.0** (2026-07-08), steps 25.1–25.6
> all verified in-browser; see `test-plans/phase-25-runtime-shell.md` for the
> acceptance record. (Reconciled 2026-07-08 against v4.19.0 before
> implementation; originally drafted 2026-07-07 as phase 21 / v4.8.0.)
> Notable deviations from this plan during implementation:
> - `SceneRouter` was built in step 25.3 (the initial scene load already goes
>   through `go()`); 25.4 added only the `load_scene` action/types/panel field
>   and the `scene:load-request` subscription.
> - **Pre-existing PhysicsWorld leak fixed** (25.4): `createStaticCollider`/
>   `createSensorCollider` allocate a dedicated fixed body per collider, but
>   `removeCollider` left it behind — every zone unload leaked one body per
>   collider (invisible in editor zone swaps, compounding per runtime scene
>   transition). `removeCollider` now removes the empty parent body;
>   `removeRigidBody` is idempotent (`isValid()` guard) for CharacterBody's
>   collider-then-body dispose order.
> - The router owns script re-index/activation across scene loads; the
>   runtime's `preview:start` handler is UI state + save cadence only (§5.6's
>   "wired exactly as App.tsx" was wrong for this handler).
> - `go()` gained `opts.restore` (one-shots + pose) so Continue restores
>   through the router; pose rides the existing `character:save-position` /
>   `character:teleport` pair via reserved gameState key `__runtime_pose` — no
>   new engine surface.
> - `on_level_load` fires with the zone id (matching the editor's
>   `zone:enter` path), not null.
> - The no-param menu's URL input navigates with a full reload
>   (`?manifest=…`) rather than booting in place.
> - Demo fixture: hand-authored JSON validated through the real engine load
>   path (not click-authored in the editor).
> - `verifyFiles:false` is passed unconditionally in the runtime (not only
>   for cross-origin bases).
> - `physicsWorld` added to the `window.__runtime` dev global (un-versioned
>   dynamic `import()` of a module Vite has HMR-stamped returns a second,
>   uninitialized instance — learned mid-test).

A lightweight web runtime, separate from the editor, served from the **same
repo as a second Vite entry** (`runtime.html` + `src/runtime/`). It boots from
a `manifest.json` — loadable from **any URL** (remote origins OK, CORS
permitting) — shows a DOM main menu built from manifest metadata, and routes
between whole scene files (main menu → level_01 → level_02) one level *above*
the existing in-scene zone-transition system. Global game state (`gameState`)
persists across scene loads.

Origin: a design conversation about "standardized 3JS runtime containers" —
pre-baked runtime shells that accept a standardized JSON scene format and just
run, with a manifest layer that behaves like an OS/launcher above the scene
layer. This editor's world JSON **is already that scene format**; this phase
builds the shell around it.

---

## 1. Scope & assumptions

**In scope**

- Manifest v1 schema + loader (remote URLs OK; scene/asset URLs resolved
  relative to the manifest's own URL).
- Runtime composition root reusing the engine classes directly (`WorldState`,
  `ZoneManager`, `PreviewController`, `ScriptEngine`, `physicsWorld`,
  `assetManager`) — `App.tsx` stays the editor's composition root, untouched
  except the named coupling edits in §7.
- `SceneRouter` with full teardown/reload between scene files; a new
  `load_scene` script action so authored content can trigger scene changes.
- DOM/React main menu (title, description, Start, Continue), loading screen,
  error screens; the full preview overlay set reused: `PreviewHUD` (needs its
  phase-24 `scheme` prop), `DialogueOverlay` (advances on `action:confirm`;
  runtime emits `dialogue:closed` in onClose), `FadeOverlay`
  (`src/preview/FadeOverlay.tsx`), `TouchControlsOverlay` (gated on active
  scheme === "touch" — without it touch input is dead), and `PauseMenu` +
  App's `action:cancel` handler pattern (runtime routes "exit" to the menu
  screen instead of the editor).
- Runtime game save (state + fired one-shots + current scene + pose),
  namespaced per manifest id, separate from the editor's localStorage keys.

**Out of scope (explicitly — future-work notes in §13 only)**

- Launcher/library UI, localStorage manifest registry, add-by-URL library,
  remote registry browsing.
- Ref-counted cross-scene asset cache and preloading (v1: `assetManager`
  caches simply persist for the session — correct for shared assets, just not
  evicted).
- 3D main-menu scenes (`load_scene` makes this nearly free later).
- Editor "Export manifest / bundle" tooling — v1 manifests are hand-written;
  the existing world-JSON save **is** the runtime scene format.
- Per-scene lighting/sky overrides (runtime keeps SceneManager's hardcoded
  sky/fog/lights, same as editor preview today).

**Assumption:** the runtime only ever enters `preview.enter("game")` — the
non-game "preview" mode (editor-camera spawn fallback) stays editor-only.

---

## 2. Current state (what this phase changes)

| Where | Today | Problem |
|---|---|---|
| `src/core/SceneManager.ts:44` | Hard-wires `new EditorCamera(this.camera, canvas, bus)`; also ViewHelper (`:55`), grid + demo ground (`_setupGrid`) | The one real editor coupling in the engine layer. Runtime needs a SceneManager with no editor camera, no ViewHelper, no grid/ground. |
| `src/preview/PreviewController.ts:48` | Non-game preview path reads `this._scene.editorCamera.focus`. (Since phase 24, `enter()` also constructs `ControlSchemeManager` + `loadBindings()` internally and passes it to `CharacterController` — the runtime inherits kbm/gamepad/touch for free.) | NPEs once `editorCamera` is nullable. Runtime only calls `enter("game")`, but the type must be honest. |
| `src/core/AssetManager.ts` | `fetch('/assets/textures/manifest.json')` (`:41`), models manifest (`:91`), **decals manifest (`:116`)** — absolute-from-origin paths; HEAD existence checks (`_fileExists`, `:146`); texture map paths (`loadTexture` `:186`), model defaults (`loadModel`/`loadGLTF` `:306`/`:375`), OBJ/MTL paths (`:325-343`) | No base-URL indirection: remote manifests can't resolve assets, and cross-origin HEAD checks spuriously hide assets (some hosts 405 HEAD). Collider presets ride the models manifest (COLLIDERS_GUIDE), so they come free once the manifest fetch is base-resolved. |
| `src/App.tsx` (2167 lines) | The only composition root; owns save/load, preview lifecycle (`preview:start` handler `:411-428`), dialogue/fade/pause state, `action:cancel` handling (`:441-455`) | Nothing wrong — the decision is to **not** refactor it. Runtime duplicates ~150 lines of glue instead (§3.1). |
| `vite.config.ts` | Single implicit entry (`index.html`) | Needs `build.rollupOptions.input` with a second `runtime.html` entry. |
| `src/types.ts` (`ActionType`, `ScriptAction`, `BusEvents`) | No cross-scene action; `TransitionDef` (`:550`) covers zone→zone within one file only | Need `load_scene` action + `scene:load-request` bus event. |
| `src/scripting/GameState.ts:5` | `GAMESAVE_KEY = "worldeditor_gamesave"`; App.tsx also owns `worldeditor_autosave` | Runtime saves must not collide with editor saves on the same origin (dev serves both entries). |

What already exists and is reused untouched (verified: zero `@/editor` /
`@/ui` imports): `WorldState` (`toJSON`/`loadFromJSON` of `SceneFile`),
`ZoneManager` + the pure builders (its `loadZone`/`unloadZone` fully handle
the new `ZoneDef.shapes`/`ZoneDef.decals` arrays incl. hull/trimesh collider
teardown), `PreviewController`/`CharacterController`/`TriggerSystem`/
`ObjectPlacer`, the whole `src/input/` system (owned by `PreviewController`),
`ScriptEngine` + `gameState`, `physicsWorld` (StrictMode-safe `init()`),
`WorldLoader` migrations, and the bus-driven React overlays (`PreviewHUD`,
`DialogueOverlay`, `FadeOverlay`, `TouchControlsOverlay`, `PauseMenu`).
One caveat: `src/dev/testHelpers.ts` statically imports `@/editor/bakeShapes`
— the runtime loads it via DEV-gated dynamic import so no editor code lands
in the runtime chunk graph (§5.7).

---

## 3. Key decisions

1. **Runtime gets its own small composition root; App.tsx is not refactored.**
   The engine classes are already editor-clean; App.tsx's 2167 lines are ~90%
   editor tooling and React state fan-out. A shared `createEngine()` factory
   would thread ~10 constructor params to save ~120 lines of duplication while
   putting every editor feature at regression risk. Duplicating the glue
   (engine construction, init race handling, overlay wiring, game-save
   helpers) is the cheaper, safer trade. If a third consumer ever appears,
   extract then.
2. **SceneManager gets a mode option, not a subclass.**
   `new SceneManager(canvas, bus, { mode: "game" })` (default `"editor"` —
   zero editor churn). Game mode skips EditorCamera, ViewHelper, and
   `_setupGrid()` (grid helpers *and* the demo ground plane — runtime worlds
   bring their own floors). `editorCamera` becomes `EditorCamera | null`; only
   two external references exist (`App.tsx:269` dev global,
   `PreviewController.ts:48`). Render loop needs only guards
   (`this.editorCamera?.update(dt)`, skip ViewHelper render). **Before Start,
   the canvas renders sky + lighting with the static default camera — that's
   the menu backdrop; no special paused state needed.** A `GameSceneManager`
   subclass would duplicate lighting/sky/resize/loop for no benefit.
3. **Scene entry convention: the first zone in the SceneFile is the entry
   zone** (`loadFromJSON` already sets `activeZoneId = zones[0].id`), and
   spawn is `world.defaultSpawn` (already required by game mode). No new
   SceneFile fields in v1.
4. **`load_scene` is a first-class ScriptAction with a free-text `sceneId`.**
   Reusing `fire_event` would overload `on_state_changed` semantics and give
   the router string-parsing duties. A dedicated action is one `ActionType`
   member + one dispatch case emitting `scene:load-request { sceneId }`. The
   editor does **not** validate scene ids (it can't — the manifest doesn't
   exist at author time); ScriptPanel shows a plain text input with helper
   text "must match a scene key in the runtime manifest". In editor preview
   nothing listens to `scene:load-request` → silent no-op by design.
5. **Asset resolution = one base URL on the AssetManager.**
   `assetManager.setBaseUrl(url)` + a private `_resolve(path)` used by every
   fetch/loader call: strip a leading `/`, `new URL(path, base)`. Default base
   = document origin ⇒ byte-identical editor behavior. Scene URLs and
   `assetsBase` resolve against the **manifest URL** with the same
   `new URL(rel, manifestUrl)` rule.
6. **Cross-scene state = the existing `gameState` singleton, untouched.** The
   router calls `configureSchema()` per scene but **never `reset()`** mid-run
   — `register()` only seeds defaults for missing keys, so values written in
   scene A survive into scene B by construction. Fired one-shots are captured
   before `deactivate()` and restored after `activate()` (which clears them)
   so cross-scene one-shots don't re-fire.
7. **Editor export scope: nothing.** "Save world JSON" output is already a
   valid runtime scene. A committed demo bundle under `public/demo/` (manifest
   + 2 small scenes, authored in the editor) is the dev fixture and the
   documentation-by-example.

---

## 4. Design — manifest schema (v1)

```jsonc
// manifest.json — all relative URLs resolve against this file's URL
{
  "manifestVersion": 1,              // required; runtime rejects > 1
  "id": "demo-adventure",            // required; stable slug — namespaces the game save, future registry key
  "name": "Demo Adventure",          // required; menu title
  "version": "1.0.0",                // author's content version (display only)
  "description": "Two tiny levels.", // optional; menu subtitle
  "author": "Seanmclem",             // optional
  "thumbnail": "cover.png",          // optional; unused by v1 shell, reserved for launcher
  "entryScene": "level_01",          // required; key into scenes
  "scenes": {                        // required; sceneId → scene JSON URL (each a SceneFile export)
    "level_01": "scenes/level_01.json",
    "level_02": "scenes/level_02.json"
  },
  "assetsBase": "./"                 // optional; base for the /assets/** tree (texture+model manifests
                                     // and all their paths). Default: the manifest's directory.
}
```

```ts
// src/runtime/manifest.ts
export interface RuntimeManifest {
  manifestVersion: 1; id: string; name: string; version?: string;
  description?: string; author?: string; thumbnail?: string;
  entryScene: string; scenes: Record<string, string>; assetsBase?: string;
}
export interface LoadedManifest {
  manifest: RuntimeManifest; url: URL;
  sceneUrl(id: string): URL;   // new URL(manifest.scenes[id], url) — throws on unknown id
  assetsBaseUrl: URL;
}
export async function loadManifest(rawUrl: string): Promise<LoadedManifest>; // fetch + validate + resolve
```

Validation is shallow and loud: required fields present, `entryScene` ∈
`scenes`, `manifestVersion === 1`. Manifest-level `playerSettings` overrides
deliberately **omitted** — they live in each SceneFile's
`world.playerSettings` already.

---

## 5. Design — runtime composition root & bootstrap

```
runtime.html                     // mirror of index.html; loads /src/runtime/main.tsx
src/runtime/
  main.tsx                       // createRoot(<StrictMode><RuntimeApp/></StrictMode>)
  RuntimeApp.tsx                 // composition root + shell state machine (the "small App.tsx")
  manifest.ts                    // types + loadManifest + URL resolution (§4)
  SceneRouter.ts                 // file-level scene routing (§6)
  saveGame.ts                    // runtime save blob: key `runtime_gamesave:<manifest.id>` (§8)
  ui/MainMenu.tsx                // title/description, Start, Continue-if-save; manifest-URL input when ?manifest= absent
  ui/LoadingScreen.tsx           // shown during router transitions (scene fetch + zone build)
  ui/ErrorScreen.tsx             // manifest/scene fetch failures; names CORS explicitly on fetch TypeError
public/demo/
  manifest.json                  // committed fixture — two scenes wired by a load_scene portal
  scenes/level_01.json
  scenes/level_02.json
```

`RuntimeApp` shell states: `boot → menu → loading → playing → error` (plain
`useState`; no router lib). Bootstrap sequence:

1. Read `?manifest=` from `location.search`. Absent → menu renders a URL
   input (v1's stand-in for the launcher).
2. `loadManifest()`; `assetManager.setBaseUrl(loaded.assetsBaseUrl.href)` —
   **before any assetManager init call** (unlike App, which fires
   `initMaterials()` before its async block, the runtime must await the
   manifest first so the base URL is set).
3. Construct engine (mirrors `App.tsx:194-258`, minus every editor tool and
   `HistoryManager`): `EventBus`, `new SceneManager(canvas, bus,
   { mode: "game" })`, `assetManager.init(renderer)`, `WorldState`,
   `ObjectPlacer`, `ZoneManager`, `PreviewController` (which owns
   `ControlSchemeManager` since phase 24 — the runtime constructs no input
   code), `ScriptEngine`, `gameState.attach(bus)`, plus `scene.onUpdate`
   hooks for `physicsWorld.step`, `objectPlacer.update`, and
   `zones.updateVolumeVisuals`.
4. Mirror App's init shape (`App.tsx:353-399`): store
   `materialsReady = assetManager.initMaterials()`, fire `initAssets()` +
   `initDecals()` without awaiting, then
   `await Promise.all([physicsWorld.init(), materialsReady])` under the
   StrictMode `active`-flag pattern (`App.tsx:353`).
5. Show menu over the sky-only canvas. **Start** → clear runtime save,
   `gameState.reset()`, `router.go(entryScene, { newGame: true })`.
   **Continue** → restore save (§8), `router.go(save.sceneId, { resume: true })`.
6. React overlays mounted alongside the canvas, wired to the same bus exactly
   as App.tsx does (all bus-driven, no editor imports):
   - `PreviewHUD` — now needs the phase-24 `scheme` prop; track the active
     scheme via an `input:scheme-changed` subscription.
   - `DialogueOverlay` — advances on the `action:confirm` bus event (phase
     24); the runtime's `onClose` must emit `dialogue:closed` (feeds
     `ControlSchemeManager` menu-mode).
   - `FadeOverlay` (`src/preview/FadeOverlay.tsx`) — fed by `overlay:fade-in`.
   - `TouchControlsOverlay` — gated on `scheme === "touch" && preview.input`,
     props `{ shared, joystickRadius, layout }` from `preview.input.touch` /
     `preview.input.bindings.touch` (mirror App ~`:2007`). Without it, touch
     input is dead.
   - `PauseMenu` + the `action:cancel` handler pattern (App `:441-455`: close
     dialogue → close pause → open pause via `pause:show`); the runtime's
     pause-menu "exit" goes to the menu screen instead of the editor.
   - DEV only: `FpsCounter`.
7. DEV globals per TESTING.md conventions:
   `window.__runtime = { router, manifest, bus, world, zones, preview,
   scriptEngine, gameState }`, plus `installTestHelpers(...)` loaded via a
   DEV-gated **dynamic** import (it statically imports `@/editor/bakeShapes`;
   a lazy chunk keeps editor code out of the runtime graph) so the existing
   `window.__test` recipes work in the runtime tab too.
8. Exit while playing: Escape (kbm) and the pause menu's exit (all schemes)
   → `preview.exit()` + back to menu (Continue reflects the auto-saved
   position).

---

## 6. Design — SceneRouter

```ts
// src/runtime/SceneRouter.ts
export class SceneRouter {
  constructor(deps: { bus; world: WorldState; zones: ZoneManager;
                      preview: PreviewController; scriptEngine: ScriptEngine;
                      manifest: LoadedManifest });
  get currentSceneId(): string | null;
  async go(sceneId: string, opts?: { newGame?: boolean; resume?: boolean }): Promise<void>;
  dispose(): void;                       // unsubscribe scene:load-request
}
```

`go(sceneId)` sequence (order matters — comment it inline):

1. Re-entrancy guard (`_transitioning` flag — a portal volume can fire
   `load_scene` twice before teardown).
2. `bus.emit("overlay:fade-in", { color: "#000", duration: 0.3 })`; show
   LoadingScreen.
3. `const fired = scriptEngine.getFiredOneShots()`;
   `scriptEngine.deactivate()` (clears timers/listeners); `clearIndex()`.
4. `preview.exit()` — removes character body + collider, restores
   `setPreviewCamera(null)` (game-mode SceneManager keeps rendering with the
   default camera; harmless behind the fade).
5. Unload **all** loaded zones — `unloadZone` removes every mesh, Rapier
   collider (incl. shape hulls/trimeshes), door/volume sensor, and
   decal/surface-patch maps (verified `ZoneManager.ts:576-641`).
6. `fetch(manifest.sceneUrl(sceneId))`; parse; run migrations exactly as
   `App.tsx:744-749` (`migrateWallNodes`, `migrateUVs`, `pruneOrphanNodes`).
7. `world.loadFromJSON(file)` (emits `world:loaded`; sets
   `activeZoneId = zones[0]`).
8. `await zones.loadZone(world.activeZoneId)`.
9. Re-index scripts (mirror `App.tsx:417-420`): `clearIndex(); loadWorld(...);
   loadZone(activeZone)`.
10. `gameState.configureSchema(world.world?.stateSchema ?? DEFAULT)` —
    **no reset**; new keys seed defaults, existing values persist.
    `opts.newGame` is the only case where the caller reset beforehand.
11. `scriptEngine.activate()` then `restoreFiredOneShots(fired)` (activate
    clears the set) — unless `newGame`.
12. `preview.enter("game")` (spawns at `world.defaultSpawn`; emits
    `preview:start` — the runtime's handler starts the 30s game-autosave,
    mirroring `App.tsx:427`). On `resume`, follow with `character:teleport`
    to the saved pose if one exists.
13. First entry of a run only (`newGame || resume` from the menu):
    `scriptEngine.onGameStart()`. Every entry: fire `on_level_load` for the
    active zone — do **not** synthesize `bus.emit("zone:enter")`, which would
    also trip ZoneManager's zone-swap handler (`ZoneManager.ts:386`).
14. Hide LoadingScreen; `bus.emit("overlay:fade-out", …)`.

Router subscribes to `bus.on("scene:load-request", ({ sceneId }) =>
void this.go(sceneId))` — unknown id → non-fatal console/HUD error, stay in
the current scene.

### `load_scene` action spec (the only script-system change)

- `src/types.ts`: add `'load_scene'` to `ActionType`; add `sceneId?: string`
  to `ScriptAction`; add `"scene:load-request": { sceneId: string }` to
  `BusEvents`.
- `src/scripting/ScriptEngine.ts` `_dispatch`:
  `case "load_scene": if (action.sceneId) this._bus.emit("scene:load-request", { sceneId: action.sceneId }); break;`
- `src/ui/ScriptPanel.tsx`: add the action to the picker with one free-text
  field, labeled "Scene id (runtime manifest key — not validated here)".
  Cross-scene authoring is intentionally stringly-typed in v1.
- Recommend `oneShot: true` on portal scripts in docs (see §10 re-entrancy).

---

## 7. Design — engine decoupling edits (the complete touched-files list)

| File | Edit |
|---|---|
| `src/core/SceneManager.ts` | Ctor gains `opts?: { mode?: "editor" \| "game" }` (default `"editor"`). Game mode: skip `new EditorCamera` (field becomes `editorCamera: EditorCamera \| null`), skip ViewHelper + its DOM element, skip `_setupGrid()`. Guards: `this.editorCamera?.update(dt)` in the loop, `?.` in `setPreviewCamera`/`dispose`, skip ViewHelper render. |
| `src/preview/PreviewController.ts` | `:48` fallback becomes `this._scene.editorCamera?.focus ?? new THREE.Vector3(0, 0, 0)` (runtime only calls `enter("game")`; this keeps the type honest). Missing `defaultSpawn` in game mode: fail soft — spawn at origin + console warn. |
| `src/core/AssetManager.ts` | `setBaseUrl(url: string)` (default = document origin) + private `_resolve(path)` applied at **every** fetch/loader URL: `initMaterials` (`:41`), `initAssets` (`:91`), `initDecals` (`:116`), `_fileExists` (`:146`), `loadTexture` (`:186` + `_buildMaterial` map paths), `loadModel`/`loadGLTF` defaults (`:306`/`:375`), OBJ/MTL paths (`:325-343`). `initMaterials`/`initAssets`/`initDecals` gain `opts?: { verifyFiles?: boolean }` (runtime passes `false` — cross-origin HEAD checks would spuriously hide assets). |
| `src/types.ts` | `ActionType += 'load_scene'`; `ScriptAction.sceneId?`; `BusEvents["scene:load-request"]`. |
| `src/scripting/ScriptEngine.ts` | One dispatch case (§6). |
| `src/ui/ScriptPanel.tsx` | `load_scene` entry + text field. |
| `vite.config.ts` | `build: { rollupOptions: { input: { main: resolve(__dirname, "index.html"), runtime: resolve(__dirname, "runtime.html") } } }`. Dev server needs nothing — `localhost:7373/runtime.html` just works. |
| `src/App.tsx` | `:269` dev global tolerates null editorCamera. Otherwise **untouched**. |

Everything else is new files under `src/runtime/` + `public/demo/` (§5).

---

## 8. Design — persistence & localStorage keys

| Key | Owner | Content |
|---|---|---|
| `worldeditor_autosave` / `_ts` | Editor (unchanged) | Scene JSON autosave |
| `worldeditor_gamesave` | Editor preview (unchanged) | Editor-preview play save |
| `runtime_gamesave:<manifest.id>` | **Runtime (new)** | `{ version: 1, ts, sceneId, state: gameState.snapshot(), firedOneShots, pose?: {x,y,z,facing} }` |
| `worldbuilder.bindings.v1` | Shared (phase 24) | Input bindings — a **device pref**, deliberately shared between editor preview and runtime (not world data, no namespacing needed). |

`src/runtime/saveGame.ts` (~30 lines, modeled on `App.tsx:330-348` but adding
`sceneId` + pose read on the 30s tick). Namespacing by `manifest.id` means two
different games on the same origin never clobber each other, and neither
touches editor keys. Menu's Continue button = save key exists.

---

## 9. Events & types (EventBus table additions)

| Event | Direction | Payload |
|---|---|---|
| `scene:load-request` | ScriptEngine (`load_scene` action) → SceneRouter | `{ sceneId: string }` |

Everything else reuses existing events (`preview:start/stop`, `world:loaded`,
`dialogue:show`/`dialogue:closed`, `overlay:fade-in/out`, `zone:activated`,
`input:scheme-changed`, `action:confirm`/`action:cancel`,
`pause:show`/`pause:closed`). Note: a `scene:loaded` event already exists in
`BusEvents` (types.ts:219) with a different, editor-side meaning — the new
event is deliberately named `scene:load-request` to avoid colliding with it.

---

## 10. Edge cases to handle (checklist)

- [ ] **StrictMode double-mount**: RuntimeApp keeps StrictMode for parity;
  replicate App.tsx's `active` flag around the async boot IIFE
  (`App.tsx:353`). `physicsWorld.init()` is already re-entrant-safe (returns
  the in-flight promise).
- [ ] **Touch is dead without `TouchControlsOverlay`**: mount it gated on the
  active scheme (tracked via `input:scheme-changed`) — reusing
  PreviewController's input is not enough on its own.
- [ ] **Dialogue advance needs `dialogue:closed`**: the overlay advances on
  `action:confirm`, which ControlSchemeManager only emits in menu mode —
  entered on `dialogue:show`, exited on `dialogue:closed`. The runtime's
  onClose must emit it (mirror App).
- [ ] **`installTestHelpers` drags in `@/editor/bakeShapes`**: load it via a
  DEV-gated dynamic import in the runtime; verify the prod runtime chunks
  contain no `@/editor` code (grep dist).
- [ ] **Physics singleton across scene loads**: collider count must return to
  baseline after teardown — verify across `A→B→A` cycles; a leak compounds
  per transition.
- [ ] **`load_scene` re-entrancy**: portal volume fires `on_player_enter` on
  every boundary crossing; the `_transitioning` guard drops duplicates, and
  docs recommend `oneShot` for portal scripts.
- [ ] **Fired one-shots across scenes**: `activate()` clears the set —
  capture/restore around it (§6 steps 3/11) or cross-scene one-shots re-fire
  on every revisit.
- [ ] **`gameState.reset()` placement**: only on New Game from the menu — a
  reset inside `go()` would destroy the feature this phase exists for.
- [ ] **CORS**: manifest, scene JSONs, texture/model manifests, textures, GLBs
  all need `Access-Control-Allow-Origin` on remote hosts. Three's loaders
  default `crossOrigin = "anonymous"` — fine. ErrorScreen names CORS
  explicitly when a fetch TypeErrors (it's *the* failure mode users will hit).
- [ ] **Cross-origin HEAD checks**: runtime passes `verifyFiles: false` — some
  static hosts 405 HEAD, and a false negative silently hides every material
  (magenta world).
- [ ] **localStorage collisions**: runtime key is namespaced (§8); runtime
  must never write `worldeditor_autosave`.
- [ ] **Timers across transitions**: `deactivate()` clears script timers
  (verified); the runtime's own 30s autosave interval is cleared on
  `preview:stop` and re-created per scene entry (mirror `App.tsx:427-437`).
- [ ] **Missing `defaultSpawn`** in a scene file: fail soft (origin + warn),
  don't crash (§7 PreviewController edit).
- [ ] **Sky-only canvas before Start** renders at full RAF rate — acceptable
  for v1; note loop throttling as future polish.
- [ ] **`audio:play` has no listener anywhere today** — `play_sound` in the
  runtime is a silent no-op, same as editor preview. Pre-existing, not a
  regression; note it.

---

## 11. Implementation order (each step → verify)

Testing per TESTING.md: Chrome MCP on `localhost:7373`, `window.__runtime` /
`window.__test` globals, `npm run typecheck`. Each sub-phase commits straight
to main and gets its `test-plans/` doc at the end (25.6).

1. **25.1 — Decouple, zero behavior change.** SceneManager mode option,
   nullable `editorCamera`, PreviewController guard, AssetManager
   `setBaseUrl`/`_resolve`/`verifyFiles` (defaults preserve current behavior
   exactly).
   → verify: typecheck; full editor smoke pass via Chrome MCP (orbit, place
   wall, preview enter/exit, materials load); asset requests still hit
   `/assets/...` unchanged in the network log.
2. **25.2 — Second entry, empty shell.** `runtime.html`,
   `src/runtime/main.tsx`, minimal `RuntimeApp` (canvas + game-mode
   SceneManager + physics/material init + placeholder menu), vite
   `rollupOptions.input`.
   → verify: `/runtime.html` renders sky, **no** grid/ViewHelper/demo ground
   (scene-graph check via `window.__runtime`), no console errors, StrictMode
   clean; `npm run build` emits both entries; editor unaffected.
3. **25.3 — Manifest + single-scene play.** `manifest.ts`, `public/demo/`
   fixture (one scene first, authored in the editor), MainMenu (Start),
   LoadingScreen/ErrorScreen, full engine wiring, all five overlays
   (HUD+scheme / Dialogue+`dialogue:closed` / Fade / TouchControls / PauseMenu
   with `action:cancel` handling), `window.__runtime` + DEV-dynamic
   `installTestHelpers`.
   → verify: `/runtime.html?manifest=/demo/manifest.json` → Start → character
   spawns at `defaultSpawn`, walks, interacts (dialogue shows/advances via
   confirm), pause opens/closes and exits to menu, in-scene zone transitions
   still work; bad manifest URL → ErrorScreen; typecheck.
4. **25.4 — SceneRouter + `load_scene`.** Types/ScriptEngine/ScriptPanel
   edits, router with the §6 sequence, one-shot carry-over, second demo scene
   + portal trigger volume.
   → verify: walk into portal → fade → level_02 loads and spawns; a
   `set_state` in scene 1 gates a script in scene 2 (state persisted);
   collider/mesh counts identical across `A→B→A`; unknown sceneId →
   non-fatal; editor: authoring the action round-trips through save/load.
5. **25.5 — Save/Continue + remote hardening.** `saveGame.ts` (sceneId +
   pose), Continue path, Escape→menu, cross-origin pass.
   → verify: mid-game reload → Continue resumes correct scene/state/pose; New
   Game after Continue starts clean; serve `public/demo/` from a second local
   server (e.g. `python3 -m http.server 8000`) and load via
   `?manifest=http://localhost:8000/demo/manifest.json` — assets resolve, or
   the CORS error surfaces readably.
6. **25.6 — Docs & tests.** Update `WORLD_EDITOR_ARCHITECTURE.md` per
   `PLAN_UPDATE_GUIDE.md` — **both** the new Phase 25 section **and** the
   file-level sections (SceneManager, PreviewController, AssetManager,
   ScriptEngine, EventBus table, new `src/runtime/` sections); version bump +
   changelog; `test-plans/phase-25-runtime-shell.md`; `HUMAN_TESTING.md`
   walkthrough; note the runtime globals in `TESTING.md`.

---

## 12. Testing strategy

- **Chrome MCP as primary driver** (TESTING.md §1/§3): the runtime is a second
  tab on the same dev server. `window.__runtime.router.go("level_02")` gives
  deterministic transition tests without walking; `window.__test.fire(...)`
  drives portals; character body position via existing globals confirms
  spawns. Snapshot dumps chunked ≤ ~1 KB per tool result.
- **Regression firewall**: 25.1 is the only editor-touching step — full editor
  smoke pass there; after later phases only typecheck + a quick editor load,
  since `src/runtime/` is unreachable from the editor entry.
- **Cross-origin is a real test, not a thought experiment** (25.5): second
  local server, watch the network panel for resolved URLs.

---

## 13. Future work (explicitly not this phase)

- **Launcher/library**: manifest registry in localStorage
  (`runtime_registry`), add-by-URL UI, thumbnails (schema field already
  reserved), remote registry browsing (a registry is just another JSON
  endpoint of `{ name, manifest, thumbnail, author, tags }` entries).
- **Ref-counted asset cache + preloading**: `assetManager` caches already
  persist across scenes (a feature for shared assets); ref-counting +
  eviction-on-zero + manifest-driven preload of the *next* scene's assets
  belongs with the launcher work.
- **3D main menu**: a manifest scene entered via `load_scene` — the router
  already supports it; only menu-input UX is missing.
- **Editor "Export manifest" / bundle zip**; manifest-level `playerSettings`
  overrides; per-scene sky/lighting from `WorldConfig`.

---

## 14. Open questions (non-blocking, defaults chosen)

1. **Per-portal spawn override** (portal → specific spawn point in the target
   scene, like `TransitionDef.spawnPoint` one level down)? Default: no — v1
   always uses the target scene's `defaultSpawn`; add `load_scene.spawnId`
   later if demo authoring demands it.
2. **Pause behavior?** Resolved by phase 24b shipping `PauseMenu`: the
   runtime reuses it via the `action:cancel` flow (works on kbm/gamepad/
   touch), with its exit option routed to the runtime menu. Escape (kbm)
   remains a direct exit-to-menu with autosave, mirroring the editor.
3. **Demo fixture**: hand-authored JSON vs exported from a real editor
   session. Default: author in the editor, save, commit the JSON — proves the
   "export already works" claim.
