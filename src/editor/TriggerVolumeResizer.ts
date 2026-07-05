import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, TriggerVolume, Vec3, ScreenPos } from "@/types";

const GRID = 0.5;
const MIN  = 0.5;   // smallest allowed size along any axis
const HANDLE = 0.24;

type Face = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
const FACES: Face[] = ["+x", "-x", "+y", "-y", "+z", "-z"];

// Axis-tinted so the push/pull affordance reads (matches the panel's X/Y/Z colors).
const AXIS_COLOR: Record<Face, number> = {
  "+x": 0xff6b6b, "-x": 0xff6b6b,
  "+y": 0x6bff8a, "-y": 0x6bff8a,
  "+z": 0x6b8aff, "-z": 0x6b8aff,
};

function snap(v: number): number { return Math.round(v / GRID) * GRID; }

interface DragOrig { position: Vec3; size: Vec3; theta: number }

/**
 * Six push/pull face handles (±X, ±Y, ±Z) for the selected trigger volume. Dragging a
 * face grows/shrinks that dimension with the opposite face pinned. Shown only for the
 * selected volume under the Select tool. Raycasts ONLY its own handle meshes (never the
 * scene), so the TransformControls drag-plane and other geometry can't steal the pick.
 * Coexists with GizmoManager's move/rotate gizmo via the shared `gizmo:dragging` mute.
 */
export class TriggerVolumeResizer implements IEditorModule {
  private _activeTool:  ToolId = "select";
  private _activeZoneId = "demo";
  private _selectedId:  string | null = null;
  private _previewing   = false;
  private _gizmoActive  = false;   // an external TransformControls drag is in progress
  private _altDown      = false;

  private _handles:  THREE.Mesh[] = [];
  private _hovered:  Face | null = null;

