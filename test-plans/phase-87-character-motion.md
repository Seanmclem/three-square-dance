# Test plan · Phase 87 · A move's timeline (v4.118.0)

Run on a throwaway harness (`deno run -A scripts/test-harness.ts platfrom-obby level_3 <port>`),
never the desktop shell's port. Character: Mannequin Male (`chr_13e910a4`, UAL1 + UAL2).

## Feet analysis

- [x] UAL clips: Walk_Loop 0.82 m/s, Jog_Fwd_Loop 4.73, Sprint_Loop 7.13, one touchdown per
      foot per loop; Idle_Loop and Jump_Loop have no touchdowns.
- [x] In-game check (fixed 1/60 clock, D held): a planted foot moves least at the measured
      rate (Jog 0.80 to 0.86 m/s at 1.1 to 1.27×, 1.82 at 1.45×; Sprint 1.05 at 0.88×,
      2.97 at 1.1×).
- [x] Bunny (`chr_777d2b37`): FootL / FootR found; walk and run two touchdowns each.

## Regression

- [x] `scripts/regression/character-anim.mjs`: SAME on every frame (player + crab, 1557 +
      272 frames) against the v4.117.0 build.

## Editor (all passed headless)

- [x] Moves list: walk reads "feet slide 86%"; after a fit, "feet planted".
- [x] Clicking "walk" opens its timeline; feet status, two green steps "from the feet".
- [x] MATCH FEET sets 7.32× and the note says it will look rushed.
- [x] FIND A CLIP THAT FITS lists Sprint_Loop at 0.84×; clicking it sets clip + speed.
- [x] STEPS: click adds a step (amber, "your own"), drag moves it, FROM THE FEET resets.
- [x] HANDOFFS: + from… idle, preset quick → `handoffs["idle>walk"] = 0.08`; the stage's
      animator uses it, walk → run stays 0.15.
- [x] + LAYER Idle_Talking_Loop on the upper body: `mix:walk` (2.67 s) plays, Head track from
      the talk clip and thigh_l from the walk.
- [x] Save writes layers, speed and handoffs to game.json.
- [x] TRY IT: handoff 0.08, walk plays `mix:walk`, 8 step moments, footsteps heard only on
      the walk's touchdowns.

## Layer facing and preview switch

- [x] Punch_Jab on the upper body over Walk_Loop / Sprint_Loop: the hand's direction matches
      the punch clip alone (worst 7.2° over the punch, was 28.5° / 49.8°; at full reach
      0.08 down, was 0.5 / 0.8 down).
- [x] LAYER 1's switch off: the preview plays plain Walk_Loop, the move still has its layer;
      on again: `mix:walk`.

## By hand

- [ ] Listen: footsteps land with the feet (walk and run) in TRY IT and in Play.
- [ ] A handoff set to slow (0.3 s) vs snap (0) looks clearly different in the blend test.
- [ ] A placed character / enemy whose walk is a mix plays it (scripts and the AI).
- [ ] A layer on "arms" or "head" only (not upper body) on the bunny.
