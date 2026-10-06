# Phase 87 · A move's timeline: sliding feet, footsteps, mixing clips, handoffs

> Status: **IMPLEMENTED** as v4.118.0 (2026-10-05), not yet committed (waiting on the
> user's approval); see `test-plans/phase-87-character-motion.md`. Design pages:
> "Character Motion Mockups" and "Feet, Handoffs and Mixing" (claude.ai artifacts).

## Decided (2026-10-05, user: "go with your recommendation on everything")

- Layout: **one timeline per move** (option 2), plus a slim status in the moves list
  (option 3's strip): walk and run say "feet planted" or "feet slide N%".
- Handoffs: **presets and seconds** (snap 0, quick 0.08, smooth 0.15, slow 0.3, or any
  number).
- Footsteps: **on touchdown** for characters with clips; the old "every STRIDE meters"
  stays for capsules, players without a character, and clips with no feet found.
- Mixing: body parts from a **short list** (upper body, arms, head, legs), not painting.

The four problems this answers, from the user: walk / run feet sliding because a clip is
slower than the player moves (UAL's `Walk_Loop` at 6 m/s); every move change being the same
0.15 s blend; footstep sounds every 2 m instead of when a foot lands; and moves no clip has
("talk while walking").

---

## 1. Scope

**In**

- Feet analysis per clip: when each foot is down, when it touches down, and how fast the
  clip "walks" (`src/characters/feet.ts`).
- MATCH FEET (speed = game speed / clip speed) and FIND A CLIP THAT FITS (clips needing
  0.8× to 1.25×) for walk and run.
- Footsteps on touchdown (or the move's own STEPS) for a player using a character.
- Layers: another clip on a body part, baked into one mixed clip (`src/characters/mix.ts`)
  so every player of clips (player, placed characters, enemy AI, scripts, editor) plays it.
- Handoffs: blend time per pair of moves, for the player and the editor's blend test.
- The move timeline in the character editor; feet status in the moves list.

**Out (later)**

- Handoffs and timed footsteps for placed characters and enemies (they play mixes and
  SPEEDs already).
- Partial-strength layers (a layer is all or nothing on its part), additive tweaks (lean,
  arms out), painting body parts.
- Speeding the clip with the actual ground speed continuously (the "speed line"); MATCH
  FEET is a button you press.
- Different sounds per step.

## 2. How the feet are read (`feet.ts`)

- A spare copy of the model at the scale it plays at (never the one on screen) plays the
  clip; at least 72 poses (60 per second) are sampled.
- Contact: the lowest bone of the foot's chain (heel at touchdown, toes at push-off) within
  3% of the model's height of the floor, where the floor is foot level in the model's own
  pose (so an in-air loop never "lands"). Gaps up to 0.05 s are closed and touches up to
  0.04 s dropped.
- Touchdown = the start of a contact. Ground speed = the median speed of the planted
  ankle (not the lowest point, which jumps from heel to toe), skipping the first and last
  samples of each contact.
- Checked against the game: with the fixed 1/60 clock and the player walking, a planted
  foot barely moves at the measured rate (Jog 0.80 to 0.86 m/s of residual roll at 1.1 to
  1.27×; 1.82 at 1.45×).

## 3. Mixing (`mix.ts`)

- Bones sort into legs (with hips and root), spine, arms, head by name; a bone without a
  telling name follows its parent; a skeleton with no telling names sorts by position.
- Upper body = spine + arms + head. A later layer wins where parts overlap.
- A layer keeps its own facing: the first bone of its part is re-aimed so the part has the
  rotation it has in its own clip relative to the model, whatever the legs' clip does with
  the hips (added after "he punches downward" with a punch over a walk).
- Each layer has a switch to preview the move without it (editor only).
- The mix lasts a whole number of the base clip's loops (rounded to the layer's length),
  the base tiled and each layer stretched a little to fill it, so nothing jumps at the
  loop seam.

## 4. Data

```ts
CharacterMove.layers?: Array<{ clip: string; source?: string; part: "upper" | "arms" | "head" | "legs" }>
CharacterMove.steps?:  number[]                 // fractions of the loop; absent = touchdowns
CharacterDef.handoffs?: Record<string, number>  // "from>to" → seconds; absent = 0.15
```

## 5. Implementation order (each step verified)

1. `feet.ts` + stage probe → numbers for UAL walk / jog / sprint, then the in-game slide
   check with the fixed clock.
2. Types, `mix.ts`, resolver, animator handoffs, controller footsteps, ObjectPlacer and
   stage wiring → regression recording SAME.
3. Editor: timeline + moves-list status → headless pass on a harness.
4. Docs: the Characters guide, architecture doc, CHARACTER_GUIDE, test plan.
