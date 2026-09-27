# Phase 77 test plan: game-wide scripts

Plan: `plans/phase-77-game-scripts.md`. Changelog: WORLD_EDITOR_ARCHITECTURE.md v4.90.0.

## Where it is

Scripts panel, **LEVEL** tab, with a project open: a **GAME · every level / THIS SCENE**
toggle at the top. GAME scripts live in `game.json` and run in every level. Open any level
script and press **Move to game** in its footer (next to Disable / Delete) to promote it;
**Move to this scene** brings it back. A GAME script that names an entity of one scene
(a volume, an object, a checkpoint) shows a warning in its row.

`on_game_start` fires once per run. `on_level_load` ("when the level starts") fires every
time a level is entered.

## Checks run (all passed unless noted)

| # | Check | Result |
|---|---|---|
| 1 | Both game scripts indexed next to level_1's own | `on_state_equals:Hearts` and `on_game_start:*` buckets hold them |
| 2 | One-shot `on_game_start` game script | fired once (coins +7); still 7 after level_2 and level_3 |
| 3 | Game death handler in level_2 (which had no handler) | Hearts 1, 0, 3 |
| 4 | Same in level_3 | fired and respawned, hearts NOT restored: `Hearts` is not registered in level_3 (register it under GAME in the STATE tab) |
| 5 | Editor toggle, Move to game round-trip | id preserved, editor follows, GAME shows "(1)"; nothing written (api stubbed) |
| 6 | Portability check on real level_1 scripts | death / store-init portable; volume scripts flag their volume + targets; crab Bite juice (`self`) portable |
| 7 | `npm run typecheck` | clean |

## Do this to finish your game's setup

1. STATE tab, **GAME** scope: add `Hearts` (number, default 3, min 0, max 3). Delete the
   scene copies in level_1 and level_2 and the unused `health` in level_3.
2. LEVEL tab, level_1: open **death script**, press **Move to game**.
3. Fix level_2's kill floor respawn key (`checkpoint_0` should be `checkpoint`).

## Not covered

- The warning row was verified through the exported function, not by clicking a
  scene-bound script into GAME in the editor.
- Undo of a Move (game.json writes are immediate; the opposite move reverses it).
