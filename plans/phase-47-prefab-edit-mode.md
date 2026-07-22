# Phase 47 — Isolated Prefab Edit Mode + Propagation

> Slice 5 of the prefab plan — the "editing the prefab updates all placed
> instances" promise. Unity prefab-mode style: open a snapshot prefab alone,
> edit with the normal tools, Save → every open-scene instance re-expands.
> Generator prefabs have no edit mode (their params are the interface).

## Staging: a temp zone in the live WorldState

`src/prefab/PrefabEditSession.ts`. A second WorldState would require re-plumbing
every subsystem (selection, gizmos, tools, panels all hold the one instance);
instead a temporary `ZoneDef "__prefab_edit__"` joins the live state and the
active-zone machinery does the rest.

- **enter(prefab)**: remember `activeZoneId` + `editorCamera.getPose()` → build
  the staging zone from `expandPrefab(prefab, {})` at origin, **entity id =
  memberKey** (recapture reads ids back as keys; surviving members keep their
  keys across an edit) → unjournaled `world.addZone` → `zones.unloadZone(prev)`
  → `loadZone(staging)` → `setActiveZone` → `history.clear()` → frame camera.
- **saveAndExit()**: recapture template from the staging zone's PREFABABLE
  arrays (memberKey = entity id; entities added during the edit contribute
  fresh keys), `version + 1`, teardown, return the updated def. The App then
  persists it (`applyPrefabs`) and **propagates**: one undoable transaction
  running `reexpandInstance` on every open-scene instance — kept members retain
  entity ids, so undo of the propagation is a single clean step.
- **cancel()**: teardown only.
- Teardown: unload staging → `WorldState.removeZone` (new, unjournaled like
  addZone) → reload prev zone → `history.clear()` → `setPose` restore.
- Idempotent enter (StrictMode); session held in an App ref.

## Contamination guards (the highest-severity risk)

While `editingPrefabRef.current`:

- `writeAutosave` early-returns — covers the 60s tick AND beforeunload.
- `handleSave`, `handlePreviewEnter`/`handleNewGame`/`handleContinue`,
  `handleProjectSceneSwitch`, `closeProject` all early-return.
- Belt-and-braces: `WorldState.toJSON()` filters the `__prefab_edit__` zone —
  even a path that slipped the gates cannot serialize staging state.

Verified live: `window.dispatchEvent(new Event('beforeunload'))` mid-edit left
`worldeditor_autosave` byte-identical, and `toJSON().zones` = `["demo"]`.

## UI

- Prefabs panel: amber **Edit** button on snapshot rows.
- `src/ui/PrefabEditBar.tsx`: fixed top-center amber bar — "⬡ Editing Prefab ·
  <name> — saving updates every placed instance · [Save] [Cancel]".

## Verification (2026-07-21, Chrome MCP, real UI)

- Captured a 2-cube snapshot prefab, placed a 2nd instance.
- Edit → world disappeared; only the 2 members at origin on the empty grid;
  amber bar shown; autosave gate + toJSON filter verified (above).
- Moved a member (+2y) → Save → def v2; BOTH instances re-expanded with the
  member at origin+offset; records at v2; back in the demo zone, staging gone.
- ONE Cmd+Z reverted the entire propagation (both members + record versions);
  redo re-applied. (The def stays v2 — the library is un-journaled by design;
  the load-time staleness sweep re-applies it coherently on the next load.)
- Cancel: entered again, moved a member, Cancel → template + world untouched.
- Cleanup verified; autosave restored byte-identical; typecheck clean.

## Flagged tradeoffs / later increments

- World undo history clears on enter AND exit (Unity-like). Scoped stacks later.
- No beforeunload "unsaved prefab edits" confirm yet.
- Other project scenes sync via the existing load-time staleness sweep
  (phase 45) — no silent multi-file writes on Save, by design.
