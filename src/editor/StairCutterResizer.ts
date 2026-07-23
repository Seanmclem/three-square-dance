import { isSelectMode } from "@/editor/selectMode";
import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, StairDef, StairCutterDef, Vec3, ScreenPos } from "@/types";

const GRID = 0.1;   // drag snap — matches the panel's 0.1 field step (Alt = free)
const MIN  = 0.1;   // smallest allowed cut-box dimension (matches panel step/min)
const HANDLE = 0.22;
const GAP  = 0.3;   // push face handles this far OUTSIDE each face — clear of the box body
                    // and the center move handle so they grab unambiguously.
const DEG2RAD = Math.PI / 180;

type Face = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
type Handle = Face | "center";
const FACES: Face[] = ["+x", "-x", "+y", "-y", "+z", "-z"];
const ALL: Handle[] = [...FACES, "center"];

// Face → (cut-box dimension, local axis). Cut box is BoxGeometry(width, height, depth) = X/Y/Z.
const FACE_DIM: Record<Face, "width" | "height" | "depth"> = {
  "+x": "width", "-x": "width", "+y": "height", "-y": "height", "+z": "depth", "-z": "depth",
};
const FACE_LOCAL: Record<Face, [number, number, number]> = {
  "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1],
};
const AXIS_COLOR: Record<Handle, number> = {
  "+x": 0xff6b6b, "-x": 0xff6b6b, "+y": 0x6bff8a, "-y": 0x6bff8a, "+z": 0x6b8aff, "-z": 0x6b8aff,
  "center": 0xffdd44,
};

function snap(v: number): number { return Math.round(v / GRID) * GRID; }

interface DragOrig { end: Vec3; cutter: StairCutterDef; euler: THREE.Euler }

/**
 * Viewport handles for a stair's CSG cut box (the "CUT BOX"). Shown only when a stair
 * whose `csgCutter` is enabled is selected under the Select tool. Six face handles
 * resize each dimension (opposite face pinned) and a center handle drag-moves the box in
 * the horizontal plane. Rotation is edited in the panel. Writes back via
 * `updateStair({ csgCutter })`; the cut box is a world box centered at `stair.end + offset`
 * with a full XYZ-Euler rotation. Raycasts only its own handle meshes and coexists with
 * the stair's own move gizmo via the shared `gizmo:dragging` mute.
 */
export class StairCutterResizer implements IEditorModule {
  private _activeTool:  ToolId = "select";
  private _stairId:     string | null = null;
  private _zoneId       = "demo";
  private _previewing   = false;
  private _gizmoActive  = false;
  private _altDown      = false;

  private _handles: THREE.Mesh[] = [];
  private _hovered: Handle | null = null;

