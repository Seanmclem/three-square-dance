import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { facesFromCloud, loopCutRing } from "@/editor/brushOps";
import { isBrush, isFaceBrush } from "@/builders/ShapeBuilder";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, ShapeDef, Vec3 } from "@/types";

const SNAP = 0.25;
const SUSPEND_SOURCE = "face-mode";

/**
 * Face-mode controller (Phase 23): a translate-only TransformControls parked on the
 * selected brush face's centroid (ColliderEditor's proxy pattern). Dragging moves all
 * of the face's vertices live — the whole drag is one transaction (one undo step),
 * Escape restores. While a face is selected the entity gizmo is suspended
 * (gizmo:suspend), so the two never fight for the pointer.
 *
 * Also owns the legacy-cloud AUTO-BAKE: the first face/vertex-mode selection of a
 * cloud brush (vertices, no faces) bakes explicit face loops in one labeled,
 * undoable transaction — geometry is visually identical, and faces become pickable.
 * Parametric shapes are never auto-converted (the panel offers Convert to Brush).
 */
export class BrushFaceEditor implements IEditorModule {
  private _activeTool: ToolId = "select";
  private _zoneId: string | null = null;
  private _selectedId: string | null = null;
  private _faceIndex: number | null = null;
  private _faceSet: number[] = [];   // Phase 81: every selected face; the gizmo moves them all
  private _previewing = false;
  private _suspended = false;

