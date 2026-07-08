# Phase 24b — Pause Menu — Test Plan

Verified 2026-07-08 during implementation (v4.16.0) via Chrome MCP,
deterministic manual-frame stepping (`pv._scene.offUpdate(pv._updateFn)` +
`input.update(1/60)` — see the phase-24 test plan's RAF/occlusion gotcha).
Re-run after changes to `PauseMenu.tsx`, the `action:cancel` branch in App,
the menu-mode block in `ControlSchemeManager`, or kbm `cancel` bindings.

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Enter during play (kbm) | PAUSED overlay opens; manager `_pauseOpen` true | ✅ |
| 2 | Hold W while paused | move stays zero (menu mode) | ✅ |
| 3 | Enter while paused | confirm wins over cancel → activates Resume; menu closes, preview continues | ✅ |
| 4 | Gamepad Start | opens the menu (no longer instant-exits) | ✅ |
| 5 | D-pad down | highlight moves to Exit (`menu:nav`) | ✅ |
| 6 | Gamepad A on Exit | exits preview, menu gone | ✅ |
| 7 | Dialogue open + Enter | advances the dialogue; pause NEVER opens behind it (cancel dropped when confirm fires) | ✅ |
| 8 | Enter on last dialogue line | closes dialogue; still no pause menu | ✅ |
| 9 | Touch scheme: ⚙ button (replaces ✕) | visible; tap opens the pause menu | ✅ |
| 10 | Esc while paused | exits preview entirely (App path unchanged); pause state cleared on `preview:stop` | ✅ |
| 11 | Screenshot | dimmed backdrop, PAUSED title, Resume highlighted, HUD hint "Enter · menu Esc · exit" | ✅ |

Known/intentional:
- The world keeps simulating while paused (same as dialogues) — real
  time-freeze is future work (runtime shell).
- Pointer lock releases on pause open; re-lock on close is best-effort
  (user-activation dependent) with the canvas-mousedown fallback. Not
  automatable — part of the real-hardware checklist below.

Manual (real hardware, with the phase-24 checklist):
- [ ] kbm: pause → mouse visibly freed → click Resume → lock re-acquired
      (or after one canvas click)
- [ ] Touch device: ⚙ reachable under the notch/home-bar insets; backdrop
      tap resumes
