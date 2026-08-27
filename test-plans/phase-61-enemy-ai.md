# Phase 61 — Basic enemy AI — acceptance run (2026-08-15)

Run against the platfrom-obby crab (the wired living example) in a Chrome tab
on the dev shell's origin. Key technique: the extension tab freezes rAF while
backgrounded, so behavior was verified with **deterministic manual stepping**
(`window.__enemyAI.update(1/120)` in loops — the new `__enemyAI` dev global),
per TESTING.md §3's hidden-tab pattern. All checks passed.

| # | Check | Method | Result |
|---|---|---|---|
| 1 | `npm run typecheck` | shell | ✅ 0 errors each stage |
| 2 | AI def + hook script load from scene | boot; read `crab.ai` / scripts | ✅ damageKey Hearts, on_enemy_attack hook |
| 3 | Idle outside detect radius | player at 10m; frames run | ✅ crab stationary at post |
| 4 | Detect + chase with curvature | player at 4m; 2s stepped | ✅ 2.6m advance, x-drift from orbit bias (variation 0.6) |
| 5 | **Bite lands** | chase to 1.17m → attack | ✅ Hearts 3 → 2 at the damage moment; on_enemy_attack dispatched (flash/knock hook) |
| 6 | Clip cycling | rec.currentClip through the run | ✅ Walk while chasing, attack one-shot, Idle in-range/cooldown (auto-matched Idle/Walk/Bite_Front) |
| 7 | Give-up + leash + return | player teleported 17m away; 5s stepped | ✅ state → return → walked home (−34.8, −80.14 ≈ post) → idle; no phantom bites |
| 8 | **Stomp volume rides the chase** | `vol_50dfd99c` wireframe vs rec.pos mid-chase | ✅ 0.05m offset (attachTo on the aiDriven host) |
| 9 | Death dormancy | despawn crab, player adjacent, 2s stepped | ✅ stays idle at post, no damage |
| 10 | Pose reset on preview exit | exitPreview; mesh position | ✅ byte-exact authored pose (mover reset path) |

## Addendum (same day): `player_falling` — the goomba rule

User report: the crab is short — walking over it entered the stomp zone and
killed it for free. Added the `player_falling` condition (airborne +
descending, 120ms landing grace) and gated the crab-stomp script with it.

| # | Check | Method | Result |
|---|---|---|---|
| A1 | Condition false while grounded | `checkConditions([{type:"player_falling"}])` standing | ✅ false |
| A2 | Walk-up doesn't stomp | real KeyW walk into the crab | ✅ crab survives (body-blocks the player; bites instead) |
| A3 | **Falling stomp kills** | teleport 4m above; real free-fall through the riding stomp zone | ✅ crab despawned, no damage taken |
| A4 | Grace expires | condition re-checked long after landing | ✅ false |

Found live: the user's 0.13m-thin stomp zone flush with the crab's back
enters on the SAME frame as grounding (velY already clamped) — pure
"falling now" semantics never passed. Hence the 120ms landing grace,
recorded only for falls faster than 2.5 m/s (slope-walking micro-falls
can't sneak through).

## Bug found & fixed during verification

**Uncapped dt**: a backgrounded tab's first resumed frame handed the AI a
29-second delta (seen live on the perf counter) — raw, that teleports steering
and blows through attack windows in one frame. `EnemyAI.update` now clamps to
0.05s, matching `physicsWorld.step`'s own clamp.

## Verification notes / not live-verified

- Hidden-tab reads without stepping show the AI "frozen mid-chase" — that's
  rAF starvation, not a bug (bit this run twice before switching to manual
  stepping; recorded so the next session doesn't rediscover it).
- Knockback/flash verified as dispatch (Hearts write + hook firing), not
  visually; wall-probe stop and feints not isolated (curvature observed).
- Runtime shell parity: same system registered in RuntimeApp, not separately
  driven this run.

Cleanup: gamesave restored, workspace autosave purged, no world-data
mutations (AI is runtime-only); the scene diff is the authored crab wiring,
committed as content+example.

## Addendum (2026-08-27, v4.79.31) — enemy sounds

1. Enemy AI screen → SOUNDS: ON DETECT / WHILE WALKING / ON ATTACK, each a
   sound picker + VOL (empty = clip level, >1 boosts, cap 4). ▶ previews at
   the VOL. Empty slots silent.
2. Runtime: detect plays once on the idle/return→chase edge; attack plays per
   bite start; walk is a keyed loop that runs only while the enemy actually
   moves (0.3s stillness, a bite, death/despawn, or preview stop ends it).
   All three are positional and parented to the enemy mesh (follow the chase).
3. Headless-verified on the crab via __enemyAI.update() pumping: detect + attack
   one-shots fired at the right moments; entityId parenting = crab mesh with
   linear/1/20 falloff. Walk loop can't trigger headless (no physics step →
   ground ray misses → ledge rule refuses movement) — listen in real gameplay.
4. Prefab: ai config is part of the object def — snapshot capture carries the
   sounds; export ships the referenced clips (assetRefs).
