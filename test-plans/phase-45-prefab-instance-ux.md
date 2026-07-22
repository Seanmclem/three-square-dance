# Test Plan — Phase 45: Prefab Instance UX (v4.39.0)

[x] = verified via Chrome MCP 2026-07-21 (real UI clicks; details in
`plans/phase-45-prefab-instance-ux.md`). [ ] = manual/human follow-up.

## PrefabSection

- [x] Select any tile of a placed Tiled Platform → root screen shows
      "ƒ Prefab · Tiled Platform" with WIDTH/DEPTH/TILE SET, INSTANCE ORIGIN
      (X/Y/Z/ROT°), Re-expand / Unlink / Delete instance.
- [x] Panel values come from the live record (width shows 5 after a redo that
      restored a 5-wide state).
- [ ] TILE SET grass→dirt swaps all tiles' assets in one undo step.
- [ ] Origin X +2 → whole platform shifts 2m, member ids unchanged.
- [ ] ROT° 90 → platform rotates around its origin, tiles re-oriented.
- [ ] Out-of-range width (e.g. 50) clamps to 32; garbage input reverts.

## Re-expansion semantics

- [x] Width 3→5: 9→15 members; unchanged tiles keep their entity ids
      (spot-checked the selected tile's id across the resize).
- [x] One Cmd+Z reverts the entire resize (variables AND members); redo works.
- [ ] Manually move one tile, then Re-expand → tile snaps back (prefab wins).
- [ ] Group membership on a kept tile survives a resize.

## Unlink / delete

- [x] Unlink → record removed, all stamps stripped, tiles remain as plain
      objects; selecting one shows NO Prefab section.
- [x] Cmd+Z after unlink restores the record + every stamp.
- [x] Delete instance → all members + record removed, panel deselects.
- [x] Paste/duplicate of a member produces an unlinked copy (stamp stripped in
      pasteClipboard — code-level; spot-check via Cmd+D on a tile: the copy
      shows no Prefab section).

## Staleness sweep

- [ ] Save a project scene with an instance; bump the prefab's `version` in
      game.json by hand; reload → instance re-expands on load and the scene is
      marked dirty (console shows no warnings). Missing prefabId → warn, tiles
      keep rendering.

## Regressions

- [x] `npm run typecheck` → 0 errors; no console errors during the flow.
- [ ] Non-prefab object selection unchanged (no Prefab section, gizmo normal).
- [x] Autosave snapshot-restore protocol left the user's autosave byte-identical.
