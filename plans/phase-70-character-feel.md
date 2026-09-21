# Phase 70: Character feel (dependable like Roblox, alive like Mario)

> User ask (2026-09-19): the test character "feels rigid and awkward", and the
> concrete difficulties are "misjudging distance, or where I'm landing",
> "certainly jumping on enemies too", "maybe the camera or character/enemy size
> is off or collisions". Target feel, in the user's words: "somewhat dependable
> like roblox without being so rigid, something much more alive like mario".
> Seven items were agreed in discussion and are implemented here in order.

## What the code did before (measured, not assumed)

- Horizontal movement was `input x moveSpeed x dt`: full speed on the first
  frame, dead stop on release, and the same in the air (instant mid-air
  reversal at full speed).
- Jump: takeoff `sqrt(2 * 9.81 * jumpHeight)`, then gravity 20 both up and
  down. For platfrom-obby (`jumpHeight 3.5`, `moveSpeed 6`): peak 1.72m,
  0.83s in the air, about 5m of running-jump distance. Symmetric arc, fixed
  height, no fall speed-up.
- No shadow of any kind under the player (the avatar never had `castShadow`,
  and there was no landing marker). This is the largest single cause of
  "where am I landing".
- The crab's stomp volume (1.2 x 0.5 x 0.9, top at +0.75m) is flush with the
  crab's back, the exact case HAZARDS_GUIDE.md warns against ("make the zone
  extend 0.3 to 0.5m ABOVE the enemy's back").
- Already good and kept as is: jump press buffer (0.15s), coyote time (0.12s),
  smoothed avatar turning, 0.15s clip crossfades, camera height and arm
  smoothing.

## The rule that shapes every change

**Fixed rules, lively presentation.** The same input always produces the same
arc, and everything that adds life either does not move the landing point
(shadow, squash, lean) or is tuned so existing levels stay valid (jump
reshape). Concretely, the full-hold jump keeps today's peak AND today's air
time, so every gap already built in level_1 is still the same jump.

## The seven items

1. **Landing shadow.** A soft dark disc directly under the player, found with
   one Rapier ray straight down per frame (sensors excluded, own capsule
   excluded, 40m max), laid on the hit surface along its normal. It shrinks and
   fades slightly with height. Enemies are solid colliders, so the disc lands
   on a crab's back when you are above it: that is the stomp aiming aid.
   Third person only. Lives in `CharacterController` (created in `init`,
   removed in `dispose`), never raycast-pickable, no per-frame allocation.
2. **Camera defaults.** The user tuned level_2 by hand (FOV 60, distance 5.5,
   height 0.8, angle 25) and saved it as a scene override. Promote those values
   to platfrom-obby's game defaults so level_1 and level_3 get them, and remove
   the now-redundant level_2 camera override. Also move the engine's stock
   third-person defaults for NEW games toward the same framing.
3. **Forgiving crab stomp zone.** Content fix on the "Crab 1" prefab and its
   placed copies: taller (top about 0.5m above the back) and slightly wider
   than the body. Safe because the stomp script is gated on `player_falling`.
4. **Jump arc.** Rise under a lighter gravity, fall under a heavier one, with
   the split chosen so peak and total air time equal the legacy arc for any
   `jumpHeight` (rise fraction 0.56 gives roughly 15.9 up and 25.8 down against
   the legacy 20/20). Hold for height: releasing jump while still rising
   applies 3x rise gravity until the peak (tap is a short hop of about 0.6m,
   full hold is always the same 1.72m). New player setting
   `variableJump` (Movement page, default on) so an obby author can force fixed
   jumps. The reshaped arc applies ONLY to a jump, from takeoff to landing:
   launch pads and walk-off falls keep legacy gravity 20, so every existing
   spring still lands where it did. The `jumpHeight` label mismatch (the
   setting yields about half its number) is deliberately NOT touched: the
   user deferred it, and changing it would resize every existing jump.
5. **Start and stop ramp, no instant mid-air reversal.** The controller keeps
   a horizontal velocity that moves toward `input x moveSpeed` at a limited
   rate: about 0.08s to full speed and 0.08s to stop on the ground (a stop
   slide of roughly 0.25m at speed 6), about 0.2s in the air (still strongly
   steerable, which landing precision needs, but no longer reversible in one
   frame). Rates are expressed as times so they scale with `moveSpeed`.
   Zeroed on teleport and ladder mount. Mover carry and the launch channel
   stay separate and additive, as today.
6. **Landing squash, takeoff stretch, lean.** A damped spring on the avatar
   root's scale (volume preserving, anchored at the feet): a kick toward
   stretch at takeoff and launch, a kick toward squash on landing scaled by
   impact speed. Plus a small forward lean with speed and a roll into turns
   driven by the avatar's turn rate. Presentation only: the capsule, the
   camera and the landing point are untouched. Neutral while climbing.
