import type { WorldState } from "@/world/WorldState";
import type { ZoneManager } from "@/world/ZoneManager";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { EditorCamera } from "@/editor/EditorCamera";
import type { EditorCameraPose, ShapeDef, ZoneDef } from "@/types";
import { isBrush } from "@/builders/ShapeBuilder";

export const BRUSH_EDIT_ZONE = "__brush_edit__";

/** The fields a brush edit session hands back to the original shape. */
export type BrushEditResult = Pick<ShapeDef, "mesh" | "material" | "materialOverrides" | "sideMaterial" | "sideMaterialOverrides">;

/**
 * Isolated brush edit mode: the PrefabEditSession pattern applied to ONE shape.
 * The selected brush is cloned into a temporary zone at the origin (rotation
 * zero, so the local-space mesh is what you see), the face/vertex/edge
 * sub-modes work on it unchanged, and Save writes the mesh (+ materials) back
 * to the original shape. Position/rotation of the clone are ignored on save.
 *
 * Same contamination rules as prefab mode: the temp zone is added/removed
 * outside the undo journal, WorldState.toJSON filters it, and the App gates
 * every save/autosave/preview path while a session is active. History is
 * cleared on enter AND exit (the world's undo stack is sacrificed).
 *
 * Brushes only — a parametric shape's params are its editing interface; the
 * panel's Convert to Brush comes first.
 */
export class BrushEditSession {
  private _target: { zoneId: string; shapeId: string } | null = null;
  private _prevZoneId: string | null = null;
  private _prevPose: EditorCameraPose | null = null;

  constructor(
    private readonly _world:   WorldState,
    private readonly _zones:   ZoneManager,
    private readonly _history: HistoryManager,
    private readonly _camera:  () => EditorCamera | null,
  ) {}

  get active(): boolean { return this._target !== null; }
  get target(): { zoneId: string; shapeId: string } | null { return this._target; }

  async enter(zoneId: string, shape: ShapeDef): Promise<void> {
    if (this._target || !isBrush(shape)) return;   // idempotent (StrictMode) + brushes only
    this._target = { zoneId, shapeId: shape.id };
    this._prevZoneId = this._world.activeZoneId;
    this._prevPose = this._camera()?.getPose() ?? null;

    const clone = structuredClone(shape);
    clone.position = { x: 0, y: 0, z: 0 };
    clone.rotation = { x: 0, y: 0, z: 0 };
    delete clone.prefab;       // not an instance member in here
    delete clone.groupIds;
    delete clone.movers; delete clone.mover; delete clone.sound;

    const temp: ZoneDef = {
      id: BRUSH_EDIT_ZONE, name: `Brush: ${shape.label ?? shape.id}`, type: "outdoor",
      bounds: { x: -25, z: -25, width: 50, depth: 50 },
      nodes: [], floors: [], walls: [], platforms: [], stairs: [], objects: [],
      shapes: [clone],
    };

    this._world.addZone(temp);                               // unjournaled by design
    if (this._prevZoneId) this._zones.unloadZone(this._prevZoneId);
    await this._zones.loadZone(BRUSH_EDIT_ZONE);
    this._world.setActiveZone(BRUSH_EDIT_ZONE);
    this._history.clear();

    const cam = this._camera();
    if (cam) {
      // Frame the brush: orbit target at its local centroid, radius from its extent.
      let cx = 0, cy = 0, cz = 0, r = 0;
      const verts = shape.mesh!.vertices;
      for (const v of verts) { cx += v.x; cy += v.y; cz += v.z; }
      cx /= verts.length; cy /= verts.length; cz /= verts.length;
      for (const v of verts) r = Math.max(r, Math.hypot(v.x - cx, v.y - cy, v.z - cz));
      cam.focus.set(cx, cy, cz); cam.targetFocus.set(cx, cy, cz);
      const radius = Math.max(4, r * 3);
      cam.spherical.radius = radius; cam.targetSpherical.radius = radius;
      cam.update(0.016);
    }
  }

  /** Read the edited mesh back from the staging clone, exit, and return the
   *  changes for the original shape. Null if the clone is gone (deleted). */
  async saveAndExit(): Promise<{ zoneId: string; shapeId: string; changes: BrushEditResult } | null> {
    const target = this._target;
    if (!target) return null;
    const clone = this._world.zones.get(BRUSH_EDIT_ZONE)?.shapes?.find(s => s.id === target.shapeId);
    const changes: BrushEditResult | null = clone ? structuredClone({
      mesh: clone.mesh,
      material: clone.material,
      materialOverrides: clone.materialOverrides,
      sideMaterial: clone.sideMaterial,
      sideMaterialOverrides: clone.sideMaterialOverrides,
    }) : null;
    await this._teardown();
    return changes?.mesh ? { ...target, changes } : null;
  }

  async cancel(): Promise<void> {
    if (!this._target) return;
    await this._teardown();
  }

  private async _teardown(): Promise<void> {
    this._target = null;
    this._zones.unloadZone(BRUSH_EDIT_ZONE);
    this._world.removeZone(BRUSH_EDIT_ZONE);
    if (this._prevZoneId) {
      await this._zones.loadZone(this._prevZoneId);
      this._world.setActiveZone(this._prevZoneId);
    }
    this._history.clear();
    const cam = this._camera();
    if (cam && this._prevPose) cam.setPose(this._prevPose);
    this._prevZoneId = null;
    this._prevPose = null;
  }
}
