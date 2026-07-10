# Phase 33 — Projects: multi-scene games, auto-generated manifest, shared game.json

> **Status: IMPLEMENTED** — shipped 2026-07-10 (v4.27.0). Verified in-browser
> end-to-end; acceptance record in `test-plans/phase-33-projects.md`.
> Deviations from plan: none material (the ⋯ menu's Delete targets the
> *current* scene rather than an arbitrary pick — same guards; Play's
> positive path is covered by the pj-fixture boot since OPFS projects
> aren't HTTP-served).


## Context

Today the editor is single-scene: each level is a standalone JSON saved wherever the file picker points, the runtime manifest is hand-written, `load_scene` ids are free-typed and unvalidated, and game-wide data (the Phase 32 item registry, stateSchema defaults) must be duplicated into every scene file. This phase adds an opt-in **project** layer: a folder holding an auto-generated `manifest.json`, a shared `game.json`, and `scenes/<id>.json` — defaulting to `public/games/<id>/` so save = instantly playable in the runtime shell, with an explicit **Publish** flow (user requirement: testable locally) and all file IO behind a `ProjectStore` module so fully-external projects can come later (user requirement: move in that direction). Single-scene editing without a project stays untouched.

Decisions settled with user: projects under `public/games/<id>/` by default; Publish-to-any-folder also ships now; architecture ready for external projects next. PUBLISHING_GUIDE.md §0 already documents the *manual* version of this exact flow (confirmed: demo manifest uses `assetsBase: "/"`); Phase 33 automates it.

## Project shape

```
public/games/<id>/
  manifest.json          # auto-generated RuntimeManifest — never hand-edited
  game.json              # GameConfig: shared items + stateSchema defaults
  scenes/<sceneId>.json  # exact editor SceneFile format
```

Generated manifest: `{ manifestVersion: 1, id, name, version, entryScene, scenes: { <id>: "scenes/<id>.json" }, assetsBase: "/", game: "game.json" }`. Scene id = manifest key = filename stem (slug); `SceneFile`/`SceneMetadata` stay id-free — identity is a project-layer concept, matching the runtime's existing `scenes: Record<string,string>`.

## Step A — Types + merge seam (no dependencies)

- `src/types.ts`: `GameConfig { gameVersion: 1; items?: ItemDef[]; stateSchema?: Record<string, StateSchema> }` near ItemDef (~894).
- `src/world/WorldState.ts`: instance fields `gameItems?: ItemDef[]`, `gameStateSchema?: Record<string, StateSchema>` — **session-only, never serialized** (`toJSON()` at 619-628 hand-builds output; `activeZoneId` precedent). Set by App (project open) and SceneRouter (runtime).
- `src/scripting/inventory.ts`: `itemRegistry(world) = mergeItemDefs(world.gameItems, world.world?.items)` — **scene wins on duplicate id** (game order first, scene-only appended, shadowing replaces in place). Consumers: `ownedItems` (inventory.ts:24-26, one line) and ScriptEngine.ts:343 give/take lookup. These are the ONLY two registry readers (verified; `has_item` reads gameState only).

## Step B — Runtime: `manifest.game` + merge (independently shippable; do first)

- `src/runtime/manifest.ts`: `RuntimeManifest.game?: string` (URL relative to manifest); `LoadedManifest.game: GameConfig | null`; `loadManifest` fetches it after validation — **non-fatal on any failure** (warn, `game: null`).
- `src/runtime/SceneRouter.ts` `go()`: after `loadFromJSON` (~104) set `world.gameItems`/`world.gameStateSchema` from `manifest.game`; replace the configureSchema call (~117) with game-under-scene spread: `{ ...(game.stateSchema ?? {}), ...(scene ?? (game.stateSchema ? {} : DEFAULT_STATE_SCHEMA)) }` — DEFAULT only when neither exists; still no reset (cross-scene persistence intact).
- **Commit fixture `public/games/pj-fixture/`** (adapted from demo scenes): 2 scenes, `game.json` with one item (`itm_key`, stackSize 1) + schema key (`quest.stage` default 0, overridden by scene 2), a `give_item` trigger in scene 1. Permanent regression fixture AND the runtime-boot verification target (OPFS isn't HTTP-served, so runtime tests can't use the automation-created project).

## Step C — `src/project/ProjectStore.ts` (new; all project file IO)

- `slugifyId(name)`, `uniqueSceneId(base, existing)` (suffix `_2`, `_3`…).
- `ProjectStore.create(parentDir, name)` — makes `<id>/` INSIDE the picked dir (pick `public/games` once → `public/games/<id>`), writes manifest + game.json. `ProjectStore.open(dir)` — validates manifest loudly; missing/invalid game.json → default `{gameVersion:1}` + warn.
- Members: `dir`, `manifest`, `game`, `id/name/sceneIds/entryScene`; `loadScene/saveScene/addScene/removeScene/setEntryScene/writeManifest/writeGame`; `publishTo(target)` copies manifest+game+scenes/* INTO the picked folder directly, returns file count. FSA idioms already in the codebase: `getDirectoryHandle(id,{create:true})` (MaterialImporter.ts:67-69), `getFileHandle(n,{create:true})`+createWritable, manifest read-modify-write (App.tsx:1350-1356).
- IDB persistence via existing `src/lib/fileHandleStore.ts`: `'lastProject' = { dir, name, sceneId }` (name stored so the reopen banner renders without read permission); `restoreLastProject()` uses `queryPermission({mode:'readwrite'})` (App.tsx:404-410 precedent); `requestProjectPermission(dir)` = first `requestPermission` in the codebase — **must run in a user gesture**; extend `src/fsa.d.ts` if needed.

## Step D — App.tsx wiring

- State: `project: { store, currentSceneId, rev } | null` + `projectRef` (handleSave is `useCallback([])` — ref pattern like `fileHandleRef`); `projectPending` (reopen banner data); `gameItems` React mirror.
- Handlers: `handleProjectNew` (prompt name → `showDirectoryPicker({mode:'readwrite'})`, hint "pick <repo>/public/games for instant Play" → create → **adopt current world as scene 1**, entryScene = it, null `fileHandleRef`); `handleProjectOpen`; `handleProjectSceneSwitch` (**auto-save current, no prompt** — write-through model → loadScene → `handleLoadFromJSON` → re-set `world.gameItems`; undo history clears on world:loaded, expected); `handleProjectSceneAdd` (extract handleNew's fresh-scene template at 863-876 into `makeFreshScene(name)` and reuse); `handleProjectClose`; `handleProjectReopen` (gesture → requestPermission → open; do **not** reload the scene — the autosave already restored it, possibly fresher).
- `handleSave` (821-858): project branch at top — `saveScene(currentSceneId, toJSON()) + writeGame() + writeManifest()`, skip the fileHandle/showSaveFilePicker branch, keep the autosave-keys + dirty-clear tail.
- Boot restore (after the lastFileHandle block, 403-410): `restoreLastProject()` → granted: open + adopt (persisted sceneId validated ∈ sceneIds else entryScene), **don't reload the scene**; else `setProjectPending`.
- **ITEMS scoping**: project open → `handleWorldItemsChange` (1823-1830) branches to `store.game.items` + `world.gameItems` + dirty (persisted on Save; not undoable v1 — document). Scene-local `WorldConfig.items` still honored via merge but not editable while a project is open (v1; blurb states it).
- **Editor preview schema merge**: App.tsx:439 `configureSchema` gets the same game-under-scene spread using `world.gameStateSchema` (set wherever gameItems is set).

## Step E — TopBar UI (`src/ui/TopBar.tsx`)

Optional props (absent = today's rendering): `project`, `projectPendingName`, `onProjectNew/Open/Reopen`, `onSceneSwitch/Add/Delete`, `onProjectPlay/Publish/Close`, `onEntrySceneChange`. One compact cluster after the title (~line 86):
- No project: `PROJ ▾` button → small popover (absolutely positioned panel, document-pointerdown to close — new ~30-line pattern) with New Project… / Open Project…. Pending: amber `REOPEN "<name>"` button (the requestPermission gesture).
- Project open: name label + native `<select>` scene switcher + `+` (add scene) + `▶` (Play) + `⋯` popover (entry-scene select, Publish…, Delete scene… [blocked for entry/last; deleting current switches to entry first], Close project).
- **Scene rename deferred** (cross-scene `load_scene` refs would need rewriting) — documented future work.

## Step F — ScriptPanel `load_scene` dropdown

Thread `projectSceneIds?: string[]` down the established `worldItems` chain (App → LeftPanel → ScriptPanel → ScriptEditor → ActionRow → ActionFields). `load_scene` case (~1864-1880): with ids, render `<select>` (+ "(not in project)" preservation for unknown current value + `Custom…` sentinel flipping to the existing free-text input — ItemPicker idiom at 1466-1495); without, exactly today's free text.

## Step G — Play in runtime

`handleProjectPlay`: save first → probe `fetch('/games/<id>/manifest.json', {cache:'no-store'})`, verify `.id === store.id` (guards a shadowing folder) → `window.open('/runtime.html?manifest=…')`; on failure, notice: "not served at /games/<id>/ — create under public/games or use Publish… (PUBLISHING_GUIDE.md §0)". `window.alert` acceptable v1 (no toast precedent).

## Step H — Publish

Save all → `showDirectoryPicker` → if target has a manifest.json with a **different** id, `confirm` before overwrite → `publishTo(target)` → notice "Published N files. **Assets are not copied** — see PUBLISHING_GUIDE.md (assetsBase)."

## Edge cases

Permission lost → pending banner + gesture-gated requestPermission. Id collisions → `uniqueSceneId`. Delete scene → blocked for entry/last, refs degrade ("(not in project)" + runtime already non-fatal at SceneRouter 63-71). Dirty switch → auto-save, no prompt. game.json missing/invalid → warn + default; next Save rewrites. Autosave stays a single-scene snapshot of the active scene (persisted `lastProject.sceneId` keeps attribution). Two tabs on one project → last-writer-wins, documented limitation. Corrupt manifest → `open` fails loudly, single-scene editing unaffected.

## Implementation order + gates

1. **A** merge seam → typecheck + editor smoke (identity merge when no project)
2. **B** runtime game support + pj-fixture → typecheck + fixture boot assertions (runtime shippable alone)
3. **C** ProjectStore → typecheck
4. **D+E** App + TopBar → typecheck + OPFS automation
5. **F** load_scene dropdown → typecheck
6. **G+H** Play + Publish → typecheck + OPFS publish test
7. Docs; commit straight to main; version = changelog head + 1 at merge time (don't pin; parallel sessions)

## Verification (TESTING.md §3 golden path + §9 OPFS stub — FSA pickers can't be clicked)

1. Snapshot `worldeditor_autosave` (dump in slices) before mutating.
2. Stub `window.showDirectoryPicker = async () => opfs` (clean OPFS first). UI: PROJ ▾ → New Project "Test Game" → assert OPFS contents: `test-game/manifest.json` (manifestVersion 1, assetsBase "/", game "game.json", entryScene = adopted scene), `game.json`, `scenes/<id>.json` == `__world.toJSON()`.
3. `+` scene → edit → Save → assert second scene file + both manifest keys; ITEMS tab add item → Save → assert `game.json.items`; pickers/bag read the merged registry.
4. `load_scene` dropdown lists both ids + Custom fallback.
5. Scene switch flips `__world.toJSON()` correctly and back.
6. Publish with a call-counting stub returning a second OPFS dir → assert copied files.
7. **Reload** → OPFS handles round-trip IDB with `queryPermission` granted → boot-restore adopts the project (TopBar shows name + scene).
8. **Runtime merge** against the committed fixture URL `runtime.html?manifest=/games/pj-fixture/manifest.json`: `quest.stage === 0` post-Start; give trigger → `ownedItems` resolves the game.json def (not `def:null`); `router.go(scene_02)` → def still resolves; scene-2 schema override wins.
9. Human one-click checks (HUMAN_TESTING): real picker into `<repo>/public/games/`, Save, ▶ plays in runtime; browser-restart reopen prompts once.

## Docs

- **WORLD_EDITOR_ARCHITECTURE.md**: new Projects phase section (ProjectStore, merge seam, gameItems non-serialization rationale); amend manifest.ts / SceneRouter / WorldState / TopBar / ScriptPanel file-level sections; strike the phase-25 future-work "editor Export manifest" row (superseded). No version pinning.
- **PUBLISHING_GUIDE.md §0**: lead with the automated flow; manual steps become the appendix; note Publish copies JSON only, never assets.
- **HUMAN_TESTING.md**: "Workflow: author a multi-scene project".
- **TESTING.md §9**: one line — projects reuse the OPFS stub; pj-fixture pointer.
- **plans/phase-33-projects.md** + **test-plans/phase-33-projects.md** (committed).

## Recorded follow-ups (not this phase)

External-folder projects (runtime boots from a directory handle / publish pipeline), scene rename with cross-scene ref rewrite, launcher/registry (arch doc §13), usable/consumable items, second bag style + bagStyle dropdown, demo-world items showcase.
