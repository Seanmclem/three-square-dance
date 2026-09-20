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
| 2 | Override with 3 sounds, 167 strides | 57 / 55 / 55, never the same twice in a row |
| 3 | Override with 2 sounds | 28 / 27, strict alternation |
| 4 | Blank and duplicate variations | collapse to the one real sound |
| 5 | `set_footstep` with an empty sound | override cleared, back to the default sound |
| 6 | `npm run typecheck` | clean |

## By hand

1. Add two variations to the footstep and walk: you should hear the samples
   alternate, never the same one back to back.
2. Build a surface zone with 2 or 3 variations on its enter script, walk through
   it, and confirm the footsteps revert when you leave.
3. Export the game and confirm the extra samples are in the bundle.

## Not covered

- The "+ Add variation" button was looked at but not clicked in your project,
  because player settings write straight into `game.json`.
- The sounds were verified by which sample id played, not by listening.
