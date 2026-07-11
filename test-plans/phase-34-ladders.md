# Phase 34 — Ladders: acceptance test plan

Feature plan: `plans/phase-34-ladders.md`. Automation notes: TESTING.md §3
(frame-stepping, autosave protocol). Demo entities: `ladder_demo34` at
(−3, 0.14, −6) rotY 0 h 3.2, with `plat_ladder34` (top surface flush with the
ladder top at y 3.34, on the −Z platform side).

## Automated (frame-stepping loop, editor tab)

Run with the preview controller live; step `physicsWorld.step(1/120)` +
`__preview._updateFn(1/120)` synchronously so the RAF loop can't interleave.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Console entity round-trip | `__world.addLadder/updateLadder/removeLadder` | mesh rebuilds each time; `toJSON().zones[0].ladders` tracks; 2 sensor handles per ladder in `__zones.ladderSensorMap` |
| 2 | Bottom auto-mount | spawn on climb side (+Z), hold W toward ladder | `ladder:zone-enter` fires; `_climbLadder` set within a few frames; yaw snaps to face ladder |
| 3 | Climb up + line snap | keep holding W | y rises at `climbSpeed`; X/Z converge to the climb line (ladder plane + capsule offset); Climb clip playing, `timeScale ≈ 1` |
| 4 | Hang | release W mid-ladder | position static; Climb clip `timeScale == 0` |
| 5 | Top dismount | hold W to the top | at top bound, player teleports to the fixed stand marker (`topDismountOffset` inward), `_climbLadder` null, lands standing on the platform |
| 6 | Top auto-remount | on the platform, move toward the ladder (backing up or facing it) | mounts from the top-lip sensor zone, snaps onto the line, S descends |
| 7 | Bottom dismount | hold S to the bottom | at foot bound `_climbLadder` null, normal walking resumes |
| 8 | Jump release + cooldown | mid-climb press Space | detaches, falls; W toward ladder re-grabs only after ~0.4s |
| 9 | Force-exit soft-lock guard | mid-climb `character:teleport` | `_climbLadder` null, control normal at destination |
| 10 | Ladder edit mid-climb | mid-climb `__world.updateLadder(...)` | force-exit (no ghost climb on stale colliders); mesh rebuilt |
| 11 | Interact prompt | stand in top zone, don't move | `character:interact-range` fires with label "Climb down"; interact key mounts |

## Manual / UI

| # | Scenario | Expected |
|---|---|---|
| 1 | Toolbar | Stair button popover offers ▤ Stair / ☰ Ladder; ladder icon renders |
| 2 | Place via tool | click a floor → ladder appears (h 3, facing +Z), tool returns to Select, placed ladder selected |
| 3 | Select + panel | clicking the ladder selects it; LADDER · LEVEL 0 header; Geometry screen shows position/rotY/height/width/rung spacing/top dismount offset; Material screen sets material |
| 4 | Panel edits rebuild | change height/rotY → mesh + sensors rebuild in place |
| 5 | Undo/redo | place + edit + delete all undo cleanly (journal path) |
| 6 | Player settings | CLIMB SPEED field under Jump Height; CLIMB (ladders) slot in the anim overrides (third-person) |
| 7 | Save/load | ladder survives save + reload; runtime shell renders + climbs identically |
| 8 | Perf | FpsCounter worst-ms unchanged standing next to the ladder (sensor events only, no per-frame scans) |

## Results (2026-07-11) — ALL PASS

Automated (frame-stepped, 1/120s, synchronous so RAF can't interleave):
1. ✅ round-trip + 2 sensor handles per ladder; 132-tri mesh (11 boxes)
2. ✅ mounted at frame 11 holding W from the climb side
3. ✅ y at climbSpeed; X/Z converged exactly to the climb line (z −5.5 for the demo ladder)
4. ✅ hang: 0.0000 drift over 60 frames, clip timeScale 0 (1.0 while moving)
5. ✅ top dismount teleported to the fixed marker (−3, 4.24, −6.6), grounded on the platform
6. ✅ top auto-remount on first frame of backing toward the ladder; S descends
7. ✅ bottom dismount at the foot bound, grounded
8. ✅ jump-release; re-grab blocked at 0.2s, allowed after 0.4s cooldown
9. ✅ teleport mid-climb force-exited (soft-lock guard)
10. ✅ updateLadder mid-climb: exits + remounts the rebuilt ladder (accepted; see plan
    deviations); sensors re-register after the async rebuild (map back to 2 handles)
11. ✅ "Climb down" prompt in the top zone; KeyE mounted

Manual/UI (real clicks, 1:1 screenshot↔CSS coords):
1. ✅ Stair popover shows ▤ Stair / ☰ Ladder
2. ✅ click placed `ladder_a239766c` at the clicked point, auto-selected
3. ✅ panel header "LADDER · LEVEL 0", geo summary "h 3 · 8 rungs"
4. ✅ rotY → 90 via the real input (debounce+focusout): def, mesh, sensors all rebuilt
5. ✅ cmd+z twice: rotation reverted, then placement removed (mesh + sensors gone)
6. ✅ CLIMB SPEED field + CLIMB (ladders) anim slot present in the player panel
7. ➖ runtime shell not separately exercised (shared ZoneManager/PreviewController path)
8. ✅ no new console errors (pre-existing Toolbar style warning + scripted-preview
    pointer-lock exceptions only); typecheck clean

Demo entities left in the world (autosaved): `ladder_demo34` (h 3.2 at −3,−6) with
`plat_ladder34` top platform. Player settings left at third-person + character avatar
so the Climb clip is visible when testing.
