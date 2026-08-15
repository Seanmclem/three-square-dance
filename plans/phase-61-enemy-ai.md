# Phase 61 — Basic enemy AI (detect → chase/circle → attack)

> User request (2026-08-15, condensed): "Basic enemy AI — a simple state
> machine: detect player within a radius, face and follow them, attack when in
> range. Attack could be as simple as a bite/lunge animation triggering damage
> when close, with some movement variation (circling, feinting) rather than a
> straight beeline." Design settled in a grilling session (14 questions).
> Premise correction recorded there: no NPC/AI trigger types existed —
> `on_player_detected` etc. are BORN here, not tied into.

## Why

Enemies today are statues: hazards are authored from trigger volumes and
scripts, which can bite a player who walks in but can never pursue one.
Scripts fire on events and cannot do per-frame steering — chase/circle/attack
needs an engine system. Phase 60 gave enemies their own health and persistent
death; this phase makes them dangerous while alive.

## Design decisions (grilled)

1. **Hybrid architecture** — a per-frame `EnemyAI` runtime system owns
   steering/facing/attack timing; authors configure it in the panel and hook
   effects via three NEW entity-owned triggers: `on_player_detected`,
   `on_player_lost`, `on_enemy_attack` (fires when a bite LANDS, at the
   damage moment). All stamp the owner like `on_interact` does, so
   "★ this object" works inside them.
2. **Objects only**, enabled + tuned in a new **AI screen** on the object
   panel. Blessed fields: ENABLE · DETECT RADIUS 6 · GIVE-UP (default 1.5×
   detect) · ATTACK RANGE 1.2 · MOVE SPEED 2.5 · ATTACK DAMAGE 1 ·
   DAMAGE KEY `health` · ATTACK COOLDOWN 1.5 s · DAMAGE MOMENT 0.4 s ·
   MOVEMENT VARIATION 0–1 (0.5) · LEASH RADIUS 12 · IDLE/WALK/ATTACK clip
   pickers (name-match defaults).
3. **Movement**: kinematic chase — ground-snap downward ray + a forward
   wall-probe ray that stops (not steers) at obstacles. No pathfinding, no
   gap-jumping: enemies patrol their own platform. **Detection is horizontal
   distance with a 3 m max vertical gap** so a platform enemy doesn't grind
   at a wall over a player two floors down.
4. **States**: idle → detected (trigger) → chase/circle → attack → cooldown;
   hysteresis (give-up radius) and a leash — beyond it, `on_player_lost`
   fires and the enemy walks home to its authored post.
5. **Attack**: play the attack clip; at DAMAGE MOMENT, if the player is still
   in range, the engine `adjust`s the global DAMAGE KEY by −DAMAGE (schema
   clamps apply; the obby uses `Hearts`) and fires `on_enemy_attack`.
   Flash/knockback/sound are AUTHORED via that hook (`flash_player`,
   `launch_player` exist) — the obby crab ships wired as the example.
6. **Variation slider**: orbit-biased approach that drifts over time
   (curve/strafe, not beelines), jittered attack timing, occasional
   damage-less feints. 0 = pure beeline. Per-enemy deterministic offsets so
   two goblins don't move in lockstep.
7. **Fences**: enemy death stays phase-60 authored (AI is dormant while its
   entity is despawned — the engine does NOT guess which key means health);
   player-attacks-enemy stays authored (stomp volumes). No player-carry when
   standing on a walking enemy.
8. **`spawn_npc` removed from the action dropdown** (a Phase-13 stub that
   only console-warned; old data stays a tolerated no-op, same policy as the
   npc conditions in Phase 60).

## Mechanics (scout-informed)

- **Kinematic host via a dormant mover entry.** `ZoneManager._buildObjectColliders`
  already builds a kinematic body + registers meshes/colliders with
  MoverSystem when `obj.mover?.enabled`; the condition widens to
  `|| obj.ai?.enabled`, registering AI-only enemies with a synthetic
  `autoStart:false` def (MoverSystem skips non-running entries, so nothing
  fights). That one reuse buys: solid-while-moving colliders, phase-53
  attached volumes riding the chase (the crab-stomp zone follows), rest-pose
  snap-back on preview:stop, and `hostFor` for free. MoverSystem gains a
  small `entryFor(id)` accessor (body + meshes) for the AI to drive, and
  `mover:set` ops ignore AI-synthetic entries.
- **Update order**: `enemyAI.update(dt)` registers AFTER `movers.update`
  and BEFORE `physicsWorld.step` in both shells (kinematic
  `setNextKinematicTranslation` must precede the step).
- **Player access**: PreviewController gains a public read accessor for the
  live controller body position (none existed; TriggerSystem holds only the
  collider).
- **Rays**: `physicsWorld.world.castRay` with `EXCLUDE_SENSORS` +
  exclude-own-rigid-body — down for ground height, forward at mid-height for
  the wall stop.
- **Animations**: a dedicated `ObjectPlacer` AI-clip path (loop for
  idle/walk, one-shot for attack) that bypasses the script-preview channel's
  GLOBAL single one-shot slot (two enemies attacking would cut each other's
  clips through `previewClip`).
- **ScriptEngine**: the three new triggers join the entity-owned lists in
  `_ownedScript` (owner stamping) and `_runActions` (ownerId threading), so
  hook actions/conditions scoped "★ this object" resolve to the enemy. A
  target-less zone/world script with these triggers lands in the wildcard
  bucket and fires for EVERY enemy — deliberate.
- **Dormancy**: entry skipped while `__despawned.<id>` is true (Phase 60
  key) or the mesh is gone. Internal state resets on preview start/stop.

## Out of scope

- Pathfinding / obstacle steering / gap-jumping (wall-probe stops only).
- Line-of-sight or vision-cone detection (radius only; natural later flags).
- Player combat system; enemy-vs-enemy anything.
- Runtime enemy spawning (spawn_npc stays a typed-but-hidden stub).
- Player riding on enemies (no carry).

## Files touched

`src/types.ts`, `src/preview/EnemyAI.ts` (new), `src/world/MoverSystem.ts`,
`src/world/ZoneManager.ts`, `src/preview/PreviewController.ts`,
`src/preview/ObjectPlacer.ts`, `src/scripting/ScriptEngine.ts`,
`src/App.tsx`, `src/runtime/RuntimeApp.tsx`, `src/ui/PropertiesPanel.tsx`,
`src/ui/ScriptPanel.tsx`.

## Acceptance

`test-plans/phase-61-enemy-ai.md`: detect/give-up hysteresis at the authored
radii (horizontal + 3 m vertical gap); chase with visible curving at
variation 0.5 vs beeline at 0; wall-probe stop; leash disengage + walk home +
`on_player_lost`; attack clip → damage at the damage moment on the authored
key (obby `Hearts`) → `on_enemy_attack` hook runs flash/knockback; cooldown;
two enemies attacking simultaneously without animation theft; stomp volume
riding the chasing crab; despawned enemy dormant; pose snap-back on preview
exit; pre-existing scripts and mover objects unaffected.
