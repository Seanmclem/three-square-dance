# Phase 24 — Controller & Touchscreen Support (ControlSchemeManager)

> Status: **PLANNED** — not yet implemented.
> Target version: v4.12.0. Phase number assumes nothing lands between this and
> phase 23 (face/vertex sub-object editing, v4.11.0, in progress); renumber if
> needed. (Originally drafted as phase 20 / v4.7.0; renumbered twice — decals
> and shapes took 20–22, face/vertex editing took 23.)

Gamepad and touchscreen support for **preview/game mode**, built around a
`ControlSchemeManager` that abstracts raw input into named game actions so the
same gameplay works across keyboard/mouse, gamepad, and touch. Bindings are
configurable per scheme; the active scheme auto-switches based on whichever
input device the player last used.

---

## 1. Scope & assumptions

**In scope**

- Preview/game mode only: movement, camera look, jump, interact, zoom,
  exit/pause, and dialogue advance.
- Three schemes: `kbm` (keyboard+mouse), `gamepad`, `touch`.
- Auto-detection + live switching between schemes.
- Scheme-aware HUD prompts (`[E] Interact` → `[LB] Interact` → tap hint).
- Configurable bindings (data model + persistence; minimal UI — see §8).

**Out of scope (explicitly)**

- The **editor** stays keyboard/mouse. `src/core/InputManager.ts`,
  `EditorCamera`, and all tools are untouched. Touch-editing (orbit/pinch in
  the editor viewport) is a separate future phase.
- **No R3F / ecctrl integration.** ecctrl is a pattern reference only (§3).
- No haptics/rumble, no multiple simultaneous players, no remapping of
  *editor* hotkeys.

**Assumption to confirm during implementation:** preview is currently entered
from the editor UI (Toolbar buttons + `P` key). On a pure touch device the
editor itself is not really usable yet — that's fine; the goal is that a world
opened on / mirrored to a touch device is *playable*, and that desktop testing
with Chrome touch emulation works.

---

## 2. Current state (what this phase changes)

| Where | Today | Problem |
|---|---|---|
| `src/preview/CharacterController.ts` | Owns its own `document` listeners: `keydown`/`keyup` into a `Set<string>` (`update()` checks `KeyW`… literally, `CharacterController.ts:153-156`), `mousemove` → yaw/pitch (`:98-102`), `wheel` → zoom, `KeyE` keydown → `character:interact` emit (`:108`). | Input is hardwired to one device and to specific key codes. This is the code the manager replaces. |
| `src/preview/PreviewController.ts` | Creates the controller, calls `requestPointerLock()` unconditionally on enter (`:70`). | Pointer lock is wrong for touch (unsupported) and unnecessary for gamepad. |
| `src/ui/PreviewHUD.tsx` | Hardcodes `[E] {label}` (`:67`) and `Esc · exit` (`:89`). | Prompts must follow the active scheme. |
| `src/ui/DialogueOverlay.tsx` | Own `window` keydown listener for E/Space/Enter (`:39-49`); click also advances. | Needs a gamepad path (confirm button) — keyboard/tap already work. |
| `src/App.tsx` | `Escape` keydown exits preview (`:916`). | Needs gamepad (Start) and touch (on-screen button) equivalents. |
| `src/core/InputManager.ts` | Editor-only DOM → bus event fan-out. | **Unchanged.** ControlSchemeManager is its preview-mode sibling, not a replacement. Reuse its patterns: typed bus events, `_suppress` on `overlay:fade-in/out`, drag-vs-click threshold. |

---

## 3. Reference takeaways (ecctrl, three.js #33095)

- **ecctrl**: the load-bearing idea is that input sources never touch the
  controller — they write into shared stores (`useJoystickStore`,
  `useButtonStore`), and the character controller consumes a structured
  movement object each frame. Its virtual joystick and buttons are *plain DOM
  overlays*, deliberately replaceable. We adopt: (a) a per-frame **action
  state** struct as the single seam between devices and the character, (b)
  the joystick/buttons as a React DOM overlay, not scene objects.
