import { isSelectMode } from "@/editor/selectMode";
import * as THREE from "three";
import { castObjectBoxes } from "@/editor/objectPicking";
import { volumeExtents } from "@/world/volumeShape";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { EditorObjectType, SelectedRef, TriggerVolume, Euler3, Scale3, ToolId } from "@/types";

type State = "IDLE" | "PLACING";

const GRID = 0.5;
const DEFAULT_HEIGHT = 2.5;
const AMBER = 0xffaa00;
const ZERO_ROT: Euler3  = { x: 0, y: 0, z: 0 };
const UNIT_SCL: Scale3  = { x: 1, y: 1, z: 1 };

function snap(v: number): number { return Math.round(v / GRID) * GRID; }

function makeWireframe(w: number, h: number, d: number): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  const mat = new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 1 });
  const wire = new THREE.LineSegments(geo, mat);
  // Faint interior fill so the drag preview reads as a box, not four lines
  // (matches the placed-volume rendering in ZoneManager — same inset +
  // renderOrder to avoid coplanar z-fighting / transparent-sort flicker).
  const fill = new THREE.Mesh(
    insetBox(w, h, d),
    new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.FrontSide }),
  );
  fill.userData = { selectable: false };
  fill.renderOrder = 1;
  wire.renderOrder = 2;
  wire.add(fill);
  return wire;
}

function insetBox(w: number, h: number, d: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(Math.max(0.05, w - 0.04), Math.max(0.05, h - 0.04), Math.max(0.05, d - 0.04));
}

