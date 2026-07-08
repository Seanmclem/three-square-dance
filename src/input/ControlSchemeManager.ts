import type { EventBus } from "@/core/EventBus";
import type { ActionState, ControlScheme, InputSource } from "./actions";
import { createActionState, zeroActionState } from "./actions";
import type { BindingsConfig } from "./bindings";
import { KeyboardMouseSource } from "./KeyboardMouseSource";
import { GamepadSource } from "./GamepadSource";

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

  private readonly _sources: InputSource[];
  private _scheme: ControlScheme = "kbm";
  private _suppress = false;      // zone-transition fades freeze the player (InputManager idiom)
  private _unsub: Array<() => void> = [];

  constructor(
    _dom: HTMLCanvasElement,      // canvas — claimed by the touch source in a later step
    private readonly _bus: EventBus,
    bindings: BindingsConfig,
  ) {
    this._sources = [new KeyboardMouseSource(bindings), new GamepadSource(bindings)];
  }

  get activeScheme(): ControlScheme { return this._scheme; }

  init(): void {
    this._sources.forEach(s => s.attach());
    this._unsub.push(
      this._bus.on("overlay:fade-in",  () => { this._suppress = true; }),
      this._bus.on("overlay:fade-out", () => { this._suppress = false; }),
    );
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