7. **Test room and jump readout.** `level_3` ("Jump Lab") in platfrom-obby,
   generated from level_2's skeleton (kill floor, checkpoint, lighting) with
   plain box platforms: a row of level gaps 2, 3, 4, 5, 6m; a staircase of
   steps 0.5, 1.0, 1.5, 2.0m high; and a crab pen for stomp practice. The
   readout: the controller measures every airborne stretch (peak height above
   takeoff, horizontal distance, air time, height difference at landing) and
   emits `character:jump-stats` on landing; a small overlay beside the perf
   counter shows the last one. Editor preference, ships OFF ("Jump readout
   while playing" checkbox in the no-selection EDITOR section).

## Out of scope (deliberately)

- Sprint. A second speed doubles the jump distances a level must be built
  around; revisit after the feel pass settles.
- Camera behavior changes (for example not following Y during a jump). Only
  settings move in this phase.
- Avatar `castShadow`, fall speed cap, anticipation dip before takeoff (it
  delays the jump, which works against "dependable").
- Applying the faster fall to launches and ledge drops. Worth unifying later,
  using the test room to retune springs.

## Verification

Deterministic, in a hidden Chrome tab on the shell origin, stepping the full
update loop by hand at dt 1/120 with synthetic key events (TESTING.md section 3):

1. Baseline BEFORE any code change: peak, air time and distance of a full-hold
   running jump on level_2's flat platform.
2. After item 4: full hold must match the baseline peak and air time within
   integration error (a few mm, one or two frames); a one-frame tap must give a
   clearly lower peak; `variableJump: false` must make the tap equal full hold.
3. After item 5: time to full speed, stop distance, and that a mid-air
   reversal no longer flips velocity in one frame; running-jump distance
   reported against the baseline.
4. A `character:launch` must still reach its legacy peak (springs unchanged).
5. Item 1: disc position equals the ray hit under the player, on the ground and
   over a crab. Items 1 and 6 also checked by eye in the real shell window
   (legibility, not just wiring).
6. level_3 loads in the editor and the runtime, the readout numbers match the
   built gaps, the kill floor respawns, the crab can be stomped.
7. `npm run typecheck`, console clean, framerate in the shell window unchanged
   (one extra Rapier ray per frame).

## As built (2026-09-19): what changed from the plan, and what the test room found

Deviations:

- **Readout measurement.** The plan said the controller "measures every
  airborne stretch and emits on landing". Two traps forced a different shape:
  `isGrounded` turns true about 2 frames before the capsule finishes settling
  (0.11m high after a full jump), and while rising past a ledge the capsule's
  round bottom grazes the lip and `isGrounded` flickers true for single frames.
  So the landing block is gated on `_velY <= 0`, and `drop` is read from the
  settled feet 6 frames after landing.
- **level_3 needed a hub checkpoint volume.** The kill floor respawns at the
  `checkpoint` state key, which only a checkpoint gate sets. Without one, a
  fall in level_3 respawned at level_1's coordinates (measured). The hub volume
  stores the hub checkpoint on every entry (not one-shot).
- **A platform's `position.y` is its BOTTOM** (top = y + thickness). The first
  generated staircase was too tall because the mesh code reads as if it were
  the center. Measured in-engine, then fixed in the generator.
- Stock defaults landed at distance 5.5 / angle 20 (FOV left at 75: it is
  shared with FPS mode).

Measured in the Jump Lab (full-hold jump, `jumpHeight 3.5`, `moveSpeed 6`):

| Obstacle | Result |
|---|---|
| Gaps 2, 3, 4m | clear from an edge takeoff (readout: across 5.00m) |
| Gap 5m | exactly the jump distance: fails from the edge, needs a late (coyote) takeoff |
| Gap 6m | impossible |
| Steps 0.5, 1.0, 1.5m | climbable |
| Step 2.0m | ALSO climbable, although the jump peaks at 1.75m (see below) |

Pre-existing behaviors found, reported to the user, deliberately not changed:

1. **(Corrected: the cause is Rapier autostep firing mid-jump, and reach is really 2.2m.
   v4.88.0 turned it off in the air and v4.88.2 REVERTED that because mounting a ledge became
   jittery. 2.2m stands. See the architecture changelog.)** Original note:
   **Effective ledge reach is about jump height + capsule radius** (2.0m here).
   The capsule's round bottom catches the lip and forward input rolls it over,
   like a wheel over a curb. Build "unreachable" ledges at 2.3m or more.
2. **A lip graze while rising refreshes the coyote window**, so a second jump
   is possible for 0.12s next to a ledge.
3. **The `checkpoint` state key is game-wide.** Entering a new level and
   falling before its first checkpoint gate respawns at the previous level's
   coordinates. level_2's spawn sits before its first gate, so it has this
   hazard today. A per-level "store checkpoint at spawn" volume (as in
   level_3) is the content-side fix.
4. The old crab stomp volume (top 0.75m) sat below the crab's back (0.76m): a
   player landing squarely on the crab could never enter it. Only glancing
   side hits registered. This was the main cause of "jumping on enemies".
