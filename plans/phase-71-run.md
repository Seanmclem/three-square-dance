# Phase 71: Run

> User ask (2026-09-19, right after Phase 70 shipped): "is there a run function
> now?" There was none (Phase 70 listed sprint as out of scope). The design below
> was proposed in chat and accepted as is ("those are fine").

## Decisions

- **Triggers, per device, no new on-screen button:**
  - Keyboard: hold **Shift** (`bindings.kbm.run`, default ShiftLeft + ShiftRight).
  - Gamepad and touch: push the move stick **to 85% or more of its travel**
    (`RUN_STICK_THRESHOLD`). The touch layout has no spare button and both sticks
    are already analog.
- **Speed:** a per-game `PlayerSettings.runMultiplier` on the Movement page
  (RUN SPEED x). Absent or 1 = no run. Suggested starting value 1.4.
- **Off by default**, so every existing level plays exactly as before until an
  author opts in. platfrom-obby's game defaults are NOT changed; only the
  Jump Lab (`level_3`) gets a scene override of 1.4, so running can be tried
  and measured without touching level_1 or level_2.

## Behavior

- `ActionState.run` (held), set by each source, cleared with the rest in menu mode.
- In `CharacterController`: running = multiplier above 1, `run` held, and moving.
  Wanted speed = `moveSpeed x multiplier`, direction at full magnitude. It feeds
  the Phase 70 ramp unchanged, so reaching run speed takes the same 0.08s on the
  ground, and run can be held or released in the air.
- **Analog walk range when run is enabled:** the stick's 0 to 85% span maps to
  0 to full walk speed (full walk is reached at the threshold, where run takes
  over). With run disabled the stick maps 0 to 100% as it always has. Keyboard
  input is magnitude 1 and is unaffected either way.
- Animation: new locomotion state `run` (Character page slot, auto-matches a
  clip named "run"; the stock character ships one). Falls back to `walk` when
  the model has no run clip.
- Forward lean scales up to the run speed (a little more lean while running).
- Jump height is unchanged by running; jump DISTANCE grows with speed
  (air time is the same), which is the level-design cost: a gap can be built
  for the walk jump (5.05m at speed 6) or the run jump (about 7.07m at 1.4x).
  The Jump Lab lane gains 7m and 8m gaps to calibrate this.

## Out of scope

- A run toggle (press once), stamina, a run button on the touch overlay, a
  rebinding UI for the run key (the Controls page lists no key bindings today).
- Changing platfrom-obby's game defaults.

## Verification

Same deterministic stepping recipe as Phase 70, in the runtime page on level_3:
walk speed and walk jump unchanged with the multiplier at 1 and at 1.4 without
Shift; Shift gives 1.4x speed; run jump distance about 1.4x the walk jump with
the same peak; releasing Shift ramps back down; the 6m and 7m gaps; the run clip
plays; typecheck and console clean.
