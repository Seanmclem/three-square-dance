# Phase 45 — Prefab Variables, Re-expansion, Unlink, Instance Properties

> Slice 3 of the prefab plan (44 = core + generator; 46 = snapshot capture;
> 47 = isolated edit mode + propagation). This phase makes placed instances
> *live*: configurable variables, whole-instance moves, unlink, delete — all
> through the PropertiesPanel when any member is selected.

## Re-expansion (the heart of "linked instances")

`reexpandInstance(world, zoneId, prefab, instanceId)` in `src/prefab/expand.ts`:

1. `collectInstanceMembers` — scan the zone's PREFABABLE collections for
   `entity.prefab.instanceId === instanceId` → Map memberKey → {type, id}.
2. Expand the prefab at the record's current variables; materialize with the
   existing memberKey→id map, so **members present in both keep their entity
   id** — external script targets, group memberships, and the current selection
   all survive a resize.
3. Diff-apply in ONE transaction: both → remove + re-add under the same id
   (exact replace — a shallow `updateX` merge couldn't drop fields the new
   template lacks); new memberKeys → add; gone → remove; record `version`
   bumps to the prefab's.

Consequence (deliberate v1 semantic, stated in the panel): manual tweaks to an
individual member are reset by the next re-expansion — the prefab wins. Unlink
first for a one-off customized copy.

Also: `unlinkInstance` (strip stamps + remove record), `deleteInstance`
(members + record), and `pasteClipboard` now **strips `prefab` stamps** — a
pasted copy of a member is unlinked (a duplicate stamp would collide with the
original in the memberKey diff).

## PropertiesPanel — PrefabSection

Rendered on the root screen when the selection carries a `prefab` stamp (App
resolves `prefabInfo = {prefab, record}` from the stamp). Contents:

- **Variables** from the prefab's schema: number fields (draft state, commit on
  blur/Enter, min/max/step clamp), choice `<select>`, boolean checkbox. Commit →
  `updatePrefabInstance({variables})` + `reexpandInstance` in one transaction.
- **Instance origin** X/Y/Z/ROT° — the supported way to move a whole instance
  (edit → record update + re-expand with stable ids).
- **Re-expand / Unlink / Delete instance** buttons with explanatory tooltips.

After any re-expansion the App refreshes the selection from the live def
(`refreshSelectionAfterReexpand`) since the member def object was replaced —
or deselects if the member no longer exists (e.g. width shrank).

## Load-time staleness sweep

`handleLoadFromJSON`: after zones load, any `PrefabInstanceRecord` with
`version < prefab.version` re-expands and marks the scene dirty; a record whose
prefab is missing warns and keeps its expanded entities (they're real entities —
nothing breaks). This is the mechanism by which other scenes in a project catch
up after a prefab changes (the version-bumping edit flows land in phase 47).

## Files

- `src/prefab/expand.ts` — collectInstanceMembers/reexpandInstance/
  unlinkInstance/deleteInstance (+ memberKey on the materialized entries)
- `src/ui/PropertiesPanel.tsx` — PrefabSection + PrefabVarField + OriginNumField
- `src/App.tsx` — selPrefabInfo resolution, 5 handlers, staleness sweep,
  selection refresh
- `src/editor/copyPaste.ts` — stamp strip on paste

## Verification (done 2026-07-21, Chrome MCP, real UI clicks)

- Select a placed tile → "ƒ Prefab · Tiled Platform" section with width/depth/
  tileSet, origin fields, buttons.
- Width 3→5 typed in the panel → 9→15 members, grid recentered (x −31..−23 at
  2m pitch), selected tile kept id `obj_3cda053c`, record vars updated.
- ONE Cmd+Z reverted the entire resize (vars + members); redo restored.
- Unlink → 0 records / 0 stamps / 15 plain tiles; Cmd+Z restored record + all
  15 stamps (journaled `prefabInstance` ChangeKind).
- Delete instance → all members + record gone, panel deselected, only the
  user's 2 original objects remain.
- `npm run typecheck` clean; no console errors; autosave restored byte-identical.

## Deferred

- Trigger-volume members don't show the PrefabSection yet (TriggerVolumeView is
  a separate root render) — phase 46 alongside the door prefab.
- Gizmo-drag of a whole instance (origin fields are the v1 move path).
