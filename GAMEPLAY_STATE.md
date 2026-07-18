# Gameplay State

Authoritative reference for the runtime gameplay-state system: the `GameState`
store, its scripting primitives, and persistence. Source of truth over any older
`flags` / `GameStateManager` / `GameSave` descriptions in
`WORLD_EDITOR_ARCHITECTURE.md`, which predate this system.

- Store: `src/scripting/GameState.ts`
- Scripting: `src/scripting/ScriptEngine.ts`, authored in `src/ui/ScriptPanel.tsx`
- Lifecycle + save: `src/App.tsx`
- Types: `src/types.ts`

---

## 1. Two tiers — don't conflate them

1. **Runtime session state** — the `GameState` store. Lives only during play,
   persisted to the _game save_. Health, score, lives, checkpoints, inventory
   counts, mission booleans — anything the player accumulates.
2. **Authored definitions** — scene-file data (max health, starting inventory,
   mission definitions). Authored in the editor, saved in the scene JSON, **not**
   runtime state. A `CharacterDef.maxHealth` is an authored default that _seeds_
   `gameState.set("health", maxHealth)` at spawn — it is not itself the live value.

This doc is about tier 1.

---

## 2. The store

One flat map of string key → JSON value. Any key is usable ad-hoc; registration
is optional (see §3).

```ts
export type JsonValue =
  | number
  | boolean
  | string
  | null
  | JsonValue[] // arrays
  | { [key: string]: JsonValue }; // objects ("records")
```

### API (`gameState` singleton)

| Method                  | Behavior                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `get(key)`              | value or `undefined`                                                                |
| `has(key)`              | key present?                                                                        |
| `set(key, value)`       | store a value; clamps if registered numeric; **no-op if unchanged**                 |
| `adjust(key, delta)`    | numeric add; missing → registered default or `0`; runs through `set` (so it clamps) |
| `delete(key)`           | remove key (emits `state:changed` with `null`)                                      |
| `reset()`               | clear all, then re-seed registered defaults (New Game)                              |
| `snapshot()`            | plain object for save                                                               |
| `restore(obj)`          | replace all values from a plain object (Continue)                                   |
| `register(key, schema)` | optional schema — default + numeric clamp (§3)                                      |
| `attach(bus)`           | wire the EventBus once at app init so mutations emit `state:changed`                |

```ts
gameState.set("score", 0);
gameState.adjust("score", 25); // 25
gameState.set("checkpoint", { x: 1, y: 0, z: 3 }); // structured record — no schema needed
gameState.get("score"); // 25
gameState.has("checkpoint"); // true
```

### Values can be objects — but they're opaque

A value may be a nested object or array, stored whole under one key. The store
does **not** know its shape: no per-field schema, no validation. You get/set the
whole thing. Equality (for the no-op guard) and save both use JSON serialization,
so objects round-trip correctly.

Consequence: the numeric script condition can't reach inside an object.
`compare_number` reads `Number(get(key))`, and `Number({x:1})` is `NaN`, so you
**cannot** author "checkpoint.x >= 5". To _gate_ a script on a coordinate, store
it as its own scalar key (`set("checkpoint_x", 1)`).

But a Vec3-shaped record **is** first-class for the checkpoint flow: `save_checkpoint`
writes the live player position into a key, and `teleport_player`'s "from state key"
mode reads it back (§5). So `{x,y,z}` records are usable for save/warp without
`run_script` — just not for numeric comparisons.

---

## 3. Schema (`register`) — what it actually does

```ts
export interface StateSchema {
  type: "number" | "boolean" | "string" | "object";
  default?: JsonValue;
  min?: number; // clamp floor (numeric keys)
  max?: number; // clamp ceiling
}

gameState.register("health", {
  type: "number",
  default: 100,
  min: 0,
  max: 100,
});
```

Schemas are **authored per level** in the scene file (`WorldConfig.stateSchema`)
and applied on `preview:start` via `gameState.configureSchema()`, falling back to
`DEFAULT_STATE_SCHEMA` (`{ health: … }`) for scenes that don't define any. New
levels seed `DEFAULT_STATE_SCHEMA`. Edit them visually in the **Scripts & Triggers
panel → STATE tab** (add/rename keys, set type + default + min/max); changes save
with the scene and apply on the next play.

