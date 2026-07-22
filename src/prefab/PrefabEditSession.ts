import type { WorldState } from "@/world/WorldState";
import type { ZoneManager } from "@/world/ZoneManager";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { EditorCamera } from "@/editor/EditorCamera";
import type {
  EditorCameraPose, EditorObjectType, LadderDef, PrefabDef, PrefabTemplateEntity, ShapeDef, StairDef,
  TriggerVolume, WorldObject, ZoneDef,
} from "@/types";
import { expandPrefab } from "@/prefab/expand";

export const PREFAB_EDIT_ZONE = "__prefab_edit__";

/**
 * Isolated prefab edit mode (Phase 47), Unity prefab-mode style. Staging is a
 * temporary zone in the LIVE WorldState — every tool/selection/gizmo already
 * operates on the active zone, so editing Just Works. The temp zone is added
 * and removed OUTSIDE the undo journal (addZone/removeZone are unjournaled)
 * and can never persist: WorldState.toJSON filters it, and the App gates every
 * autosave/save path while a session is active (the critical contamination
 * guard — see the 2026-07-16 autosave incident class).
 *
 * History is cleared on enter AND exit: undo inside edit mode works on the
 * prefab's entities; the world's undo stack is sacrificed on entry (flagged
 * tradeoff — scoped stacks are a later increment).
 *
 * Snapshot prefabs only — a generator's params ARE its editing interface.
 */
export class PrefabEditSession {
  private _prefab: PrefabDef | null = null;
  private _prevZoneId: string | null = null;
  private _prevPose: EditorCameraPose | null = null;

  constructor(
    private readonly _world:   WorldState,
    private readonly _zones:   ZoneManager,
    private readonly _history: HistoryManager,
    private readonly _camera:  () => EditorCamera | null,
  ) {}

  get active(): boolean { return this._prefab !== null; }
  get prefab(): PrefabDef | null { return this._prefab; }

  async enter(prefab: PrefabDef): Promise<void> {
    if (this._prefab || prefab.kind !== "snapshot") return;   // idempotent (StrictMode) + snapshot-only
    this._prefab = prefab;
    this._prevZoneId = this._world.activeZoneId;
    this._prevPose = this._camera()?.getPose() ?? null;

    const temp: ZoneDef = {
      id: PREFAB_EDIT_ZONE, name: `Prefab: ${prefab.name}`, type: "outdoor",
      bounds: { x: -25, z: -25, width: 50, depth: 50 },
      nodes: [], floors: [], walls: [], platforms: [], stairs: [], objects: [],
    };
    // Members at template-local coords; entity id = memberKey (recapture reads them back).
    for (const m of expandPrefab(prefab, {})) {
      const def = structuredClone(m.def) as { id: string; zoneId?: string };
      def.id = m.memberKey;
      switch (m.type) {
        case "object":         { const d = def as WorldObject;   d.zoneId = PREFAB_EDIT_ZONE; temp.objects.push(d); break; }
        case "trigger-volume": { const d = def as TriggerVolume; d.zoneId = PREFAB_EDIT_ZONE; (temp.triggerVolumes ??= []).push(d); break; }
        case "shape":          (temp.shapes ??= []).push(def as unknown as ShapeDef); break;
        case "stair":          temp.stairs.push(def as unknown as StairDef); break;
        case "ladder":         (temp.ladders ??= []).push(def as unknown as LadderDef); break;
      }
    }

    this._world.addZone(temp);                               // unjournaled by design
    if (this._prevZoneId) this._zones.unloadZone(this._prevZoneId);
    await this._zones.loadZone(PREFAB_EDIT_ZONE);
    this._world.setActiveZone(PREFAB_EDIT_ZONE);
    this._history.clear();

    const cam = this._camera();
    if (cam) {
      cam.focus.set(0, 1, 0); cam.targetFocus.set(0, 1, 0);
      cam.spherical.radius = 12; cam.targetSpherical.radius = 12;
      cam.update(0.016);
    }
  }

  /** Recapture the template from the staging zone, exit, and return the
   *  updated PrefabDef (version bumped). Caller persists it + propagates. */
  async saveAndExit(): Promise<PrefabDef | null> {
    const prefab = this._prefab;
    if (!prefab) return null;
    const zone = this._world.zones.get(PREFAB_EDIT_ZONE);
    const template: PrefabTemplateEntity[] = [];
    if (zone) {
      const grab = (type: EditorObjectType, arr: Array<{ id: string }> | undefined): void => {
        for (const e of arr ?? []) {
          const def = structuredClone(e) as { prefab?: unknown };
          delete def.prefab;
          template.push({ memberKey: e.id, type, def });
        }
      };
      grab("object", zone.objects);
      grab("trigger-volume", zone.triggerVolumes);
      grab("shape", zone.shapes);
      grab("stair", zone.stairs);
      grab("ladder", zone.ladders);
    }
    const updated: PrefabDef = { ...prefab, template, version: prefab.version + 1 };
    await this._teardown();
    return updated;
  }

  async cancel(): Promise<void> {
    if (!this._prefab) return;
    await this._teardown();
  }

  private async _teardown(): Promise<void> {
    this._prefab = null;
    this._zones.unloadZone(PREFAB_EDIT_ZONE);
    this._world.removeZone(PREFAB_EDIT_ZONE);
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
