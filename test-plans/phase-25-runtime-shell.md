# Phase 25 — Standalone Runtime Shell — Test Plan

Verified 2026-07-08 during implementation (v4.20.0) via Chrome MCP against the
running dev server. Re-run after changes to `src/runtime/*`,
`SceneManager`, `AssetManager` (base-URL path), `PhysicsWorld`
(collider/body removal), `ScriptEngine` (`load_scene`), or `ZoneManager`
teardown.

**Remote-testing gotchas hit this phase:**
- **Held-key walking via separate tool calls is uncontrollable** — each
  `javascript_tool` round-trip adds 1–3s to the "hold", so a 0.35s strafe ran
  ~2–4s and walked the player off the floor (twice). For a deterministic pose
  use `bus.emit("character:teleport", { position, facing })`; walk only for
  trigger-volume crossings, with generous floors.
- **Un-versioned dynamic `import("/src/…")` from the console returns a second
  module instance** once Vite has HMR-stamped the page's graph (`?t=` query) —
  the imported `physicsWorld` was uninitialized. Use the dev globals
  (`window.__runtime.physicsWorld`) instead of console imports.
- The extension's network log can report HEAD statuses wrong (503) while the
  in-page fetch sees 200 — verify with an in-page `fetch(url, {method:"HEAD"})`
  before chasing ghosts.
- Pointer-lock `WrongDocumentError`/`NotAllowedError` console noise on every
  automated game entry — CDP actions carry no user gesture; known artifact.
- The runtime tab writes no editor localStorage keys, but any *editor* tab
  opened in the session still needs the full TESTING.md autosave
  snapshot/neuter/restore protocol (used here for the 25.1 smoke + the 25.4
  round-trip check; neutered `setItem` immediately after snapshot, kept a
  bound `realSetItem` for the restore).

## 25.1 — Decoupling (zero editor change)

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | `npm run typecheck` | clean | ✅ |
| 2 | Editor loads (autosaved world) | textured world, 0 magenta-fallback materials | ✅ 12 textured / 0 magenta |
| 3 | Asset request URLs | unchanged `/assets/...` same-origin | ✅ network log |
| 4 | EditorCamera orbit (`focus` set + `update`) | camera follows | ✅ (10,14.1,10)→(15,16.1,15) |
| 5 | Preview enter/exit via `__test` | isActive true→false, kbm scheme, no crash from nullable guards | ✅ |
| 6 | Console | Toolbar CSS warning + pointer-lock noise only (both pre-existing) | ✅ |

## 25.2 — Second entry, empty shell

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | `/runtime.html` | sky renders (12 tris, bright px via readPixels-after-render) | ✅ |
| 2 | Scene graph | 0 GridHelpers, 0 demo ground, 0 ViewHelper DOM | ✅ |
| 3 | `npm run build` | emits `index.html` + `runtime.html`; runtime references only its own chunk + shared engine chunk (no `main-*.js`) | ✅ |
| 4 | StrictMode | boot IIFE `active`-flag bail; no double engine | ✅ |
| 5 | Console | clean | ✅ |

## 25.3 — Manifest + single-scene play

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | `?manifest=/demo/manifest.json` | menu shows name/description/author·version from manifest; `document.title` = name | ✅ |
| 2 | Start | level_01 builds: floor 1, merged wall run 1, shapes 4, volume 1; spawn (0, 0.9, 3.5) | ✅ |
| 3 | Walk (W) into greeter volume | dialogue line 1; `visited_l1` 0→1 | ✅ |
| 4 | Confirm (E) ×2 | line 2 → closed (`dialogue:closed` emitted — advance works ⇒ menu-mode gate works) | ✅ |
| 5 | Enter | pause menu opens (`action:cancel` handler) | ✅ |
| 6 | Pause → Exit | back at main menu, preview inactive | ✅ |
| 7 | Start again (teardown/reload cycle) | identical mesh counts; `visited_l1` reset to 0 (New Game) | ✅ |
| 8 | Escape | back to menu | ✅ |
| 9 | Bad manifest URL | ErrorScreen (invalid-JSON message names the dev-server HTML-fallback case) | ✅ |
| 10 | HUD | zone name "Level One", scheme-correct hints, FpsCounter (DEV) ~120 FPS | ✅ |

## 25.4 — SceneRouter + load_scene

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Walk into l1 portal volume | fade → level_02 loads, spawns at its defaultSpawn | ✅ |
| 2 | Cross-scene state | `set_state visited_l1=1` in scene 1 gates level_02's `on_level_load` dialogue (compare_number ≥ 1) | ✅ |
| 3 | A→B→A→B counts (`window.__counts` probe) | identical per scene every visit: A = 9 meshes/9 colliders/9 bodies, B = 6/4/4 | ✅ after leak fix |
| 4 | Physics leak fix | pre-fix B showed 12 bodies (fixed bodies orphaned by removeCollider); post-fix exact | ✅ |
| 5 | One-shot carry-over | l2 carryover script (oneShot) fires once; A→B revisit does NOT re-fire; `getFiredOneShots()` retains it across scenes | ✅ |
| 6 | Unknown sceneId (`scene:load-request "nope"`) | console error, still playing, no ErrorScreen, no teardown | ✅ |
| 7 | Editor round-trip | volume + `load_scene` script via `addTriggerVolume` → `toJSON()` preserves `{type:"load_scene", sceneId}` | ✅ |
| 8 | Editor preview no-op | `__test.fire("on_player_enter", vol)` with load_scene action → nothing happens, no crash | ✅ |
| 9 | ScriptPanel | `load_scene` in ACTION_TYPES with free-text sceneId field + "not validated here" hint | ✅ (code; dropdown renders the union) |

## 25.5 — Save/Continue + remote manifests

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Escape while playing | save blob written: `runtime_gamesave:demo-adventure` `{sceneId, state, firedOneShots, pose}` | ✅ pose (2,~0,1,90°) exact |
| 2 | Menu after save exists | Continue + New Game buttons | ✅ |
| 3 | Full page reload → Continue | resumes level_02 at saved pose (2, 0.9, 1), `visited_l1`=1, one-shot restored, carryover does NOT re-fire | ✅ |
| 4 | New Game after Continue | entryScene level_01, state reset (0), one-shots empty, save cleared | ✅ |
| 5 | Remote manifest (`?manifest=http://localhost:8787/...`, python CORS server serving `public/`) | menu → play, textured (6 texture-mapped meshes); manifest/scenes/asset-manifests/textures all fetched from 8787 (performance entries) | ✅ 14 resource entries |
| 6 | CORS/error surfacing | manifest.ts names CORS on fetch TypeError; ErrorScreen renders it | ✅ (message path; bad-URL variant exercised) |

## Regression (editor)

- `npm run typecheck` clean at every step. ✅
- Editor smoke after 25.1 (the only editor-touching step): load, orbit,
  select, preview enter/exit, materials, asset URLs — unchanged. ✅
- `src/runtime/` unreachable from the editor entry; later steps re-verified by
  typecheck + editor load only (per plan §12 regression firewall). ✅

## Known / accepted

- Kill-plane: walking off a floor edge falls forever (and a mid-fall save
  records that pose). Same behavior as editor preview; respawn-below-Y is
  future polish.
- `SceneManager`'s static `EditorCamera`/ViewHelper imports ride along unused
  in the runtime bundle (~tens of KB; accepted, lazy-import noted as future).
- Sky-only menu canvas renders at full RAF rate (accepted for v1).
- `play_sound` remains a silent no-op everywhere (`audio:play` has no listener
  — pre-existing).
