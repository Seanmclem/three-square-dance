# Phase 77: Game-wide scripts (LEVEL tab, GAME scope)

> User ask (2026-09-26): "level-scripts should have an 'on every level' option that
> adds them to the game defaults. duplicating the script onto subsequent levels
> created" is what they do today. Their death script (`on_state_equals Hearts 0`,
> respawn + restore health) lives in level_1 only, so levels 2 and 3 have no death
> handler. Same session, the related question "level scripts don't have an
> on-level-start trigger": they do, `on_level_load` ("when the level loads"); the
> tab's help text pointed at a trigger that does not exist (`on_zone_enter`).

## Model (the Phase 68 pattern, applied to scripts)

- `GameConfig.scripts?: ScriptDef[]` in `game.json`. Scripts here run in EVERY
  scene of the project, alongside the scene's own zone scripts.
- The LEVEL tab gets the same GAME / THIS SCENE scope toggle the STATE tab has
  (project open only). GAME lists and edits the game scripts; THIS SCENE is the
  existing per-level list, unchanged.
- **Move to game** / **Move to this scene**: an action on a script (in its editor)
  that transfers it between the two lists, id preserved, so the user's existing
  death script is promoted with one click instead of recreated.
- Game scripts are ordinary `ScriptDef`s: any trigger, any actions. Two things
  cannot resolve in another scene: a `targetId` that names an entity of the
  scene the script was written in (a volume, an object) and `★ this object`.
  The editor does not block them (the same is true of a copied script today);
  the engine simply finds no match in scenes without that id.
- One-shot bookkeeping is by script id and is already game-wide (the runtime
  carries `firedOneShots` across scenes), so a one-shot game script fires once
  per run, which is what a "first time the game starts" script wants. A per-scene
  one-shot belongs in THIS SCENE.

## Engine and persistence

- `ScriptEngine.loadGame(scripts)`: indexes them exactly like `loadWorld`. Called
  at all three index-rebuild sites (editor preview start, editor scene switch,
  runtime `SceneRouter`), after `clearIndex`, before `loadZone`. Cost: the same
  bucket map with a few more entries; nothing per frame changes.
- `WorldState.gameScripts` (non-serialized, like `gameItems`): set from
  `store.game.scripts` wherever the other game fields are set.
- Runtime: `RuntimeApp`/`SceneRouter` read `manifest.game` already; `scripts`
  ride along. Export: `assetRefs` walks game scripts for sounds/materials so a
  `play_sound` in a game script ships its clip.
- The id-uniqueness and `★ this object` resolution in `loadZone` apply unchanged.

## UI details

- Scope toggle on the LEVEL tab, identical styling to the STATE tab's.
- Game-scope list rows carry a small "GAME" badge; the THIS SCENE list is as today.
- Script editor footer: "Move to game" (scene scope) / "Move to this scene" (game
  scope), next to Disable / Delete. Undo: the move is two list writes; game.json
  writes are immediate (Phase 68 precedent), so the button confirms nothing but
  is reversible with the opposite move.
- Help text fixes: the LEVEL tab blurb names `on_level_load` (and no longer
  `on_zone_enter`); the trigger picker label becomes "when the level starts".

## Out of scope

- Per-scene overrides of a game script (disable one game script in one level).
  A `disabledGameScripts` list per scene would do it; not asked for.
- Game-scope dialogues, and moving trigger-volume / object scripts to game scope.

## Verification

1. Typecheck.
2. Runtime: with the death script moved to GAME, Hearts 1 to 0 in level_2 and
   level_3 respawns with 3 hearts (the levels that had no handler).
3. A one-shot `on_game_start` game script fires once per run, not per scene.
4. Editor: the toggle, the badge, Move to game / Move to this scene round-trip
   with the id preserved; `game.json` on disk gains/loses the script.
5. Index rebuild count is unchanged (three sites, one more call each).
