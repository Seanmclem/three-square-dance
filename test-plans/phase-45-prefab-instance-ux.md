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

## Addendum (2026-08-27, v4.79.25) — membership line, pruning, delete-review dialog

1. **Membership header line**: select any single member of a placed instance →
   under the name, `⬡ {prefab name} ✎` (snapshot; clicking enters prefab edit),
   `ƒ {name}` (generator), or `⚠ … definition missing` (orphan). Verified via a
   scratch prefab: header link read "Prefab 9 ✎".
2. **Last-member pruning**: delete all of an instance's pieces (any path — Delete
   key multi-select, single delete, script-detach prompt) → the prefabInstances
   record goes with the last piece, in the same transaction. One ↩ undo restores
   pieces AND record together (verified: 0/0 after delete, 2 members + 1 record
   after one undo click).
3. **Delete-review dialog**: the library × is never disabled. Count > 0 → dialog
   lists instances (zone · origin · pieces) with Go to (selects members, camera
   glides) and per-row Delete (one undo step each; rows refresh in place, incl.
   on undo while open). Ghost records show amber "empty record (leftover)",
   Delete only. "Delete prefab" unlocks at 0 rows. Verified end-to-end with the
   scratch prefab and read-only against the real Spike Step 2 (1 live + 1 ghost).

### v4.79.26 — legacy ghosts swept on load

Records with zero members (created before v4.79.25) are removed by the
scene-load sweep (syncPrefabInstances) with a console info line. Verified:
reloading dropped Spike Step 2 from 2 records to 1 — the badge now matches
reality without touching the modal.

### v4.79.27 — "⛶ all N" select-whole-instance

Shift-click a single piece of a multi-piece instance → the header's prefab
line shows "⛶ all N" → clicking selects every member (whole-instance multi
view, one gizmo). Hidden for 1-member instances and in the multi view (already
whole). Verified on the chest instance: 1 piece → "⛶ all 4" → "4 selected".

### v4.79.28 — header ⋯ menu + confirmations

1. Single-piece selection → header shows ⋯ after the prefab name (and ⛶ when
   multi-piece); it lists Reset from prefab / Unlink / Delete instance
   (Reset hidden for orphans). Click-outside closes.
2. Every route to those three actions — the ⋯ menu AND the Prefab section's
   buttons — opens a confirm dialog first (action-specific copy, notes
   undoability). Cancel is a no-op.
3. Verified: cancel path on a real chest instance left it intact; confirm path
   on a scratch prefab deleted member + record, prefab then deletable.
