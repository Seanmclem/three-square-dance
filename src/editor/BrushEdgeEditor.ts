import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { facesFromCloud, edgeLoop, roundEdges } from "@/editor/brushOps";
import { applySoft } from "@/editor/softFalloff";
import { isBrush, isFaceBrush } from "@/builders/ShapeBuilder";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, ShapeDef, ShapeBrushMesh, Vec3 } from "@/types";

const SNAP = 0.25;
const SUSPEND_SOURCE = "edge-mode";

/**
 * Edge-mode controller (Phase 23b): a translate-only TransformControls parked on the
 * selected brush edge's midpoint (BrushFaceEditor's proxy pattern, moving the edge's
 * 2 vertices instead of a face's loop). The whole drag is one transaction (one undo
 * step), Escape restores. While an edge is selected the entity gizmo is suspended.
 *
 * Edges have no stored identity — the selection is the (unordered) vertex-index pair
 * carried on object:selected.edgeVerts, valid while some face loop traverses it
 * (SelectionManager clamps on every emit). Also auto-bakes legacy cloud brushes on
 * first edge-mode selection, same as face/vertex modes.
 */
export class BrushEdgeEditor implements IEditorModule {
  private _activeTool: ToolId = "select";
  private _zoneId: string | null = null;
  private _selectedId: string | null = null;
  private _edge: [number, number] | null = null;
  private _previewing = false;
  private _suspended = false;

  private _controls: TransformControls | null = null;
  private readonly _proxy = new THREE.Group();
  private _dragging = false;
  private _dragStart = new THREE.Vector3();
  private _origVertices: Vec3[] | null = null;

