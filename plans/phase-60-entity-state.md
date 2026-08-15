# Phase 60 — Per-entity state (entity health, chest open/closed, NPC memory)

> User request (2026-08-15, condensed): "Right now it feels like all state is
> global — player health, inventory, checkpoints. Other things need their own
> state too: an enemy should have its own health and inventory, separate from
> other enemies. Same for NPCs. Chests could have independent open/closed
> states without needing a global for each one. It could technically be a
> facade — only *seems* local but is still global — if that's a technical
> requirement." Design settled in a grilling session (12 questions, all
> answered); the decisions below are the user's.

## Why

Every stateful gameplay pattern beyond the player currently requires hand-rolled
global keys (`goblin_3_health`, `chest_cave_opened`) that scripts must spell
consistently, that break when an entity is duplicated or a prefab is stamped
twice, and that pollute the STATE tab. Entity-owned state makes "each goblin
tracks its own health" and "each chest knows whether it's open" first-class —
with prefab instances independent by construction.

A second, adjacent hole (user-promoted into scope): **despawn is not
persistent.** `despawn_object` lives only in live-scene sets, so a "killed"
enemy or an opened-and-emptied chest visually reappears on scene re-entry or
Continue. Entity state makes death *recordable*; despawn persistence makes it
*stick*.

## Design decisions (grilled)

1. **Facade, by choice** — entity keys are namespaced entries in the ONE
   GameState store (`__ent.<entityId>.<key>`; entity item counters
   `__ent.<entityId>.inv.<itemId>`). Saves/Continue, New-Game reset, min/max
   clamping, `state:changed` reactivity, and the `__`-prefix STATE-tab hiding
   all work unchanged. **Invariant: no UI ever shows a raw prefixed key.**
2. **Scope** — any script-owning entity: placed objects + trigger volumes
   (the only entities with per-entity scripts today; platforms/shapes join
   if/when they gain script ownership).
3. **Authoring** — a STATE mini-section on the entity's properties panel
   (key / type / default / min–max), stored as `stateSchema` on the entity
   def. Prefab templates carry it; every instance stamps its own copy;
   duplicates start at fresh defaults, never the source's live values.
4. **One scope selector everywhere** — "Global (default) / ★ this entity /
   pick entity…" added uniformly to state actions (`set_state`,
   `adjust_number`, `delete_state`, `give_item`, `take_item`), conditions
   (`has_state`, `compare_number`, `has_item`), and state triggers
   (`on_state_changed`, `on_state_equals`). Global stays the default →
   existing scripts untouched. Groups allowed in ACTIONS (fan out to
   members); conditions/triggers take single entities only (any/all
   semantics deliberately dodged).
5. **"This entity" rides the existing rails** — `ScriptEngine._ownedScript`
   already rewrites `action.targetId === "self"` at index time; the same pass
   now also resolves the new scope fields on actions, conditions, and
   triggers. For scoped state *triggers*, the index bucket key simply becomes
   the namespaced key — the firing path is byte-identical.
6. **Dialogues get the owner** — `show_dialogue`'s launching entity threads
   through DialogueRunner, so "Show if" conditions and option actions can use
   ★ this entity (NPC-local dialogue memory).
7. **Entity inventory = counters with ITEMS identity** — same registry
   (icons, names, stack sizes), no bag UI for non-players. New
   **`transfer_item`** action (item, count, from-scope, to-scope): atomic and
   conserving — moves `min(count, source balance, destination stack space)`;
   duplication impossible by construction. `give_item`/`take_item` remain as
   creation/destruction, scoped like everything else.
8. **Persistence** — entity state rides the save; reset on New Game only
   (respawn-revives-enemies is an authorable per-game choice, not
   engine-imposed).
9. **Despawn persistence** — `despawn_object`/`spawn_object` additionally
   write hidden `__despawned.<entityId>` booleans; zone load applies them the
   way `startHidden` is applied today, with **state-wins-when-present** over
   `startHidden`. Zero save-format change, and "is it despawned" becomes
   queryable state.
10. **`npc_alive`/`npc_dead` condition stubs removed from the dropdown**
    (confirmed no-ops today; scoped `compare_number` covers them). Evaluation
    stays tolerant of old data.

## Mechanics

- **`src/scripting/entityState.ts`** (new): `ENT_PREFIX`, `entKey(entityId,
  key)`, `despawnedKey(entityId)`, `entInvKey(entityId, itemId)`, plus
  `resolveScopedKey(...)` used by dispatch/eval.
- **Types** — entity defs (`WorldObject`, `TriggerVolume`) gain
  `stateSchema?: Record<string, StateSchema>`. `ScriptAction` state actions
  reuse `targetId` as the entity scope (absent = global; `"self"` = index-time
  rewrite — the existing convention). `ScriptCondition` and `ScriptTrigger`
  gain `entityId?: string` (`"self"` allowed). `transfer_item` adds
  `fromId?`/`toId?` (absent = player/global; `"self"` allowed on both).
- **Schema registration** — after every `configureSchema` (it clears the map:
  App.tsx preview start + SceneRouter.go), a new pass registers each active
  zone entity's `stateSchema` under namespaced keys → defaults seed, clamps
  apply, `gameState.reset()` (New Game) re-seeds entity defaults for free.
- **Despawn apply** — ZoneManager's start-hidden pass consults
  `__despawned.*` after applying `startHidden`; dispatch writes the key per
  resolved member id (groups fan out first, as today).
- **Eval-time resolution for conditions** — `checkScriptConditions` gains an
  optional `ownerId`; DialogueRunner and GameGuiOverlay pass what they have.
  (Index-time rewrite handles engine-owned scripts; eval-time handles
  dialogue/menu surfaces that never go through the index.)

## Out of scope

- Bag UI for non-player entities.
- HUD widgets bound to entity keys (GUI stays global-key only).
- Script ownership for platforms/shapes/stairs (pre-existing gap).
- Any-member/all-member group semantics in conditions.
- Atomic multi-item trades (compose multiple `transfer_item`s).

## Files touched

`src/types.ts`, `src/scripting/entityState.ts` (new),
`src/scripting/ScriptEngine.ts`, `src/scripting/GameState.ts` (if needed),
`src/scripting/DialogueRunner.ts`, `src/scripting/inventory.ts`,
`src/world/ZoneManager.ts`, `src/App.tsx`, `src/runtime/SceneRouter.ts`,
`src/ui/ScriptPanel.tsx`, `src/ui/PropertiesPanel.tsx`,
`src/ui/GameGuiOverlay.tsx` (condition ownerId pass-through).

## Acceptance

`test-plans/phase-60-entity-state.md`: schema seeding + clamping per entity;
two prefab-instance goblins tracking health independently; This-entity death
handler (`on_state_equals` health==0 → despawn self); despawn persisting
across scene re-entry AND Continue; New Game resetting everything;
`transfer_item` conserving under empty-source and full-stack edge cases;
NPC dialogue reading/writing its own state; STATE tab showing no `__ent.`
keys; pre-existing global-state scripts running unchanged.
