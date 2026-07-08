# Phase 24 — Controller & Touchscreen Support — Test Plan

Verified 2026-07-08 during implementation (v4.15.0) via Chrome MCP against the
running app (real DOM events, stubbed `navigator.getGamepads`, deterministic
manual-frame stepping for one-frame edges). Re-run after changes to
`src/input/*`, `CharacterController`, `PreviewController`, `PreviewHUD`,
`TouchControlsOverlay`, or `DialogueOverlay`.

**Remote-testing gotchas hit this phase:**
- **RAF freezes whenever the Chrome window is occluded/backgrounded** — every
  timing-based assertion silently reads zero. Take a screenshot (surfaces the
  window) immediately before live-loop tests, or bypass RAF entirely:
  `pv._scene.offUpdate(pv._updateFn)` then drive `input.update(1/60)` manually
  (required anyway for one-frame edge flags). Check the FPS counter when
  results look impossible.
- Don't probe the dialogue by `zIndex === "100"` — the Select-variant popover
  is also z-100. Match on content (`textContent.startsWith("▶")`).
- `gamepaddisconnected` sets `_padCount` 0 and a stubbed pad never re-fires
  `gamepadconnected` on its own — re-dispatch the event after re-stubbing.
- **Editing source while a preview session is live** makes Vite HMR dispose the
  Rapier body under the still-registered old `updateFn` → one
  `computedGrounded` TypeError, which **kills `SceneManager._loop`** (it
  re-arms RAF after the callbacks, so any thrown callback ends the loop until
  reload). Dev-only — the real exit() path unregisters before disposing. Exit
  preview before editing source, and suspect a dead loop (FPS counter frozen)
  whenever timing assertions read zero.

## Step 1 — kbm extraction (no behavior change)

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | clean | ✅ |
| 2 | Hold W 0.6s (document keydown) | ~3.6m at moveSpeed 6 | ✅ 3.55 |
| 3 | mousemove 200px | yaw −0.400 (0.002 rad/px) | ✅ exact |
| 4 | wheel deltaY 300 | third-person dist +1.50 (0.005/Δ) | ✅ exact |
| 5 | Space on platform | grounded→rise→land→grounded | ✅ |
| 6 | E near interactable | `character:interact-range` + `character:interact` | ✅ |
| 7 | Esc | clean exit, `_input`/`_controller` nulled, no ghost listeners | ✅ |
| 8 | Console | only pre-existing pointer-lock automation noise (phase-13 known) | ✅ |

## Step 2 — GamepadSource (stubbed `navigator.getGamepads`)

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Left stick (0,−1) | move {0, 1} | ✅ |
| 2 | Stick len 0.099 (< 0.15 deadzone) | move {0, 0} | ✅ |
| 3 | Half stick −0.5 | move.y = (0.5−0.15)/0.85 = 0.4118; walks 1.47m/0.6s | ✅ exact |
| 4 | RB (5) held | jump true while held | ✅ |
| 5 | LB (4) press-and-hold | interactPressed one frame only | ✅ |
| 6 | D-pad down held | menuNav 1 one frame only | ✅ |
| 7 | Start (9) | cancelPressed edge | ✅ |
| 8 | Right stick x=1 for 1/60s | look.x = 2.5/60 = 0.0417 | ✅ exact |
| 9 | Disconnect mid-hold | movement zeroed immediately | ✅ |

## Step 3 — Touch (dispatched `pointerType:"touch"` PointerEvents)

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | `maxTouchPoints` spoof + enter preview | scheme "touch", overlay mounts, NO pointer lock (no WrongDocumentError) | ✅ |
| 2 | Joystick down (left 40%) + 60px up | move {0,1}; walks 3.55m/0.6s | ✅ |
| 3 | 30px up (half radius) | move {0, 0.5}; walks 1.22m/0.4s | ✅ |
| 4 | Two-thumb: joystick + right-side drag | walk + yaw simultaneously (per-pointerId) | ✅ |
| 5 | Release joystick | move zeroed, knob resets | ✅ |
| 6 | Tap (≤5px/250ms) on look region | interactPressed one frame; drag never interacts | ✅ |
| 7 | JUMP button hold/release | jump held-level | ✅ |
| 8 | ✕ button | cancelPressed edge | ✅ |

Regression found & fixed here: joystick origin must live in a **ref**, not
only React state — a pointermove arriving before the re-render saw null and
dropped the move.

## Step 4 — scheme switching + dialogue/exit wiring

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | First-run guess (no localStorage) | kbm on desktop | ✅ |
| 2 | Fake pad button | → gamepad; key → kbm; touch pointerdown → touch | ✅ all |
| 3 | Events + persistence | `input:scheme-changed` per flip; `worldbuilder.lastScheme` written | ✅ |
| 4 | Overlay mounts on flip to touch mid-session | yes | ✅ |
| 5 | Dialogue open: hold W | zero movement (menu mode) | ✅ |
| 6 | Gamepad A | advance line 1→2 (visually confirmed 2/2); A on last line closes; menuMode false after | ✅ |
| 7 | Start with dialogue open | closes dialogue, preview stays active | ✅ |
| 8 | Start with no dialogue | exits preview | ✅ |
| 9 | kbm E / Enter with dialogue open | advance / close via action:confirm (overlay's own keydown removed) | ✅ |

## Step 5 — bindings persistence + Controls UI

| # | Check | Expected | Status |
|---|---|---|---|
| 1 | Save lookSensitivity 0.01, enter preview | 100px mousemove → yaw exactly −1.000 | ✅ |
| 2 | `__bindings.reset()` | defaults restored (0.002) | ✅ |
| 3 | Partial + garbage localStorage JSON | merges over defaults (sens 0.005, jump ["Space"], dz 0.15) | ✅ |
| 4 | Spawn selected → panel | CONTROLS (THIS DEVICE) section renders all fields + reset | ✅ |

## Manual checklist — real hardware (not yet run)

- [ ] Physical gamepad: connect, play (sticks/bumpers/Start), unplug mid-walk
      (must stop), reconnect (must resume after a button press)
- [ ] Real touch device (iPad/phone): joystick feel, two-thumb play, safe-area
      button placement, no browser scroll/zoom during play, ✕ exits
- [ ] Pointer-lock round-trip on desktop: play kbm → press gamepad button
      (lock releases) → click canvas (lock re-acquires)
- [ ] Editor regression smoke: tools, camera orbit, undo — `src/input/` is
      preview-only and must not affect the editor