  // Phase 83: the last ROUND stays live (STEPS / SIZE rebuild it from `pre`) until DONE,
  // another selection, or any other change to the mesh (`last` = the mesh we wrote).
  private _round: { zoneId: string; shapeId: string; pre: ShapeBrushMesh; edges: Array<[number, number]>; key: string; last: string } | null = null;

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
        this._world.beginTransaction("move brush edge");
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
        if (this._round && (payload.type !== "shape" || payload.id !== this._round.shapeId)) this._endRound(null);
        if (payload.type === "shape") {
          this._selectedId = payload.id;
          this._zoneId = payload.zoneId;
          this._edge = payload.edgeVerts ?? null;
          this._maybeAutoBake();
        } else {
          this._selectedId = null;
          this._edge = null;
        }
        this._sync();
      }),
      this._bus.on("object:deselected", () => { this._selectedId = null; this._edge = null; this._endRound(null); this._sync(); }),
      this._bus.on("shape:removed", ({ id }) => {
        if (id === this._selectedId) { this._selectedId = null; this._edge = null; this._sync(); }
      }),
      this._bus.on("shape:rebuilt", ({ shapeId }) => {
        if (shapeId === this._selectedId && !this._dragging) this._sync();
        // Any other change to the rounded brush (undo, a drag, another op) ends the live round.
        if (this._round?.shapeId === shapeId && JSON.stringify(this._roundShape()?.mesh ?? null) !== this._round.last) this._endRound(null);
      }),
      // Phase 80: double-click an edge (its first click selected it) → select its loop.
      this._bus.on("input:dblclick", () => {
        if (!this._isActive() || this._dragging) return;
        const loop = edgeLoop(this._shape()!.mesh!, this._edge!);
        if (loop) this._bus.emit("shape:select-vertex-set", { zoneId: this._zoneId!, shapeId: this._selectedId!, verts: loop.verts });
      }),
      this._bus.on("brush:soft-changed", () => { if (this._dragging) this._onGizmoChange(); }),   // Phase 82: [ ] mid-drag
      this._bus.on("shape:round-edges", ({ zoneId, shapeId, edges, steps, size }) => this._roundEdges(zoneId, shapeId, edges, steps, size)),
      this._bus.on("shape:round-adjust", ({ steps, size }) => this._adjustRound(steps, size)),
      this._bus.on("shape:round-done", () => this._endRound(null)),
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
    if (this._activeTool !== "select-edge" || this._previewing || this._edge === null) return false;
    const s = this._shape();
    if (!s || !isFaceBrush(s)) return false;
    const n = s.mesh!.vertices.length;
    return this._edge[0] < n && this._edge[1] < n;
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

  /** First edge-mode selection of a legacy cloud brush → bake faces (undoable). */
  private _maybeAutoBake(): void {
    if (this._activeTool !== "select-edge") return;
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
    const verts = shape.mesh!.vertices;
    const [a, b] = this._edge!;
    const mid = new THREE.Vector3(
      (verts[a]!.x + verts[b]!.x) / 2,
      (verts[a]!.y + verts[b]!.y) / 2,
      (verts[a]!.z + verts[b]!.z) / 2,
    ).applyMatrix4(this._shapeMatrix(shape));
    this._proxy.position.copy(mid);
    this._controls.attach(this._proxy);
    this._controls.visible = true;
  }

  private _setSuspended(on: boolean): void {
    if (on === this._suspended) return;
    this._suspended = on;
    this._bus.emit("gizmo:suspend", { source: SUSPEND_SOURCE, suspended: on });
  }

  // ── Round (Phase 83) ────────────────────────────────────────────────────────

  private _roundShape(): ShapeDef | undefined {
    const r = this._round;
    return r ? this._world.zones.get(r.zoneId)?.shapes?.find(s => s.id === r.shapeId) : undefined;
  }

  private _roundEdges(zoneId: string, shapeId: string, edges: Array<[number, number]>, steps: number, size: number): void {
    this._endRound(null);
    const shape = this._world.zones.get(zoneId)?.shapes?.find(s => s.id === shapeId);
    if (!shape?.mesh) return;
    const r = roundEdges(shape.mesh, edges, size, steps);
    if ("refused" in r) { this._bus.emit("shape:round-state", { shapeId, live: false, count: 0, note: r.refused }); return; }
    const key = `round:${shapeId}:${Date.now()}`;
    this._round = { zoneId, shapeId, pre: structuredClone(shape.mesh), edges, key, last: "" };
    this._writeRound(r.mesh);
    this._bus.emit("shape:round-state", { shapeId, live: true, count: edges.length, note: null });
  }

  private _adjustRound(steps: number, size: number): void {
    const t = this._round;
    if (!t) return;
    const r = roundEdges(t.pre, t.edges, size, steps);
    if ("refused" in r) { this._bus.emit("shape:round-state", { shapeId: t.shapeId, live: true, count: t.edges.length, note: r.refused }); return; }
    this._writeRound(r.mesh);
    this._bus.emit("shape:round-state", { shapeId: t.shapeId, live: true, count: t.edges.length, note: null });
  }

  /** One undo step for the round and all its adjustments (same coalesce key). */
  private _writeRound(mesh: ShapeBrushMesh): void {
    const t = this._round!;
    const shape = this._roundShape();
    if (!shape) return;
    const next = { ...shape.mesh!, vertices: mesh.vertices, faces: mesh.faces };
    t.last = JSON.stringify(next);
    this._world.transaction("round edges", () => this._world.updateShape(t.zoneId, t.shapeId, { mesh: next }), t.key);
  }

  private _endRound(note: string | null): void {
    if (!this._round) return;
    const shapeId = this._round.shapeId;
    this._round = null;
    this._bus.emit("shape:round-state", { shapeId, live: false, count: 0, note });
  }

  // ── Drag ────────────────────────────────────────────────────────────────────

  private _onGizmoChange(): void {
    if (!this._dragging || !this._origVertices || !this._zoneId || !this._selectedId) return;
    const shape = this._shape();
    if (!shape || this._edge === null) return;
    // World delta → local via the inverse shape rotation (shapes have no scale).
    const world = this._proxy.position.clone().sub(this._dragStart);
    const D2R = Math.PI / 180;
    const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ")).invert();
    const local = world.applyQuaternion(inv);
    const moving = new Set(this._edge);
    const moved = this._origVertices.map((v, i) => moving.has(i)
      ? { x: +(v.x + local.x).toFixed(4), y: +(v.y + local.y).toFixed(4), z: +(v.z + local.z).toFixed(4) }
      : v);
    const vertices = applySoft(this._bus, shape, this._origVertices, moved, this._edge, shape.mesh!.faces);
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
