import { isSelectMode } from "@/editor/selectMode";
import * as THREE from "three";
import { resolveShapeParams, isBrush } from "@/builders/ShapeBuilder";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, ShapeDef, ScreenPos } from "@/types";

const SNAP   = 0.25;
const HANDLE = 0.22;
const GAP    = 0.35;

type Face = "+x" | "-x" | "+z" | "-z" | "+y";

const AXIS_COLOR: Record<Face, number> = {
  "+x": 0xff6b6b, "-x": 0xff6b6b,
  "+z": 0x6b8aff, "-z": 0x6b8aff,
  "+y": 0x6bff8a,
};

const snap = (v: number): number => Math.round(v / SNAP) * SNAP;

interface DragOrig {
  def:    ShapeDef;              // structuredClone of the pre-drag def
  axisW:  THREE.Vector3;         // world direction of the dragged local axis
  originW: THREE.Vector3;        // world point the new dimension is measured FROM
}

/**
 * Push/pull face handles for the selected parametric shape (v4.10.0), toggled from
 * the Geometry panel ("shape:resize-toggle"). TriggerVolumeResizer pattern — raycasts
 * only its own handles, live-updates through updateShape inside a drag-scoped
 * transaction (one undo step), gizmo:dragging mute both ways. Local-axis aware, so
 * handles work on shapes with any XYZ rotation:
 *   box:      ±X width · ±Z depth · +Y height (opposite face pinned; base pinned for +Y)
 *   wedge:    ±X width · ±Z depth · +Y heightHigh
 *   cylinder: four radial handles (both radii shift together, cones stay cones) · +Y height
 * Brush shapes get no handles — their vertices ARE the handles (BrushVertexEditor).
 */
export class ShapeResizer implements IEditorModule {
  private _activeTool: ToolId = "select";
  private _zoneId: string | null = null;
  private _selectedId: string | null = null;
  private _enabled = false;
  private _previewing = false;
  private _gizmoActive = false;
  private _altDown = false;

