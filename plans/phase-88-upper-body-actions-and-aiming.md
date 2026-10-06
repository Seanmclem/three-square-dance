# Phase 88 · Upper-body actions and aiming

> Status: **IMPLEMENTED** as v4.119.0 (2026-10-06), not yet committed (waiting on the
> user's approval); see `test-plans/phase-88-upper-body-actions-and-aiming.md`. Builds on Phase 87 (body parts, re-aiming in
> `src/characters/mix.ts`).

## Decided (2026-10-06, user)

- Started by **scripts only** for now ("it should kind of be both … Do option 1 for now").
  Buttons are a **fast follow-up phase**: consolidate the game's controls (today only the
  action button is set on the game's input screen; move and jump are mapped elsewhere) and
  give scripts triggers for button presses.
- Aim angle from the **camera's up / down look**.
- **Spine turn** for characters without aim clips is in this phase.

User: "if someone needs to point and shoot a gun while walking … would that blend need to be
automatic? … if walking and shooting and then aiming upwards, suddenly that's a new wrinkle."

A Phase 87 mix is a fixed recipe saved as one move. It can't do this: the game picks the legs
(idle, walk, run, jump) from the player's input, and a script that plays "walk_shoot" takes
the whole body, so the legs stop following the player; and every combination (idle_shoot,
walk_shoot, run_shoot, jump_shoot) would be its own move. This phase combines them **while the
game runs**, and adds aiming up and down.

---

## 1. Actions on a body part ("plays on")

- A move gets **PLAYS ON**: whole body (as today) or upper body / arms / head / legs.
  Example: `shoot` = `Pistol_Shoot`, plays on the upper body.
- When such a move plays (script **play move**, or the automatic hit / talk), it plays on that
  part only; the rest of the body keeps doing what the game picked. One `shoot` move works
  standing, walking, running and jumping.
- Loop / hold / once as play move has today. A looping action does **not** end when the
  player moves (that's the point); it ends with a stop (play move "none" / a new **stop
  move** option) or by itself for a one-shot.
- It keeps its own facing (the Phase 87 re-aim, done live each frame since the legs change).
- Works for the player and for placed characters / enemies (same `CharacterAnimator`).

How: after the mixer runs each frame, the animator writes the action's rotations onto that
part's bones (faded in and out over the handoff time), re-aiming the part's first bone. No
change to how locomotion clips play, so a character with no actions plays exactly as before
(regression recording before / after).

## 2. Aiming up and down

- A character gets an **AIM** set: three clips for aiming up, straight and down (UAL1 has
  `Pistol_Aim_Up` / `Pistol_Aim_Neutral` / `Pistol_Aim_Down`, UAL2 the `Bow_Aim_*` three),
  the part they drive (upper body or arms), and how far up / down they reach (degrees).
- While aiming, the part takes the pose between straight and up (or down) for the aim angle.
- Aiming combines with an action: the action plays as made, tilted by the aim (the aim pose
  relative to straight is added on top), so `Pistol_Shoot` fires at whatever angle you aim.
- **Aim angle**: the third-person camera's up / down look (recommended). FPS shows no body.
- Aiming turns on and off with a script action (**aim on / off**), and an action move can be
  set to **aim while it plays**.

## 3. No aim clips: turn the spine

For characters without aim clips: the aim angle is spread over the spine bones and the head
(more on the upper spine), so the chest and head point where you aim. Less natural at big
angles than real aim poses; good enough for most.

## 4. Editor

- Move timeline: **PLAYS ON** (whole body / upper body / arms / head / legs) and **AIMS
  WHILE PLAYING**; the preview plays the action over a chosen legs move (idle / walk / run) so
  you see it combined.
- Character: an **AIM** section (up / straight / down clips, part, reach), with a slider that
  previews the aim angle.

## 5. Order (each step verified)

1. Runtime action overlay + live re-aim; regression recording SAME; harness: shoot over
   walk keeps the legs walking and the hand facing as in the clip.
2. Aim set + angle from the camera; harness: hand direction follows camera pitch.
3. Spine-turn fallback (bunny).
4. Editor controls, guide, architecture doc, test plan.

## 6. Out (later)

- Enemies aiming at the player (their aim angle from the direction to the player).
- Weapons in hands (attaching a model to a hand bone), projectiles, damage from shooting.
