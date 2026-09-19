# Phase 70 test plan: character feel

Plan: `plans/phase-70-character-feel.md`. Everything numeric below was run
2026-09-19 in a hidden Chrome tab on the shell origin, stepping the full update
loop by hand at dt 1/120 with synthetic key events (TESTING.md section 3), so
it is deterministic and repeatable. Game: platfrom-obby (`jumpHeight 3.5`,
`moveSpeed 6`, `characterScale 0.9`).

## Turn it on first

- **Jump readout ships OFF.** Select tool, click empty space (nothing
  selected), scroll the Properties panel to **EDITOR**, tick **"Jump readout
  while playing"**. It appears under the FPS counter in editor preview (the
  bottom-left green play button). It reads "jump to measure" until the first
  landing.
- **Hold to jump higher** is ON by default: Select tool, click the spawn
  marker, **Movement**, checkbox under JUMP HEIGHT.
- The test room is **level_3** in platfrom-obby (scene switcher in the top bar).
  Reload the editor window first if it was open while level_3 was created.

## Automated checks (all passed)

| # | Check | Result |
|---|---|---|
| 1 | Full-hold running jump vs the pre-change baseline | peak 1.752 to 1.748m, air 0.833 to 0.833s, distance 5.05 to 5.05m |
| 2 | 1-frame tap / 10-frame hold | 0.603m / 0.944m (was 1.752m for every press) |
| 3 | `variableJump: false`, 1-frame tap | 1.748m (full fixed height) |
| 4 | `character:launch` speed 10, hSpeed 4 vs baseline | identical: 2.458m, 0.992s, 2.331m |
| 5 | Ground ramp | 0.092s to full speed, 0.266m stop slide |
| 6 | Mid-air reversal (flip input 10 frames after takeoff) | 6, 3.25, 0.25, -2.75, -5.75, -6 m/s at frames 1, 12, 24, 36, 48, 60 (no one-frame flip) |
| 7 | Shadow position | directly under the player (dx 0, dz 0), 0.02m above the surface, radius 0.46, opacity 0.55 at rest |
| 8 | Shadow over an enemy | sat on the crab's back during a descent |
| 9 | Squash and stretch | +10.8% 9 frames after takeoff, -11.4% 9 frames after landing, settles to exactly 1.000 |
| 10 | Lean | 5.7 degrees forward at full run; up to 8.5 degrees of roll, verified INTO the turn (head tips toward the inside) |
| 11 | Readout on flat ground | up 1.75, across 5.00, 0.82s, drop 0 |
| 12 | Readout on the steps | landed 0.5 / 1.0 / 1.5 / 2.0 higher, matching the built heights |
| 13 | level_3 loads in the runtime | 41 platforms, crab, kill floor + hub checkpoint + stomp volumes; camera inherited from game defaults (FOV 60, 5.5, 25, 0.8) |
| 14 | Gap lane from an edge takeoff | 2, 3, 4m landed; 5m and 6m fell |
| 15 | Crab stomp, landing 0.55m off-centre | fired (launch 8) with the feet still 0.69m up, before reaching the back at 0.76m; despawn dispatched to the level_3 crab's own id; crab gone |
| 16 | Kill floor | hub checkpoint key set on spawn; after a fall the player respawns at (0, 10, 2) |
| 17 | `npm run typecheck`, console | clean (only the known Rapier deprecation warning) |

## By hand (feel cannot be automated)

1. Open level_3, enter preview, tick the readout. Run and jump the gap lane.
   Count the brick posts on each pad: that is the gap in metres. Expect 2 to 4
   comfortably, 5 only with a late takeoff, 6 never.
2. Watch the disc under the character while airborne: it should tell you where
   you will land before you land. Jump over the crab and steer until the disc
   sits on its back, then let it land.
3. Tap jump vs hold jump: clearly different heights; a full hold always
   reaches the same height.
4. Start, stop and reverse on the hub: there should be a short sense of weight
   (about a quarter metre of slide) without feeling like ice. Reverse in
   mid-air: it should steer firmly but not flip instantly.
5. Land from the top step: the character squashes briefly and recovers; running
   leans forward; sharp turns lean into the turn.
6. level_1: every existing jump and every spring should behave as before.
   Stomp a crab from directly above.
7. Shell window framerate in preview should still read about 120 FPS with a
   9 to 10ms worst frame (one extra physics ray per frame).

## Not covered

- Touch and gamepad were not exercised (the jump button reports held/released
  the same way on all three, so hold-for-height should behave identically).
- The shadow, squash and lean were checked by numbers and by single
  screenshots, not by watching motion in the shell window.
- level_3 was verified in the standalone runtime page only, not opened in the
  editor (an editor tab would have restored the user's autosave and written
  scene files on a scene switch).