  private _handles: THREE.Mesh[] = [];
  private _hovered: Face | null = null;
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
        if (!isSelectMode(tool) && this._state === "DRAG") this._cancelDrag();
        this._sync();
      }),
      this._bus.on("object:selected", payload => {
        const next = payload.type === "shape" ? payload.id : null;
        if (next !== this._selectedId) this._enabled = false;   // toggle is per-selection
        this._selectedId = next;
        this._zoneId = payload.zoneId;
        this._sync();
      }),
      this._bus.on("object:deselected", () => { this._selectedId = null; this._enabled = false; this._sync(); }),
      // Single-object tool — detach on multi-selection (prefab instances etc.).
      this._bus.on("selection:changed", ({ refs }) => {
        if (refs.length > 1 && this._selectedId) { this._selectedId = null; this._enabled = false; this._sync(); }
      }),
      this._bus.on("shape:removed", ({ id }) => {
        if (id === this._selectedId) { this._selectedId = null; this._sync(); }
      }),
      this._bus.on("shape:resize-toggle", ({ enabled }) => { this._enabled = enabled; this._sync(); }),
      this._bus.on("shape:updated", ({ id }) => {
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

  // ── Visibility ──────────────────────────────────────────────────────────────

  private _shouldShow(): boolean {
    if (!isSelectMode(this._activeTool) || !this._enabled || this._previewing) return false;
    const s = this._selectedShape();
    return !!s && !isBrush(s);
  }

  private _selectedShape(): ShapeDef | undefined {
    if (!this._selectedId || !this._zoneId) return undefined;
    return this._world.zones.get(this._zoneId)?.shapes?.find(s => s.id === this._selectedId);
  }

  private _faces(shape: ShapeDef): Face[] {
    void shape;
    return ["+x", "-x", "+z", "-z", "+y"];
  }

  private _sync(): void {
    const shape = this._shouldShow() ? this._selectedShape() : undefined;
    if (!shape) { this._clearHandles(); return; }
    if (this._handles.length === 0) this._buildHandles(shape);
    this._positionHandles();
  }

  private _buildHandles(shape: ShapeDef): void {
    for (const face of this._faces(shape)) {
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

  /** def position/rotation → world matrix (the mesh transform; no scale). */
  private _shapeMatrix(shape: ShapeDef): THREE.Matrix4 {
    const D2R = Math.PI / 180;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(shape.position.x, shape.position.y, shape.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ")),
      new THREE.Vector3(1, 1, 1),
    );
  }

  /** Local positions of each handle for the current params. */
  private _localHandlePos(shape: ShapeDef, face: Face): THREE.Vector3 {
    const p = resolveShapeParams(shape);
    const topY = shape.kind === "wedge" ? p.heightHigh : p.height;
    const midY = topY / 2;
    const hx = (shape.kind === "cylinder" ? p.radiusBottom : p.width / 2) + GAP;
    const hz = (shape.kind === "cylinder" ? p.radiusBottom : p.depth / 2) + GAP;
    switch (face) {
      case "+x": return new THREE.Vector3(hx, midY, 0);
      case "-x": return new THREE.Vector3(-hx, midY, 0);
      case "+z": return new THREE.Vector3(0, midY, hz);
      case "-z": return new THREE.Vector3(0, midY, -hz);
      case "+y": return new THREE.Vector3(0, topY + GAP, 0);
    }
  }

  private _positionHandles(): void {
    const shape = this._selectedShape();
    if (!shape || this._handles.length === 0) return;
    const m = this._shapeMatrix(shape);
    for (const h of this._handles) {
      h.position.copy(this._localHandlePos(shape, h.userData.faceAxis as Face)).applyMatrix4(m);
    }
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
    // Let TransformControls yield the pick while a handle is hot (ColliderEditor idiom).
    this._bus.emit("collider:handle-hover", { hovering: face !== null });
  }

  // ── Dragging ────────────────────────────────────────────────────────────────

  private _onMouseDown(screenPos: ScreenPos): void {
    const face = this._castHandles(screenPos);
    if (!face) return;
    const shape = this._selectedShape();
    if (!shape) return;

    const m = this._shapeMatrix(shape);
    const rot = new THREE.Matrix4().extractRotation(m);
    const p = resolveShapeParams(shape);

    // World axis + fixed origin the new dimension is measured from.
    let localAxis: THREE.Vector3, localOrigin: THREE.Vector3;
    if (face === "+y") {
      localAxis = new THREE.Vector3(0, 1, 0);
      localOrigin = new THREE.Vector3(0, 0, 0);                       // base pinned
    } else {
      const sign = face[0] === "+" ? 1 : -1;
      const ax = face[1] === "x";
      localAxis = ax ? new THREE.Vector3(sign, 0, 0) : new THREE.Vector3(0, 0, sign);
      const topY = shape.kind === "wedge" ? p.heightHigh : p.height;
      localOrigin = shape.kind === "cylinder"
        ? new THREE.Vector3(0, topY / 2, 0)                            // radius measured from the axis
        : localAxis.clone().multiplyScalar(-(ax ? p.width : p.depth) / 2).setY(topY / 2); // opposite face pinned
    }

    this._dragFace = face;
    this._dragOrig = {
      def:     structuredClone(shape),
      axisW:   localAxis.clone().applyMatrix4(rot).normalize(),
      originW: localOrigin.clone().applyMatrix4(m),
    };
    this._state = "DRAG";
    this._world.beginTransaction("resize shape");
    this._bus.emit("gizmo:dragging", { isDragging: true });
  }

  private _onDragMove(screenPos: ScreenPos): void {
    const o = this._dragOrig, face = this._dragFace;
    const shape = this._selectedShape();
    if (!o || !face || !shape || !this._zoneId || !this._selectedId) return;

    const rect = this._canvas.getBoundingClientRect();
    const ndcX =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
    const ray = this._raycaster.ray;

    // Closest point on the axis line to the mouse ray → distance from originW.
    // Minimizing |O + t·d − (ro + s·rd)|² gives t = (d·w0 − b·(rd·w0)) / (1 − b²).
    const w0 = ray.origin.clone().sub(o.originW);
    const b = o.axisW.dot(ray.direction);
    const denom = 1 - b * b;
    if (Math.abs(denom) < 1e-6) return;   // ray parallel to axis
    const t = (o.axisW.dot(w0) - b * ray.direction.dot(w0)) / denom;
    let dim = this._altDown ? t : snap(t);

    const od = o.def;
    const op = resolveShapeParams(od);
    const changes: Partial<ShapeDef> = {};

    if (face === "+y") {
      dim = Math.max(0.05, dim);
      if (od.kind === "wedge") changes.heightHigh = dim;
      else                     changes.height = dim;
    } else if (od.kind === "cylinder") {
      const r = Math.max(0.05, dim);
      const delta = r - op.radiusBottom;
      changes.radiusBottom = r;
      changes.radiusTop    = op.radiusTop < 1e-3 ? 0 : Math.max(0.05, op.radiusTop + delta);
    } else {
      dim = Math.max(0.05, dim);
      const ax = face[1] === "x";
      if (ax) changes.width = dim; else changes.depth = dim;
      // Keep the opposite face pinned: local footprint center shifts by half the
      // size change along the dragged (world-rotated) axis.
      const shift = o.axisW.clone().multiplyScalar((dim - (ax ? op.width : op.depth)) / 2);
      changes.position = {
        x: od.position.x + shift.x,
        y: od.position.y + shift.y,
        z: od.position.z + shift.z,
      };
    }

    this._world.updateShape(this._zoneId, this._selectedId, changes);
    this._positionHandles();
  }

  private _commitDrag(): void {
    this._world.commitTransaction();
    this._endDrag();
  }

  private _cancelDrag(): void {
    const o = this._dragOrig;
    if (o && this._zoneId && this._selectedId) {
      this._world.updateShape(this._zoneId, this._selectedId, {
        position: o.def.position, width: o.def.width, depth: o.def.depth, height: o.def.height,
        heightHigh: o.def.heightHigh, radiusBottom: o.def.radiusBottom, radiusTop: o.def.radiusTop,
      });
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
