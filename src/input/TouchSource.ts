import type { ActionState, InputSource } from "./actions";
import type { BindingsConfig } from "./bindings";

/**
 * Touch input for preview mode. The React TouchControlsOverlay writes directly
 * into `shared` (the ecctrl store pattern — no bus round-trip per pointer
 * move); apply() merges it into the ActionState once per frame. attach/detach
 * are no-ops because the overlay owns all DOM listeners and mounts/unmounts
 * with the preview session.
 */
export class TouchSource implements InputSource {
  readonly shared = {
    move: { x: 0, y: 0 },      // virtual joystick, unit-clamped; y=+1 forward
    lookPx: { x: 0, y: 0 },    // accumulated look-drag pixels since last frame
    jumpHeld: false,
    interactQueued: false,     // tap on the look region
    cancelQueued: false,       // ✕ button
    activity: false,           // any pointerdown on the overlay (scheme-switch signal)
  };

  // Document-level: the overlay only mounts while the scheme is already
  // "touch", so a touch anywhere (e.g. on the bare canvas after a keyboard
  // press stole the scheme) must still register as touch activity.
  private readonly _onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") this.shared.activity = true;
  };

  constructor(private readonly _bindings: BindingsConfig) {}

  attach(): void {
    document.addEventListener("pointerdown", this._onPointerDown);
  }

  detach(): void {
    document.removeEventListener("pointerdown", this._onPointerDown);
    const s = this.shared;
    s.move.x = s.move.y = 0;
    s.lookPx.x = s.lookPx.y = 0;
    s.jumpHeld = false;
    s.interactQueued = s.cancelQueued = s.activity = false;
  }

  hadActivity(): boolean {
    const a = this.shared.activity;
    this.shared.activity = false;
    return a;
  }

  apply(state: ActionState, _dt: number): void {
    const s = this.shared;
    state.move.x += s.move.x;
    state.move.y += s.move.y;
    const sens = this._bindings.touch.lookSensitivity;
    state.look.x += s.lookPx.x * sens;
    state.look.y += s.lookPx.y * sens;
    s.lookPx.x = s.lookPx.y = 0;
    if (s.jumpHeld) state.jump = true;
    if (s.interactQueued) {
      state.interactPressed = true;
      state.confirmPressed  = true;
      s.interactQueued = false;
    }
    if (s.cancelQueued) {
      state.cancelPressed = true;
      s.cancelQueued = false;
    }
  }
}

export type TouchShared = TouchSource["shared"];
