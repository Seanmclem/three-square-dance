# Gameplay State

Authoritative reference for the runtime gameplay-state system: the `GameState`
store, its scripting primitives, and persistence. Source of truth over any older
`flags` / `GameStateManager` / `GameSave` descriptions in
`WORLD_EDITOR_ARCHITECTURE.md`, which predate this system.

- Store:      `src/scripting/GameState.ts`
- Scripting:  `src/scripting/ScriptEngine.ts`, authored in `src/ui/ScriptPanel.tsx`
- Lifecycle + save: `src/App.tsx`
- Types:      `src/types.ts`

---

## 1. Two tiers — don't conflate them

1. **Runtime session state** — the `GameState` store. Lives only during play,
   persisted to the *game save*. Health, score, lives, checkpoints, inventory
   counts, mission booleans — anything the player accumulates.
2. **Authored definitions** — scene-file data (max health, starting inventory,
   mission definitions). Authored in the editor, saved in the scene JSON, **not**
   runtime state. A `CharacterDef.maxHealth` is an authored default that *seeds*
   `gameState.set("health", maxHealth)` at spawn — it is not itself the live value.

This doc is about tier 1.

---

## 2. The store

One flat map of string key → JSON value. Any key is usable ad-hoc; registration
is optional (see §3).

```ts
export type JsonValue =
  | number | boolean | string | null
  | JsonValue[]                    // arrays
  | { [key: string]: JsonValue };  // objects ("records")
```

### API (`gameState` singleton)

| Method | Behavior |
|---|---|
| `get(key)` | value or `undefined` |
| `has(key)` | key present? |
| `set(key, value)` | store a value; clamps if registered numeric; **no-op if unchanged** |
| `adjust(key, delta)` | numeric add; missing → registered default or `0`; runs through `set` (so it clamps) |
| `delete(key)` | remove key (emits `state:changed` with `null`) |
| `reset()` | clear all, then re-seed registered defaults (New Game) |
| `snapshot()` | plain object for save |
| `restore(obj)` | replace all values from a plain object (Continue) |
| `register(key, schema)` | optional schema — default + numeric clamp (§3) |
| `attach(bus)` | wire the EventBus once at app init so mutations emit `state:changed` |

```ts
gameState.set("score", 0);
gameState.adjust("score", 25);                     // 25
gameState.set("checkpoint", { x: 1, y: 0, z: 3 }); // structured record — no schema needed
gameState.get("score");                            // 25
gameState.has("checkpoint");                       // true
```

### Values can be objects — but they're opaque

A value may be a nested object or array, stored whole under one key. The store
does **not** know its shape: no per-field schema, no validation. You get/set the
whole thing. Equality (for the no-op guard) and save both use JSON serialization,
so objects round-trip correctly.

Consequence: the numeric script condition can't reach inside an object.
`compare_number` reads `Number(get(key))`, and `Number({x:1})` is `NaN`, so you
**cannot** author "checkpoint.x >= 5". To *gate* a script on a coordinate, store
it as its own scalar key (`set("checkpoint_x", 1)`).

But a Vec3-shaped record **is** first-class for the checkpoint flow: `save_checkpoint`
writes the live player position into a key, and `teleport_player`'s "from state key"
mode reads it back (§5). So `{x,y,z}` records are usable for save/warp without
`run_script` — just not for numeric comparisons.

---

## 3. Schema (`register`) — what it actually does

```ts
export interface StateSchema {
  type:     'number' | 'boolean' | 'string' | 'object';
  default?: JsonValue;
  min?:     number;   // clamp floor (numeric keys)
  max?:     number;   // clamp ceiling
}

gameState.register("health", { type: "number", default: 100, min: 0, max: 100 });
```

Schemas are **authored per level** in the scene file (`WorldConfig.stateSchema`)
and applied on `preview:start` via `gameState.configureSchema()`, falling back to
`DEFAULT_STATE_SCHEMA` (`{ health: … }`) for scenes that don't define any. New
levels seed `DEFAULT_STATE_SCHEMA`. There is no schema-editing UI yet — author it
by editing the scene JSON.

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
as documentation + a hook for future validation, not a guarantee. *(Follow-up:
optionally validate/coerce on `set`.)*

### Clamping changes your comparison operator

If a key is floor-clamped at `min: 0`, it can **never** be negative, so a `< 0`
check never fires — you must test `<= 0`. The clamp and the operator have to agree:

| Schema | `set("health", currentMinus7)` from 3 | Correct death test |
|---|---|---|
| `min: 0` | `0` (clamped, no crash/throw) | `<= 0` |
| no `min` | `-4` | `< 0` or `<= 0` |

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

**Actions:**
- `set_state` — `set(stateKey, stateValue)`
- `adjust_number` — `adjust(stateKey, numberDelta)`
- `delete_state` — `delete(stateKey)`
- `save_checkpoint` — stamps the live player position `{x,y,z}` into `stateKey` (emits `character:save-position` → `CharacterController` writes it)
- `teleport_player` — moves the player; destination is literal `position` **or** a stored Vec3 via `positionKey` (malformed/missing key → warn + no-op)

`fire_event` fires `on_state_changed` (a manual signal). `run_script`'s sandbox
ctx exposes `{ get, set, has, adjust }` over the store.

**Checkpoint loop (records used first-class):**
```ts
{ trigger:{ type:"on_player_enter", targetId:"checkpoint_volume" },
  actions:[{ type:"save_checkpoint", stateKey:"checkpoint" }] }        // stamp live pos
{ trigger:{ type:"on_state_changed", targetId:"dead" },
  actions:[{ type:"teleport_player", positionKey:"checkpoint" }] }     // warp back to it
```

**Example — a death check (verified):**
```ts
{
  trigger:    { type: "on_state_changed", targetId: "health" },
  conditions: [{ type: "compare_number", stateKey: "health", compareOp: "<=", stateValue: 0 }],
  actions:    [{ type: "set_state", stateKey: "dead", stateValue: true }],
}
```

---

## 6. Persistence — the game save

Separate from the scene autosave (`worldeditor_autosave`). Key:
`worldeditor_gamesave` (`GAMESAVE_KEY` in `GameState.ts`).

```ts
const blob = {
  version: 1, ts: Date.now(),
  state:         gameState.snapshot(),
  firedOneShots: scriptEngine.getFiredOneShots(),  // so one-shots don't re-run
};
```

Lifecycle (`App.tsx`):
- **`preview:start`** → `if (!loadGame()) gameState.reset()` (continue-or-fresh),
  then a 30s autosave interval. `loadGame` runs *after* `scriptEngine.activate()`
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
  entity; any *global* consequence (score++, mission flag) routes through
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
- No schema-editing UI — `WorldConfig.stateSchema` is authored via scene JSON (§3).
- No New Game / Continue UI; game save omits player position/zone (§6).
- `teleport_player` doesn't author a facing (keeps current look direction).
