# Test Plan: Phase 86, Characters (part A: v4.111.0)

[x] = verified 2026-10-03. Regression: `scripts/regression/character-anim.mjs` (TESTING.md
§13). Logic: scratch Node scripts over the real `src/characters` code. UI / runtime:
headless Playwright on throwaway harnesses (`HARNESS_DIST` = a build of the working tree,
`HARNESS_ASSETS` = a temp copy of the asset library with UAL1, UAL1_RM, UAL2 and
Mannequin_F added); nothing reaches `public/games` or `public/assets`.

## Part A

- [x] Regression baseline from the previous commit (git worktree build): two recordings
      identical, 0 m difference.
- [x] Player on `CharacterAnimator` + the character loader: SAME as the baseline on every
      frame, Jump Lab (1557 frames: idle, walk, tap and hold jump, run, walk + jump, a
      script clip, respawn, crab chase / bite / stomp) and level_1's ladder (272 frames).
- [x] AUTO FILL: UAL1 → Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Jump_Start, Jump_Loop,
      Jump_Land, Climb_Up_Loop, Punch_Jab, Hit_Head, Death01, Idle_Talking_Loop; none of
      the repo's 24 animated models changes a pick against the old guess.
- [x] A game character (Mannequin_F + UAL1 clips) as the obby's player: 120 clips
      loaded, idle / walk / jump / in air / land / idle again, a script `Dance_Loop` from
      the borrowed file, no warnings.
- [x] KEEP IN PLACE: with UAL1_RM the root bone stays put while walking (0.000 m);
      with `inPlace: false` it travels (0.57 m).
- [x] Export: a used character's model and clip files are collected; an unused
      character's are not.
- [x] Import UAL1 / UAL2 / Mannequin_F through the Model Importer (the user's import,
      2026-10-04): each manifest entry got `rig` with 65 bones and the same id
      (`d3a03ee5`).

## Part B (v4.112.0)

Harness with the temp asset library (UAL1 / UAL2 / Mannequin_F), real clicks:

- [x] Characters button → panel; NEW from Mannequin F → saved in game.json, editor opens.
- [x] The level is set aside (129 visible level meshes → 0) and comes back on Close;
      checkpoint markers hidden while editing.
- [x] + ADD FILE: UAL1 accepted ("same skeleton"), 120 clips listed; the crab refused
      (different skeleton).
- [x] AUTO FILL: walk = Walk_Loop (and the rest from UAL1).
- [x] Clicking Dance_Loop plays it; + ADD MOVE "dance" takes the picked clip; ▶ on jump
      plays Jump_Start.
- [x] A click at the start of the scrub bar pauses at 0.00; the pose holds through a
      color change (no T-pose).
- [x] FIT TO CAPSULE, a color for M_Main, a new name → "unsaved changes"; Save writes all
      of it to game.json.
- [x] USE AS PLAYER → `playerSettings.characterId`; in game the player has 120 clips,
      plays idle, shows the new color.
- [x] Close with unsaved changes asks; Discard keeps the saved name.
- [x] "Make the player's look a character" (stock obby): walk Run, idle Idle, land
      Jump_Land, keep in place off; used as the player; plays as before.
- [ ] By hand: orbit under the character; BLEND TEST walk → run looks right; the capsule
      ghost reads clearly.

## Part C (v4.113.0)

- [x] Regression around the enemy refactor (baseline from the part-B commit): the
      refactor alone and the final part-C build both SAME on every frame (player and crab,
      1557 + 272 frames).
- [x] PLACE a UAL2 zombie character: an object with `characterId`, idles in
      Zombie_Idle_Loop, 134 clips.
- [x] ENEMY AI on it: the AI screen says its clips come from the character's moves.
- [x] In game (Hero character as the player): the zombie walks with Zombie_Walk_Fwd_Loop
      and bites with Zombie_Bite; the player plays its hit move (Hit_Chest) when bitten.
- [x] Play move: "dance" on the player plays Dance_Loop; "hit" on the zombie plays
      Hit_Knockback.
- [x] respawn_player plays Death01 under the fade, then idle.
- [x] TRY IT plays the unsaved draft (new color); Esc returns to the editor with the
      change still unsaved.
- [x] No errors or "no move" warnings.
- [ ] By hand: the dialogue talk move; a script adjust_number hit; the Characters guide
      from the ? menu.

## Searchable menus (v4.115.2)

- [x] Characters panel: typing "ual" in the model field leaves UAL1 / UAL2 under the
      Characters heading; Enter picks; NEW opens the editor.
- [x] Editor: a move's clip field filters word by word ("loop walk"); click picks;
      "no matches" for junk; Escape keeps the pick; the list stays on screen at the
      right edge.
- [x] Player Character page (CHARACTER = None): CHARACTER MODEL "ual1" + Enter sets the
      model; WALK filters its clips.
- [ ] By hand: an object's AUTO-PLAY clip field; the list opening upward near the
      window bottom.

## TRY IT starts at the spawn (v4.115.3)

- [x] TRY IT on level_1 and level_3 (camera focus left elsewhere): the player stands at
      the level spawn, grounded, idle (before: spawned at the camera focus and fell forever).

## BLEND TEST stop (v4.115.4)

- [x] TEST (walk → run) turns into STOP; walk, then run; STOP goes back to idle and TEST
      returns; playing another move also ends the test.

## Character move speeds, sounds, FEEL (v4.116.0)

- [x] Regression recording SAME (player + crab) after the animator change.
- [x] SPEED box: "1.5" types through; walk previews at 1.5; editing retimes it.
- [x] SOUNDS footstep chop, VOL 0.5, STRIDE 1.2; FEEL squash off; Save writes them.
- [x] TRY IT: character footstep + stride, game jump sound; squash off, lean on; walking
      at 1.5; jump at its own 0.8 (JUMP ANIM SPEED 1.2 skipped), land at the game's 1.2.
- [ ] By hand: a placed character / enemy walking at its walk SPEED; the player Feel and
      Character Sounds pages showing the character's notes; footsteps heard in game.

## Change a character's model (v4.117.0)

- [x] UAL1 → Mannequin F (same skeleton): no question, note shown, UAL1 + UAL2 borrowed,
      moves resolve to the same clips, 254 clips; Save keeps the name and id.
- [x] → the bunny (different skeleton): asks, lists lost moves and removed files; CANCEL
      keeps the model; CHANGE MODEL keeps only same-name clips (land); AUTO FILL fills the rest.
- [ ] By hand: the swapped character as the player in Play; a placed one rebuilding with
      the new model.
