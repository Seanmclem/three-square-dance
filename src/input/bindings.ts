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
    interact: string[];
    confirm:  string[];        // dialogue advance (menu mode only)
    lookSensitivity: number;   // rad per px of mouse movement
  };
  gamepad: {
    // standard-mapping button indices
    buttons: Record<"jump" | "interact" | "confirm" | "cancel", number[]>;
    lookRate: number;          // rad/s at full stick deflection
    deadzone: number;          // radial, 0..1
    invertLookY: boolean;
  };
  touch: {
    lookSensitivity: number;   // rad per px of drag
    joystickRadius: number;    // px
    layout: "right-jump" | "left-jump";
  };
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
    interact: ["KeyE"],
    confirm:  ["KeyE", "Space", "Enter"],   // the keys DialogueOverlay historically accepted
    lookSensitivity: 0.002,    // matches the pre-phase-24 hardcode
  },
  gamepad: {
    buttons: {
      jump:     [5, 0],        // RB (bumpers per spec); A doubles as jump outside dialogue
      interact: [4],           // LB
      confirm:  [0],           // A — face-button confirm for dialogue
      cancel:   [9],           // Start — exit preview / close dialogue
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
      kbm:     { ...d.kbm,     ...s.kbm,     move:    { ...d.kbm.move,        ...s.kbm?.move } },
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
