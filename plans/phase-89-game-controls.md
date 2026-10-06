# Phase 89 · One place for a game's controls

> Status: **PLANNED** (2026-10-06). Design page: "Game Controls Page" (claude.ai artifact).
> Working prototype: `plans/mockups/controls-prototype.html` (open it in a browser).
> Follows Phase 88 (actions on a body part, aiming), which is started by scripts only.

## Decided so far (2026-10-06, user)

- **Layout A** (a tab per device) for editing, opened from a **compact read-only view in
  layout B's shape** (every action, every device, one list) with an **EDIT** button; the
  compact view has no + ADD BUTTON.
- **Feel is saved in the game** as its defaults (mouse speed, invert, gamepad look speed,
  deadzone, invert, touch look speed, joystick size): "it should be saved to game, no? like
  as a default. then players can edit that in menu." Players' own changes (keys and feel)
  live on their device and win, when the game allows it ("Players can change keys and feel
  in the pause menu", on by default).
- **Gamepad buttons by both names**: Xbox and PlayStation pads report the same buttons, so
  each gamepad binding shows its Xbox name with a green outline and its PlayStation name with
  a blue outline (RB / R1, A / ✕, Start / Options); sticks, the same on both, get one chip
  outlined half green, half blue. Touch chips are outlined and named by the button (jump,
  bag, fire, exit), with no "btn" suffix.

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
  (move, look, jump, run), GAME (interact, bag, pause), YOUR BUTTONS, FEEL (the game's
  defaults). Each binding is a key cap: click it and press the new key or button (Esc cancels),
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
- **Saved in the game** (game.json `input`): the game's bindings for every action, your
  buttons, and the feel defaults. A player's own keys and feel (pause menu, per device) win
  over them when "Players can change" is on (today's rule for interact, now for everything).
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
  feel?: { mouseSpeed?: number; mouseInvertY?: boolean; padLookRate?: number; padDeadzone?: number;
           padInvertY?: boolean; touchLook?: number; joystick?: number };
  playersCanChange?: boolean;   // default true
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

## 5. Edge cases the prototype covers (and the build must)

- Click a key cap and press the new key; Delete / Backspace removes it; Esc or a click
  anywhere else cancels; Esc itself can't be bound (it leaves Play).
- Mouse buttons bind only in the "click here with the mouse button" box, so clicking away
  never binds left click by accident; left click notes that the first click in Play captures
  the mouse.
- A key used by two actions shows amber with "E is also Interact" (allowed: both fire).
- Gamepad: press a button on a connected pad, or pick from the list (no pad needed).
- An action stays held while any of its keys is down (Shift + R Shift; F + left click).
- PRESS vs HOLD: a hold button's move plays from press to release; aim needs HOLD.
- Deleting a button: confirm; scripts that used it show "its button was deleted".
- Players' own keys win only when allowed; the pause menu shows "yours (game: …)".
- Window losing focus releases everything held.

## 6. Out (later)

- Players rebinding gamepad buttons in the pause menu (keyboard keys and feel are in this
  phase: the pause menu's Controls list, as in the prototype).
- Analog values in scripts (how far a trigger is pulled).

## 7. Still open

1. A button's built-in "what it does" (play a move, aim while held), or scripts only? (The
   prototype has it.)
2. New games: start with no buttons of your own, or with Fire and Aim ready?
