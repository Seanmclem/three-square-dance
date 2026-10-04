# Character Guide

The player character: what it does, where each behaviour is configured, and what
applies in first person versus third person. Everything here lives in the engine
(`src/preview/CharacterController.ts`, `CharacterBody.ts`, `EnemyAI.ts`), so every
game built with the editor gets it. Nothing is tied to a particular game or level;
the Crab prefab, the Jump Lab level and a game's scripts are content.

Built in Phases 70 to 77 (September 2026). Detail and measurements are in the
architecture changelog from v4.80.0 on.

## Why it is the way it is

The starting complaint (September 2026): the test character "feels rigid and awkward";
players were "misjudging distance, or where I'm landing", and "jumping on enemies" was
unreliable. The target feel, in the author's words: **"somewhat dependable like Roblox
without being so rigid, something much more alive like Mario."**

Those two halves pull against each other, so one rule settled every decision:

> **Fixed rules, lively presentation.** The same input always produces the same arc,
> so a level can be built around known numbers (the obby side). Everything that adds
> life either does not move the landing point at all, or is tuned so existing levels
> stay valid (the Mario side).

That is why the jump was *reshaped* rather than changed (lighter rise, heavier fall,
same peak and same air time), why hold-to-jump-higher only ever shortens a jump and a
full hold is always the same height, and why run is off unless a game turns it on.

The "alive" half borrows from the classic animation principles, the Disney list:

- **Squash and stretch** on takeoff and landing, volume preserving, anchored at the
  feet, so the character reads as a body with weight rather than a rigid capsule.
- **Anticipation and follow-through** as lean: forward with speed, more when running,
  back when braking, and the run skid, where the body keeps facing the old way for a
  beat before whipping round. The same treatment on enemies (lean while chasing, squash
  when stomped) so the world reacts, not only the player.
- **Secondary motion and rhythm** in sound: footstep variation and pitch wobble exist so
  a repeated sample stops reading as a loop.
- **Readability**: the landing shadow is not physics, it is a cue. Its job is to answer
  "where will I land" and "am I over the crab" while airborne, which was the biggest
  cause of the misjudged landings.

Things deliberately left out, and why:

- **An anticipation dip before takeoff.** It delays the jump, which works against
  "dependable". Jumps must respond on the frame.
- **A fall-speed cap and a faster fall for springs and ledge drops.** Both would retune
  every authored spring and gap; kept for a later pass with the Jump Lab.