  private _controls: TransformControls | null = null;
  private readonly _proxy = new THREE.Group();
  private _dragging = false;
  private _dragStart = new THREE.Vector3();
  private _origVertices: Vec3[] | null = null;

  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:  THREE.Scene,
    private readonly _world:  WorldState,
    private readonly _bus:    EventBus,
    private readonly _camera: THREE.PerspectiveCamera,
    private readonly _canvas: HTMLCanvasElement,
  ) {}

  init(): void {
    this._scene.add(this._proxy);
    this._controls = new TransformControls(this._camera, this._canvas);
    this._controls.setMode("translate");
    this._controls.setSize(0.5);
    this._controls.setTranslationSnap(SNAP);
    this._scene.add(this._controls);

    this._controls.addEventListener("dragging-changed", e => {
      const isDragging = (e as unknown as { value: boolean }).value;
      this._bus.emit("gizmo:dragging", { isDragging });
      if (isDragging) {
        this._dragging = true;
        this._dragStart.copy(this._proxy.position);
        const shape = this._shape();
        this._origVertices = shape ? structuredClone(shape.mesh!.vertices) : null;
        this._world.beginTransaction("move brush face");
      } else {
        this._dragging = false;
        this._origVertices = null;
        this._world.commitTransaction();
        this._sync();
      }
    });
    this._controls.addEventListener("objectChange", () => this._onGizmoChange());

    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => {
        this._activeTool = tool;
        this._sync();
      }),
      this._bus.on("object:selected", payload => {
        if (payload.type === "shape") {
          this._selectedId = payload.id;
          this._zoneId = payload.zoneId;
          this._faceIndex = payload.faceIndex ?? null;
          this._faceSet = payload.faceSet ?? (payload.faceIndex !== undefined ? [payload.faceIndex] : []);
          this._maybeAutoBake();
        } else {
          this._selectedId = null;
          this._faceIndex = null;
        }
        this._sync();
      }),
      this._bus.on("object:deselected", () => { this._selectedId = null; this._faceIndex = null; this._sync(); }),
      this._bus.on("shape:removed", ({ id }) => {
        if (id === this._selectedId) { this._selectedId = null; this._faceIndex = null; this._sync(); }
      }),
      this._bus.on("shape:rebuilt", ({ shapeId }) => {
        if (shapeId === this._selectedId && !this._dragging) this._sync();
      }),
      // Phase 81: double-click a face → its face loop (the longer of its two rings).
      this._bus.on("input:dblclick", () => {
        if (!this._isActive() || this._dragging) return;
        const mesh = this._shape()!.mesh!;
        const rings = ([0, 1] as const).map(pair => loopCutRing(mesh, { faceIdx: this._faceIndex!, pair })?.faces.map(f => f.faceIdx) ?? []);
        const ring = rings[0]!.length >= rings[1]!.length ? rings[0]! : rings[1]!;
        if (ring.length > 1) this._bus.emit("shape:sub-select", { zoneId: this._zoneId!, shapeId: this._selectedId!, faceIndex: this._faceIndex, vertexIndex: null, faceSet: ring });
      }),
      this._bus.on("preview:start", () => { this._previewing = true;  this._sync(); }),
      this._bus.on("preview:stop",  () => { this._previewing = false; this._sync(); }),
      this._bus.on("input:keydown", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") this._controls?.setTranslationSnap(null);
        if (code === "Escape" && this._dragging) this._cancelDrag();
      }),
      this._bus.on("input:keyup", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") this._controls?.setTranslationSnap(SNAP);
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
  }

  // ── State ───────────────────────────────────────────────────────────────────

  private _shape(): ShapeDef | undefined {
    if (!this._selectedId || !this._zoneId) return undefined;
    return this._world.zones.get(this._zoneId)?.shapes?.find(s => s.id === this._selectedId);
  }

  private _isActive(): boolean {
    if (this._activeTool !== "select-face" || this._previewing || this._faceIndex === null) return false;
    const s = this._shape();
    return !!s && isFaceBrush(s) && this._faceIndex < (s.mesh!.faces!.length);
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

  /** First face/vertex-mode selection of a legacy cloud brush → bake faces (undoable). */
  private _maybeAutoBake(): void {
    if (this._activeTool !== "select-face" && this._activeTool !== "select-vertex") return;
    const s = this._shape();
    if (!s || !isBrush(s) || isFaceBrush(s) || !this._zoneId || !this._selectedId) return;
    const faced = facesFromCloud(s.mesh!.vertices);
    if (!faced) return;   // degenerate — stays a cloud
    this._world.transaction("bake brush faces", () => {
      this._world.updateShape(this._zoneId!, this._selectedId!, { mesh: faced });
    });
  }

  private _sync(): void {
    if (!this._controls || this._dragging) return;
    const active = this._isActive();
    this._setSuspended(active);
    if (!active) {
      this._controls.detach();
      this._controls.visible = false;
      return;
    }
    const shape = this._shape()!;
    // Gizmo at the centre of every corner the face set moves.
    const verts = shape.mesh!.vertices, corners = this._movingCorners(shape);
    const c = new THREE.Vector3();
    for (const i of corners) c.add(new THREE.Vector3(verts[i]!.x, verts[i]!.y, verts[i]!.z));
    c.divideScalar(Math.max(1, corners.size)).applyMatrix4(this._shapeMatrix(shape));
    this._proxy.position.copy(c);
    this._controls.attach(this._proxy);
    this._controls.visible = true;
  }

  /** Corners of every face in the set (just the one face when there's no set). */
  private _movingCorners(shape: ShapeDef): Set<number> {
    const faces = shape.mesh!.faces!;
    const set = this._faceSet.length ? this._faceSet : [this._faceIndex!];
    return new Set(set.filter(i => i < faces.length).flatMap(i => faces[i]!.verts));
  }

  private _setSuspended(on: boolean): void {
    if (on === this._suspended) return;
    this._suspended = on;
    this._bus.emit("gizmo:suspend", { source: SUSPEND_SOURCE, suspended: on });
  }

  // ── Drag ────────────────────────────────────────────────────────────────────

  private _onGizmoChange(): void {
    if (!this._dragging || !this._origVertices || !this._zoneId || !this._selectedId) return;
    const shape = this._shape();
    if (!shape || this._faceIndex === null) return;
    if (!shape.mesh!.faces![this._faceIndex]) return;
    // World delta → local via the inverse shape rotation (shapes have no scale).
    const world = this._proxy.position.clone().sub(this._dragStart);
    const D2R = Math.PI / 180;
    const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ")).invert();
    const local = world.applyQuaternion(inv);
    const moving = this._movingCorners(shape);
    const vertices = this._origVertices.map((v, i) => moving.has(i)
      ? { x: +(v.x + local.x).toFixed(4), y: +(v.y + local.y).toFixed(4), z: +(v.z + local.z).toFixed(4) }
      : v);
    this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices } });
  }

  private _cancelDrag(): void {
    if (this._origVertices && this._zoneId && this._selectedId) {
      const shape = this._shape();
      if (shape) this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices: this._origVertices } });
    }
    this._world.abortTransaction();
    this._dragging = false;
    this._origVertices = null;
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }
}
