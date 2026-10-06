# Test plan · Phase 89 · One place for a game's controls (v4.120.0)

Throwaway harness only (`deno run -A scripts/test-harness.ts platfrom-obby level_3 <port>`).

## Regression

- [x] `scripts/regression/character-anim.mjs`: SAME on every frame (player + crab) after the
      input changes (default bindings; real keys).

## Runtime (fixed bindings injected, real keys)

- [x] Fire (F, plays shoot on the upper body): action plays, an `on_button` press script counts.
- [x] Hold G (Aim): aiming; a "held" script repeats every 0.2 s; release stops aiming, the
      repeats stop and the release script runs.
- [x] The game's Jump = J jumps; Space no longer does.
- [x] A tap shorter than a frame still presses a game button.

## Editor (all passed headless, 3 runs)

- [x] Main menu: Controls row "WASD · Space · E"; opens the compact list.
- [x] Jump's Space chip opens EDIT on the keyboard tab; changing it to J writes
      `input.bindings.kbm.jump = ["KeyJ"]` to game.json.
- [x] Adding E to Jump shows "E is also Interact"; REMOVE takes it off.
- [x] Gamepad tab: Interact's chip opens the controller picker (no "press a button"); X / □
      saves `input.bindings.gamepad.interact = [2]`.
- [x] + ADD BUTTON "Fire" with K and "play a move"; PLACE… → + puts it on screen; dragged to
      60 % / 30 %.
- [x] Mouse speed 0.003 saved as `input.feel.mouseSpeed`.
- [x] Compact list shows J and the new button.
- [x] In game: J jumps, K presses Fire; pause menu CONTROLS: Jump → L (shown amber), L jumps
      after Resume.

## Prototype

- [x] `plans/mockups/controls-prototype.html`: 39 checks (compact, chips, tabs, capture,
      REMOVE, picker, touch list and arranger, button pages, tester, player pause menu).

## By hand

- [ ] A real gamepad (Xbox and PlayStation): Fire on RT / R2, Aim on LT / L2.
- [ ] Mouse buttons in Play after the first click captures the mouse.
- [ ] A phone or tablet: the arranged buttons, Fire on screen.
- [ ] A new game starts with Fire and Aim.