- **three.js issue #33095**: closed as "not planned"; it's a request to adopt
  a third-party player controller and contains no input-abstraction design
  worth borrowing. Nothing to adopt beyond confirming the feature list
  (walk/sprint/jump/camera modes) matches what we already have.
- We stay vanilla Three.js + our EventBus/module conventions
  (`init/update/dispose`, no per-frame allocation — see the scratch-vector
  pattern at `CharacterController.ts:41-47`).

---

## 4. Design — action vocabulary

One struct, rewritten every frame by the active source(s), read by
`CharacterController.update()`. Analog-first: keyboard fills ±1, sticks fill
the range, the joystick fills magnitude (walk speed can scale by magnitude —
free analog walk on stick/joystick, unchanged full-speed on keys).

```ts
// src/input/actions.ts
export interface ActionState {
  move:     { x: number; y: number };  // unit-clamped; y=+1 forward, x=+1 right (camera-relative applied later)
  look:     { x: number; y: number };  // this-frame delta, radians (already rate*dt for sticks; raw mouse delta * sens for kbm)
  zoomDelta: number;                   // third-person distance delta this frame
  jump:      boolean;                  // held (edge-detection stays in CharacterController — _jumpArmed already does this)
  interactPressed: boolean;            // edge, consumed once per frame
  confirmPressed:  boolean;            // dialogue advance (gamepad A / bottom face button)
  cancelPressed:   boolean;            // pause/exit (gamepad Start, touch ✕ button; Esc keeps its App.tsx path)
  menuNav:   -1 | 0 | 1;               // d-pad up/down edge, for future menu/choice UIs
}
export type ControlScheme = "kbm" | "gamepad" | "touch";
```

Notes:

- `look` is a **delta**, which unifies mouse (`movementX * sensitivity`),
  right stick (`axis * rateRadPerSec * dt`), and touch drag
  (`px moved * sensitivity`). CharacterController just does
  `yaw -= look.x; pitch -= look.y` + the existing ±80° clamp.
- `jump` stays level-triggered because `_jumpArmed`
  (`CharacterController.ts:54-55`) already implements edge behavior; don't
  duplicate it.
- Edge flags (`*Pressed`) are set by sources and cleared by the manager at the
  end of each frame — sources may fire from DOM events between frames, so they
  latch until the next `update()` consumes them.

---

## 5. Design — ControlSchemeManager & sources

New folder `src/input/` (preview-mode input; `src/core/InputManager.ts` stays
editor-only):

```
src/input/
  actions.ts               // ActionState, ControlScheme, action ids
  bindings.ts              // BindingsConfig types, DEFAULT_BINDINGS, load/save (localStorage)
  ControlSchemeManager.ts  // owns sources, active scheme, per-frame merge, scheme auto-switch
  KeyboardMouseSource.ts   // extracted from CharacterController's current listeners
  GamepadSource.ts         // navigator.getGamepads() polling
  TouchSource.ts           // state written by the React overlay + canvas touch listeners
src/ui/
  TouchControlsOverlay.tsx // virtual joystick + jump/exit buttons (DOM overlay, ecctrl-style)
```

### ControlSchemeManager

```ts
class ControlSchemeManager {                 // implements the module lifecycle (init/update/dispose)
  readonly state: ActionState;               // stable object identity — controller holds a reference
  get activeScheme(): ControlScheme;

  constructor(dom: HTMLCanvasElement, bus: EventBus, bindings: BindingsConfig);
  init(): void;      // sources attach listeners; initial scheme guess (§7)
  update(dt: number): void;  // poll gamepad, merge source states into `state`, clear edges, detect scheme switch
  dispose(): void;   // detach everything, zero the state
}
```

