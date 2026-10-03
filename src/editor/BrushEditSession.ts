import type { WorldState } from "@/world/WorldState";
import type { ZoneManager } from "@/world/ZoneManager";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { EditorCamera } from "@/editor/EditorCamera";
import type { EditorCameraPose, ShapeDef, ZoneDef } from "@/types";
import { isBrush } from "@/builders/ShapeBuilder";

export const BRUSH_EDIT_ZONE = "__brush_edit__";

function pickResult(s: ShapeDef): BrushEditResult {
  return structuredClone({
    mesh: s.mesh, material: s.material, materialOverrides: s.materialOverrides,
    sideMaterial: s.sideMaterial, sideMaterialOverrides: s.sideMaterialOverrides,
  });
}

/** The fields a brush edit session hands back to the original shape. */
export type BrushEditResult = Pick<ShapeDef, "mesh" | "material" | "materialOverrides" | "sideMaterial" | "sideMaterialOverrides">;

/**
 * Isolated brush edit mode: the PrefabEditSession pattern applied to ONE shape.
 * The selected brush is cloned into a temporary zone at the origin (rotation
 * zero, so the local-space mesh is what you see), the face/vertex/edge
 * sub-modes work on it unchanged. Save (v4.99.1) records a snapshot of the mesh
 * (+ materials) and STAYS in the session; Close applies the last saved snapshot to
 * the original shape (one undo step, done by the App after teardown) and drops any
 * changes made after it. Position/rotation of the clone are ignored.
 *
 * Why Save doesn't write the original right away: its zone is unloaded while the
 * session runs, and a shape:updated for it would make ZoneManager build it into the
 * scene, under the same shape id as the clone (build tokens are keyed by id). Disk
 * saves are gated during the session anyway, so holding the snapshot until Close
 * changes nothing a user can observe.
 *
 * Same contamination rules as prefab mode: the temp zone is added/removed
 * outside the undo journal, WorldState.toJSON filters it, and the App gates
 * every save/autosave/preview path while a session is active. History is
 * cleared on enter AND exit (the world's undo stack is sacrificed).
 *
 * v4.110.0: it can open from inside the prefab editor (`keepHistory`): the prefab's
 * staging zone is only unloaded while the brush is edited (its data stays in the
 * world), Close loads it back, and the prefab editor's undo history is kept aside and
 * put back instead of being cleared.
 *
 * Brushes only — a parametric shape's params are its editing interface; the
 * panel's Convert to Brush comes first.
 */
export class BrushEditSession {
  private _target: { zoneId: string; shapeId: string } | null = null;
  private _prevZoneId: string | null = null;
  private _prevPose: EditorCameraPose | null = null;
  private _original: BrushEditResult | null = null;   // the shape as it was on enter
  private _saved: BrushEditResult | null = null;      // last Save, applied on Close
  private _keptHistory: ReturnType<HistoryManager["capture"]> | null = null;   // nested in prefab edit

  constructor(
    private readonly _world:   WorldState,
    private readonly _zones:   ZoneManager,
    private readonly _history: HistoryManager,
    private readonly _camera:  () => EditorCamera | null,
  ) {}

  get active(): boolean { return this._target !== null; }
  get target(): { zoneId: string; shapeId: string } | null { return this._target; }

  async enter(zoneId: string, shape: ShapeDef, opts: { keepHistory?: boolean } = {}): Promise<void> {
    if (this._target || !isBrush(shape)) return;   // idempotent (StrictMode) + brushes only
    this._target = { zoneId, shapeId: shape.id };
    this._prevZoneId = this._world.activeZoneId;
    this._prevPose = this._camera()?.getPose() ?? null;
    this._original = pickResult(shape);
    this._saved = null;
    this._keptHistory = opts.keepHistory ? this._history.capture() : null;

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

  /** The staging clone's current mesh + materials (null if it was deleted). */
  private _current(): BrushEditResult | null {
    const target = this._target;
    const clone = target && this._world.zones.get(BRUSH_EDIT_ZONE)?.shapes?.find(s => s.id === target.shapeId);
    return clone ? pickResult(clone) : null;
  }

  /** Record the current state as saved; the session stays open. False if there's
   *  nothing to save (the clone was deleted). */
  save(): boolean {
    const now = this._current();
    if (!now?.mesh) return false;
    this._saved = now;
    return true;
  }

  /** Changes since the last Save (or since entering, if never saved). */
  isDirty(): boolean {
    const now = this._current();
    const base = this._saved ?? this._original;
    return !!now && !!base && JSON.stringify(now) !== JSON.stringify(base);
  }

  /** Exit. Returns the last saved state for the original shape, or null if nothing
   *  was saved (or it equals how the shape started). Unsaved changes are dropped. */
  async close(): Promise<{ zoneId: string; shapeId: string; changes: BrushEditResult } | null> {
    const target = this._target;
    if (!target) return null;
    const saved = this._saved, original = this._original;
    await this._teardown();
    this._saved = null; this._original = null;
    if (!saved?.mesh || JSON.stringify(saved) === JSON.stringify(original)) return null;
    return { ...target, changes: saved };
  }

  private async _teardown(): Promise<void> {
    this._target = null;
    this._zones.unloadZone(BRUSH_EDIT_ZONE);
    this._world.removeZone(BRUSH_EDIT_ZONE);
    if (this._prevZoneId) {
      await this._zones.loadZone(this._prevZoneId);
      this._world.setActiveZone(this._prevZoneId);
    }
    if (this._keptHistory) this._history.restore(this._keptHistory);
    else this._history.clear();
    this._keptHistory = null;
    const cam = this._camera();
    if (cam && this._prevPose) cam.setPose(this._prevPose);
    this._prevZoneId = null;
    this._prevPose = null;
  }
}
