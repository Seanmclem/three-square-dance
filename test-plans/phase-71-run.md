# Phase 71 test plan: run

Plan: `plans/phase-71-run.md`. Numeric checks were run 2026-09-19 in the
standalone runtime page on `level_3` (the Jump Lab, which carries a scene
override of `runMultiplier: 1.4`), stepping the update loop by hand at dt 1/120
with synthetic key events (TESTING.md section 3).

## Turn it on first

- **Run ships OFF.** Select tool, click the spawn marker, **Movement**, set
  **RUN SPEED x** above 1 (try 1.4). 1 = no running.
- In platfrom-obby it is already on in **level_3 only** (a scene override), so
  level_1 and level_2 play exactly as before.
- Keyboard: hold **Shift** while moving. Gamepad and touch: push the move stick
  nearly all the way (85% or more).

## Automated checks (all passed)

| # | Check | Result |
|---|---|---|
| 1 | Walk speed, W only (run enabled) | 6.0 m/s, `walk` clip |
| 2 | W + Shift | 8.4 m/s (1.4x), `run` clip |
| 3 | Release Shift while moving | back to 6.0 m/s |
| 4 | Shift alone | no movement (only the normal 0.27m stop slide from the previous run) |
| 5 | Walk jump on the hub | up 1.75, across 5.00, 0.82s |
| 6 | Run jump over the 6m gap | up 1.75, across 7.00, 0.82s (same height and air time, 1.4x distance) |
| 7 | 6m gap walking | falls short |
| 8 | Gap lane running, edge takeoff | 5, 6, 7m landed; 8m fell |
| 9 | Analog stick, run enabled (driven through the touch source's state) | 50% = 3.53, 84% = 5.93, 90% = 8.4, 100% = 8.4 m/s |
| 10 | Run DISABLED (multiplier unset) | stick 50% = 3.0, 90% = 5.4, 100% = 6.0; keyboard Shift = 6.0 (no effect): identical to pre-phase behavior |
| 11 | `npm run typecheck`, console | clean |

## Regression found by the user, fixed in v4.81.1

"The run animation is just like a bare pose like a t-pose almost." platfrom-obby maps
WALK to the "Run" clip, so walk and run share one three.js action, and the crossfade
faded it in and straight back out (total mixer weight 0 = bind pose). Checks 1 and 2
above pressed W and Shift TOGETHER and so never exercised walk to run.

| # | Check (the real sequence: walk first, THEN hold Shift) | Result |
|---|---|---|
| 12 | Before the fix | after Shift: no live action, total mixer weight 0 |
| 13 | After: idle, walk, +Shift, -Shift, stop | `Idle`, `Run x1`, `Run x1.4`, `Run x1`, `Idle`; total weight never below 1 |
| 14 | Rapid Shift tapping while walking | total weight never below 1 |
| 15 | Screenshot mid-run | a posed running stride, not the bind pose |

## Second user-found regression, fixed in v4.81.3

"When you jump while walking and keep walking... the walking animation briefly does not
play after landing. Running too." The `jump_land` one-shot always played to its end
(0.37s at this game's jump animation speed) before walk/run resumed.

| # | Check | Before | After |
|---|---|---|---|
| 16 | Walk, tap jump, keep holding W: frames from touchdown to the walk clip | 44 (0.37s, 2.2m travelled in the landing pose) | 0 |
| 17 | Same while running | same stall | 0 |
| 18 | Standing jump | plays `Jump_Land`, ends in `Idle` | unchanged |
| 19 | Standing jump, press W 10 frames after touchdown | waits for the landing clip to end | `walk` 1 frame after the key press |
| 20 | Total active mixer weight across tap, full and standing jumps | | never below 1.0 |

## By hand

1. level_3, editor preview, jump readout on. Walk the lane: 5m is the edge of
   possible, 6m is not. Hold Shift: 5, 6 and 7m clear; 8m does not. Count the
   brick posts on a pad to read its gap.
2. The run clip plays while Shift is held and returns to walk on release, with
   a short ramp either way (no snap).
3. level_1 and level_2: Shift does nothing.
4. Gamepad or phone: a gentle push walks slowly, a firm push walks at full
   speed, a full push runs.

## Not covered

- A real gamepad and a real touchscreen were not exercised: the stick mapping
  was driven by writing the touch source's shared joystick state.
- The run animation and the extra forward lean were not watched in motion.
