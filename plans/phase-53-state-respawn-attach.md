# Phase 53 — on_state_equals, respawn_player, attachable trigger volumes

> User request (2026-07-31, condensed): "For things that move like a platform
> or an enemy, do we have a way to attach a trigger-box to it? Like if you go
> under one that is coming down on you it could crush you to death... or an
> enemy could see you if you walk in front of it but if the enemy moves so
> does the trigger." Follow-ups: a respawn/death action, and "instead of
> on_health_zero, it might be nice to have like on_state_equals
> any-specific-value kind of thing."

## Why

Three gameplay gaps, all adjacent to hazards:

1. **Trigger sensors can't ride moving geometry.** Attached *object* sensor
   colliders follow object movers (their colliders parent to the mover's
   kinematic body), but built-in platforms/shapes can't carry a sensor at all,
   and standalone Trigger Volumes are static world-space boxes. Crushers and
   moving sight-cones on platform-based hosts are impossible.
2. **Death is hand-assembled and half-broken.** Authors build kill floors from
   `store_position` + `teleport_player`; there's no fade-back, no fallback
   when no checkpoint was reached yet, and `fade_screen` has a live bug: the
   fade suppresses player input via `overlay:fade-in`, and `overlay:fade-out`
   (the declared un-suppress event) is emitted by *nothing* — one authored
   fade freezes the player for the rest of the session.
3. **Reacting to a state value needs two constructs** (`on_state_changed` +
   `compare_number` condition). A first-class `on_state_equals` trigger
   ("fires when key becomes value") makes the common case one construct. The
   existing `on_health_zero` is a dead stub — offered in the trigger dropdown,
   fired by nothing.

## What ships (3 independent commits)

### 1. `on_state_equals` trigger (+ wire `on_health_zero`)

- `TriggerType` += `on_state_equals`; `ScriptTrigger.stateValue?: JsonValue`.
  The state key rides `targetId` (same as `on_state_changed`).
- `ScriptEngine`'s single `state:changed` subscription (the payload already
  carries `value`, previously discarded) additionally:
  - runs the `on_state_equals:<key>` index bucket filtered by
    `trigger.stateValue` equality (GameState `_equal` semantics, mirrored
    locally). Transition-only for free: GameState emits only on real change.
  - fires `on_health_zero` when `key === "health" && value <= 0` — the stub
    comes alive; clamped-at-0 re-damage can't re-fire (set no-ops).
- Panel: trigger in the dropdown, state-key input (wb-state-keys datalist),
  "Equals value" input parsed with the existing `coerceStateValue`.
- Edges (documented): seeded defaults never emit → no fire on initial value;
  `delete_state` emits `value: null`.

### 2. `respawn_player` action + real fade-out (fixes the fade freeze)

- `FadeOverlay` gains `direction: "in" | "out"` — "in" holds at opaque until
  an explicit fade-out; both shells subscribe `overlay:fade-out` and clear on
  preview stop; `InputManager` un-suppresses on `preview:stop`.
- `fade_screen` schedules an engine-side `overlay:fade-out {duration: 0}` at
  fade end (today's exact visual, input no longer freezes, deactivate-safe).
- `SceneRouter.go()` emits a real fade-out on arrival (transitions become a
  proper fade-through-black).
- `GameState.resetKey(key)` (public; routes through `set()` so it clamps and
  emits; `reset()` stays silent — New Game must not fire state triggers).
- `respawn_player`: fade in → (timer in `_timers`) resolve destination
  **stored-pose `positionKey` → checkpoint `targetId` → `world.defaultSpawn`**
  → `character:teleport` → optional `restoreHealth` via `resetKey("health")`
  → fade out. One new ScriptAction field (`restoreHealth?: boolean`); reuses
  `positionKey`/`targetId`/`fadeColor`/`fadeDuration`.

### 3. Attachable trigger volumes

- `TriggerVolume.attachTo?: string` — a mover-enabled platform/shape/object in
  the same zone. **The def keeps world-space rest coords** (tool, resizer,
  gizmos, panel position fields unchanged); host-local conversion happens only
  at collider build.
- `MoverSystem`: `hostFor(id)` (body + rest pose lookup), `attachMeshes` /
  `detachMeshes` (volume wireframe + gradient fill ride via the entry's mesh
  list — `_applyPose` already handles off-origin meshes, `_resetAll` restores
  rest pose on preview stop).
- `PhysicsWorld.createSensorColliderOn(desc, body)`: sensor +
  `KINEMATIC_KINEMATIC | KINEMATIC_FIXED` active types — the load-bearing
  flag; a kinematic-parented sensor vs the kinematic player capsule produces
  no intersection pairs without it (the case Phase 31 declared out of scope).
- `ColliderBuilder.registerVolumeSensor(vol, host?)`: with a host, the world
  center/yaw converts to body-local (`inv(originQuat) × (C − origin)`).
- `ZoneManager`: host lookup in `_buildVolumeCollider` with **static-sensor
  fallback** (missing host, disabled mover, body-less hosts — CSG/polygon
  platforms, degenerate hulls); `_reattachVolumes(zoneId, hostId)` =
  remove+re-add of attached volumes, called synchronously from every host
  rebuild/add/remove site (host rebuilds free the kinematic body and
  `register()` wipes attached meshes); `isValid()` guard on collider removal
  (the host teardown may already have freed it).
- Id remap: copy/paste gains an entity-id pre-pass map; prefab expansion
  remaps `attachTo` through the member id map (external hosts pass through).
- Panel: "Attached to" select on the trigger-volume view — mover-enabled
  entities of the zone, in optgroups.
- Not doing: host-local storage, walls/floors/stairs hosts, cross-zone
  attach, editor-time sensor animation (movers only run in preview),
  TriggerSystem/tool/resizer changes.

## Deliverables beyond code

- `test-plans/phase-53-state-respawn-attach.md` acceptance checklist.
- `HAZARDS_GUIDE.md` — human guide with screenshots (`docs/images/`): kill
  floor, crusher, sight-cone, damage-based death via one central
  `on_state_equals health == 0 → respawn_player` script, checkpoints and the
  fallback chain. Cross-linked from GAMEPLAY_STATE.md.
- WORLD_EDITOR_ARCHITECTURE.md changelog + file-level sections per commit.