  private _state: "IDLE" | "DRAG" = "IDLE";
  private _dragFace: Face | null = null;
  private _dragOrig: DragOrig | null = null;

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:  THREE.Scene,
    private readonly _world:  WorldState,
    private readonly _bus:    EventBus,
    private readonly _camera: THREE.Camera,
    private readonly _canvas: HTMLCanvasElement,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._activeTool = tool;
        if (tool !== "select" && this._state === "DRAG") this._cancelDrag();
        this._sync();
      }),
      this._bus.on("triggervolume:select", ({ id }) => { this._selectedId = id; this._sync(); }),
      this._bus.on("object:deselected", () => { this._selectedId = null; this._sync(); }),
      this._bus.on("zone:activated", ({ zoneId }) => {
        this._activeZoneId = zoneId;
        this._selectedId = null;
        this._sync();
      }),
      this._bus.on("triggervolume:removed", ({ id }) => {
        if (id === this._selectedId) { this._selectedId = null; this._sync(); }
      }),
      // External change (panel edit, gizmo move/rotate). Reposition; skip mid-drag (we
      // reposition inline during our own drag).
      this._bus.on("triggervolume:updated", ({ id }) => {
        if (id === this._selectedId && this._state !== "DRAG") this._positionHandles();
      }),
      this._bus.on("preview:start", () => { this._previewing = true;  this._sync(); }),
      this._bus.on("preview:stop",  () => { this._previewing = false; this._sync(); }),

      this._bus.on("gizmo:dragging", ({ isDragging }) => {
        this._gizmoActive = isDragging && this._state !== "DRAG";
      }),
      this._bus.on("input:mousemove", ({ screenPos }) => {
        if (this._state === "DRAG") { this._onDragMove(screenPos); return; }
        if (!this._shouldShow() || this._gizmoActive) return;
        this._onHover(screenPos);
      }),
      this._bus.on("input:mousedown", ({ button, screenPos }) => {
        if (button !== 0 || !this._shouldShow() || this._gizmoActive) return;
        this._onMouseDown(screenPos);
      }),
      this._bus.on("input:mouseup", ({ button }) => {
        if (button === 0 && this._state === "DRAG") this._commitDrag();
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") this._altDown = true;
        if (code === "Escape" && this._state === "DRAG") this._cancelDrag();
      }),
      this._bus.on("input:keyup", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") this._altDown = false;
      }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
    this._clearHandles();
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  private _shouldShow(): boolean {
    return this._activeTool === "select" && this._selectedId !== null && !this._previewing;
  }

  private _selectedVolume(): TriggerVolume | undefined {
    if (!this._selectedId) return undefined;
    return this._world.zones.get(this._activeZoneId)?.triggerVolumes?.find(v => v.id === this._selectedId);
  }

  /** Build handles if we should show and they're missing; otherwise reposition or clear. */
  private _sync(): void {
    if (!this._shouldShow() || !this._selectedVolume()) { this._clearHandles(); return; }
    if (this._handles.length === 0) this._buildHandles();
    this._positionHandles();
  }

  private _buildHandles(): void {
    for (const face of FACES) {
      const geo = new THREE.BoxGeometry(HANDLE, HANDLE, HANDLE);
      const mat = new THREE.MeshBasicMaterial({
        color: AXIS_COLOR[face], depthTest: false, depthWrite: false, transparent: true, opacity: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 4;
      mesh.userData.hideInGame = true;
      mesh.userData.faceAxis = face;
      this._scene.add(mesh);
      this._handles.push(mesh);
    }
  }

  private _clearHandles(): void {
    for (const m of this._handles) {
      this._scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this._handles.length = 0;
    this._hovered = null;
  }

  /** Place each face handle at its face-center for the current volume. */
  private _positionHandles(): void {
    const vol = this._selectedVolume();
    if (!vol || this._handles.length === 0) return;
    const p = this._faceCenters(vol.position, vol.size, ((vol.rotation?.y ?? 0) * Math.PI) / 180);
    for (const m of this._handles) {
      const c = p[m.userData.faceAxis as Face];
      m.position.set(c.x, c.y, c.z);
    }
  }

  private _faceCenters(pos: Vec3, size: Vec3, theta: number): Record<Face, Vec3> {
    const cx = pos.x, cz = pos.z;
    const baseY = pos.y, topY = pos.y + size.y, midY = pos.y + size.y / 2;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const eX = { x: cos, z: -sin };   // local +X in world XZ
    const eZ = { x: sin, z: cos };    // local +Z in world XZ
    const hx = size.x / 2, hz = size.z / 2;
    return {
      "+x": { x: cx + eX.x * hx, y: midY, z: cz + eX.z * hx },
      "-x": { x: cx - eX.x * hx, y: midY, z: cz - eX.z * hx },
      "+z": { x: cx + eZ.x * hz, y: midY, z: cz + eZ.z * hz },
      "-z": { x: cx - eZ.x * hz, y: midY, z: cz - eZ.z * hz },
      "+y": { x: cx, y: topY,  z: cz },
      "-y": { x: cx, y: baseY, z: cz },
    };
  }

  // ── Picking ─────────────────────────────────────────────────────────────────

  private _castHandles(screenPos: ScreenPos): Face | null {
    const rect = this._canvas.getBoundingClientRect();
    const ndcX =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
    const hit = this._raycaster.intersectObjects(this._handles, false)[0];
    return hit ? (hit.object.userData.faceAxis as Face) : null;
  }

  private _onHover(screenPos: ScreenPos): void {
    const face = this._castHandles(screenPos);
    if (face === this._hovered) return;
    this._hovered = face;
    for (const m of this._handles) {
      const mat = m.material as THREE.MeshBasicMaterial;
      const isHover = m.userData.faceAxis === face;
      mat.color.setHex(isHover ? 0xffffff : AXIS_COLOR[m.userData.faceAxis as Face]);
      mat.opacity = isHover ? 1.0 : 0.6;
      m.scale.setScalar(isHover ? 1.4 : 1.0);
    }
  }

  // ── Dragging ──────────────────────────────────────────────────────────────

  private _onMouseDown(screenPos: ScreenPos): void {
    const face = this._castHandles(screenPos);
    if (!face) return;
    const vol = this._selectedVolume();
    if (!vol) return;
    this._dragFace = face;
    this._dragOrig = {
      position: { ...vol.position },
      size:     { ...vol.size },
      theta:    ((vol.rotation?.y ?? 0) * Math.PI) / 180,
    };
    // Set DRAG before emitting so our own gizmo:dragging doesn't mute us (mirrors NodeDragger).
    this._state = "DRAG";
    this._world.beginTransaction("resize trigger volume");
    this._bus.emit("gizmo:dragging", { isDragging: true });
  }

  private _onDragMove(screenPos: ScreenPos): void {
    const o = this._dragOrig, face = this._dragFace;
    if (!o || !face || !this._selectedId) return;

    const rect = this._canvas.getBoundingClientRect();
    const ndcX =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
    const ray = this._raycaster.ray;
    const hit = new THREE.Vector3();

    const position = { ...o.position };
    const size     = { ...o.size };

    if (face === "+y" || face === "-y") {
      // Vertical drag: intersect a camera-facing vertical plane through the box center.
      const camDir = new THREE.Vector3(this._camera.position.x - o.position.x, 0, this._camera.position.z - o.position.z);
      if (camDir.lengthSq() < 1e-6) camDir.set(0, 0, 1);
      camDir.normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, new THREE.Vector3(o.position.x, 0, o.position.z));
      if (!ray.intersectPlane(plane, hit)) return;
      if (face === "+y") {
        const top = this._altDown ? hit.y : snap(hit.y);
        size.y = Math.max(MIN, top - o.position.y);      // bottom pinned
      } else {
        const topY = o.position.y + o.size.y;            // top pinned
        const bottom = Math.min(this._altDown ? hit.y : snap(hit.y), topY - MIN);
        position.y = bottom;
        size.y = topY - bottom;
      }
    } else {
      // Horizontal drag: intersect the mid-height plane, project onto the rotated axis.
      const midY = o.position.y + o.size.y / 2;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -midY);
      if (!ray.intersectPlane(plane, hit)) return;
      const cos = Math.cos(o.theta), sin = Math.sin(o.theta);
      const which: "x" | "z" = (face === "+x" || face === "-x") ? "x" : "z";
      const axis = which === "x" ? { x: cos, z: -sin } : { x: sin, z: cos };
      const faceSign = face[0] === "+" ? 1 : -1;
      const sOrig = which === "x" ? o.size.x : o.size.z;
      // Opposite (pinned) face center along the axis.
      const fixed = {
        x: o.position.x - faceSign * axis.x * (sOrig / 2),
        z: o.position.z - faceSign * axis.z * (sOrig / 2),
      };
      const proj = (hit.x - fixed.x) * axis.x + (hit.z - fixed.z) * axis.z;
      let newSize = faceSign * proj;
      newSize = Math.max(MIN, this._altDown ? newSize : snap(newSize));
      position.x = fixed.x + faceSign * axis.x * (newSize / 2);
      position.z = fixed.z + faceSign * axis.z * (newSize / 2);
      size[which] = newSize;
    }

    this._world.updateTriggerVolume(this._activeZoneId, this._selectedId, { position, size });
    this._positionHandles();
  }

  private _commitDrag(): void {
    this._world.commitTransaction();
    this._endDrag();
  }

  private _cancelDrag(): void {
    const o = this._dragOrig;
    // abortTransaction only discards the journal — restore the live volume first.
    if (o && this._selectedId) {
      this._world.updateTriggerVolume(this._activeZoneId, this._selectedId, { position: o.position, size: o.size });
    }
    this._world.abortTransaction();
    this._endDrag();
  }

  private _endDrag(): void {
    this._state = "IDLE";
    this._dragFace = null;
    this._dragOrig = null;
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }
}
