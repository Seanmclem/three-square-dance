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
