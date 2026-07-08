import type { EventBus } from "@/core/EventBus";
import type { ActionState, ControlScheme, InputSource } from "./actions";
import { createActionState, zeroActionState } from "./actions";
import type { BindingsConfig } from "./bindings";
import { KeyboardMouseSource } from "./KeyboardMouseSource";
import { GamepadSource } from "./GamepadSource";
import { TouchSource } from "./TouchSource";

/**
 * Preview-mode input hub. Owns one source per device class; every source is
 * always live and update() merges their contributions into a single
 * ActionState each frame (last-writer-wins — real players don't use two
 * devices at once). The "active scheme" is only a label for UI prompts and
 * pointer-lock policy, never a gate on which device works.
 *
 * Lifecycle matches a preview session: created in PreviewController.enter(),
 * disposed in exit(). It never exists in editor mode, so it cannot fight the
 * editor's InputManager.
 */
export class ControlSchemeManager {
  /** Stable identity — CharacterController holds a reference and reads it every frame. */
  readonly state: ActionState = createActionState();

  /** The touch source's shared store — written directly by TouchControlsOverlay. */
  readonly touch: TouchSource;

  private readonly _sources: InputSource[];
  private _scheme: ControlScheme = "kbm";
  private _suppress = false;      // zone-transition fades freeze the player (InputManager idiom)
  private _unsub: Array<() => void> = [];

  constructor(
    _dom: HTMLCanvasElement,      // canvas — reserved for future pointer-lock re-entry wiring
    private readonly _bus: EventBus,
    bindings: BindingsConfig,
  ) {
    this.touch = new TouchSource(bindings);
    this._sources = [new KeyboardMouseSource(bindings), new GamepadSource(bindings), this.touch];
  }

  get activeScheme(): ControlScheme { return this._scheme; }

  init(): void {
    this._sources.forEach(s => s.attach());
    this._unsub.push(
      this._bus.on("overlay:fade-in",  () => { this._suppress = true; }),
      this._bus.on("overlay:fade-out", () => { this._suppress = false; }),
    );
    this._setScheme(this._guessScheme());
  }

  /** Initial scheme guess: touch hardware → touch; connected pad → gamepad; else kbm. */
  private _guessScheme(): ControlScheme {
    if (window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0) return "touch";
    for (const p of navigator.getGamepads()) if (p) return "gamepad";
    return "kbm";
  }

  private _setScheme(scheme: ControlScheme): void {
    this._scheme = scheme;
    this._bus.emit("input:scheme-changed", { scheme });
  }

  /** Must run before CharacterController.update() in the same frame. */
  update(dt: number): void {
    zeroActionState(this.state);
    if (this._suppress) {
      // Sources still drain their accumulators so a fade doesn't release a
      // burst of buffered look/zoom afterwards.
      for (const s of this._sources) s.apply(this.state, dt);
      zeroActionState(this.state);
      return;
    }
    for (const s of this._sources) s.apply(this.state, dt);

    // Clamp move to the unit disc: keyboard diagonals (±1,±1) normalize to
    // full speed exactly as before; analog magnitudes below 1 pass through.
    const m = this.state.move;
    const lenSq = m.x * m.x + m.y * m.y;
    if (lenSq > 1) {
      const inv = 1 / Math.sqrt(lenSq);
      m.x *= inv;
      m.y *= inv;
    }
  }

  dispose(): void {
    this._sources.forEach(s => s.detach());
    this._unsub.forEach(u => u());
    this._unsub = [];
    zeroActionState(this.state);
  }
}
