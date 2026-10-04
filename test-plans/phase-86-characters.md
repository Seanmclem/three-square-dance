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
- [ ] Import UAL1 / Mannequin_F through the Model Importer: the manifest entry gets
      `rig` (65 bones, same id for both). (Needs a real import; the editor UI in part B
      shows it.)

## Part B, part C

Planned; checklists added when they're built.
