import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { LightDef, LightKind, ToolId } from "@/types";

// Per-kind placement defaults. Point/spot use physical (candela-ish) intensity
// under three's physical lighting; directional is unit-less like the sun (2.0).
const DEFAULTS: Record<LightKind, Omit<LightDef, "id" | "position">> = {
  point:       { kind: "point",       color: "#ffd9a0", intensity: 30,  range: 15, castShadow: false },
  spot:        { kind: "spot",        color: "#ffffff", intensity: 60,  range: 20, angleDeg: 30, pitchDeg: 90, yawDeg: 0, castShadow: false },
  directional: { kind: "directional", color: "#ffffff", intensity: 1.5, pitchDeg: 50, yawDeg: 0, castShadow: false },
};

// Lift above the clicked surface so the source doesn't sit inside the floor.
const PLACE_HEIGHT: Record<LightKind, number> = { point: 2.5, spot: 3, directional: 8 };

/**
 * Places light entities. Rendering (the THREE light + pick marker) is owned by
 * ZoneManager — this tool only turns a click into a LightDef and hands off via
 * light:placed so App breaks out of placement mode (mirrors CheckpointTool).
 */
export class LightTool {
  private _kind: LightKind | null = null;   // armed when a light-* tool is active
  private _activeZoneId = "demo";
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        const t = tool as ToolId;
        this._kind = t === "light-point" ? "point" : t === "light-spot" ? "spot" : t === "light-directional" ? "directional" : null;
      }),
      this._bus.on("zone:activated", ({ zoneId }) => { this._activeZoneId = zoneId; }),

      this._bus.on("input:click", ({ worldPos, surfacePos, button }) => {
        if (!this._kind || button !== 0) return;
        const p = surfacePos ?? worldPos;
        const light: LightDef = {
          id: `light_${crypto.randomUUID().slice(0, 8)}`,
          position: { x: p.x, y: p.y + PLACE_HEIGHT[this._kind], z: p.z },
          ...DEFAULTS[this._kind],
        };
        this._world.transaction("place light", () => this._world.addLight(this._activeZoneId, light));
        this._bus.emit("light:placed", { zoneId: this._activeZoneId, id: light.id });
      }),
    );
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
  }
}
