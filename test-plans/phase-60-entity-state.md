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

## Regression fix (2026-08-20, v4.79.5)

**`spawn_object` re-showed a trigger volume's yellow editor wireframe in
gameplay.** The wire is tagged `hideInGame` and hidden on gameplay
`preview:start`, but `_setEntityHidden(id, false)` (the `object:spawn` path)
force-set `visible = true` on it — so the platfrom-obby spike cube's
despawn/spawn hurt-volume cycle flashed a yellow box every interval. Fixed by
tracking `_hideInGameActive` in ZoneManager and gating only the wireframe show
on it (the gradient fill is runtime-visible by design and still shows; the
sensor toggle is untouched).

Verified in a Chrome tab on the dev shell (tab must be foregrounded — a hidden
tab pauses rAF, so timers/triggers don't run): wire `visible` sampled false
across 5 s of live spike cycles, hearts still drop standing in the spawned
volume, spikes-up screenshot shows no box, and `exitPreview` restores wire +
fill + arrow to visible in the editor.

## Addendum (2026-08-27, v4.79.33) — sibling targeting, scoped keys, searchable scope

1. Where object local state lives: the STATE section at the bottom of the
   object's Scripts drilldown (volumes show it inline). The Scripts row
   summary now shows "N state keys" so it's findable.
2. On a prefab member's script, "Whose state" lists the instance's OWN
   siblings (⬡-prefixed) — e.g. the spikes object can target its trigger.
   Other instances' members stay hidden. Same for inventory scopes,
   conditions, and the on_state_changed trigger.
3. Picking an entity scope switches the State-key suggestions to that
   entity's registered keys (verified: spring1 with a `bounces` key →
   suggestions exactly ["bounces"]).
4. Every "Whose state" is a type-to-filter combobox now (same widget as
   action targets) — typing filters the grouped list live.

### v4.79.34 — flip-aware key suggestion popup

All State-key fields (actions, conditions, triggers, UI bindings) use a
custom suggestion popup instead of the native datalist: click/focus opens
the list, typing filters, and near the bottom of the screen it opens ABOVE
the input (verified: bottom condition row → list upward). The Whose-state /
action-target comboboxes flip the same way.

### v4.79.35 — boolean Value picker with toggle

set_state on a key registered as boolean (entity or global schema) renders
the Value as a select: true / false / toggle (flip current). Toggle stores
the "__toggle__" sentinel; the engine flips the current value per resolved
key at run time. Non-boolean/unregistered keys keep the free-text field.
Verified on the spike script: picking spikes-up (a boolean on the sibling
trigger) switched Value to the picker.

### v4.79.37 — per-action conditions + unless

1. Each action row's "if" button adds a guard condition (same types/scoping
   as script conditions, AND-stacked, amber "ONLY IF" block). Guards are
   evaluated AFTER the action's delay; a failing guard silently skips just
   that action.
2. Every condition (script-level, action-level, dialogue, menus) gains an
   "unless" toggle that inverts it — "else" is a mirrored second action.
3. Prefab capture remaps condition entityIds at both levels (also fixes the
   pre-existing script-guard entityId gap).
4. Verified via the real dispatch path: blocked-when-false, ran-when-true,
   and both unless polarities.

### v4.79.38 — state_equals condition + readable dropdown labels

1. New condition "state equals value": passes when the key's current value
   equals the authored one — booleans and strings included (has_state is
   truthy-only; compare_number coerces to numbers). Objects deep-compare,
   matching the on_state_equals trigger. unless = not-equals.
2. Boolean-registered keys render a true/false picker for the Equals field
   (entity schema first, merged global schema for global scope).
3. The condition dropdown shows plain-language labels ("state is set / true",
   "state equals value", "number compare (< > =)").
4. Runtime verified via real dispatch: boolean and string equality both
   polarities + unless inversion.

### v4.79.39 — scope-exact key suggestions

An entity/group "Whose state" scope suggests EXACTLY that scope's registered
keys — an entity with none shows no suggestions (previously it leaked the
global list). Only the Global scope reads the global key list. Verified on
the spike script: cube scope → nothing; sibling volume scope → spikes-up.
