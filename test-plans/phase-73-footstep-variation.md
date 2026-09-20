# Phase 73 test plan: footstep variation

Changelog: WORLD_EDITOR_ARCHITECTURE.md v4.83.0. Guide: AUDIO.md section 4.

## Where it is (nothing is on until you add a variation)

- **Player footsteps:** deselect everything, Properties, **Audio**, **Character
  Sounds** (or select the spawn marker, **Character Sounds**). Under FOOTSTEP,
  **+ Add variation**, pick a second (and third) sound of the same surface, for
  example `footstep_carpet_001`, `_002`.
- **Surface override:** on a trigger volume's `on_player_enter` script, the
  **set_footstep** action now has the same **+ Add variation** list. The
  `on_player_exit` script is unchanged: `set_footstep` with the sound left empty.

## Automated checks (runtime page, level_3, all passed)

| # | Check | Result |
|---|---|---|
| 1 | No variations (today's data) | 55 of 55 strides play `footstep_carpet_000` |
| 2 | (v4.83.1, plain random) override with 3 sounds, 250 strides | 96 / 74 / 80, back-to-back repeats 39% (about a third is expected of true random) |
| 3 | (v4.83.0 only, superseded) the "never twice in a row" rule | removed at the user's request |
| 4 | Blank and duplicate variations | collapse to the one real sound |
| 5 | `set_footstep` with an empty sound | override cleared, back to the default sound |
| 6 | `npm run typecheck` | clean |
| 7 | Pitch wobble ON, 3 sounds, 125 strides | every footstep carries a rate between 0.94 and 1.06, mean 1.00 |
| 8 | Pitch wobble ON, single sound | same range: one sample still varies |
| 9 | Pitch wobble OFF | no rate sent at all (identical to before) |
| 10 | The rate reaches the audio object | live `THREE.Audio` footsteps show playbackRate 0.94 to 1.06 |
| 11 | Cost, timed during a walk | 0.05ms per footstep plain vs 0.027ms with 3 variations + wobble (noise); about 2.8 footsteps a second, roughly 0.01% of a 120Hz frame budget |

## By hand

1. Add two variations to the footstep and walk: you should hear the samples mix
   at random (the same one can play twice in a row).
1b. Tick **Pitch wobble** under the variations: each step should sound slightly
   higher or lower. Try it with a single footstep sound too.
2. Build a surface zone with 2 or 3 variations on its enter script, walk through
   it, and confirm the footsteps revert when you leave.
3. Export the game and confirm the extra samples are in the bundle.

## Not covered

- The "+ Add variation" button was looked at but not clicked in your project,
  because player settings write straight into `game.json`.
- The sounds were verified by which sample id played, not by listening.