Registration is **optional** and buys exactly two things:

1. **`default`** — seeded into the key on `register()` (if unset) and re-seeded on
   `reset()`. Unregistered keys have no default.
2. **`min` / `max`** — clamp numeric writes. Independent and optional: `max`
   without `min` clamps only the ceiling and lets the value go arbitrarily
   negative; `min` without `max` is the reverse; neither is fine too.

```ts
private _clamp(key, value) {
  const schema = this._schema.get(key);
  if (schema?.type === "number" && typeof value === "number") {
    let v = value;
    if (schema.min !== undefined) v = Math.max(schema.min, v);
    if (schema.max !== undefined) v = Math.min(schema.max, v);
    return v;
  }
  return value;
}
```

### Honest limits of `type`

`type` is currently a **declared-but-unenforced hint**. It is read in exactly one
place — the `_clamp` guard above — so only `type: "number"` has any effect, and
only to enable min/max. `"boolean" | "string" | "object"` do nothing at runtime.
There is **no type validation**: `set("health", "oops")` silently stores the
string (the `typeof value === "number"` guard just skips the clamp). Treat `type`
as documentation + a hook for future validation, not a guarantee. _(Follow-up:
optionally validate/coerce on `set`.)_

### Clamping changes your comparison operator

If a key is floor-clamped at `min: 0`, it can **never** be negative, so a `< 0`
check never fires — you must test `<= 0`. The clamp and the operator have to agree:

| Schema   | `set("health", currentMinus7)` from 3 | Correct death test |
| -------- | ------------------------------------- | ------------------ |
| `min: 0` | `0` (clamped, no crash/throw)         | `<= 0`             |
| no `min` | `-4`                                  | `< 0` or `<= 0`    |

Also note clamping **discards overkill**: a hit taking 3 → -50 reads as `0`; you
can't distinguish "barely died" from "obliterated". Fine for a health bar; if a
mechanic needs overkill, don't set `min` (or track raw damage separately).

---

## 4. Change events → `on_state_changed` trigger

Every `set`/`adjust`/`delete` that **actually changes the value** emits
`state:changed { key, value }`. Writing the current value is a no-op and emits
nothing — this kills scripting feedback loops. Object values are compared
structurally (`JSON.stringify`).

`ScriptEngine.activate()` subscribes and turns each change into a trigger:

```ts
sub("state:changed", ({ key }) => this.fire("on_state_changed", key));
```

This generalizes the old "flag set fires an event" behavior to **any** state
change, not just booleans. Scripts fire broadly on the key and narrow via
conditions.

---

## 5. Scripting primitives

Authored in the Script Panel (`ScriptPanel.tsx`), evaluated in `ScriptEngine`.
The old `set_flag`/`clear_flag`/`give_item` + `flag_set`/`flag_not_set`/
`player_has_item` + `on_flag_set`/`on_flag_cleared` were removed in favor of these.

**Trigger:** `on_state_changed` — `targetId` is the state key to watch.

**Conditions:**

- `has_state` — `stateKey` present and truthy (not `undefined`/`null`/`false`).
- `compare_number` — `Number(get(stateKey)) <op> Number(stateValue)`, `<op>` one of `>= <= > < == !=`.
- `has_item` — owned count of `itemId` ≥ `count` (default 1). Sugar over the `inv.*` convention below (Phase 32).

**Actions:**

- `set_state` — `set(stateKey, stateValue)`
- `adjust_number` — `adjust(stateKey, numberDelta)`
- `delete_state` — `delete(stateKey)`
- `give_item` / `take_item` — add/remove `count` of `itemId` at key `inv.<itemId>`; give clamps to the item's `stackSize`, take floors at 0 (Phase 32)
- `store_position` — stores a `{x,y,z,facing}` pose into `stateKey` (see §5a)
- `teleport_player` — moves the player to a position, optionally sets facing (see §5a)

**Reserved key prefixes:** `__` = engine-internal (e.g. `__runtime_pose`);
**`inv.`** = item counts (Phase 32) — the count for registry item `<id>`
(`WorldConfig.items`) lives at `inv.<id>`. They're ordinary store keys (saved,
`on_state_changed`-visible, STATE-tab-registrable for starting inventory /
clamps); the item layer only adds identity (label/icon/stackSize) and the bag
UI on top. Clamping for give/take is done inline in ScriptEngine from the
registry's `stackSize`, not via the schema.

