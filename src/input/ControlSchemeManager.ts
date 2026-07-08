import type { EventBus } from "@/core/EventBus";
import type { ActionState, ControlScheme, InputSource } from "./actions";
import { createActionState, zeroActionState } from "./actions";
import type { BindingsConfig } from "./bindings";
import { KeyboardMouseSource } from "./KeyboardMouseSource";
import { GamepadSource } from "./GamepadSource";
import { TouchSource } from "./TouchSource";

const LAST_SCHEME_KEY = "worldbuilder.lastScheme";
// Index-aligned with the _sources array built in the constructor.
const SOURCE_SCHEMES: ControlScheme[] = ["kbm", "gamepad", "touch"];

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
  /** The bindings this session was built with (loaded once at preview enter). */
  readonly bindings: BindingsConfig;

  private readonly _sources: InputSource[];
  private _scheme: ControlScheme = "kbm";
  private _suppress = false;      // zone-transition fades freeze the player (InputManager idiom)
  private _menuMode = false;      // dialogue open: movement/look/jump zeroed, confirm/cancel/menuNav live
  private _unsub: Array<() => void> = [];

  constructor(
    _dom: HTMLCanvasElement,      // canvas — reserved for future pointer-lock re-entry wiring
    private readonly _bus: EventBus,
    bindings: BindingsConfig,
  ) {
    this.bindings = bindings;
    this.touch = new TouchSource(bindings);
    this._sources = [new KeyboardMouseSource(bindings), new GamepadSource(bindings), this.touch];
  }

  get activeScheme(): ControlScheme { return this._scheme; }

  init(): void {
    this._sources.forEach(s => s.attach());
    this._unsub.push(
      this._bus.on("overlay:fade-in",  () => { this._suppress = true; }),
      this._bus.on("overlay:fade-out", () => { this._suppress = false; }),
      this._bus.on("dialogue:show",    () => { this._menuMode = true; }),
      this._bus.on("dialogue:closed",  () => { this._menuMode = false; }),
    );
    this._setScheme(this._guessScheme());
  }

  /** Initial scheme guess: last used → touch hardware → connected pad → kbm. */
  private _guessScheme(): ControlScheme {
    const last = localStorage.getItem(LAST_SCHEME_KEY);
    if (last === "kbm" || last === "gamepad" || last === "touch") return last;
    if (window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0) return "touch";
    for (const p of navigator.getGamepads()) if (p) return "gamepad";
    return "kbm";
  }

  private _setScheme(scheme: ControlScheme): void {
    this._scheme = scheme;
    localStorage.setItem(LAST_SCHEME_KEY, scheme);
    this._bus.emit("input:scheme-changed", { scheme });
  }

  /** Must run before CharacterController.update() in the same frame. */
  update(dt: number): void {
    zeroActionState(this.state);
    if (this._suppress) {
      // Sources still drain their accumulators (and activity flags) so a fade
      // doesn't release buffered look/zoom or flip the scheme afterwards.
      for (const s of this._sources) { s.apply(this.state, dt); s.hadActivity(); }
      zeroActionState(this.state);
      return;
    }
    for (const s of this._sources) s.apply(this.state, dt);

    // Last input wins: whichever device actually actuated this frame becomes
    // the labelled scheme (UI prompts, overlay visibility, pointer-lock policy).
    // All sources stay live regardless. Deadzone already filters stick drift.
    for (let i = 0; i < this._sources.length; i++) {
      if (this._sources[i].hadActivity()) {
        const scheme = SOURCE_SCHEMES[i];
        if (scheme !== this._scheme) this._setScheme(scheme);
      }
    }

    // Clamp move to the unit disc: keyboard diagonals (±1,±1) normalize to
    // full speed exactly as before; analog magnitudes below 1 pass through.
    const m = this.state.move;
    const lenSq = m.x * m.x + m.y * m.y;
    if (lenSq > 1) {
      const inv = 1 / Math.sqrt(lenSq);
      m.x *= inv;
      m.y *= inv;
    }

    // Menu mode (dialogue open): the player must not walk/jump/interact behind
    // the dialogue; confirm advances it. confirm only fires as a bus action in
    // menu mode — outside it the same buttons keep their gameplay meanings.
    if (this._menuMode) {
      if (this.state.confirmPressed) this._bus.emit("action:confirm", {});
      const cancel = this.state.cancelPressed;
      const nav    = this.state.menuNav;
      zeroActionState(this.state);
      this.state.cancelPressed = cancel;
      this.state.menuNav = nav;
    }
    if (this.state.cancelPressed) this._bus.emit("action:cancel", {});
  }

  dispose(): void {
    this._sources.forEach(s => s.detach());
    this._unsub.forEach(u => u());
    this._unsub = [];
    zeroActionState(this.state);
  }
}
