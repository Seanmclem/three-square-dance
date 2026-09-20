# Phase 72: Enemy feel, plus two combat fixes found on the way

> User asks (2026-09-19): "enemies to feel more alive too, such as a squash when
> stomped or a lean while chasing ... yah let's do it. also when the crabs are in
> front of me, biting, they often are missing me and not hurting me. also the
> death script does not reset the health on-respawn".

## 1. Enemy feel (presentation only)

Same rule as the player's Phase 70 squash and lean: the collider, the brain and
the bite/stomp tests never see any of it. All in `EnemyAI.ts`.

- **Squash when stomped.** A damped spring on the enemy mesh's Y scale (volume
  preserving, anchored at the feet). It is kicked when the player LANDS on the
  enemy: within 0.95m in XZ, above its top, close above it, and falling. It is
  physical, not scripted, so any enemy the player drops onto squashes, stomp
  script or not. One kick per landing.
- **Lean while chasing.** About 10 degrees of forward tilt while the enemy is
  actually moving, eased in and out, about the enemy's own right axis.
- The stomp script's Death pose freezes the AI on the very frame of the stomp,
  so the spring keeps running in that frozen branch too.
- Authored mesh scales are captured per enemy and put back on `preview:stop`
  (leaving preview does not rebuild the zone, and the mover reset only restores
  position and rotation).

## 2. Bites "missing" (root cause: the knockback, not the bite)

Measured with a motionless player: the first bite lands, then the player ends
up STANDING ON THE CRAB (feet at its top, 0.42m from its centre) and the next 13
real bites all whiff, because a bite cannot reach a player on top of the enemy
(`overTop`, by design). What put the player there is the stock crab's own
"Bite juice" script: `launch_player` 180 degrees relative to **player**, which
the engine measures from the CAMERA's look yaw. Looking at the crab, that is
away from it. Looking anywhere else (the normal case when being chased), it is
toward the crab, and the hop lands the player on its back.

Fix: a new launch frame **`away`** ("Away" in the script panel): straight away
from the owning entity, using its LIVE position (an AI enemy walks, and
WorldState only knows where it was authored), whatever the player or camera is
facing. `launchDirDeg` is an offset from that line. New
`setLivePositionProvider` in ScriptEngine (wired to `ObjectPlacer.getLivePosition`
by both shells) and an `awayFrom` field on `character:launch`.

Not changed, but worth knowing: with `variation: 0.6` the brain makes about 18% of
bites deliberate FEINTS (full animation, no damage). They read as misses too.
Set the enemy's variation to 0 to turn them off.

## 3. "Restore health" did nothing

`respawn_player`'s restore was `gameState.resetKey("health")`: a hardcoded key.
platfrom-obby's health is `Hearts`, so the checkbox silently did nothing (on the
death script AND on the Kill Floor prefab). Fix: `ScriptEngine._healthKey`
resolves, in order, the action's new optional `healthKey`; a registered
`health`; the key the owning script's global state trigger watches (a death
script fires on `Hearts == 0`); the key this scene's enemies damage
(`ai.damageKey`, which covers a kill floor). If nothing resolves it warns in the
console. The script panel shows a "Health key (blank = auto)" field when the box
is ticked.

## Content NOT changed in this phase (the user was mid-edit on the crab prefab)

When this was built the user's window had level_1 open, unsaved, with the crab's
stomp volume selected and resized. Rewriting `level_1.json` or the crab prefab in
`game.json` on disk would have collided with that, so the one content change
the knockback fix needs was left to the user, in the editor:

> Select a crab, Scripts, open **Bite juice**, the `launch_player` action,
> RELATIVE TO: **Away**, ANGLE: **0**. Do it on the prefab so all crabs get it.

The health fix needs no content change.

## Verification (runtime page, deterministic stepping, 2026-09-19)

| Check | Result |
|---|---|
| Old knockback, camera looking away, player motionless, 30s | 13 real bites, 1 landed, 29.5s standing on the crab |
| `away` frame, same setup | 0.2s on the crab in one run, 0s in the next |
| `away`, clean timeline, no harness interference | bite at 1.49m, HIT, knocked to 2.06m with a hop, crab re-engages, HIT: 2 of 2 landed |
| Stomp squash | mesh Y scale down to 0.70 at 49 frames, rebound 1.06, settles to 1.000, width back to 1.000 |
| Chase lean | peaks at 9.7 degrees |
| Leave preview mid-squash (editor) | scale 0.83 at exit, restored to the authored [0.5, 0.5, 0.5] |
| Death script on the user's real level_1 (`Hearts` 1 to 0) | Hearts history 1, 0, 3 |
| `npm run typecheck` | clean |