**Schema scopes (projects, Phase 33+):** values are ALWAYS one global pool —
only the schema has scopes. With a project open, the STATE tab gains a
**GAME / THIS SCENE** toggle: GAME edits the shared `game.json` schema
(defaults + clamps for every scene, persisted on Save, outside the scene's
undo journal), THIS SCENE edits the scene's own `stateSchema` (which overrides
GAME entries for the same key while that scene is loaded). At play/scene entry
the two spread game-under-scene into one `configureSchema` call; the classic
`DEFAULT_STATE_SCHEMA` applies only when neither exists.

`fire_event` fires `on_state_changed` (a manual signal). `run_script`'s sandbox
ctx exposes `{ get, set, has, adjust }` over the store.

**Example — a death check (verified):**

```ts
{
  trigger:    { type: "on_state_changed", targetId: "health" },
  conditions: [{ type: "compare_number", stateKey: "health", compareOp: "<=", stateValue: 0 }],
  actions:    [{ type: "set_state", stateKey: "dead", stateValue: true }],
}
```

## 5a. Positions, checkpoints & teleport

A "position" value is a **pose** record — `{ x, y, z, facing? }`, `facing` in
degrees (optional). It's just a generic state value; a "checkpoint" is one use.

**`store_position`** writes a pose into a state key (`stateKey`). Source (`posSource`):

- `player` — the player's live position + look direction (yaw). Emits
  `character:save-position`; `CharacterController` writes the pose.
- `object` — a scene object's position + `rotation.y` (resolved from the active zone).
- `coords` — authored `position` `{x,y,z}` + optional literal `facing`.

**`teleport_player`** moves the player. Two independent inputs:

- **Position:** literal `position` `{x,y,z}`, **or** from a state key (`positionKey`)
  that holds a Vec3/pose. Malformed/missing → warn + no-op.
- **Facing** (`facingSource`): `keep` (leave current look direction — the default),
  `literal` (`facing` degrees), or `key` (`facingKey` → a number, **or** the
  `.facing` of a stored pose, so one key restores both position and facing).

The trigger is independent of the action — **any** trigger can drive a teleport
(volume enter, interact, timer, `on_state_changed`, game start…).

**Checkpoint loop (poses used first-class, incl. facing):**

```ts
// stamp the player's pose (position + facing) when they cross a volume
{ trigger:{ type:"on_player_enter", targetId:"checkpoint_volume" },
  actions:[{ type:"store_position", posSource:"player", stateKey:"checkpoint" }] }

// on death, warp back to the pose — position AND facing from the same key
{ trigger:{ type:"on_state_changed", targetId:"dead" },
  actions:[{ type:"teleport_player",
             positionKey:"checkpoint", facingSource:"key", facingKey:"checkpoint" }] }
```

To store a **fixed** marker instead of the live player, use `posSource:"coords"`
(or an `object` source). Facing can also be a plain number key (a generic
variable) rather than a pose.

---

## 6. Persistence — the game save

Separate from the scene autosave (`worldeditor_autosave`). Key:
`worldeditor_gamesave` (`GAMESAVE_KEY` in `GameState.ts`).

```ts
const blob = {
  version: 1,
  ts: Date.now(),
  state: gameState.snapshot(),
  firedOneShots: scriptEngine.getFiredOneShots(), // so one-shots don't re-run
};
```

Lifecycle (`App.tsx`):

- **`preview:start`** → `if (!loadGame()) gameState.reset()` (continue-or-fresh),
  then a 30s autosave interval. `loadGame` runs _after_ `scriptEngine.activate()`
  (which clears fired one-shots) so a restored save's progress survives.
- **`preview:stop`** → `saveGame()`, clear the interval.
- `loadGame()` = `gameState.restore(blob.state)` + `scriptEngine.restoreFiredOneShots(blob.firedOneShots)`.

Deliberately lighter than the doc's old `GameSave`: it omits player
position/zone/facing (add later if needed).

**No New Game / Continue UI yet** — exposed for now via `window.__test.newGame()`
(clears the save, resets state, clears fired one-shots). A SaveLoadPanel
game-mode row is the natural follow-up.

---

