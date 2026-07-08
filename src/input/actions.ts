/**
 * Preview-mode input abstraction (Phase 24). One ActionState struct is the
 * single seam between input devices (keyboard/mouse, gamepad, touch) and the
 * CharacterController: sources write into it, the controller only reads it.
 * The editor's InputManager is unrelated — this layer exists only while a
 * preview session is active.
 */
export type ControlScheme = "kbm" | "gamepad" | "touch";

export interface ActionState {
  /** Unit-clamped; x=+1 right, y=+1 forward. Camera-relative rotation is applied by the controller. */
  move: { x: number; y: number };
  /** This-frame look delta in radians (sources pre-multiply their own sensitivity/rate). */
  look: { x: number; y: number };
  /** Third-person camera distance delta this frame (meters). */
  zoomDelta: number;
  /** Held — edge detection stays in CharacterController (_jumpArmed). */
  jump: boolean;
  /** Edge: true for exactly one frame after actuation. */
  interactPressed: boolean;
  confirmPressed:  boolean;
  cancelPressed:   boolean;
  /** D-pad up/down edge, for future menu/choice UIs. */
  menuNav: -1 | 0 | 1;
}

export function createActionState(): ActionState {
  return {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    zoomDelta: 0,
    jump: false,
    interactPressed: false,
    confirmPressed:  false,
    cancelPressed:   false,
    menuNav: 0,
  };
}

/** Reset every field in place (the state object's identity must never change). */
export function zeroActionState(s: ActionState): void {
  s.move.x = s.move.y = 0;
  s.look.x = s.look.y = 0;
  s.zoomDelta = 0;
  s.jump = false;
  s.interactPressed = s.confirmPressed = s.cancelPressed = false;
  s.menuNav = 0;
}

/**
 * A device adapter owned by ControlSchemeManager. Listeners/pollers accumulate
 * between frames; apply() writes the accumulated contribution into `state`
 * once per frame and clears its own pending edges/deltas.
 */
export interface InputSource {
  attach(): void;
  detach(): void;
  apply(state: ActionState, dt: number): void;
}
