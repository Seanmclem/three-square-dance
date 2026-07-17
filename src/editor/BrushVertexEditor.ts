import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { isBrush } from "@/builders/ShapeBuilder";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, ShapeDef, ScreenPos, Vec3 } from "@/types";

const SNAP = 0.25;             // local-space grid for vertex edits (Alt = free)
const HANDLE_R = 0.09;
const COLOR        = 0xffaa33;  // brush-corner amber
const COLOR_HOVER  = 0xffffff;
const COLOR_SELECT = 0x00ffff;  // selected vertex (vertex mode)
const MIN_VERTS = 4;
const SUSPEND_SOURCE = "vertex-mode";

const snap = (v: number): number => Math.round(v / SNAP) * SNAP;

/**
 * Quake/UE-style brush editing for shapes in brush mode (v4.10.0): a sphere handle
 * per local vertex of `ShapeDef.mesh.vertices`.
 *  - drag a handle → move that corner (camera-facing plane, snapped to 0.25 local,
 *    Alt = free); live hull rebuild through updateShape inside one drag transaction.
 *  - right-click a handle → delete the corner (min 4 kept).
 *    Convexity is guaranteed by construction: geometry + collider are always the
 *    hull of the cloud.
 * NodeDragger/TriggerVolumeResizer idioms: raycasts only its own handles,
 * gizmo:dragging mute both ways, Escape cancels.
 */
export class BrushVertexEditor implements IEditorModule {
  private _activeTool: ToolId = "select";
  private _zoneId: string | null = null;
  private _selectedId: string | null = null;
  private _previewing = false;
  private _gizmoActive = false;
  private _altDown = false;

  private _handles: THREE.Mesh[] = [];
  private _hovered: number | null = null;

  private _state: "IDLE" | "DRAG" = "IDLE";
  private _dragIndex = -1;
  private _dragPlane = new THREE.Plane();
  private _origVertices: Vec3[] | null = null;

