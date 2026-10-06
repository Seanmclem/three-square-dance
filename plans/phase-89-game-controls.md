# Phase 89 · One place for a game's controls

> Status: **PLANNED** (2026-10-06). Design page: "Game Controls Page" (claude.ai artifact).
> Follows Phase 88 (actions on a body part, aiming), which is started by scripts only.

User: "it should kind of be both, no? Like it could be scripted to trigger from a button
press? Right now we just have this game-input option for the action button from the main
screen. jump and move are like auto mapped somewhere else? we need to improve and
consolidate that" … "make it a page in that main menu on the right when nothing is
selected."

## 1. Today

- **GAME INPUT** (main menu, nothing selected): the interact key and gamepad button only,
  saved in game.json (`input.interact`), under any player rebind (`resolveGameBindings`).
- **Fixed in code** (`DEFAULT_BINDINGS`, `src/input/bindings.ts`): move (WASD, arrows, left
  stick), jump (Space; RB, A), run (Shift; stick past 85%), bag (I, Tab; Y), pause / confirm /
  menu keys. Players' own bindings live in localStorage with no editor UI.
- **Device feel** (mouse sensitivity, gamepad look rate / deadzone / invert, touch look speed,
  joystick size, "jump on left / right"): the spawn point's Controls page, per device.
- No buttons of your own; no script trigger for a button press.

## 2. Design (recommended; see the design page)

- **Controls** row on the main menu (with Lights and Audio), summary "WASD · Space · E ·
  Fire · Aim". It replaces the GAME INPUT block; the spawn point's Controls page links here.
- **Layout A, a tab per device** (KEYBOARD + MOUSE / GAMEPAD / TOUCH). Sections MOVING
  (move, look, jump, run), GAME (interact, bag, pause), YOUR BUTTONS, FEEL (this device
  only). Each binding is a key cap: click it and press the new key or button (Esc cancels),
  + adds another, an empty dashed cap means none on that device. A key used twice shows in
  amber ("E is also Interact").
- **Your buttons** (+ ADD BUTTON): a page each with NAME, KIND (PRESS / HOLD), keys per
  device (keyboard keys, left / right / middle mouse, gamepad buttons and triggers, an
  on-screen touch button), an optional built-in **what it does** (when pressed: play a move,
  once or while held; while held: aim), and the scripts that use it.
- **Touch tab**: a phone screen to drag the buttons (jump, bag, your buttons) to where thumbs
  go, each with size and on / off; replaces "jump on left / right".
- **Script trigger**: "when the player presses / releases <button>" (and "every N s while
  held"), for your buttons and the built-ins (jump, interact).
- **Saved in the game** (game.json `input`): the game's bindings for every action and your
  buttons. Device feel stays per device. A player's own rebind still wins (today's rule).
- **Mouse buttons**: the first click in Play captures the mouse as today; after that left /
  right click are buttons.

## 3. Data (sketch)

```ts
GameConfig.input = {
  bindings?: { kbm?: Partial<Record<Action, string[]>>; gamepad?: Partial<Record<Action, number[]>> };
  buttons?: Array<{ id: string; name: string; kind: "press" | "hold";
                   kbm: string[];            // KeyboardEvent.code or "Mouse0" / "Mouse2"
                   gamepad: number[];        // standard-mapping indices (RT 7, LT 6 …)
                   touch?: { x: number; y: number; size: number } | null;
                   does?: { playMove?: string; whileHeld?: boolean } | { aim: true } }>;
  touchLayout?: Record<string, { x: number; y: number; size: number; on: boolean }>;
  interact?: …   // today's field, read as a binding for "interact" (migrated)
};
TriggerType += "on_button"   // trigger.buttonId, trigger.buttonEdge: "press" | "release" | "held"
```

`ActionState` gains `buttons: Record<id, { down: boolean; pressed: boolean; released: boolean }>`
filled by each source; the controller handles "what it does"; the script engine fires
`on_button` from the same edges.

## 4. Order (each step verified)

1. Bindings from game.json for every built-in action (migrating `input.interact`), keyboard /
   mouse / gamepad sources reading them; regression recording SAME with default bindings.
2. Your buttons: sources report them, `on_button` trigger, built-in "what it does" (play a
   move, aim while held); harness: Fire (left click) plays shoot, Aim (right click) aims.
3. The Controls page (main menu row, tabs, key-cap capture, clashes, button pages, device
   feel moved here) and the Script panel's new trigger.
4. Touch arranger and on-screen buttons for your buttons.
5. Guide (a Controls page in the ? menu), architecture doc, test plan.

## 5. Out (later)

- Players rebinding keys in the game's pause menu (the same list, saved per device).
- Analog values in scripts (how far a trigger is pulled).

## 6. Questions (on the design page)

1. Layout A (a tab per device) or B (one list, all devices)?
2. A button's built-in "what it does" (play a move, aim while held), or scripts only?
3. Players rebinding in the pause menu: this phase or later?
4. New games: start with no buttons of your own, or with Fire and Aim ready?
