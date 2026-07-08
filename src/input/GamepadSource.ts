import type { ActionState, InputSource } from "./actions";
import type { BindingsConfig } from "./bindings";

// Standard-mapping indices (https://w3c.github.io/gamepad/#remapping)
const AXIS_LX = 0, AXIS_LY = 1, AXIS_RX = 2, AXIS_RY = 3;
const BTN_DPAD_UP = 12, BTN_DPAD_DOWN = 13;
const MAX_BUTTONS = 17;

/**
 * Gamepad input for preview mode. The Gamepad API is poll-only, so all work
 * happens in apply() each frame — the connect/disconnect listeners exist only
 * to gate polling and to clear edge state when a pad vanishes mid-session.
 * Chrome returns immutable snapshots from navigator.getGamepads(), so the pad
 * object must be re-read every frame, never cached.
 */
export class GamepadSource implements InputSource {
  private _padCount = 0;
  // Previous-frame pressed flags for edge detection (fixed-size, reused — no per-frame allocation).
  private readonly _prev = new Array<boolean>(MAX_BUTTONS).fill(false);

  private readonly _onConnect:    () => void;
  private readonly _onDisconnect: () => void;

  constructor(private readonly _bindings: BindingsConfig) {
    this._onConnect    = () => { this._padCount++; };
    this._onDisconnect = () => {
      this._padCount = Math.max(0, this._padCount - 1);
      this._prev.fill(false);   // stale edges must not fire against the next pad
    };
  }

  attach(): void {
    window.addEventListener("gamepadconnected",    this._onConnect);
    window.addEventListener("gamepaddisconnected", this._onDisconnect);
    // A pad connected before preview started never fires gamepadconnected.
    this._padCount = 0;
    for (const p of navigator.getGamepads()) if (p) this._padCount++;
  }

  detach(): void {
    window.removeEventListener("gamepadconnected",    this._onConnect);
    window.removeEventListener("gamepaddisconnected", this._onDisconnect);
    this._prev.fill(false);
  }

  apply(state: ActionState, dt: number): void {
    if (this._padCount === 0) return;
    const pad = this._pickPad();
    if (!pad) return;
    const b = this._bindings.gamepad;

    // Left stick → move. Stick up is -Y on the axis; ActionState forward is +y.
    const move = this._deadzoned(pad.axes[AXIS_LX] ?? 0, pad.axes[AXIS_LY] ?? 0, b.deadzone);
    state.move.x += move.x;
    state.move.y += -move.y;

    // Right stick → look, rate-based (rad/s at full deflection).
    const look = this._deadzoned(pad.axes[AXIS_RX] ?? 0, pad.axes[AXIS_RY] ?? 0, b.deadzone);
    state.look.x += look.x * b.lookRate * dt;
    state.look.y += (b.invertLookY ? -look.y : look.y) * b.lookRate * dt;

    // Buttons — held for jump, edges for the rest.
    if (this._anyHeld(pad, b.buttons.jump)) state.jump = true;
    if (this._anyEdge(pad, b.buttons.interact)) state.interactPressed = true;
    if (this._anyEdge(pad, b.buttons.confirm))  state.confirmPressed  = true;
    if (this._anyEdge(pad, b.buttons.cancel))   state.cancelPressed   = true;
    if (this._edge(pad, BTN_DPAD_UP))   state.menuNav = -1;
    if (this._edge(pad, BTN_DPAD_DOWN)) state.menuNav =  1;

    // Snapshot pressed flags for next frame's edge detection.
    const n = Math.min(pad.buttons.length, MAX_BUTTONS);
    for (let i = 0; i < n; i++) this._prev[i] = pad.buttons[i].pressed;
  }

  private _pickPad(): Gamepad | null {
    const pads = navigator.getGamepads();
    let fallback: Gamepad | null = null;
    for (const p of pads) {
      if (!p) continue;
      if (p.mapping === "standard") return p;
      fallback ??= p;
    }
    return fallback;
  }

  /** Radial deadzone with rescale — the remaining range maps to 0..1 so there's
   *  no dead ramp; per-axis deadzones cause diagonal drift, so don't use them. */
  private _deadzoned(x: number, y: number, dz: number): { x: number; y: number } {
    const len = Math.hypot(x, y);
    if (len <= dz) { this._dzOut.x = 0; this._dzOut.y = 0; return this._dzOut; }
    const scaled = Math.min(1, (len - dz) / (1 - dz)) / len;
    this._dzOut.x = x * scaled;
    this._dzOut.y = y * scaled;
    return this._dzOut;
  }
  private readonly _dzOut = { x: 0, y: 0 };   // reused result — callers copy immediately

  private _anyHeld(pad: Gamepad, idxs: number[]): boolean {
    for (const i of idxs) if (pad.buttons[i]?.pressed) return true;
    return false;
  }

  private _anyEdge(pad: Gamepad, idxs: number[]): boolean {
    for (const i of idxs) if (this._edge(pad, i)) return true;
    return false;
  }

  private _edge(pad: Gamepad, i: number): boolean {
    return !!pad.buttons[i]?.pressed && !this._prev[i];
  }
}
