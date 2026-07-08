import * as THREE from "three";
import { isBrush } from "@/builders/ShapeBuilder";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, ShapeDef, ScreenPos, Vec3 } from "@/types";

const SNAP = 0.25;             // local-space grid for vertex edits (Alt = free)
const HANDLE_R = 0.09;
const COLOR       = 0xffaa33;  // brush-corner amber
const COLOR_HOVER = 0xffffff;
const MIN_VERTS = 4;

const snap = (v: number): number => Math.round(v / SNAP) * SNAP;

/**
 * Quake/UE-style brush editing for shapes in brush mode (v4.10.0): a sphere handle
 * per local vertex of `ShapeDef.mesh.vertices`.
 *  - drag a handle → move that corner (camera-facing plane, snapped to 0.25 local,
 *    Alt = free); live hull rebuild through updateShape inside one drag transaction.
 *  - right-click a handle → delete the corner (min 4 kept).
 *  - "shape:add-corner" (Geometry panel) arms insertion: the next click on the brush
 *    surface adds a corner at the hit point — it starts ON the hull (no visual
 *    change) and becomes a real corner the moment it's dragged outward. Convexity is
 *    guaranteed by construction: geometry + collider are always the hull of the cloud.
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
  private _addArmed = false;

  private _handles: THREE.Mesh[] = [];
  private _hovered: number | null = null;

  private _state: "IDLE" | "DRAG" = "IDLE";
  private _dragIndex = -1;
  private _dragPlane = new THREE.Plane();
  private _origVertices: Vec3[] | null = null;

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
      this._bus.on("object:selected", payload => {
        this._selectedId = payload.type === "shape" ? payload.id : null;
        this._zoneId = payload.zoneId;
        this._addArmed = false;
        this._sync();
      }),
      this._bus.on("object:deselected", () => { this._selectedId = null; this._addArmed = false; this._sync(); }),
      this._bus.on("shape:removed", ({ id }) => {
        if (id === this._selectedId) { this._selectedId = null; this._sync(); }
      }),
      this._bus.on("shape:updated", ({ id }) => {
        if (id === this._selectedId && this._state !== "DRAG") this._sync();
      }),
      this._bus.on("shape:add-corner", ({ armed }) => {
        this._addArmed = armed;
        document.body.style.cursor = armed ? "crosshair" : "";
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
        if (this._addArmed) { this._onAddCorner(screenPos); return; }
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
        if (code === "AltLeft" || code === "AltRight") this._altDown = true;
        if (code === "Escape") {
          if (this._state === "DRAG") this._cancelDrag();
          if (this._addArmed) { this._addArmed = false; document.body.style.cursor = ""; }
        }
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

  // ── State ───────────────────────────────────────────────────────────────────

  private _shouldShow(): boolean {
    if (this._activeTool !== "select" || this._previewing) return false;
    const s = this._selectedShape();
    return !!s && isBrush(s);
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
    if (!shape) { this._clearHandles(); return; }
    const verts = shape.mesh!.vertices;
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
    this._world.updateShape(this._zoneId, this._selectedId, { mesh: { vertices } });
    this._sync();
  }

  private _commitDrag(): void {
    this._world.commitTransaction();
    this._endDrag();
  }

  private _cancelDrag(): void {
    if (this._origVertices && this._zoneId && this._selectedId) {
      this._world.updateShape(this._zoneId, this._selectedId, { mesh: { vertices: this._origVertices } });
    }
    this._world.abortTransaction();
    this._endDrag();
  }

  private _endDrag(): void {
    this._state = "IDLE";
    this._dragIndex = -1;
    this._origVertices = null;
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }

  // ── Add / delete corners ────────────────────────────────────────────────────

  /** Armed click: raycast the brush's own meshes, insert a corner at the hit point. */
  private _onAddCorner(screenPos: ScreenPos): void {
    const shape = this._selectedShape();
    if (!shape || !this._zoneId || !this._selectedId) return;
    this._setRayFrom(screenPos);
    const targets: THREE.Mesh[] = [];
    this._scene.traverse(o => {
      if (o instanceof THREE.Mesh && o.userData["editorId"] === this._selectedId) targets.push(o);
    });
    const hit = this._raycaster.intersectObjects(targets, false)[0];
    if (!hit) return;   // stay armed until a face is actually clicked (Escape cancels)
    const inv = this._shapeMatrix(shape).invert();
    const local = hit.point.clone().applyMatrix4(inv);
    const v: Vec3 = this._altDown
      ? { x: local.x, y: local.y, z: local.z }
      : { x: snap(local.x), y: snap(local.y), z: snap(local.z) };
    this._world.transaction("add brush corner", () => {
      this._world.updateShape(this._zoneId!, this._selectedId!, {
        mesh: { vertices: [...shape.mesh!.vertices, v] },
      });
    });
    this._addArmed = false;
    document.body.style.cursor = "";
    // Swallow the click that follows this mousedown so SelectionManager doesn't re-pick.
    this._bus.emit("gizmo:dragging", { isDragging: true });
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }

  /** Right-click a handle: remove that corner (keep at least MIN_VERTS). */
  private _onDeleteCorner(screenPos: ScreenPos): void {
    const idx = this._castHandles(screenPos);
    if (idx === null) return;
    const shape = this._selectedShape();
    if (!shape || !this._zoneId || !this._selectedId) return;
    if (shape.mesh!.vertices.length <= MIN_VERTS) return;
    this._world.transaction("delete brush corner", () => {
      this._world.updateShape(this._zoneId!, this._selectedId!, {
        mesh: { vertices: shape.mesh!.vertices.filter((_, i) => i !== idx) },
      });
    });
    this._sync();
  }
}
