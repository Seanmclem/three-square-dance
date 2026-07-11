import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, LadderDef } from "@/types";

const GRID = 0.5;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

/**
 * Ladder placement (Phase 34): single click places a default ladder foot on the
 * clicked surface; height/facing/width live in the PropertiesPanel afterward.
 */
export class LadderTool implements IEditorModule {
  private _active = false;
  private _activeZoneId = "demo";
  private _activeLevel  = 0;
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => { this._active = tool === "ladder"; }),
      this._bus.on("floor:select", ({ level }) => { this._activeLevel = level; }),
      this._bus.on("zone:activated", ({ zoneId }) => { this._activeZoneId = zoneId; }),
      this._bus.on("input:click", ({ worldPos, surfacePos, button }) => {
        if (!this._active || button !== 0) return;
        const p = surfacePos ?? worldPos;   // land the foot on the clicked floor/platform top
        const ladder: LadderDef = {
          id:          `ladder_${crypto.randomUUID().slice(0, 8)}`,
          position:    { x: snap(p.x), y: p.y, z: snap(p.z) },
          rotationY:   0,
          height:      3,
          width:       0.7,
          rungSpacing: 0.35,
          material:    "concrete_01",
          floorLevel:  this._activeLevel,
        };
        this._world.transaction("add ladder", () => {
          this._world.addLadder(this._activeZoneId, ladder);
          this._bus.emit("tool:placed", { type: "ladder", id: ladder.id, zoneId: this._activeZoneId });
        });
      }),
    );
  }

  update(): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
  }
}
