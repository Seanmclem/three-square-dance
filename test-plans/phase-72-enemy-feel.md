# Phase 72 test plan: enemy feel, bite knockback, restore health

Plan and measured results: `plans/phase-72-enemy-feel.md`.

## Do this first (one content change, by hand)

The engine fix for "bites miss" only takes effect once the crab's knockback uses
the new frame. It was not applied for you because the crab prefab was open and
unsaved in your editor at the time.

1. Select a crab. In Properties, open **Scripts**, then **Bite juice**.
2. On the `launch_player` action set RELATIVE TO: **Away** and ANGLE: **0**.
3. Do it on the **Crab 1** prefab (or apply to the prefab) so every crab gets it.

Nothing to turn on for the other two: enemy squash and lean are automatic, and
"Restore health" now works on your existing death script and Kill Floor.

## By hand

1. **Bites.** Let a crab chase you while you run away with the camera facing
   forward, then let it catch you. Each bite that connects should throw you AWAY
   from the crab. You should never end up standing on its back. Standing still,
   nearly every real bite should cost a heart (about 1 in 5 are feints by design
   at this crab's variation of 0.6; set variation to 0 to remove them).
2. **Squash.** Jump on a crab: it flattens to about 70% height, rebounds once,
   and settles, while its Death pose plays.
3. **Lean.** A chasing crab tilts forward about 10 degrees and levels out when it
   stops.
4. **Restore health.** Lose all hearts: after the death animation you respawn at
   the checkpoint with 3 hearts. Fall onto the Kill Floor with 1 heart: you
   respawn with 3.
5. **Editor hygiene.** Enter preview, stomp a crab, press Esc while it is still
   squashed: the crab in the editor viewport is its normal size.

## Not covered

- Squash and lean were checked by numbers, not watched in motion.
- The knockback distance (the crab's `launchHSpeed` 6) was not tuned: two bites
  walked a motionless player off the 8m test pen. Lower it if it feels too strong.
- Enemies other than the crab (none exist in platfrom-obby).
