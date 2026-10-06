/**
 * Per-scheme input bindings. A player/device preference, NOT world data — it
 * never enters the SceneFile. Persisted to localStorage and merged over
 * DEFAULT_BINDINGS on load so newly-added fields pick up their defaults.
 * Read once per preview session (ControlSchemeManager construction) — edits
 * apply the next time preview starts.
 */
export interface BindingsConfig {
  kbm: {
    // KeyboardEvent.code lists
    move: { forward: string[]; back: string[]; left: string[]; right: string[] };
    jump:     string[];
    run:      string[];        // held (Phase 71)
    interact: string[];
    confirm:  string[];        // dialogue advance / menu activate (menu mode only)
    cancel:   string[];        // pause-menu toggle (Esc keeps its direct-exit path in App.tsx)
    bag:      string[];        // inventory-bag toggle (Phase 32)
    menuNav:  { up: string[]; down: string[] };  // dialogue-option / menu highlight (menu mode only)
    lookSensitivity: number;   // rad per px of mouse movement
    invertLookY?: boolean;     // Phase 89: the game's / player's "invert mouse up / down"
  };
  gamepad: {
    // standard-mapping button indices
    buttons: Record<"jump" | "interact" | "confirm" | "cancel" | "bag", number[]> & { run?: number[] };
    lookRate: number;          // rad/s at full stick deflection
    deadzone: number;          // radial, 0..1
    invertLookY: boolean;
  };
  touch: {
    lookSensitivity: number;   // rad per px of drag
    joystickRadius: number;    // px
    layout: "right-jump" | "left-jump";
    /** Phase 89: where the on-screen buttons sit (% of the screen) and whether they show. */
    spots?: Record<string, { x: number; y: number; size: number; on: boolean }>;
  };
  /** Phase 89: the game's own buttons (Fire, Aim …) and what they do without a script. */
  buttons?: Array<{ id: string; name: string; kind: "press" | "hold"; kbm: string[]; gamepad: number[];
    does: { type: "move"; move: string } | { type: "aim" } | null }>;
}

export const DEFAULT_BINDINGS: BindingsConfig = {
  kbm: {
    move: {
      forward: ["KeyW", "ArrowUp"],
      back:    ["KeyS", "ArrowDown"],
      left:    ["KeyA", "ArrowLeft"],
      right:   ["KeyD", "ArrowRight"],
    },
    jump:     ["Space"],
    run:      ["ShiftLeft", "ShiftRight"],
    interact: ["KeyE"],
    confirm:  ["KeyE", "Space", "Enter"],   // the keys DialogueOverlay historically accepted
    // Enter is BOTH confirm and cancel: in menu mode confirm wins (the manager
    // drops the simultaneous cancel), outside it cancel opens the pause menu.
    cancel:   ["Enter"],
    bag:      ["KeyI", "Tab"],
    // Movement keys double as menu nav — harmless, since movement is zeroed
    // in menu mode and menuNav is ignored outside it.
    menuNav:  { up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"] },
    lookSensitivity: 0.002,    // matches the pre-phase-24 hardcode
  },
  gamepad: {
    buttons: {
      jump:     [5, 0],        // RB (bumpers per spec); A doubles as jump outside dialogue
      interact: [4],           // LB
      confirm:  [0],           // A — face-button confirm for dialogue
      cancel:   [9],           // Start — exit preview / close dialogue
      bag:      [3],           // Y — inventory-bag toggle
    },
    lookRate: 2.5,
    deadzone: 0.15,
    invertLookY: false,
  },
  touch: {
    lookSensitivity: 0.004,
    joystickRadius: 60,
    layout: "right-jump",
  },
};

const BINDINGS_KEY = "worldbuilder.bindings.v1";

/** Stored config merged over defaults — unknown/missing fields fall back cleanly. */
export function loadBindings(): BindingsConfig {
  const d = structuredClone(DEFAULT_BINDINGS);
  try {
    const raw = localStorage.getItem(BINDINGS_KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<BindingsConfig>;
    return {
      kbm:     { ...d.kbm,     ...s.kbm,     move:    { ...d.kbm.move,        ...s.kbm?.move },
                                             menuNav: { ...d.kbm.menuNav,     ...s.kbm?.menuNav } },
      gamepad: { ...d.gamepad, ...s.gamepad, buttons: { ...d.gamepad.buttons, ...s.gamepad?.buttons } },
      touch:   { ...d.touch,   ...s.touch },
    };
  } catch {
    return d;
  }
}

export function saveBindings(b: BindingsConfig): void {
  localStorage.setItem(BINDINGS_KEY, JSON.stringify(b));
}

export function resetBindings(): void {
  localStorage.removeItem(BINDINGS_KEY);
}

// ── Display names (v4.79.78) ───────────────────────────────────────────────────

const KEY_PRETTY: Record<string, string> = {
  Space: "Space", Enter: "Enter", Tab: "Tab", Escape: "Esc",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  ShiftLeft: "Shift", ShiftRight: "R Shift", ControlLeft: "Ctrl", ControlRight: "R Ctrl",
  AltLeft: "Alt", AltRight: "R Alt", Backquote: "`", Minus: "-", Equal: "=",
  Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Mouse0: "left click", Mouse1: "middle click", Mouse2: "right click", Mouse3: "mouse back", Mouse4: "mouse forward",
};
export function prettyKey(code: string): string {
  if (KEY_PRETTY[code]) return KEY_PRETTY[code];
  if (code.startsWith("Key"))   return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export const GAMEPAD_BUTTON_NAMES: Record<number, string> = {
  0: "A", 1: "B", 2: "X", 3: "Y", 4: "LB", 5: "RB", 6: "LT", 7: "RT",
  8: "Back", 9: "Start", 10: "LS", 11: "RS", 12: "DPad ↑", 13: "DPad ↓", 14: "DPad ←", 15: "DPad →",
};
export const gamepadButtonName = (i: number): string => GAMEPAD_BUTTON_NAMES[i] ?? `B${i}`;

/** The active scheme's display name for the effective interact control —
 *  resolve ONCE per scheme/binding change; cheap string, no per-frame work. */
export function interactDisplay(scheme: "kbm" | "gamepad" | "touch", b: BindingsConfig): string {
  if (scheme === "touch")   return "Tap";
  if (scheme === "gamepad") return gamepadButtonName(b.gamepad.buttons.interact[0] ?? 4);
  return prettyKey(b.kbm.interact[0] ?? "KeyE");
}
