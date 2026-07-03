# Phase 13 (foundation) — Generic Gameplay State Store — Test Plan

## Prerequisites
- `npm run typecheck` / `npm run build` pass with zero errors
- Scripting engine + trigger volumes from Phase 10.5+

> **Verified 2026-07-02 (Chrome, localhost:7373) via `window.__gameState` / `window.__test`.**
> All checks below passed against the live engine (real `fire()` / `_dispatch` / bus paths, not
> data shortcuts). The only console output was `WrongDocumentError: pointer lock` from entering
> game mode inside an automation tab (CharacterController requesting pointer lock) — unrelated to
> the state system. No errors from GameState / ScriptEngine.

---

## What changed

The boolean-only **flags** system and the string-set **inventory** (`GameStateManager`) were
replaced by one generic **`GameState`** store (`src/scripting/GameState.ts`): a `Map<string, JsonValue>`
holding any JSON-serializable value (health, score, lives, checkpoints, inventory counts, mission
booleans — anything). Keys can optionally be `register()`ed with a type + default + numeric clamp;
any key is settable ad-hoc.

Old script actions/conditions/triggers `set_flag`/`clear_flag`/`give_item`/`flag_set`/
`flag_not_set`/`player_has_item`/`on_flag_set`/`on_flag_cleared` were **removed** (clean slate) and
replaced with generic `set_state` / `adjust_number` / `delete_state` / `has_state` /
`compare_number` / `on_state_changed`. `fire_event` now fires `on_state_changed`; `run_script`'s
sandbox ctx now exposes `get/set/has/adjust`.

---

## 1. Store logic (registered schema + generic values) — ✅ verified

- [x] `register('health', {number, default:100, min:0, max:100})` seeds default → `get('health') === 100`
- [x] `set('health', 250)` clamps to max → `100`
- [x] `adjust('health', -140)` clamps to min → `0`
- [x] Ad-hoc unregistered numeric key: `set('score',0)` + `adjust('score',25)` → `25`
- [x] Structured record value: `set('checkpoint', {x,y,z})` round-trips
- [x] Boolean value: `set('door_open', true)` → `true`
- [x] No-op guard: `set(key, currentValue)` emits **no** `state:changed`; a real change emits exactly one
- [x] `snapshot()` / `restore()` round-trip preserves values

## 2. Scripting integration (live engine) — ✅ verified

- [x] `on_state_changed` trigger fires when a key mutates (via bus `state:changed` → `fire`)
- [x] `compare_number` condition gates correctly: `health <= 0` → false at 50, true at 0
- [x] `set_state` action sets a value through `_dispatch`
- [x] `adjust_number` action: `health -10` → 90
- [x] `delete_state` action removes a key (`has` → false)
- [ ] `has_state` condition (truthy gate) — logic mirrors `compare_number`; typecheck-passed, not separately fired
- [ ] Authoring UI (ScriptPanel): new trigger/condition/action rows render + persist — not driven in automation tab (data-level verified)

## 3. Persistence (game save) — ✅ verified

- [x] `preview:stop` (`exitPreview`) writes `localStorage['worldeditor_gamesave']` with `{state, firedOneShots}`
- [x] Save blob contains mutated values (health 42, score 7) + fired one-shot ids
- [x] Re-entering play restores saved state over defaults (health 42, not 100)
- [x] Fired one-shots restored → a one-shot script does **not** re-fire after restore
- [x] `__test.newGame()` clears the save + resets state + clears fired one-shots
- [ ] Full page-reload restore (vs re-enter) — behaves identically by construction; spot-check manually if desired

## 4. Regression / cleanup — ✅ verified

- [x] `grep` confirms zero remaining references to `gameStateManager`/`setFlag`/`give_item`/`flag_set`/etc.
- [x] `npm run typecheck` + `npm run build` clean

---

## 5. Authored state schemas (follow-up) — ✅ verified 2026-07-03

Schemas moved from the App.tsx hardcode into per-level authored data
(`WorldConfig.stateSchema`), registered on `preview:start` via
`gameState.configureSchema()` with `DEFAULT_STATE_SCHEMA` as fallback.

- [x] Hardcode removed → entering play still yields `health === 100` (now from `DEFAULT_STATE_SCHEMA`/scene, not code)
- [x] Scene-authored key seeds: set `world.stateSchema.score = {default:5}`, re-enter → `get("score") === 5`
- [x] New levels (`freshScene`) and every `toJSON()` carry `stateSchema` (no migration; absent → fallback)

## 6. store_position + teleport (position & facing) — ✅ verified 2026-07-03

`save_checkpoint` was generalized/renamed to **`store_position`** (source: player /
object / coords), and `teleport_player` gained facing control. Poses are
`{x,y,z,facing}` records.

- [x] `store_position` **player** → stores `{x,y,z,facing}`; facing captured from yaw (set yaw 45 → pose.facing ≈ 45)
- [x] `store_position` **coords** → `{x:1,y:2,z:3,facing:90}`
- [x] `store_position` **object** → object position + `rotation.y` (`{7,0.5,-2,facing:120}`)
- [x] `teleport_player` `positionKey` warps to the stored Vec3; malformed key → warn + no-op
- [x] teleport facing `key` (reads pose `.facing`) → yaw set to the stored facing (45°)
- [x] teleport facing `literal` 180 → yaw 180°; `keep` → yaw unchanged
- [x] `character:teleport.facing` is optional (undefined = keep current)

## 7. STATE tab schema editor — ✅ verified 2026-07-03 (real UI path)

- [x] Scripts panel shows a STATE tab; "+ Add key" adds `new_key` to `world.stateSchema`
- [x] Rename key (on blur / `focusout`) → key renamed in `world.stateSchema`
- [x] Edit default (e.g. `lives` default 3) persists; entering play seeds `get("lives") === 3`
- [x] Edits go through `handleStateSchemaChange` (transaction → undo; `setIsDirty`)
- [x] Cold reload has no `setStateSchema` error (an earlier one was transient HMR staleness)

---

## Notes / follow-ups
- `on_state_changed` fires on every real change; scripts narrow via conditions (fire broadly, gate precisely).
  Setting a key to its current value is a no-op, which prevents the obvious feedback loop.
- No New Game / Continue **UI** yet — exposed via `__test.newGame()` for now. A SaveLoadPanel game-mode
  row (New Game / Continue / Clear) is the natural follow-up (was the doc's Phase 9 `GameSave`).
- Game save is intentionally lighter than the doc's `GameSave` — it omits player position/zone/facing.
- **Phase 13 reconciliation:** player health/score/etc. live in `gameState`; NPC/enemy per-entity health
  stays per-entity. `CharacterDef.maxHealth` should seed `gameState.set('health', maxHealth)` at spawn.
