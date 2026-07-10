# Phase 31 — Moving Geometry / Animated World Objects — Acceptance Record

Tested 2026-07-10 against the running dev server (`localhost:7373`), Chrome
extension automation, hidden-tab manual stepping per TESTING.md §3. World:
the user's working autosave (demo zone: floor + phase-29 switchback stair).

**Demo content was deliberately LEFT in the working world** (user request) so
the feature can be tried by hand: `plat_mover_lift` (slide y, loop, dwell),
`plat_mover_ferry` (slide x, loop), `shape_mover_spin` (spin y, 60°/s),
`shape_mover_door` (slide x, once, autoStart off) + `tv_mover_door` trigger
volume whose `on_player_enter` script runs `toggle_mover` on the door.

## Gotcha hit (recorded for future sessions)

`await import('/src/physics/PhysicsWorld.ts')` from the console returned a
**dead duplicate module** (`initialized: false`) — the un-versioned-import HMR
trap TESTING.md documents for the runtime shell bit the *editor* tab this
time. Fix: import the HMR-stamped URL found via
`performance.getEntriesByType('resource')` (`...PhysicsWorld.ts?t=<stamp>`).
Symptom of the dead instance: meshes animate but `body.translation()` never
moves (the real world's `step()` never ran).

## Checks

| # | Check | Result |
|---|---|---|
| 1 | `npm run typecheck` / `npm run build` | ✅ 0 errors, clean build |
| 2 | Registration: 4 movers registered on add, kinematic bodies present, door `running:false` (autoStart off), system inactive in editor | ✅ |
| 3 | Slide loop: lift mesh eases 0.3 → 3.3 (distance 3) over 3s, dwells, returns; ferry slides 5m eased | ✅ |
| 4 | Body↔mesh sync: `body.translation()` tracks the mesh every sample (lift offset exactly thickness/2 = mesh-center vs body-base); spin body quaternion == mesh quaternion | ✅ |
| 5 | Spin: quaternion advances at 60°/s (sin(θ/2) matches at t=1,2,3) | ✅ |
| 6 | Door `once`+toggle via `__test.runAction({type:"toggle_mover"})`: opens exactly +2.2 (x 2→4.2), stops (progress 1); second toggle returns to 2 and stops | ✅ |
| 7 | Door via **trigger-volume script** through the real index: `enterGame()` + `fire("on_player_enter","tv_mover_door")` → running, opens to 4.2 | ✅ |
| 8 | `preview:stop` reset: all meshes+bodies at exact rest pose, timers/progress/angle zeroed, `running` re-seeded from autoStart | ✅ |
| 9 | Carry (horizontal): player teleported onto ferry stays aboard through a full cycle **including direction reversal** (playerX tracks ferryX, const ~0.1m offset), playerY stable | ✅ |
| 10 | Carry (vertical): player rides lift up **and down** grounded the whole way (foot ~0.02–0.05 above slab; no micro-falls on descent) | ✅ |
| 11 | Rebuild survival: `updatePlatform` moves ferry → mover re-registers at new origin, animates after rebuild, body count stable **52 → 52** (no leak) | ✅ |
| 12 | Real-UI pass: click lift in canvas (projected coords) → Geometry screen → MOTION section renders all controls → DISTANCE edited via real input+focusout events → `mover.distance: 4` persisted with the full object intact | ✅ |
| 13 | Persistence: `toJSON()` round-trips `mover` on platforms + shapes; after a **real page reload** the autosave contains user content + all demo movers, and all 4 re-register on cold zone load | ✅ |
| 14 | Runtime shell: `runtime.html?manifest=/demo/manifest.json` boots with MoverSystem wired (`__movers` present, 0 entries — demo scenes have no movers), no console errors | ✅ |
| 15 | Console: no new errors (only the pre-existing Toolbar style warning + the documented pointer-lock automation artifact) | ✅ |
| 16 | Perf: `MoverSystem.update` allocates nothing per frame (module scratch objects); 240-frame manual-step loops ran instantly with 4 movers | ✅ (counter eyeball deferred — hidden tab) |

## v4.25.1 addendum — push-out + performance pass (2026-07-10)

User report after playing: the spinning wall passed through a stationary player
(kinematic-kinematic pairs have no solver contacts; the KCC only resolves the
player's own movement). Fixed with contact-manifold depenetration + a perf pass.

| # | Check | Result |
|---|---|---|
| A1 | Spinning wall push: player teleported to r=1.2 inside the sweep gets shoved around and out past r=2.32; trajectory never crosses the wall (max transient center-dip 0.02m on isolated frames) | ✅ |
| A2 | Door closes on a player standing in the doorway: end face bulldozes them from x=2 to x=0.49 — flush against the panel edge (0.8 − capsule 0.3), `playerInsideDoorAtEnd: false` | ✅ |
| A3 | Lift-riding regression with contacts active: foot-vs-slab offset −0.001…+0.045m over a full cycle, grounded throughout — no carry/push fight | ✅ |
| A4 | `anyRunning()` gate: false in editor mode and after `stop_mover` on all four demo movers (controller skips raycast + contact scan entirely) | ✅ |
| A5 | `carryDelta`/`isMoverBody` via `_byHandle` Map (O(1)); idle movers skipped in `update()`; `delta` zeroed on every running→stopped path | ✅ (code-verified + A3/A4) |
| A6 | Zero per-frame allocations: persistent contact callbacks, reused `{x,y,z}` setter objects | ✅ (code-verified) |
| A7 | `preview:stop` reset + `running` re-seed still correct after stops/toggles; autosave byte-identical after the whole session (no world mutations) | ✅ |
| A8 | Console clean (no mover/rapier errors) | ✅ |

## Not covered / deferred

- FPS-counter eyeball with many concurrent movers (hidden tab — no rAF); code
  path is allocation-free and O(movers).
- Rotation carry on spinning platforms (out of scope by decision).
- Movers on polygon/CSG platforms (excluded by design — panel hides MOTION for
  polygon platforms; CSG-cut platforms build static and skip registration).
- A runtime-shell scene *containing* movers (demo manifest scenes have none);
  the registration/update code paths are identical to the editor shell.
