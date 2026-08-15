# Phase 60 — Per-entity state — acceptance run (2026-08-15)

Run in a Chrome tab on the dev shell's origin (TESTING.md §0), platfrom-obby
level, via the `__test` harness + real dispatch paths. All checks passed.

| # | Check | Method | Result |
|---|---|---|---|
| 1 | `npm run typecheck` | shell | ✅ 0 errors after each stage |
| 2 | Entity schema seeds on preview start | goblin `stateSchema {health: default 3, min 0, max 3}`; enterPreview | ✅ `__ent.test_goblin.health` = 3 |
| 3 | Scoped adjust + clamping | `adjust_number health targetId=goblin delta -10` | ✅ clamps to 0 (min), not −7 |
| 4 | **Instance independence** | second goblin, same schema | ✅ goblin2 stays 3 while goblin1 hits 0 |
| 5 | **"This entity" death handler** | object script `on_state_equals` entityId self, health == 0 → despawn self | ✅ fired on the transition; owning mesh hidden |
| 6 | Despawn persistence key | after the kill | ✅ `__despawned.test_goblin` = true (rides the save) |
| 7 | New Game reset | exitPreview → enterPreview | ✅ health re-seeded 3, despawn key cleared, mesh visible |
| 8 | **transfer_item conserves** | chest holds 2 keys; transfer 5 chest→player, twice | ✅ moves exactly 2; second transfer moves 0 (no dupes) |
| 9 | Eval-time condition scoping (dialogue path) | `checkConditions([...entityId])` + `entityId:"self"` with ownerId param | ✅ dead-goblin true / alive-goblin false / self-via-owner true |
| 10 | STATE tab hiding invariant | visible-keys filter | ✅ no `__ent.` keys in the live list |
| 11 | Panel STATE section | volume with schema, real panel selection, screenshot | ✅ rows render (boolean start-value select, number default/min/max), live-value hint text |

## Bug found & fixed during verification

**Editor preview listener-order hazard:** ZoneManager's `preview:start` handler
(registered before App's) ran `_applyStartHidden` BEFORE App reset (New Game)
or restored (Continue) gameState — so despawn-state would have been read from
the previous run's leftovers. Fixed by deferring the apply one microtask past
the listener chain. The runtime was ordering-safe all along (SceneRouter
restores before `preview.enter`).

## Known pre-existing artifact hit (not phase 60)

`__test.spawnObject` followed by `updateObject` duplicates the object's mesh
(one live/tracked, one orphan) — reproduced with a plain `position` update on
the pre-phase-60 build path; same family as the known collider same-tick
double-register. Real editor flows (place via UI, edit in panel) don't hit it.

## Not live-verified (code-reviewed only)

- Runtime Continue restoring a killed enemy's despawn across app relaunch
  (state rides `RuntimeSave.state` byte-for-byte; apply path shared with the
  verified editor pass).
- ScriptPanel scope selectors clicked by a human (rendered markup typechecked;
  same `StateScopePicker` in all five surfaces).
- Dialogue option UI end-to-end (owner threading verified at the
  `checkConditions(…, ownerId)` layer it uses).

Cleanup: all `test_*` entities removed (including a duplicate-id goblin the
artifact produced), `worldeditor_gamesave` restored, workspace autosave purged,
`git status public/` showed only the USER'S own parallel edits (committed as
content).
