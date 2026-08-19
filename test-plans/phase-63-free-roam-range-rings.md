# Phase 63 — Free-roaming enemies + AI range rings (acceptance)

Verified 2026-08-19 on the platfrom-obby crab (`obj_e043c8bb`).

## Headless — `deno task test:ai` (41/41)

- [x] Free roam: detects far beyond the leash radius (fromPost 50, leash 12).
- [x] Free roam: chase survives any distance from post (fromPost 500).
- [x] Free roam: player lost → `idle` in place, `on_player_lost` fired,
      `move: none` — and never walks home on later ticks.
- [x] Free roam: re-detects from wherever it stopped.
- [x] Homebound (flag off): the same drag past the leash still breaks the
      chase into `return` — phase-61 behavior untouched.

## Browser — real UI path (editor tab, deterministic stepping)

- [x] Enemy AI screen shows **SHOW RANGES IN VIEWPORT** at the top and a
      **FREE ROAM** row; ticking FREE ROAM hides the LEASH RADIUS row and
      writes `ai.freeRoam: true`.
- [x] SHOW RANGES ticked → 4 color-coded circles render around the crab in
      the viewport (screenshot-verified visible over the platform): green
      detect / yellow give-up / red attack / blue leash, with matching
      legend dots appearing next to the field labels.
- [x] FREE ROAM ticked → the blue leash ring drops (4 → 3 rings).
- [x] Behavior contrast at leash 2: **free roam** chased to fromPost 3.77
      (state stayed `chase`), and on losing the player went `idle` with
      zero drift from the stop spot (no walk home). **Homebound** with the
      same leash capped at fromPost 2.03, entered `return`, and walked back.
- [x] Rings cleared on preview start / deselect (AiRangeRings listens for
      `preview:start` and the panel's cleanup emit).

## Scene hygiene

- [x] Crab's authored AI def restored exactly (no `freeRoam` key on disk).
- [x] Yesterday's `test_p62_ghost` repro platform removed via
      `__test.cleanup()` + Save; level structurally identical to HEAD
      (294 objects, 10 volumes, ids identical).
