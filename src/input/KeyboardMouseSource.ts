import type { ActionState, InputSource } from "./actions";
import type { BindingsConfig } from "./bindings";

// Wheel deltaY → third-person distance meters (the pre-phase-24 hardcode).
const ZOOM_PER_DELTA = 0.005;

/**
 * Keyboard + mouse input for preview mode — the listeners extracted verbatim
 * from CharacterController. Mouse look assumes pointer lock (movementX/Y);
 * DOM events accumulate between frames, apply() drains them once per frame.
 */
export class KeyboardMouseSource implements InputSource {
  private readonly _keys = new Set<string>();
  private _lookPx  = { x: 0, y: 0 };   // accumulated mouse movement since last apply()
  private _wheel   = 0;                 // accumulated deltaY since last apply()
  private _interactQueued = false;      // latched on keydown, consumed by apply()
  private _confirmQueued  = false;
  private _activity = false;            // real kbm actuation since last hadActivity()

  private readonly _onMouseMove:   (e: MouseEvent) => void;
  private readonly _onKeyDown:     (e: KeyboardEvent) => void;
  private readonly _onKeyUp:       (e: KeyboardEvent) => void;
  private readonly _onWheel:       (e: WheelEvent) => void;
  private readonly _onPointerDown: (e: PointerEvent) => void;

  constructor(private readonly _bindings: BindingsConfig) {
    this._onMouseMove = e => {
      this._lookPx.x += e.movementX;
      this._lookPx.y += e.movementY;
      // Unlocked mouse motion is just cursor travel over UI — only locked
      // motion counts as playing with the mouse (scheme-switch signal).
      if (document.pointerLockElement) this._activity = true;
    };
    this._onWheel = e => { this._wheel += e.deltaY; this._activity = true; };
    this._onKeyDown = e => {
      if (this._isTypingTarget(e)) return;
      this._keys.add(e.code);
      if (this._bindings.kbm.interact.includes(e.code)) this._interactQueued = true;
      if (this._bindings.kbm.confirm.includes(e.code))  this._confirmQueued  = true;
      this._activity = true;
    };
    this._onKeyUp = e => this._keys.delete(e.code);
    // A real mouse press (touch also synthesizes MouseEvents, so gate on
    // pointerType) claims the scheme — it's also the gesture pointer-lock
    // re-entry piggybacks on.
    this._onPointerDown = e => { if (e.pointerType === "mouse") this._activity = true; };
  }

  attach(): void {
    document.addEventListener("mousemove",   this._onMouseMove);
    document.addEventListener("keydown",     this._onKeyDown);
    document.addEventListener("keyup",       this._onKeyUp);
    document.addEventListener("wheel",       this._onWheel, { passive: true });
    document.addEventListener("pointerdown", this._onPointerDown);
  }

  detach(): void {
    document.removeEventListener("mousemove",   this._onMouseMove);
    document.removeEventListener("keydown",     this._onKeyDown);
    document.removeEventListener("keyup",       this._onKeyUp);
    document.removeEventListener("wheel",       this._onWheel);
    document.removeEventListener("pointerdown", this._onPointerDown);
    this._keys.clear();
    this._lookPx.x = this._lookPx.y = 0;
    this._wheel = 0;
    this._interactQueued = this._confirmQueued = this._activity = false;
  }

  hadActivity(): boolean {
    const a = this._activity;
    this._activity = false;
    return a;
  }

  apply(state: ActionState, _dt: number): void {
    const b = this._bindings.kbm;
    if (this._anyDown(b.move.forward)) state.move.y += 1;
    if (this._anyDown(b.move.back))    state.move.y -= 1;
    if (this._anyDown(b.move.left))    state.move.x -= 1;
    if (this._anyDown(b.move.right))   state.move.x += 1;
    if (this._anyDown(b.jump))         state.jump = true;

    state.look.x  += this._lookPx.x * b.lookSensitivity;
    state.look.y  += this._lookPx.y * b.lookSensitivity;
    state.zoomDelta += this._wheel * ZOOM_PER_DELTA;
    this._lookPx.x = this._lookPx.y = 0;
    this._wheel = 0;

    if (this._interactQueued) {
      state.interactPressed = true;
      this._interactQueued  = false;
    }
    if (this._confirmQueued) {
      state.confirmPressed = true;
      this._confirmQueued  = false;
    }
  }

  private _anyDown(codes: string[]): boolean {
    for (const c of codes) if (this._keys.has(c)) return true;
    return false;
  }

  private _isTypingTarget(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  }
}
