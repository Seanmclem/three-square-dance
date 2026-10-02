import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { facesFromCloud, loopCutRing, offsetRegion, followRegion } from "@/editor/brushOps";
import { applySoft } from "@/editor/softFalloff";
import { dragSnapStep } from "@/editor/dragSnap";
import { isBrush, isFaceBrush } from "@/builders/ShapeBuilder";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, ShapeDef, Vec3, BrushFace } from "@/types";

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
  // v4.99.0 PUSH mode: a green cube handle at the selection's centre (the arrows hide);
  // dragging it right / up pushes every selected face out along its own normal
  // (offsetRegion), left / down pulls them in. Its own handle, not TransformControls:
  // TC's centre box is hidden along with its X/Y/Z handles.
  private _mode: "move" | "push" = "move";
  private _mouse = { x: 0, y: 0 };
  private _mouseStart = { x: 0, y: 0 };
  private _snapOn = true;
  private _origMesh: { vertices: Vec3[]; faces: BrushFace[] } | null = null;
  private _pushDist = 0;
  private _pushRefused: string | null = null;
  private _pushHandle: THREE.Mesh | null = null;
  private _pushing = false;
  private _follow = false;   // OUTER WALLS FOLLOW (v4.103.0): PUSH uses followRegion
  private readonly _ray = new THREE.Raycaster();
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
    this._controls.setTranslationSnap((dragSnapStep() || null));   // the panel's SNAP step (v4.106.0)
    this._scene.add(this._controls);

    this._controls.addEventListener("dragging-changed", e => {
      const isDragging = (e as unknown as { value: boolean }).value;
      this._bus.emit("gizmo:dragging", { isDragging });
      if (isDragging) {
        this._dragging = true;
        this._dragStart.copy(this._proxy.position);
        const shape = this._shape();
        this._origVertices = shape ? structuredClone(shape.mesh!.vertices) : null;
        this._origMesh = shape ? structuredClone({ vertices: shape.mesh!.vertices, faces: shape.mesh!.faces! }) : null;
        this._mouseStart = { ...this._mouse };
        this._pushDist = 0; this._pushRefused = null;
        this._world.beginTransaction("move brush face");
      } else {
        this._origVertices = null;
        this._origMesh = null;
        this._world.commitTransaction();
        this._dragging = false;
        this._sync();
      }
    });
    this._controls.addEventListener("objectChange", () => this._onGizmoChange());

    this._pushHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x3ccf91, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    this._pushHandle.renderOrder = 6;
    this._pushHandle.visible = false;
    this._pushHandle.userData = { hideInGame: true, editorOnly: true, selectable: false };
    this._scene.add(this._pushHandle);

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
      this._bus.on("shape:outer-walls", ({ follow }) => { this._follow = follow; }),
      this._bus.on("shape:face-gizmo-mode", ({ mode }) => {
        if (mode === this._mode) return;
        this._mode = mode;
        this._sync();
      }),
      this._bus.on("input:mousemove", ({ screenPos }) => {
        this._mouse = screenPos;
        if (this._pushing) this._onPush();
      }),
      this._bus.on("input:mousedown", ({ button, screenPos }) => {
        this._mouse = screenPos;
        if (button === 0 && this._mode === "push" && this._pushHandle?.visible && this._hitsPushHandle(screenPos)) this._beginPush();
      }),
      this._bus.on("input:mouseup", ({ button }) => { if (button === 0 && this._pushing) this._endPush(); }),
      this._bus.on("brush:soft-changed", () => {   // Phase 82: [ ] mid-drag
        if (this._pushing) this._onPush(true);
        else if (this._dragging) this._onGizmoChange();
      }),
      this._bus.on("preview:start", () => { this._previewing = true;  this._sync(); }),
      this._bus.on("preview:stop",  () => { this._previewing = false; this._sync(); }),
      this._bus.on("input:keydown", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") { this._controls?.setTranslationSnap(null); this._snapOn = false; }
        if (code === "Escape" && this._dragging) this._cancelDrag();
      }),
      this._bus.on("brush:snap-changed", () => { if (this._snapOn) this._controls?.setTranslationSnap((dragSnapStep() || null)); }),
      this._bus.on("input:keyup", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") { this._controls?.setTranslationSnap((dragSnapStep() || null)); this._snapOn = true; }
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
    if (this._pushHandle) {
      this._scene.remove(this._pushHandle);
      this._pushHandle.geometry.dispose();
      (this._pushHandle.material as THREE.Material).dispose();
      this._pushHandle = null;
    }
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
      if (this._pushHandle) this._pushHandle.visible = false;
      return;
    }
    const shape = this._shape()!;
    // Gizmo at the centre of every corner the face set moves.
    const verts = shape.mesh!.vertices, corners = this._movingCorners(shape);
    const c = new THREE.Vector3();
    for (const i of corners) c.add(new THREE.Vector3(verts[i]!.x, verts[i]!.y, verts[i]!.z));
    c.divideScalar(Math.max(1, corners.size)).applyMatrix4(this._shapeMatrix(shape));
    this._proxy.position.copy(c);
    if (this._mode === "push") {
      this._controls.detach();
      this._controls.visible = false;
      this._pushHandle!.position.copy(c);
      this._pushHandle!.visible = true;
      return;
    }
    this._pushHandle!.visible = false;
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
    const moved = this._origVertices.map((v, i) => moving.has(i)
      ? { x: +(v.x + local.x).toFixed(4), y: +(v.y + local.y).toFixed(4), z: +(v.z + local.z).toFixed(4) }
      : v);
    const vertices = applySoft(this._bus, shape, this._origVertices, moved, [...moving], shape.mesh!.faces);
    this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices } });
  }

  private _hitsPushHandle(screenPos: { x: number; y: number }): boolean {
    const rect = this._canvas.getBoundingClientRect();
    this._ray.setFromCamera(new THREE.Vector2(
      ((screenPos.x - rect.left) / rect.width) * 2 - 1, -((screenPos.y - rect.top) / rect.height) * 2 + 1), this._camera);
    return this._ray.intersectObject(this._pushHandle!, false).length > 0;
  }

  private _beginPush(): void {
    const shape = this._shape();
    if (!shape || !this._isActive()) return;
    this._pushing = true;
    this._dragging = true;
    this._origVertices = structuredClone(shape.mesh!.vertices);
    this._origMesh = structuredClone({ vertices: shape.mesh!.vertices, faces: shape.mesh!.faces! });
    this._mouseStart = { ...this._mouse };
    this._pushDist = 0; this._pushRefused = null;
    this._world.beginTransaction("push brush faces");
    this._bus.emit("gizmo:dragging", { isDragging: true });   // camera + click selection stand down
  }

  private _endPush(): void {
    this._pushing = false;
    this._dragging = false;
    this._origVertices = null;
    this._origMesh = null;
    this._world.commitTransaction();
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._bus.emit("shape:face-push-done", { dist: this._pushDist, refused: this._pushRefused });
    this._sync();
  }

  /** PUSH drag: 1 m per 100 px of right / up mouse travel, snapped to 0.05 m (Alt = free).
   *  Always recomputed from the mesh at drag start; a distance that would turn faces
   *  inside out is skipped (the last good one stays) and reported when the drag ends. */
  private _onPush(force = false): void {
    if (!this._origMesh || !this._zoneId || !this._selectedId) return;
    const px = (this._mouse.x - this._mouseStart.x) - (this._mouse.y - this._mouseStart.y);
    let dist = px / 100;
    dist = this._snapOn && dragSnapStep() > 0 ? Math.round(dist / dragSnapStep()) * dragSnapStep() : Math.round(dist * 1000) / 1000;
    if (dist === this._pushDist && !this._pushRefused && !force) return;
    const set = this._faceSet.length ? this._faceSet : [this._faceIndex!];
    // OUTER WALLS FOLLOW (v4.103.0): step walls toward the flat side, angled sides follow.
    const r = dist === 0 ? { mesh: this._origMesh } : (this._follow ? followRegion : offsetRegion)(this._origMesh, set, dist);
    if ("refused" in r) { this._pushRefused = r.refused; return; }
    this._pushRefused = null;
    this._pushDist = dist;
    const shape = this._shape();
    if (!shape) return;
    if (r.mesh.vertices.length !== this._origMesh.vertices.length) {
      // FOLLOW added corners and faces: write the whole mesh (soft falloff needs a fixed corner list).
      this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices: r.mesh.vertices, faces: r.mesh.faces } });
      return;
    }
    const sources = [...new Set(set.flatMap(i => this._origMesh!.faces[i]?.verts ?? []))];
    const vertices = applySoft(this._bus, shape, this._origMesh.vertices, r.mesh.vertices, sources, this._origMesh.faces);
    this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices, faces: r.mesh.faces } });
  }

  private _cancelDrag(): void {
    if (this._origVertices && this._zoneId && this._selectedId) {
      const shape = this._shape();
      if (shape) this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices: this._origVertices } });
    }
    this._world.abortTransaction();
    this._dragging = false;
    this._pushing = false;
    this._origVertices = null;
    this._origMesh = null;
    this._pushDist = 0;
    this._pushRefused = null;
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }
}
