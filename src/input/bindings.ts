/**
 * Per-scheme input bindings. A player/device preference, NOT world data — it
 * never enters the SceneFile. Persistence (localStorage merge over defaults)
 * lands with the Controls settings UI; until then consumers take
 * DEFAULT_BINDINGS.
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