  private _state: "IDLE" | "DRAG" = "IDLE";
  private _dragHandle: Handle | null = null;
  private _dragOrig:   DragOrig | null = null;

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
        if (!isSelectMode(tool) && this._state === "DRAG") this._cancelDrag();
        this._sync();
      }),
      this._bus.on("object:selected", ({ type, id, zoneId }) => {
        if (this._state === "DRAG") return;   // ignore re-emits mid-drag
        if (type === "stair") { this._stairId = id; this._zoneId = zoneId; }
        else                  { this._stairId = null; }
        this._sync();
      }),
      // Single-object tool — detach on multi-selection (prefab instances etc.).
      this._bus.on("selection:changed", ({ refs }) => {
        if (refs.length > 1 && this._stairId && this._state !== "DRAG") { this._stairId = null; this._sync(); }
      }),
      this._bus.on("object:deselected", () => {
        if (this._state === "DRAG") return;
        this._stairId = null;
        this._sync();
      }),
      this._bus.on("zone:activated", ({ zoneId }) => {
        this._zoneId = zoneId; this._stairId = null; this._sync();
      }),
      // Rebuild/reposition on external change (panel edit, stair move). Skip mid-drag.
      this._bus.on("stair:rebuilt", () => { if (this._state !== "DRAG") this._sync(); }),
      this._bus.on("stair:updated", () => { if (this._state !== "DRAG") this._sync(); }),
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

  // ── State ─────────────────────────────────────────────────────────────────

  private _shouldShow(): boolean {
    return isSelectMode(this._activeTool) && !this._previewing && !!this._cutter();
  }

  private _stair(): StairDef | undefined {
    if (!this._stairId) return undefined;
    return this._world.zones.get(this._zoneId)?.stairs.find(s => s.id === this._stairId);
  }

  private _cutter(): StairCutterDef | undefined {
    return this._stair()?.csgCutter;
  }

  private _sync(): void {
    if (!this._shouldShow()) { this._clearHandles(); return; }
    if (this._handles.length === 0) this._buildHandles();
    this._positionHandles();
  }

  private _buildHandles(): void {
    for (const h of ALL) {
      const s = h === "center" ? HANDLE * 1.25 : HANDLE;
      const geo = new THREE.BoxGeometry(s, s, s);
      const mat = new THREE.MeshBasicMaterial({
        color: AXIS_COLOR[h], depthTest: false, depthWrite: false, transparent: true, opacity: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 5;
      mesh.userData.hideInGame = true;
      mesh.userData.handleId = h;
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
    if (this._hovered !== null) this._bus.emit("collider:handle-hover", { hovering: false });
    this._hovered = null;
  }

  private _centerOf(stair: StairDef, cutter: StairCutterDef): THREE.Vector3 {
    return new THREE.Vector3(stair.end.x + cutter.offset.x, stair.end.y + cutter.offset.y, stair.end.z + cutter.offset.z);
  }

  private _eulerOf(cutter: StairCutterDef): THREE.Euler {
    const r = cutter.rotation ?? { x: 0, y: 0, z: 0 };
    return new THREE.Euler(r.x * DEG2RAD, r.y * DEG2RAD, r.z * DEG2RAD, "XYZ");
  }

  private _positionHandles(): void {
    const stair = this._stair(), cutter = this._cutter();
    if (!stair || !cutter || this._handles.length === 0) return;
    const center = this._centerOf(stair, cutter);
    const euler  = this._eulerOf(cutter);
    const half = { width: cutter.width / 2, height: cutter.height / 2, depth: cutter.depth / 2 };
    for (const m of this._handles) {
      const h = m.userData.handleId as Handle;
      if (h === "center") { m.position.copy(center); continue; }
      const [lx, ly, lz] = FACE_LOCAL[h];
      const n = new THREE.Vector3(lx, ly, lz).applyEuler(euler); // world face normal (unit)
      // A GAP outside the face (not on it) so the handle clears the box body + center handle.
      const halfExtent = half[FACE_DIM[h]] + GAP;
      m.position.copy(center).addScaledVector(n, halfExtent);
    }
  }

  // ── Picking ─────────────────────────────────────────────────────────────────

  private _rayFrom(screenPos: ScreenPos): THREE.Ray {
    const rect = this._canvas.getBoundingClientRect();
    const ndcX =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
    return this._raycaster.ray;
  }

  private _castHandles(screenPos: ScreenPos): Handle | null {
    this._rayFrom(screenPos);
    const hit = this._raycaster.intersectObjects(this._handles, false)[0];
    return hit ? (hit.object.userData.handleId as Handle) : null;
  }

  private _onHover(screenPos: ScreenPos): void {
    const h = this._castHandles(screenPos);
    if (h === this._hovered) return;
    this._hovered = h;
    for (const m of this._handles) {
      const id = m.userData.handleId as Handle;
      const mat = m.material as THREE.MeshBasicMaterial;
      const on = id === h;
      mat.color.setHex(on ? 0xffffff : AXIS_COLOR[id]);
      mat.opacity = on ? 1.0 : 0.6;
      m.scale.setScalar(on ? 1.4 : 1.0);
    }
    // Suspend the stair's TransformControls while a handle is hot, so the handle wins
    // the pick instead of the drag falling through to the gizmo (ColliderEditor idiom).
    this._bus.emit("collider:handle-hover", { hovering: h !== null });
  }

  // ── Dragging ──────────────────────────────────────────────────────────────

  private _onMouseDown(screenPos: ScreenPos): void {
    const h = this._castHandles(screenPos);
    if (!h) return;
    const stair = this._stair(), cutter = this._cutter();
    if (!stair || !cutter) return;
    this._dragHandle = h;
    this._dragOrig = { end: { ...stair.end }, cutter: structuredClone(cutter), euler: this._eulerOf(cutter) };
    this._state = "DRAG";
    this._world.beginTransaction("resize cut box");
    this._bus.emit("gizmo:dragging", { isDragging: true });
  }

  private _onDragMove(screenPos: ScreenPos): void {
    const o = this._dragOrig, h = this._dragHandle;
    if (!o || !h || !this._stairId) return;
    const ray = this._rayFrom(screenPos);
    const origCenter = new THREE.Vector3(o.end.x + o.cutter.offset.x, o.end.y + o.cutter.offset.y, o.end.z + o.cutter.offset.z);

    let cutter: StairCutterDef;

    if (h === "center") {
      // Move in the horizontal plane through the box center; vertical stays panel-driven.
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -origCenter.y);
      const hit = new THREE.Vector3();
      if (!ray.intersectPlane(plane, hit)) return;
      const ox = hit.x - o.end.x, oz = hit.z - o.end.z;
      cutter = { ...o.cutter, offset: {
        x: this._altDown ? ox : snap(ox),
        y: o.cutter.offset.y,
        z: this._altDown ? oz : snap(oz),
      } };
    } else {
      // Resize along the (rotated) face normal, opposite face pinned.
      // FACE_LOCAL already encodes the face's outward direction in `n` (e.g. "-x" → −x̂),
      // so measurements along n need no extra face sign: the dragged face sits at
      // center + n·(size/2) and the pinned opposite face at center − n·(size/2).
      const [lx, ly, lz] = FACE_LOCAL[h];
      const n = new THREE.Vector3(lx, ly, lz).applyEuler(o.euler).normalize();
      const dim = FACE_DIM[h];
      const sOrig = o.cutter[dim];
      const fixed = origCenter.clone().addScaledVector(n, -sOrig / 2); // pinned opposite face
      const closest = this._closestPointOnAxis(ray, origCenter, n);
      if (!closest) return;
      // Handles rest GAP outside their face — subtract it so the face lands under the
      // mouse minus that resting offset (otherwise every grab grows the box by GAP).
      const proj = closest.clone().sub(fixed).dot(n) - GAP;
      let newSize = proj;
      newSize = Math.max(MIN, this._altDown ? newSize : snap(newSize));
      const newCenter = fixed.clone().addScaledVector(n, newSize / 2);
      cutter = {
        ...o.cutter,
        [dim]: newSize,
        offset: { x: newCenter.x - o.end.x, y: newCenter.y - o.end.y, z: newCenter.z - o.end.z },
      };
    }

    this._world.updateStair(this._zoneId, this._stairId, { csgCutter: cutter });
    this._positionHandles();
  }

  /** Point on the line (P0, dir n) closest to the camera ray; null if near-parallel. */
  private _closestPointOnAxis(ray: THREE.Ray, p0: THREE.Vector3, n: THREE.Vector3): THREE.Vector3 | null {
    const d = ray.direction;                 // unit
    const w0 = ray.origin.clone().sub(p0);
    const b = d.dot(n);
    const denom = 1 - b * b;                  // a=c=1 (both unit)
    if (Math.abs(denom) < 1e-6) return null;  // ray parallel to axis
    const dd = d.dot(w0), e = n.dot(w0);
    const tc = (e - b * dd) / denom;          // param along the axis line
    return p0.clone().addScaledVector(n, tc);
  }

  private _commitDrag(): void {
    this._world.commitTransaction();
    this._endDrag();
  }

  private _cancelDrag(): void {
    const o = this._dragOrig;
    if (o && this._stairId) {
      this._world.updateStair(this._zoneId, this._stairId, { csgCutter: o.cutter });
    }
    this._world.abortTransaction();
    this._endDrag();
  }

  private _endDrag(): void {
    this._state = "IDLE";
    this._dragHandle = null;
    this._dragOrig = null;
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }
}
