import { isSelectMode } from "@/editor/selectMode";
import * as THREE from "three";
import { castObjectBoxes } from "@/editor/objectPicking";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { HistoryManager } from "@/editor/HistoryManager";
import type { TriggerVolume, Vec3, Euler3, Scale3, ToolId } from "@/types";

type State = "IDLE" | "PLACING";

const GRID = 0.5;
const DEFAULT_HEIGHT = 2.5;
const AMBER = 0xffaa00;
const ZERO_ROT: Euler3  = { x: 0, y: 0, z: 0 };
const UNIT_SCL: Scale3  = { x: 1, y: 1, z: 1 };

function snap(v: number): number { return Math.round(v / GRID) * GRID; }

function makeWireframe(w: number, h: number, d: number): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  const mat = new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.75 });
  return new THREE.LineSegments(geo, mat);
}

export class TriggerVolumeTool {
  private _state:       State  = "IDLE";
  private _active       = false;
  private _toolId:      ToolId = "select";
  private _height       = DEFAULT_HEIGHT;
  private _start:       THREE.Vector3 | null = null;
  private _preview:     THREE.LineSegments | null = null;
  private _activeZoneId = "demo";
  private _lastWorldPos: Vec3 = { x: 0, y: 0, z: 0 };
  private _lastScreenPos: { x: number; y: number } = { x: 0, y: 0 };
  private _hoveredId:   string | null = null;
  private _selectedId:  string | null = null;
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
      this._bus.on("input:mousemove", ({ worldPos, screenPos }) => {
        this._lastWorldPos  = worldPos;
        this._lastScreenPos = screenPos;
        if (this._state === "PLACING") {
          this._updatePreview(worldPos);
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
      this._bus.on("input:mousedown", ({ button }) => {
        if (!this._active || button !== 0) return;
        if (this._state === "IDLE" && !this._hoveredId) {
          this._clearSelect();
          this._beginPlace(this._lastWorldPos);
        }
      }),
      this._bus.on("input:mouseup", ({ button }) => {
        if (button !== 0) return;
        if (this._state === "PLACING") this._finishPlace(this._lastWorldPos);
      }),

      // Volume selection uses input:click. SelectionManager runs first (registered earlier)
      // and may have already tinted the floor/wall behind the volume. Emitting
      // object:deselected before our object:selected clears SelectionManager's highlight.
      this._bus.on("input:click", ({ button }) => {
        if (button !== 0 || this._state === "PLACING") return;
        // Only pick volumes under the Select or Trigger tools — never while another tool
        // (Spawn/Floor/Wall/…) is placing, so a placement click can't also select a volume.
        if (!isSelectMode(this._toolId) && this._toolId !== "trigger-volume") return;
        const vol = this._findVolumeAt(this._lastScreenPos);
        if (vol) {
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
        }
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
        if (this._preview) this._refreshPreviewGeometry(this._preview, 0.1, this._height, 0.1);
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
      const box = new THREE.Box3(
        new THREE.Vector3(vol.position.x - vol.size.x / 2, vol.position.y,                vol.position.z - vol.size.z / 2),
        new THREE.Vector3(vol.position.x + vol.size.x / 2, vol.position.y + vol.size.y,  vol.position.z + vol.size.z / 2),
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

  private _beginPlace(worldPos: Vec3): void {
    this._start  = new THREE.Vector3(snap(worldPos.x), 0, snap(worldPos.z));
    this._height = DEFAULT_HEIGHT;
    this._state  = "PLACING";
    const wire   = makeWireframe(0.1, this._height, 0.1);
    wire.position.set(this._start.x, this._height / 2, this._start.z);
    wire.userData = { editorOnly: false, selectable: false };
    this._scene.add(wire);
    this._preview = wire;
  }

  private _updatePreview(worldPos: Vec3): void {
    if (!this._start || !this._preview) return;
    const ex = snap(worldPos.x);
    const ez = snap(worldPos.z);
    const w  = Math.max(GRID, Math.abs(ex - this._start.x));
    const d  = Math.max(GRID, Math.abs(ez - this._start.z));
    const cx = (this._start.x + ex) / 2;
    const cz = (this._start.z + ez) / 2;
    this._preview.position.set(cx, this._height / 2, cz);
    this._refreshPreviewGeometry(this._preview, w, this._height, d);
  }

  private _refreshPreviewGeometry(wire: THREE.LineSegments, w: number, h: number, d: number): void {
    wire.geometry.dispose();
    wire.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
  }

  private _finishPlace(worldPos: Vec3): void {
    if (!this._start || !this._preview) { this._reset(); return; }
    const ex = snap(worldPos.x);
    const ez = snap(worldPos.z);
    const w  = Math.max(GRID, Math.abs(ex - this._start.x));
    const d  = Math.max(GRID, Math.abs(ez - this._start.z));
    const cx = (this._start.x + ex) / 2;
    const cz = (this._start.z + ez) / 2;

    if (w < GRID && d < GRID) { this._reset(); return; }

    const vol: TriggerVolume = {
      id:       `vol_${crypto.randomUUID().slice(0, 8)}`,
      label:    "Trigger Volume",
      position: { x: cx, y: 0, z: cz },
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