## 7. Phase 13 reconciliation

- **Player** health/score/lives/etc. live in `gameState`. `CharacterDef.maxHealth`
  seeds `gameState.set("health", maxHealth)` at spawn.
- **NPC/enemy** per-entity health stays per-entity (many instances, each own hp) —
  that's genuine instance state, not global. `on_health_zero` fires from the
  entity; any _global_ consequence (score++, mission flag) routes through
  `gameState` / `on_state_changed`.

---

## 8. Dev / test access

Behind `import.meta.env.DEV`:

- `window.__gameState` — the store.
- `window.__test.gameState`, `window.__test.newGame()`, plus `enterGame`,
  `fire`, `runAction` for driving the engine (see `src/dev/testHelpers.ts`).

Test plan: `test-plans/phase-13-gameplay-state.md`.

---

## Known gaps / follow-ups

- `type` is unenforced — no validation/coercion on `set` (§3).
- Object values aren't reachable by `compare_number` (§2) — store scalars for comparisons; records work for save/warp.
- No New Game / Continue UI; game save omits player position/zone (§6).

---

## Examples

Flow 1 — On level start, set checkpoint to an existing object's position

Author a script with:

- Trigger: on_game_start (target-less — fires once when game mode begins).
- Action: store_position
  - Store into state key: checkpoint
  - Source: "Source: object position" → the object target-picker appears; pick your existing object.
  - The engine resolves that object in the active zone and stores { x, y, z, facing }, where facing = the object's rotation.y in degrees (\_resolveObjectPose, ScriptEngine.ts:351-356).

Two things to note:

- on_game_start only fires in game mode (\_\_test.enterGame() / Start Game), not plain preview. If you also want it in preview, use on_level_load or on_game_start accordingly.
- "or not set": just omit this script. checkpoint stays undefined until Flow 2 fires. If you instead want "set it only if not already set" (e.g. so a loaded save's checkpoint isn't clobbered), gate it with a condition — but note has_state/compare_number can't read inside the pose object, so you'd track a separate scalar flag like checkpoint_set and condition on has_state: checkpoint_set being false. Simpler is usually to just let Flow 2 own it.

---

Flow 2 — Update checkpoint on a trigger, to an existing object's position

Same action, different trigger:

- Trigger: e.g. on_player_enter, targetId = your trigger volume's id (e.g. checkpoint_volume). Could equally be on_interact on an object, or on_timer.
- Action: store_position
  - Store into state key: checkpoint
  - Source: "Source: object position" → pick the object.

This overwrites checkpoint each time the trigger fires. Leave oneShot unchecked if you want it to keep updating (a moving checkpoint); check it if it should latch once.

▎ Contrast: Source: player position would stamp the live player pose (position + look yaw) instead of an object's transform — that's the classic "checkpoint where the player stood." You asked specifically for an existing object's position, hence "Source: object position."

---

Flow 3 — Separately, teleport the player there

Any trigger can drive this — it's fully decoupled from Flows 1–2. Common one is respawn-on-death, but it could be an interact, a volume, a timer, etc.

- Trigger: e.g. on_state_changed, targetId = dead (or whatever fires your respawn).
- Action: teleport_player
  - Destination: "Destination: from state key" → checkpoint. (Engine reads the stored Vec3/pose; malformed/missing → warn + no-op.)
  - Facing: "Facing: from state key" → checkpoint. Because the stored pose carries .facing, one key restores both position and facing (ScriptEngine.ts:249-254). Use "Facing: keep current" if you'd rather leave their look direction alone.

---

The full loop, end to end

1. Game start → store_position(object → checkpoint) seeds the ft (or omit → unset).
2. Player crosses a volume → store_position(object → checkpoint) moves it to the next object.
3. Death / respawn trigger → teleport_player(from key: checkpoint) warps them back, facing restored.

Two gotchas worth keeping in mind: script actions don't persistate the live scene/state only (verify via the mesh/**gameState,not **world.toJSON()); and checkpoint being an opaque object means you can only save/warp with it, never compare_number against checkpoint.x (store a scalar
key for that).

Want me to actually wire one of these into the current scene so be a real change — say the word and I'll set it up (e.g. anobject-sourced checkpoint on a volume + a teleport-on-death), otherwise this is just the reference you asked for.