- **Removing the mid-jump stair-step (the hidden 0.45m of ledge reach).** Tried twice;
  mounting a ledge became jittery and one attempt exposed a stuck ledge hang. Reverted.
  The designed replacement is a ledge grab or a quick mantle, not tighter grounding rules
  (constraint noted by the author: the avatar's large head rules out a classic hang pose).
- **Sprint as a second walk speed on by default.** A second speed doubles the jump
  distances a level must be built around.

## What you get, and where to turn it on

| Behaviour | Default | Where to change it |
|---|---|---|
| Landing shadow: a soft disc straight under the player, shrinking with height (74% at the top of a jump). It sits on an enemy's back when you are above it. | On | Nothing to set |
| Jump arc: rises light, falls heavier. Peak and air time equal the old arc, so existing gaps are unchanged | On | JUMP HEIGHT (Movement page) |
| Hold jump to go higher: tap = short hop (about a third of the height), hold = full height, which is always the same | On | Spawn marker, Movement page, checkbox |
| Start and stop weight: about 0.08s to full speed and 0.27m of slide to stop; no instant mid-air reversal | On | Nothing to set |
| Run: hold Shift, or push the stick past 85%. Same jump height, longer jump distance | Off | RUN SPEED x (Movement page), 1 = no run |
| Run skid: reversing at full run slides for about 0.2s, facing held, leaning back | With run | `RUN_SKID_SEC`, `SKID_LEAN` in CharacterController.ts |
| Squash and stretch, forward lean, roll into turns, lean back when braking | On | `SQUASH_*`, `LEAN_*` constants |
| Landing animation only for standing landings; landing while moving keeps the legs going | On | Nothing to set |
| Footstep variations (up to 3 extra sounds, random, equal chance) | Off | Character Sounds page, + Add variation |
| Footstep pitch wobble (plus or minus 6%) | Off | Character Sounds page, checkbox |
| Surface footstep overrides with their own variations | Per volume | `set_footstep` action |
| Enemy squash when stomped, lean while chasing | On | `FEEL_*` constants in EnemyAI.ts |
| Bite knockback straight away from the attacker | Per script | `launch_player`, RELATIVE TO: Away |

Settings on the Movement and Character Sounds pages follow the Phase 68 rule: set
them under GAME DEFAULTS for every level, or THIS SCENE for one level.

## First person versus third person

The physics is shared. The visuals on the avatar are third person only, because the
avatar is hidden in first person.

| | First person | Third person |
|---|---|---|
| Jump arc, hold to jump higher, start/stop weight, run, skid, footstep variation and wobble, enemy feel | yes | yes |
| Landing shadow | no (the physics ray is skipped too, so it costs nothing) | yes |
| Squash, stretch, lean, run animation | no | yes |
| Damage flash | screen tint | avatar tint |

In first person the skid holds the avatar's facing, which has no visible effect
because the camera follows the look direction; a reversal just brakes a little longer.

## Numbers worth knowing (platfrom-obby settings: jump 3.5, speed 6, scale 0.9)

- Jump peak 1.75m, air time 0.82s, running-jump distance 5.0m walking, 7.0m at RUN 1.4.
- A jump reaches a ledge up to about 2.2m: the physics engine's stair-stepping (0.45m) also
  lifts the capsule mid-jump. Two attempts to remove that were reverted because mounting a
  ledge became jittery; the accepted reach is 2.2m. Build "unreachable" ledges at 2.3m or more.
- The JUMP HEIGHT number is about twice the real peak (a long-standing takeoff/gravity
  mismatch, kept on purpose so existing levels do not change).
- Cost: one physics ray per frame for the shadow (4 to 9 microseconds), one flat quad;
  footsteps cost about 0.03ms each; nothing else was added to the per-frame path.

## Characters (Phase 86)

A **character** is a model plus how it moves, saved per game in `game.json`
(`characters`): the model, other files it borrows clips from (same skeleton, e.g.
Quaternius's Universal Animation Library on either mannequin), which clip each move plays,
and KEEP IN PLACE (on by default: root-motion clips stay under the character). The player
uses one when the player settings name it (`characterId`); without one, the older
MODEL + ANIMATIONS settings still describe the player, exactly as before.

All character animation goes through one shared `CharacterAnimator`
(`src/characters/`); the player's controls are one driver of it, and enemies and later
NPCs will be others.

**Making one (v4.112.0):** the **Characters** button on the left toolbar opens the game's
characters. NEW makes one from any model (its moves guessed from the clip names), and
"Make the player's look a character" turns the current player settings into one that plays
the same. EDIT opens the character editor, isolated like Edit Brush: the level is set
aside, the character stands on a dark grid inside its collision capsule. Left: every clip
it can use, by file (+ ADD FILE borrows clips from a file with the same skeleton). Right:
name, HEIGHT (FIT TO CAPSULE), KEEP IN PLACE, colors, and the MOVES list (AUTO FILL,
+ ADD MOVE). Bottom: play, scrub, speed, loop and a blend test. Save writes game.json;
USE AS PLAYER makes the game's player use it.

## Related scripting

- `on_level_load` ("when the level starts") fires on every level entry, in the editor
  preview and the Play window. `on_game_start` fires once per run.
- A GAME-scope script (LEVEL tab, GAME) runs in every level; use it for the death
  handler and for `store_position(player)` to `checkpoint` on level start.
- "Restore health" on `respawn_player` resolves the game's real health key (`Hearts`),
  or the Health key field.

## Testing

`level_3` (the Jump Lab) in platfrom-obby has a gap lane (2 to 8m), a step staircase
(0.5 to 2.0m) and a crab pen. Turn on **Jump readout while playing** (EDITOR section of the
Properties panel) to see height, distance and air time for the last jump. Deterministic
recipes are in TESTING.md and the phase 70 to 77 test plans.