- Lives **per preview session**: created in `PreviewController.enter()`,
  disposed in `exit()`. It does not exist in editor mode, so there is zero
  risk of fighting the editor's InputManager.
- `update(dt)` runs **before** `CharacterController.update(dt)` in the same
  `updateFn` (`PreviewController.ts:61-64`).
- **Merge rule:** all sources are always live; the *active scheme* is only a
  label for UI + pointer-lock policy. Movement/look/etc. take whichever source
  has non-zero input this frame (last-writer-wins is fine — real players don't
  use two devices at once; this avoids "my controller is connected so my
  keyboard stopped working").
- **Suppression:** subscribe to `overlay:fade-in`/`overlay:fade-out` like
  InputManager (`InputManager.ts:68-71`) and zero the state while suppressed,
  so zone transitions still freeze the player.
- Emits `input:scheme-changed { scheme }` on the bus when the label flips
  (drives HUD prompts + overlay visibility). New row in the EventBus table.

### KeyboardMouseSource (refactor, not new behavior)

Move `CharacterController`'s listeners (`:98-113`, `:142-145`) here verbatim:

- `keydown/keyup` → per-binding action flags (default `KeyW/A/S/D` + arrows →
  move, `Space` → jump, `KeyE` → interactPressed + confirmPressed,
  wheel → zoomDelta, mouse `movementX/Y` → look delta).
- Keep the typing-target guard pattern (`InputManager._isTypingTarget`) so a
  focused input field never drives the character.
- `KeyE → character:interact` emission moves out of the source: the source
  only sets `interactPressed`; **CharacterController** emits
  `character:interact` when `interactPressed && _interactTargetId` (same
  behavior, one code path for all three schemes).

### GamepadSource

The Gamepad API is poll-only, so this source does its work inside
`update(dt)`, not via listeners:

- `window.addEventListener("gamepadconnected"/"gamepaddisconnected")` only to
  know a pad exists (and to clear state on disconnect mid-session — otherwise
  a held stick keeps the character walking forever).
- Each frame: `navigator.getGamepads()`, take the first non-null pad with
  `mapping === "standard"` (fallback: first non-null).
- **Default bindings** (standard mapping indices):
  - Left stick (`axes[0..1]`) → move; right stick (`axes[2..3]`) → look at
    `lookRateRadPerSec * dt` (default ~2.5 rad/s, negative Y optional flag).
  - **Bumpers per spec: `LB (4)` → interact, `RB (5)` → jump.** Also map
    `A (0)` → confirm (dialogue advance) since face-button-confirm is the
    universal convention; `A` additionally acts as jump when no dialogue is
    open — cheap to include via bindings, drop if it feels redundant.
  - D-pad (`buttons[12..15]`) → `menuNav` (up/down) — today only dialogue
    exists, so d-pad does nothing visible yet beyond being wired; it future-
    proofs choice menus.
  - `Start (9)` → cancelPressed (exit preview / close dialogue).
  - Triggers (`buttons[6..7]`) → zoomDelta (LT out, RT in) — stretch, optional.
- **Deadzone:** radial on each stick (`length < 0.15 → 0`), then rescale the
  remaining range to 0..1 so there's no dead ramp; per-axis deadzone causes
  diagonal drift, don't use it. Buttons: `pressed` flag with our own
  previous-frame diff for edges.

### TouchSource + TouchControlsOverlay

Per spec: **virtual joystick for movement, swipe for camera look, tap for
interact.** Plus two things the spec implies but doesn't name: a jump button
(jump is a core action with no touch gesture left for it) and an exit (✕)
button (there is no Esc on touch).

- `TouchControlsOverlay.tsx` is a React DOM overlay mounted next to
  `PreviewHUD` in `App.tsx`, visible only while `preview` is active **and**
  the active scheme is `touch`. `pointer-events: auto` only on its widgets;
  everything else passes through. `touch-action: none` on its root and on the
  widgets (the canvas gets it too during preview) so the browser never scrolls
  or pinch-zooms the page mid-play.
- **Virtual joystick** (bottom-left quadrant): a base circle + thumb knob,
  driven by Pointer Events. Spawn-at-touch ("floating" joystick) within the
  left 40% of the screen — more forgiving than a fixed base. Output = clamped
  offset / radius → `move` (analog, so walk speed scales naturally). Knob
  re-centers on release.
- **Look = drag on the remaining screen area** (anything not claimed by a
  widget, right ~60%): pointer delta * touchLookSensitivity → `look` delta.
  Multi-touch safe: track pointers by `pointerId`, so joystick thumb + look
  thumb work simultaneously (the actual two-thumb play pattern).
- **Tap = interact**: on the look region, if a pointer goes down→up within
  ~250 ms and moves ≤ the drag threshold (reuse the 5 px `_DRAG_THRESHOLD`
  idea from `InputManager.ts:28`), set `interactPressed` + `confirmPressed`.
  A drag past the threshold is look, never interact.
- **Jump button** bottom-right; **✕ exit** top-right → `cancelPressed`.
- The overlay writes into `TouchSource` via a plain shared object (the
  ecctrl store pattern) — no bus round-trip per pointer-move. React renders
  the widgets; the per-frame consumption stays in the Three.js world.
- **Pinch** on the look region → `zoomDelta` (third-person only) — stretch,
  same bucket as triggers-zoom.

### CharacterController changes

- Constructor takes the manager (or just its `state` + a
  `consumeInteract()` helper); delete `_onMouseMove/_onKeyDown/_onKeyUp/_onWheel`
  and the `_keys` Set.
- `update(dt)`: `dir` from `state.move` (already analog — multiply by
  `speed * dt`), `yaw/pitch` from `state.look`, `_desiredDist` from
  `state.zoomDelta`, `jumpHeld = state.jump`, and emit `character:interact`
  on `interactPressed` when a target is in range.
- Everything else (spring arm, animation state machine, interact cache,
  teleport handlers) untouched.

### PreviewController changes

- Create manager before the controller, pass it in; add `scheme.update(dt)`
  first in `updateFn`; dispose it in `exit()`.
- Pointer lock: request only when `activeScheme === "kbm"`; also listen for
  scheme changes mid-session (kbm→touch: `exitPointerLock`; →kbm on click:
  re-request — pointer lock requires a user gesture, so re-acquire inside the
  canvas click handler, which is exactly how it works today via the enter
  click).

### DialogueOverlay / exit wiring

- `App.tsx` (which owns dialogue state and the Escape handler) additionally
  subscribes to two new bus events emitted by the manager:
  `action:confirm` (advance dialogue if open) and `action:cancel` (close
  dialogue if open, else exit preview). DialogueOverlay itself keeps its
  keyboard listener and onClick — no regression, gamepad/touch get parity via
  the bus path.
- While a dialogue is open the manager sets a `menuMode` flag: movement/look/
  jump are zeroed (player shouldn't walk during dialogue — matches how it
  already feels with pointer lock, and prevents A-button double-firing
  jump+confirm). Confirm/cancel/menuNav stay live.

---

## 6. Configurable bindings

```ts
// src/input/bindings.ts
export interface BindingsConfig {
  kbm: {
    move: { forward: string[]; back: string[]; left: string[]; right: string[] }; // KeyboardEvent.code lists
    jump: string[]; interact: string[];
    lookSensitivity: number;              // default 0.002 (current hardcode, CharacterController.ts:99)
  };
  gamepad: {
    buttons: Record<"jump" | "interact" | "confirm" | "cancel", number[]>; // standard-mapping indices
    lookRate: number; deadzone: number; invertLookY: boolean;
  };
  touch: {
    lookSensitivity: number; joystickRadius: number;
    layout: "right-jump" | "left-jump";   // mirrored layout for left-handed players
  };
}
export const DEFAULT_BINDINGS: BindingsConfig = { /* defaults per §5 */ };
```

- Persisted to `localStorage` under `worldbuilder.bindings.v1`, merged over
  `DEFAULT_BINDINGS` on load (so new fields get defaults). This is a
  **player/device preference, not world data** — it does not go into the
  SceneFile / `PlayerSettings`.
- **UI (minimal, this phase):** a "Controls" section in the existing player
  settings area exposing the numeric knobs (sensitivities, deadzone, invert Y,
  touch layout). Full key-rebinding UI (press-a-key capture) is deliberately
  deferred — the data model supports it, the UI is a later phase. Bindings
  are still fully configurable by editing them via a dev global
  (`window.__bindings`) in the meantime.

---

## 7. Scheme auto-detection & switching

- **Initial guess** on `enter()`: last-used scheme from
  `localStorage (worldbuilder.lastScheme)`; if none —
  `matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0`
  → `touch`, else if a gamepad is already connected → `gamepad`, else `kbm`.
  (The touch check must win over gamepad on tablets with a paired pad? No —
  last-used wins on revisit; first-run on a tablet defaults to touch, which is
  the safe guess since touch always exists there.)
- **Live switching — last input wins:**
  - key press or mouse-move-while-locked / canvas click → `kbm`
  - any gamepad button `pressed` or stick past deadzone → `gamepad`
  - any `pointerdown` with `pointerType === "touch"` → `touch`
- Switching only changes the **label** (HUD prompts, overlay visibility,
  pointer-lock policy); all sources stay live (§5 merge rule). Debounce: a
  scheme must present an actual actuation (not noise) — deadzone already
  handles stick drift, which is the classic false-switch bug.
- Persist the label to `localStorage` on change.

---

## 8. HUD & UI changes

- `PreviewHUD.tsx`: subscribe to `input:scheme-changed`; render the interact
  prompt as `[E]` / `[LB]` / `Tap` (derive the kbm/gamepad glyph from the
  bindings config, don't hardcode a second time) and the exit hint as
  `Esc · exit` / `Start · exit` / (hidden — the ✕ button exists). Crosshair:
  keep for kbm/gamepad; hide on touch (no pointer lock; a fixed center
  crosshair is meaningless when look is drag-based… actually the interact
  cone is player-forward, not camera-center, so the crosshair is cosmetic —
  keep it everywhere first pass, revisit).
- `TouchControlsOverlay.tsx`: as in §5. Respect `env(safe-area-inset-*)`
  padding so buttons clear iOS home-bar/notch regions.
- `index.html`: verify the viewport meta has
  `width=device-width, initial-scale=1, viewport-fit=cover` (add
  `viewport-fit=cover` for safe-area vars if missing).

---

## 9. Events & types (EventBus table additions)

| Event | Direction | Payload |
|---|---|---|
| `input:scheme-changed` | ControlSchemeManager → React | `{ scheme: ControlScheme }` |
| `action:confirm` | ControlSchemeManager → App | `{}` (gamepad A / touch tap while dialogue open) |
| `action:cancel` | ControlSchemeManager → App | `{}` (Start / ✕ — close dialogue or exit preview) |

`character:interact` / `character:interact-range` are unchanged.

---

## 10. Edge cases to handle (checklist)

- [ ] Gamepad disconnect mid-play → zero its contribution immediately (no
      ghost-walking); HUD falls back to kbm prompts on next input.
- [ ] Stick drift below deadzone must not flip the active scheme (§7).
- [ ] `overlay:fade-in` suppression zeroes all actions (zone transitions).
- [ ] Typing-target guard (E in a focused input must not interact).
- [ ] Multi-touch: joystick pointer and look pointer tracked independently by
      `pointerId`; a third touch (jump button) doesn't steal either.
- [ ] Tap-vs-swipe threshold: 5 px / 250 ms; a swipe never fires interact.
- [ ] Pointer lock re-entry after touch→kbm switch requires a user gesture —
      re-request on next canvas mousedown only.
- [ ] `Escape` in App.tsx and pointer-lock loss (browser-forced) still exit
      cleanly — manager disposal must be idempotent with `exit()`.
- [ ] No per-frame allocation in `ControlSchemeManager.update()` or sources
      (match the scratch-object discipline in CharacterController).
- [ ] React StrictMode double-mount of TouchControlsOverlay must not
      double-register pointer handlers on the shared TouchSource.
- [ ] `navigator.getGamepads()` returns snapshot objects in Chrome — re-read
      every frame, never cache the pad object across frames.

---

## 11. Implementation order (each step → verify)

1. **Extract, no behavior change:** `actions.ts` + `ControlSchemeManager` +
   `KeyboardMouseSource`; rewire `CharacterController`/`PreviewController`.
   → verify: `npx tsc --noEmit`; preview plays identically (WASD/mouse/jump/
   E-interact/wheel-zoom/Esc) via the Chrome-extension pass from TESTING.md.
2. **GamepadSource** + deadzone + bindings defaults + disconnect handling.
   → verify: real pad if available; otherwise the fake-source harness (§12)
   driving `state` asserts movement/jump/interact/exit paths.
3. **TouchSource + TouchControlsOverlay** + pointer-lock policy + canvas
   `touch-action`. → verify: Chrome DevTools device emulation (touch
   pointer events) — joystick walks, drag looks, tap interacts, ✕ exits.
4. **Scheme auto-switch + HUD prompts + dialogue/exit bus wiring.**
   → verify: switch mid-session kbm↔touch (emulation) and kbm↔gamepad;
   prompt text follows; dialogue advances from each scheme.
5. **Bindings persistence + Controls settings section + `window.__bindings`.**
   → verify: change sensitivity, reload, sticks.
6. **Docs & tests:** update `WORLD_EDITOR_ARCHITECTURE.md` **per
   `PLAN_UPDATE_GUIDE.md` — both the new Phase 24 section and the file-level
   sections** for CharacterController, PreviewController, PreviewHUD,
   DialogueOverlay, EventBus table, plus a new `src/input/` section; bump
   version + changelog. Write `test-plans/phase-24-control-scheme-manager.md`
   and add a HUMAN_TESTING.md walkthrough. Commit straight to main (project
   convention — no branch).

---

## 12. Testing strategy

- **Automated-ish (Chrome extension MCP, per TESTING.md):** expose the
  manager on the test globals (`window.__scheme`) and add a
  `window.__test.fakeInput(partial: Partial<ActionState>)` helper that
  injects a synthetic source for N frames — this makes gamepad paths testable
  with no physical pad (DevTools has no gamepad emulator) and gives
  deterministic movement assertions (read body position via existing test
  globals). Keep snapshot dumps chunked ≤ ~1 KB per the testing memory note.
- **Touch:** DevTools device-mode emits real `pointertype: touch` Pointer
  Events — good enough for joystick/drag/tap logic. Real-device (iPad) pass is
  a manual checklist item, not a blocker.
- **Gamepad:** manual checklist with a real controller (connect, play, unplug
  mid-walk, reconnect). Document in the phase test plan.
- **Regression:** editor input untouched — run one editor smoke pass (tool
  clicks, camera orbit, undo) to prove `src/input/` never loads outside
  preview.

## 13. Open questions (non-blocking, defaults chosen)

1. `A` button = jump **and** confirm (context-split by dialogue-open) vs
   bumpers-only per spec — shipped as bindings defaults, trivially removable.
2. Analog move magnitude scaling walk speed (chosen: yes) vs binary — if the
   walk animation looks wrong at low speeds, clamp magnitude to {0,1} and
   revisit with a blended walk/run later.
3. Crosshair on touch: kept for now (cosmetic), hide if it confuses testers.