  // Vertex-mode extras (Phase 23): selected vertex + its 3-axis gizmo.
  private _selectedVertex: number | null = null;
  private _suspended = false;
  private _controls: TransformControls | null = null;
  private readonly _proxy = new THREE.Group();
  private _tcDragging = false;
  private _tcStart = new THREE.Vector3();

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
    // Vertex-mode 3-axis gizmo on the selected corner (ColliderEditor proxy pattern).
    this._scene.add(this._proxy);
    this._controls = new TransformControls(this._camera as THREE.PerspectiveCamera, this._canvas);
    this._controls.setMode("translate");
    this._controls.setSize(0.4);
    this._controls.setTranslationSnap(SNAP);
    this._scene.add(this._controls);
    this._controls.addEventListener("dragging-changed", e => {
      const isDragging = (e as unknown as { value: boolean }).value;
      this._bus.emit("gizmo:dragging", { isDragging });
      if (isDragging) {
        this._tcDragging = true;
        this._tcStart.copy(this._proxy.position);
        const shape = this._selectedShape();
        this._origVertices = shape ? structuredClone(shape.mesh!.vertices) : null;
        this._world.beginTransaction("move brush corner");
      } else {
        this._tcDragging = false;
        this._origVertices = null;
        this._world.commitTransaction();
        this._sync();
      }
    });
    this._controls.addEventListener("objectChange", () => this._onGizmoChange());

    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._activeTool = tool;
        if (tool !== "select-vertex" && this._state === "DRAG") this._cancelDrag();
        this._sync();
      }),
      this._bus.on("object:selected", payload => {
        this._selectedId = payload.type === "shape" ? payload.id : null;
        this._zoneId = payload.zoneId;
        this._selectedVertex = payload.type === "shape" ? (payload.vertexIndex ?? null) : null;
        this._sync();
      }),
      this._bus.on("object:deselected", () => { this._selectedId = null; this._sync(); }),
      this._bus.on("shape:removed", ({ id }) => {
        if (id === this._selectedId) { this._selectedId = null; this._sync(); }
      }),
      this._bus.on("shape:updated", ({ id }) => {
        if (id === this._selectedId && this._state !== "DRAG" && !this._tcDragging) this._sync();
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
      this._bus.on("input:rightclick", ({ screenPos }) => {
        if (!this._shouldShow() || this._state === "DRAG") return;
        this._onDeleteCorner(screenPos);
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") { this._altDown = true; this._controls?.setTranslationSnap(null); }
        if (code === "Escape") {
          if (this._state === "DRAG") this._cancelDrag();
          if (this._tcDragging) this._cancelTcDrag();
        }
      }),
      this._bus.on("input:keyup", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") { this._altDown = false; this._controls?.setTranslationSnap(SNAP); }
      }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
    this._setSuspended(false);
    if (this._controls) {
      this._controls.detach();
      this._scene.remove(this._controls);
      this._controls.dispose();
      this._controls = null;
    }
    this._scene.remove(this._proxy);
    this._clearHandles();
  }

  // ── State ───────────────────────────────────────────────────────────────────

  private _shouldShow(): boolean {
    // Phase 23: corner handles live in VERTEX mode only (declutters object mode).
    if (this._activeTool !== "select-vertex" || this._previewing) return false;
    const s = this._selectedShape();
    return !!s && isBrush(s);
  }

  private _setSuspended(on: boolean): void {
    if (on === this._suspended) return;
    this._suspended = on;
    this._bus.emit("gizmo:suspend", { source: SUSPEND_SOURCE, suspended: on });
  }

  private _selectedShape(): ShapeDef | undefined {
    if (!this._selectedId || !this._zoneId) return undefined;
    return this._world.zones.get(this._zoneId)?.shapes?.find(s => s.id === this._selectedId);
  }

  private _shapeMatrix(shape: ShapeDef): THREE.Matrix4 {
    const D2R = Math.PI / 180;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(shape.position.x, shape.position.y, shape.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ")),
      new THREE.Vector3(1, 1, 1),
    );
  }

  private _sync(): void {
    const shape = this._shouldShow() ? this._selectedShape() : undefined;
    this._setSuspended(!!shape);   // vertex mode + brush selected → entity gizmo yields
    if (!shape) {
      this._clearHandles();
      if (!this._tcDragging) { this._controls?.detach(); if (this._controls) this._controls.visible = false; }
      return;
    }
    const verts = shape.mesh!.vertices;
    if (this._selectedVertex !== null && this._selectedVertex >= verts.length) this._selectedVertex = null;
    // Rebuild the handle pool when the count changes; otherwise just reposition.
    if (this._handles.length !== verts.length) {
      this._clearHandles();
      for (let i = 0; i < verts.length; i++) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(HANDLE_R, 10, 8),
          new THREE.MeshBasicMaterial({ color: COLOR, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85 }),
        );
        mesh.renderOrder = 4;
        mesh.userData.hideInGame = true;
        mesh.userData.vertexIndex = i;
        this._scene.add(mesh);
        this._handles.push(mesh);
      }
    }
    const m = this._shapeMatrix(shape);
    for (let i = 0; i < verts.length; i++) {
      this._handles[i]!.position.set(verts[i]!.x, verts[i]!.y, verts[i]!.z).applyMatrix4(m);
      const mat = this._handles[i]!.material as THREE.MeshBasicMaterial;
      mat.color.setHex(i === this._selectedVertex ? COLOR_SELECT : COLOR);
    }
    // 3-axis gizmo on the selected corner.
    if (!this._tcDragging && this._controls) {
      if (this._selectedVertex !== null) {
        this._proxy.position.copy(this._handles[this._selectedVertex]!.position);
        this._controls.attach(this._proxy);
        this._controls.visible = true;
      } else {
        this._controls.detach();
        this._controls.visible = false;
      }
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

  // ── Picking ─────────────────────────────────────────────────────────────────

  private _setRayFrom(screenPos: ScreenPos): void {
    const rect = this._canvas.getBoundingClientRect();
    const ndcX =  ((screenPos.x - rect.left) / rect.width)  * 2 - 1;
    const ndcY = -((screenPos.y - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);
  }

  private _castHandles(screenPos: ScreenPos): number | null {
    this._setRayFrom(screenPos);
    const hit = this._raycaster.intersectObjects(this._handles, false)[0];
    return hit ? (hit.object.userData.vertexIndex as number) : null;
  }

  private _onHover(screenPos: ScreenPos): void {
    const idx = this._castHandles(screenPos);
    if (idx === this._hovered) return;
    this._hovered = idx;
    for (const m of this._handles) {
      const isHover = m.userData.vertexIndex === idx;
      (m.material as THREE.MeshBasicMaterial).color.setHex(isHover ? COLOR_HOVER : COLOR);
      m.scale.setScalar(isHover ? 1.5 : 1.0);
    }
    this._bus.emit("collider:handle-hover", { hovering: idx !== null });
  }

  // ── Vertex drag ─────────────────────────────────────────────────────────────

  private _onMouseDown(screenPos: ScreenPos): void {
    const idx = this._castHandles(screenPos);
    if (idx === null) return;
    const shape = this._selectedShape();
    if (!shape) return;
    // Click = select (Blender-ish): route through the sub-select sink so the panel,
    // gizmo and everything else read one channel. The already-selected vertex's own
    // handle yields to its TransformControls (grabbing an axis arrow wins).
    if (idx !== this._selectedVertex) {
      this._selectedVertex = idx;
      this._bus.emit("shape:sub-select", { zoneId: this._zoneId!, shapeId: this._selectedId!, faceIndex: null, vertexIndex: idx });
    } else {
      return;   // TC owns drags on the selected corner
    }
    this._dragIndex = idx;
    this._origVertices = structuredClone(shape.mesh!.vertices);
    // Camera-facing plane through the vertex — free 3D drag in screen space.
    const world = this._handles[idx]!.position.clone();
    const camDir = new THREE.Vector3();
    this._camera.getWorldDirection(camDir);
    this._dragPlane.setFromNormalAndCoplanarPoint(camDir, world);
    this._state = "DRAG";
    this._world.beginTransaction("move brush corner");
    this._bus.emit("gizmo:dragging", { isDragging: true });
  }

  /** TC drag: move the selected corner along the gizmo axes (world Δ → local). */
  private _onGizmoChange(): void {
    if (!this._tcDragging || !this._origVertices || this._selectedVertex === null) return;
    const shape = this._selectedShape();
    if (!shape || !this._zoneId || !this._selectedId) return;
    const world = this._proxy.position.clone().sub(this._tcStart);
    const D2R = Math.PI / 180;
    const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ")).invert();
    const local = world.applyQuaternion(inv);
    const o = this._origVertices[this._selectedVertex]!;
    const v: Vec3 = { x: +(o.x + local.x).toFixed(4), y: +(o.y + local.y).toFixed(4), z: +(o.z + local.z).toFixed(4) };
    const vertices = this._origVertices.map((old, i) => i === this._selectedVertex ? v : old);
    this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices } });
    // Reposition the handles live (skip the TC to keep the drag stable).
    const m = this._shapeMatrix(shape);
    for (let i = 0; i < vertices.length && i < this._handles.length; i++) {
      this._handles[i]!.position.set(vertices[i]!.x, vertices[i]!.y, vertices[i]!.z).applyMatrix4(m);
    }
  }

  private _onDragMove(screenPos: ScreenPos): void {
    const shape = this._selectedShape();
    if (!shape || this._dragIndex < 0 || !this._zoneId || !this._selectedId) return;
    this._setRayFrom(screenPos);
    const hit = new THREE.Vector3();
    if (!this._raycaster.ray.intersectPlane(this._dragPlane, hit)) return;
    // World → local, snapped in local space so the data stays tidy.
    const inv = this._shapeMatrix(shape).invert();
    const local = hit.applyMatrix4(inv);
    const v: Vec3 = this._altDown
      ? { x: local.x, y: local.y, z: local.z }
      : { x: snap(local.x), y: snap(local.y), z: snap(local.z) };
    const vertices = shape.mesh!.vertices.map((old, i) => i === this._dragIndex ? v : old);
    // Full-mesh write: updateShape replaces `mesh` wholesale — dropping `faces` here
    // would silently revert a face-brush to a convex hull.
    this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices } });
    this._sync();
  }

  private _commitDrag(): void {
    this._world.commitTransaction();
    this._endDrag();
  }

  private _cancelDrag(): void {
    const shape = this._selectedShape();
    if (this._origVertices && shape && this._zoneId && this._selectedId) {
      this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices: this._origVertices } });
    }
    this._world.abortTransaction();
    this._endDrag();
  }

  private _cancelTcDrag(): void {
    const shape = this._selectedShape();
    if (this._origVertices && shape && this._zoneId && this._selectedId) {
      this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices: this._origVertices } });
    }
    this._world.abortTransaction();
    this._tcDragging = false;
    this._origVertices = null;
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }

  private _endDrag(): void {
    this._state = "IDLE";
    this._dragIndex = -1;
    this._origVertices = null;
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }

  // ── Delete corners ──────────────────────────────────────────────────────────

  /** Right-click a handle: remove that corner (keep at least MIN_VERTS). */
  private _onDeleteCorner(screenPos: ScreenPos): void {
    const idx = this._castHandles(screenPos);
    if (idx === null) return;
    const shape = this._selectedShape();
    if (!shape || !this._zoneId || !this._selectedId) return;
    // Face-brushes: deleting a vertex would reindex the array and orphan face loops
    // (Phase 23 v1 restriction — use split/extrude instead).
    if ((shape.mesh?.faces?.length ?? 0) > 0) return;
    if (shape.mesh!.vertices.length <= MIN_VERTS) return;
    this._world.transaction("delete brush corner", () => {
      this._world.updateShape(this._zoneId!, this._selectedId!, {
        mesh: { ...shape.mesh!, vertices: shape.mesh!.vertices.filter((_, i) => i !== idx) },
      });
    });
    this._sync();
  }
}
