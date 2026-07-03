import type { EventBus } from "@/core/EventBus";
import type { JsonValue, StateSchema } from "@/types";

/** localStorage key for the persisted game save (runtime state + fired one-shots). */
export const GAMESAVE_KEY = "worldeditor_gamesave";

/** Fallback registered schema for scenes that don't author their own `world.stateSchema`. */
export const DEFAULT_STATE_SCHEMA: Record<string, StateSchema> = {
  health: { type: "number", default: 100, min: 0, max: 100 },
};

/**
 * Generic runtime gameplay-state store — one flat key→value map that holds any
 * JSON-serializable value (health, score, lives, checkpoints, inventory counts,
 * mission flags, anything). Completely separate from the scene file; lives only
 * during play and is persisted to the game save.
 *
 * Keys can optionally be `register()`ed with a type + default + numeric clamp,
 * but any key is settable ad-hoc. Every mutation that actually changes a value
 * emits `state:changed` on the bus (setting a key to its current value is a
 * no-op, which kills scripting feedback loops). ScriptEngine turns that event
 * into an `on_state_changed` trigger so designers can react to any state change.
 */
export class GameState {
  private _values = new Map<string, JsonValue>();
  private _schema = new Map<string, StateSchema>();
  private _bus: EventBus | null = null;

  /** Wire the bus so mutations emit `state:changed`. Called once at app init. */
  attach(bus: EventBus): void { this._bus = bus; }

  /** Register a typed key with a default + optional numeric clamp. */
  register(key: string, schema: StateSchema): void {
    this._schema.set(key, schema);
    if (!this._values.has(key) && schema.default !== undefined) {
      this._values.set(key, schema.default);   // seed silently — no event on defaults
    }
  }

  /** Replace the whole registered schema (per-level authored keys). Called on play start. */
  configureSchema(schemas: Record<string, StateSchema>): void {
    this._schema.clear();
    for (const [key, schema] of Object.entries(schemas)) this.register(key, schema);
  }

  get(key: string): JsonValue | undefined { return this._values.get(key); }
  has(key: string): boolean { return this._values.has(key); }

  set(key: string, value: JsonValue): void {
    const next = this._clamp(key, value);
    if (this._equal(this._values.get(key), next)) return;  // no-op — kills feedback loops
    this._values.set(key, next);
    this._emit(key, next);
  }

  /** Add `delta` to a numeric key (missing → its registered default or 0). Clamped via set(). */
  adjust(key: string, delta: number): void {
    const cur = this._values.get(key);
    const base = typeof cur === "number" ? cur : (this._numericDefault(key) ?? 0);
    this.set(key, base + delta);
  }

  delete(key: string): void {
    if (!this._values.has(key)) return;
    this._values.delete(key);
    this._emit(key, null);
  }

  /** Wipe all values, then re-seed registered defaults (New Game). */
  reset(): void {
    this._values.clear();
    for (const [key, schema] of this._schema) {
      if (schema.default !== undefined) this._values.set(key, schema.default);
    }
  }

  snapshot(): Record<string, JsonValue> { return Object.fromEntries(this._values); }

  restore(obj: Record<string, JsonValue>): void {
    this._values = new Map(Object.entries(obj));
  }

  private _clamp(key: string, value: JsonValue): JsonValue {
    const schema = this._schema.get(key);
    if (schema?.type === "number" && typeof value === "number") {
      let v = value;
      if (schema.min !== undefined) v = Math.max(schema.min, v);
      if (schema.max !== undefined) v = Math.min(schema.max, v);
      return v;
    }
    return value;
  }

  private _numericDefault(key: string): number | undefined {
    const d = this._schema.get(key)?.default;
    return typeof d === "number" ? d : undefined;
  }

  private _equal(a: JsonValue | undefined, b: JsonValue): boolean {
    if (a === b) return true;
    if (a !== undefined && a !== null && typeof a === "object" &&
        b !== null && typeof b === "object") {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  private _emit(key: string, value: JsonValue): void {
    this._bus?.emit("state:changed", { key, value });
  }
}

export const gameState = new GameState();