export class TriggerVolumeTool {
  private _state:       State  = "IDLE";
  private _active       = false;
  private _toolId:      ToolId = "select";
  private _height       = DEFAULT_HEIGHT;
  private _baseY        = 0;
  private _start:       THREE.Vector3 | null = null;
  private _preview:     THREE.LineSegments | null = null;
  private _activeZoneId = "demo";
  private _lastScreenPos: { x: number; y: number } = { x: 0, y: 0 };
  private _hoveredId:   string | null = null;
  private _selectedId:  string | null = null;
  private _suppressNextClick = false;
  private _raycaster = new THREE.Raycaster();

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:   THREE.Scene,
    private readonly _world:   WorldState,
    private readonly _bus:     EventBus,
    private readonly _history: HistoryManager,
    private readonly _camera:  THREE.PerspectiveCamera,
    private readonly _canvas:  HTMLCanvasElement,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._toolId = tool;
        this._active = tool === "trigger-volume";
        if (!this._active) this._reset();
      }),
      this._bus.on("zone:activated", ({ zoneId }) => {
        this._activeZoneId = zoneId;
        this._clearHover();
        this._clearSelect();
      }),

      // Hover detection is always on (not gated by _active) so volumes are
      // visually responsive regardless of which tool is active.
      this._bus.on("input:mousemove", ({ screenPos }) => {
        this._lastScreenPos = screenPos;
        if (this._state === "PLACING") {
          this._updatePreview();
          return;
        }
        const vol = this._findVolumeAt(screenPos);
        const id  = vol?.id ?? null;
        if (id !== this._hoveredId) {
          this._hoveredId = id;
          this._bus.emit("triggervolume:hover", { zoneId: this._activeZoneId, id });
        }
      }),

      // Placement uses mousedown+mouseup (drag gesture), only when tool is active.
      // Hovering an existing volume does NOT block the gesture (a map-wide kill
      // floor would make the whole level unplaceable) — a plain click commits
      // nothing (min-drag check in _finishPlace), so click-to-select still works.
      this._bus.on("input:mousedown", ({ button }) => {
        // A fresh gesture: any click-suppression pending from a gizmo drag whose
        // release never produced an input:click (big drags exceed the threshold)
        // is stale — clear it so this gesture's click isn't wrongly swallowed.
        this._suppressNextClick = false;
        if (!this._active || button !== 0) return;
        if (this._state === "IDLE") {
          this._clearSelect();
          this._beginPlace();
        }
      }),
      this._bus.on("input:mouseup", ({ button }) => {
        if (button !== 0) return;
        if (this._state === "PLACING") this._finishPlace();
      }),

      // Volume selection uses input:click. SelectionManager runs first (registered earlier)
      // and may have already tinted the floor/wall behind the volume. Emitting
      // object:deselected before our object:selected clears SelectionManager's highlight.
      // Releasing a gizmo drag fires an input:click (when the pointer lands back
      // within the drag threshold), and volume picking deliberately ignores the
      // gizmo's meshes (no editorType) — so without this guard, finishing a drag
      // over a kill floor deselects the dragged entity and selects the volume.
      // Same pattern as SelectionManager's gizmo:dragging suppression.
      this._bus.on("gizmo:dragging", ({ isDragging }) => {
        if (!isDragging) this._suppressNextClick = true;
      }),

      this._bus.on("input:click", ({ button, shift, meta, ctrl }) => {
        if (this._suppressNextClick) { this._suppressNextClick = false; return; }
        if (button !== 0 || this._state === "PLACING") return;
        // Only pick volumes under the Select or Trigger tools — never while another tool
        // (Spawn/Floor/Wall/…) is placing, so a placement click can't also select a volume.
        if (!isSelectMode(this._toolId) && this._toolId !== "trigger-volume") return;
        const vol = this._findVolumeAt(this._lastScreenPos);
        if (!vol) return;
        // Additive click: join SelectionManager's multi-select instead of clobbering
        // it (volumes can't be raycast by SelectionManager — selectable:false — so
        // shift-clicks used to silently reset the selection to just this volume).
        if (shift || meta || ctrl) {
          this._bus.emit("selection:toggle-ref", {
            ref: { id: vol.id, type: "trigger-volume", zoneId: this._activeZoneId },
          });
          return;
        }
        // Prefab member (v4.79.62): a plain Select-tool click on a stamped volume
        // selects the whole instance — parity with every SelectionManager-picked
        // member kind (Phase 47.1). Shift-click above still toggles just the
        // volume, and the Trigger tool keeps single-select (it edits volumes).
        const stamp = (vol as { prefab?: { instanceId: string } }).prefab;
        if (isSelectMode(this._toolId) && stamp) {
          const zone = this._world.zones.get(this._activeZoneId);
          const refs: SelectedRef[] = [{ id: vol.id, type: "trigger-volume", zoneId: this._activeZoneId }];
          const gatherMembers = (type: EditorObjectType, arr: Array<{ id: string; prefab?: { instanceId: string } }> | undefined): void => {
            for (const e of arr ?? []) {
              if (e.prefab?.instanceId === stamp.instanceId && e.id !== vol.id) refs.push({ id: e.id, type, zoneId: this._activeZoneId });
            }
          };
          gatherMembers("object", zone?.objects);
          gatherMembers("trigger-volume", zone?.triggerVolumes);
          gatherMembers("shape", zone?.shapes);
          gatherMembers("stair", zone?.stairs);
          gatherMembers("ladder", zone?.ladders);
          gatherMembers("checkpoint", zone?.checkpoints);
          if (refs.length > 1) { this._bus.emit("selection:set", { refs }); return; }
        }
        this._bus.emit("object:deselected", {});  // clear any SelectionManager floor/wall tint
        this._selectedId = vol.id;
        this._bus.emit("triggervolume:select", { zoneId: this._activeZoneId, id: vol.id });
        this._bus.emit("object:selected", {
          id:       vol.id,
          type:     "trigger-volume",
          zoneId:   this._activeZoneId,
          position: vol.position,
          rotation: vol.rotation ?? ZERO_ROT,
          scale:    UNIT_SCL,
          data:     vol,
        });
      }),

      // Clear our selection when something else gets selected or when
      // SelectionManager deselects on an empty-space click.
      this._bus.on("object:deselected", () => {
        if (this._selectedId !== null) {
          this._selectedId = null;
          this._bus.emit("triggervolume:select", { zoneId: this._activeZoneId, id: null });
        }
      }),
      this._bus.on("object:selected", ({ type, id }) => {
        if (type === "trigger-volume") {
          this._selectedId = id;
        } else if (this._selectedId !== null) {
          this._selectedId = null;
          this._bus.emit("triggervolume:select", { zoneId: this._activeZoneId, id: null });
        }
      }),

      this._bus.on("input:wheel", ({ delta }) => {
        if (!this._active || this._state !== "PLACING") return;
        this._height = Math.max(0.5, this._height - delta * 0.005);
        this._updatePreview();
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (!this._active) return;
        if (code === "Escape") {
          if (this._state === "PLACING") this._reset();
          else this._clearSelect();
          return;
        }
        if ((code === "Delete" || code === "Backspace") && this._selectedId) {
          const id     = this._selectedId;
          const zoneId = this._activeZoneId;
          this._clearSelect();
          this._bus.emit("object:deselected", {});
          this._world.transaction("delete trigger volume", () => {
            this._world.removeTriggerVolume(zoneId, id);
          });
        }
      }),
    );
  }

  private _findVolumeAt(screenPos: { x: number; y: number }): TriggerVolume | undefined {
    const zone = this._world.zones.get(this._activeZoneId);
    if (!zone?.triggerVolumes?.length) return undefined;
    const rect  = this._canvas.getBoundingClientRect();
    const ndcX  =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    const ndcY  = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
    const target = new THREE.Vector3();
    let best: { vol: TriggerVolume; distance: number } | undefined;
    for (const vol of zone.triggerVolumes) {
      const ext = volumeExtents(vol);   // shape-aware AABB (sphere/cylinder pick by bounds)
      const box = new THREE.Box3(
        new THREE.Vector3(vol.position.x - ext.x / 2, vol.position.y,          vol.position.z - ext.z / 2),
        new THREE.Vector3(vol.position.x + ext.x / 2, vol.position.y + ext.y,  vol.position.z + ext.z / 2),
      );
      const angle = vol.rotation?.y ? vol.rotation.y * Math.PI / 180 : 0;
      let ray = this._raycaster.ray;
      if (angle) {
        // Inverse-rotate the ray about the volume's vertical axis so the test runs in the
        // box's local (unrotated) frame — an OBB hit-test without building OBB math.
        const m = new THREE.Matrix4()
          .makeTranslation(vol.position.x, 0, vol.position.z)
          .multiply(new THREE.Matrix4().makeRotationY(angle))
          .multiply(new THREE.Matrix4().makeTranslation(-vol.position.x, 0, -vol.position.z))
          .invert();
        ray = this._raycaster.ray.clone().applyMatrix4(m);
      }
      if (ray.intersectBox(box, target)) {
        // Rotation is distance-preserving, so this distance matches world space even
        // though `target`/`ray` may be in the volume's local (unrotated) frame.
        const distance = ray.origin.distanceTo(target);
        if (!best || distance < best.distance) best = { vol, distance };
      }
    }
    if (!best) return undefined;

    // Trigger volumes are meant to be see-through where floors/walls coincide with them
    // (that's the whole point of clicking "into" a volume), but any real authored entity
    // genuinely in front of the volume — an object, platform, stair, spawn/checkpoint
    // marker, etc. — should block the pick instead of the click passing through to the
    // volume behind it. Note we do NOT require a Mesh: marker helpers include Lines
    // (e.g. the checkpoint/spawn arrow), which must occlude too. Editor helpers with no
    // editorType (gizmo planes, grid, sky) and other volumes are ignored.
    const occluder = this._raycaster
      .intersectObjects(this._scene.children, true)
      .find(h => {
        if (!h.object.visible) return false;
        const et = h.object.userData.editorType as string | undefined;
        return !!et && et !== "floor" && et !== "wall" && et !== "trigger-volume";
      });
    if (occluder && occluder.distance < best.distance) return undefined;

    // Objects also occlude via their model AABB (matches SelectionManager's generous
    // object picking) — a click through a gap in a prop must not fall into the volume.
    const boxHit = castObjectBoxes(this._raycaster.ray, this._scene)[0];
    if (boxHit && boxHit.distance < best.distance) return undefined;

    return best.vol;
  }

  private _clearHover(): void {
    if (this._hoveredId !== null) {
      this._hoveredId = null;
      this._bus.emit("triggervolume:hover", { zoneId: this._activeZoneId, id: null });
    }
  }

  private _clearSelect(): void {
    if (this._selectedId !== null) {
      this._selectedId = null;
      this._bus.emit("triggervolume:select", { zoneId: this._activeZoneId, id: null });
    }
  }

  private _setRayFrom(screen: { x: number; y: number }): void {
    const rect = this._canvas.getBoundingClientRect();
    const ndcX =  ((screen.x - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((screen.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
  }

  /** Where the cursor lands on real geometry (platform top, terrain, floor…) —
   *  so a volume drawn on raised land starts THERE, not at y=0. Falls back to
   *  the y=0 ground plane over empty space. */
  private _surfacePointAt(screen: { x: number; y: number }): THREE.Vector3 {
    this._setRayFrom(screen);
    const hit = this._raycaster
      .intersectObjects(this._scene.children, true)
      .find(h => {
        if (!h.object.visible) return false;
        const et = h.object.userData["editorType"] as string | undefined;
        return !!et && et !== "trigger-volume";
      });
    if (hit) return hit.point.clone();
    const { origin, direction } = this._raycaster.ray;
    const t = -origin.y / direction.y;
    return t > 0 ? this._raycaster.ray.at(t, new THREE.Vector3()) : new THREE.Vector3();
  }

  /** The cursor projected onto the placement's base plane — keeps the drag's
   *  far corner level with the start corner instead of skewing to y=0. */
  private _pointAtBaseY(screen: { x: number; y: number }): THREE.Vector3 | null {
    this._setRayFrom(screen);
    const { origin, direction } = this._raycaster.ray;
    const t = (this._baseY - origin.y) / direction.y;
    return t > 0 ? this._raycaster.ray.at(t, new THREE.Vector3()) : null;
  }

  private _beginPlace(): void {
    const p      = this._surfacePointAt(this._lastScreenPos);
    this._baseY  = p.y;
    this._start  = new THREE.Vector3(snap(p.x), 0, snap(p.z));
    this._height = DEFAULT_HEIGHT;
    this._state  = "PLACING";
    const wire   = makeWireframe(0.1, this._height, 0.1);
    wire.position.set(this._start.x, this._baseY + this._height / 2, this._start.z);
    wire.userData = { editorOnly: false, selectable: false };
    this._scene.add(wire);
    this._preview = wire;
  }

  private _updatePreview(): void {
    if (!this._start || !this._preview) return;
    const p  = this._pointAtBaseY(this._lastScreenPos);
    if (!p) return;
    const ex = snap(p.x);
    const ez = snap(p.z);
    const w  = Math.max(GRID, Math.abs(ex - this._start.x));
    const d  = Math.max(GRID, Math.abs(ez - this._start.z));
    const cx = (this._start.x + ex) / 2;
    const cz = (this._start.z + ez) / 2;
    this._preview.position.set(cx, this._baseY + this._height / 2, cz);
    this._refreshPreviewGeometry(this._preview, w, this._height, d);
  }

  private _refreshPreviewGeometry(wire: THREE.LineSegments, w: number, h: number, d: number): void {
    wire.geometry.dispose();
    wire.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
    const fill = wire.children[0] as THREE.Mesh | undefined;
    if (fill) {
      fill.geometry.dispose();
      fill.geometry = insetBox(w, h, d);
    }
  }

  private _finishPlace(): void {
    if (!this._start || !this._preview) { this._reset(); return; }
    const p = this._pointAtBaseY(this._lastScreenPos);
    if (!p) { this._reset(); return; }
    const ex = snap(p.x);
    const ez = snap(p.z);
    const rawW = Math.abs(ex - this._start.x);
    const rawD = Math.abs(ez - this._start.z);
    // A plain click (no real drag) places nothing — that gesture is selection.
    if (rawW < GRID && rawD < GRID) { this._reset(); return; }
    const w  = Math.max(GRID, rawW);
    const d  = Math.max(GRID, rawD);
    const cx = (this._start.x + ex) / 2;
    const cz = (this._start.z + ez) / 2;

    const vol: TriggerVolume = {
      id:       `vol_${crypto.randomUUID().slice(0, 8)}`,
      label:    "Trigger Volume",
      position: { x: cx, y: this._baseY, z: cz },
      size:     { x: w, y: this._height, z: d },
      zoneId:   this._activeZoneId,
    };
    this._world.transaction("place trigger volume", () => {
      this._world.addTriggerVolume(this._activeZoneId, vol);
    });
    this._reset();
    this._bus.emit("triggervolume:placed", { vol });
  }

  private _reset(): void {
    if (this._preview) {
      this._scene.remove(this._preview);
      this._preview.geometry.dispose();
      (this._preview.material as THREE.Material).dispose();
      this._preview.traverse(o => {   // the interior-fill child
        if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
      });
      this._preview = null;
    }
    this._start  = null;
    this._height = DEFAULT_HEIGHT;
    this._state  = "IDLE";
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._reset();
  }
}
