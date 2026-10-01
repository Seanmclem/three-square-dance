import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { validateMesh } from "@/editor/brushOps";
import { applySoft } from "@/editor/softFalloff";
import { isBrush } from "@/builders/ShapeBuilder";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ToolId, ShapeDef, Vec3 } from "@/types";

const SNAP_MOVE   = 0.25;
const SNAP_ROTATE = THREE.MathUtils.degToRad(15);
const SNAP_SCALE  = 0.1;
const MIN_SCALE   = 0.05;   // no collapsing the set flat or mirroring it through the pivot
const MAX_SCALE   = 20;
const UNIFORM_PX  = 150;    // center-box scale: every 150px of right/up drag multiplies by e
const SUSPEND_SOURCE = "vertex-set";

type Mode = "translate" | "rotate" | "scale";

/**
 * Vertex-set gizmo (Phase 80): when vertex mode has 2+ corners selected (Shift-click,
 * SELECT LOOP, SELECT RING), one TransformControls at the set's center moves, rotates
 * or scales them together (T / R / S, or the panel buttons). The proxy carries the
 * brush's rotation, so the axes are the brush's own. Every member is recomputed from
 * its ORIGINAL position on each change: v' = pivot + q·(s ⊙ (v − pivot)) + Δ, all in
 * shape-local space. One transaction per drag; Escape restores; on release a face-brush
 * must still pass validateMesh or the drag is undone (shape:vertex-set-refused).
 * A single selected corner keeps BrushVertexEditor's own gizmo.
 */
export class BrushSetEditor implements IEditorModule {
  private _activeTool: ToolId = "select";
  private _zoneId: string | null = null;
  private _selectedId: string | null = null;
  private _set: number[] = [];
  private _previewing = false;
  private _suspended = false;
  private _wasActive = false;
  private _mode: Mode = "translate";

  private _controls: TransformControls | null = null;
  private readonly _proxy = new THREE.Group();
  private _dragging = false;
  private _startPos = new THREE.Vector3();
  private _pivot: Vec3 = { x: 0, y: 0, z: 0 };   // shape-local set center at drag start
  private _origVertices: Vec3[] | null = null;
  // Center-box (uniform) scale: TransformControls scales by |pointer − pivot| now ÷ at
  // grab, and the box sits AT the pivot, so a grab near it divides by ~0 (measured:
  // radius 1 → 2e14). Uniform scale instead follows the screen-space drag.
  private _uniform = false;
  private _mouse = { x: 0, y: 0 };
  private _mouseStart = { x: 0, y: 0 };

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
    this._controls.setSpace("local");
    this._controls.setSize(0.6);
    this._setSnap(true);
    this._scene.add(this._controls);

    this._controls.addEventListener("dragging-changed", e => {
      const isDragging = (e as unknown as { value: boolean }).value;
      this._bus.emit("gizmo:dragging", { isDragging });
      if (isDragging) this._beginDrag();
      else this._endDrag();
    });
    this._controls.addEventListener("objectChange", () => this._onGizmoChange());

    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => { this._activeTool = tool; this._sync(); }),
      this._bus.on("object:selected", payload => {
        if (payload.type === "shape") {
          this._selectedId = payload.id;
          this._zoneId = payload.zoneId;
          this._set = payload.vertexSet ?? [];
        } else {
          this._selectedId = null;
          this._set = [];
        }
        this._sync();
      }),
      this._bus.on("object:deselected", () => { this._selectedId = null; this._set = []; this._sync(); }),
      this._bus.on("shape:removed", ({ id }) => {
        if (id === this._selectedId) { this._selectedId = null; this._set = []; this._sync(); }
      }),
      this._bus.on("shape:rebuilt", ({ shapeId }) => {
        if (shapeId === this._selectedId && !this._dragging) this._sync();
      }),
      this._bus.on("shape:set-gizmo-mode", ({ mode }) => {
        if (mode === this._mode) return;
        this._mode = mode;
        this._controls?.setMode(mode);
      }),
      this._bus.on("preview:start", () => { this._previewing = true;  this._sync(); }),
      this._bus.on("preview:stop",  () => { this._previewing = false; this._sync(); }),
      this._bus.on("input:keydown", ({ code, ctrl, meta }) => {
        if (code === "AltLeft" || code === "AltRight") this._setSnap(false);
        if (code === "Escape" && this._dragging) this._cancelDrag();
        // Bare T / R / S switch the set gizmo's mode (same keys as the object gizmo).
        if (!this._isActive() || this._dragging || ctrl || meta) return;
        const mode: Mode | null = code === "KeyT" ? "translate" : code === "KeyR" ? "rotate" : code === "KeyS" ? "scale" : null;
        if (mode) this._bus.emit("shape:set-gizmo-mode", { mode });
      }),
      this._bus.on("brush:soft-changed", () => { if (this._dragging) this._onGizmoChange(); }),   // Phase 82: [ ] mid-drag
      this._bus.on("input:mousemove", ({ screenPos }) => { this._mouse = screenPos; }),
      this._bus.on("input:mousedown", ({ screenPos }) => { this._mouse = screenPos; }),
      this._bus.on("input:keyup", ({ code }) => {
        if (code === "AltLeft" || code === "AltRight") this._setSnap(true);
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
    if (this._activeTool !== "select-vertex" || this._previewing || this._set.length < 2) return false;
    const s = this._shape();
    return !!s && isBrush(s) && this._set.every(i => i < s.mesh!.vertices.length);
  }

  private _shapeQuat(shape: ShapeDef): THREE.Quaternion {
    const D2R = Math.PI / 180;
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(
      shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ"));
  }

  private _center(verts: Vec3[]): Vec3 {
    const c = { x: 0, y: 0, z: 0 };
    for (const i of this._set) { c.x += verts[i]!.x; c.y += verts[i]!.y; c.z += verts[i]!.z; }
    const n = this._set.length;
    return { x: c.x / n, y: c.y / n, z: c.z / n };
  }

  private _snapOn = true;

  private _setSnap(on: boolean): void {
    this._snapOn = on;
    this._controls?.setTranslationSnap(on ? SNAP_MOVE : null);
    this._controls?.setRotationSnap(on ? SNAP_ROTATE : null);
    this._controls?.setScaleSnap(on ? SNAP_SCALE : null);
  }

  private _sync(): void {
    if (!this._controls || this._dragging) return;
    const active = this._isActive();
    this._setSuspended(active);
    if (active && !this._wasActive) this._bus.emit("shape:set-gizmo-mode", { mode: "translate" });   // a new set starts in move
    this._wasActive = active;
    if (!active) {
      this._controls.detach();
      this._controls.visible = false;
      return;
    }
    const shape = this._shape()!;
    const q = this._shapeQuat(shape);
    const c = this._center(shape.mesh!.vertices);
    this._proxy.position.set(c.x, c.y, c.z).applyQuaternion(q)
      .add(new THREE.Vector3(shape.position.x, shape.position.y, shape.position.z));
    this._proxy.quaternion.copy(q);
    this._proxy.scale.set(1, 1, 1);
    this._controls.setMode(this._mode);
    this._controls.attach(this._proxy);
    this._controls.visible = true;
  }

  private _setSuspended(on: boolean): void {
    if (on === this._suspended) return;
    this._suspended = on;
    this._bus.emit("gizmo:suspend", { source: SUSPEND_SOURCE, suspended: on });
  }

  // ── Drag ────────────────────────────────────────────────────────────────────

  private _beginDrag(): void {
    const shape = this._shape();
    if (!shape) return;
    this._dragging = true;
    this._startPos.copy(this._proxy.position);
    this._origVertices = structuredClone(shape.mesh!.vertices);
    this._pivot = this._center(this._origVertices);
    this._uniform = this._mode === "scale" && this._controls?.axis === "XYZ";
    this._mouseStart = { ...this._mouse };
    this._world.beginTransaction("transform brush corners");
  }

  private _onGizmoChange(): void {
    if (!this._dragging || !this._origVertices || !this._zoneId || !this._selectedId) return;
    const shape = this._shape();
    if (!shape) return;
    const inv = this._shapeQuat(shape).invert();
    const move  = this._proxy.position.clone().sub(this._startPos).applyQuaternion(inv);
    const turn  = inv.clone().multiply(this._proxy.quaternion);   // rotation in shape space
    const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
    let sx: number, sy: number, sz: number;
    if (this._uniform) {
      const px = (this._mouse.x - this._mouseStart.x) - (this._mouse.y - this._mouseStart.y);
      let f = Math.exp(px / UNIFORM_PX);
      if (this._snapOn) f = Math.max(SNAP_SCALE, Math.round(f / SNAP_SCALE) * SNAP_SCALE);
      sx = sy = sz = clamp(f);
    } else {
      const s = this._proxy.scale;
      sx = clamp(s.x); sy = clamp(s.y); sz = clamp(s.z);
    }
    const p = this._pivot;
    const members = new Set(this._set);
    const tmp = new THREE.Vector3();
    const moved = this._origVertices.map((v, i) => {
      if (!members.has(i)) return v;
      tmp.set((v.x - p.x) * sx, (v.y - p.y) * sy, (v.z - p.z) * sz).applyQuaternion(turn);
      return {
        x: +(p.x + tmp.x + move.x).toFixed(4),
        y: +(p.y + tmp.y + move.y).toFixed(4),
        z: +(p.z + tmp.z + move.z).toFixed(4),
      };
    });
    const vertices = applySoft(this._bus, shape, this._origVertices, moved, this._set, shape.mesh!.faces);
    this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices } });
  }

  private _endDrag(): void {
    if (!this._dragging) return;
    const shape = this._shape();
    // A face-brush must still be a valid closed solid (rotate/scale can turn it inside out).
    const err = shape?.mesh?.faces ? validateMesh({ vertices: shape.mesh.vertices, faces: shape.mesh.faces }) : null;
    if (err) {
      this._restore();
      this._world.abortTransaction();
      this._bus.emit("shape:vertex-set-refused", { reason: "That would turn the brush inside out, so it was undone." });
    } else {
      this._world.commitTransaction();
    }
    this._dragging = false;
    this._origVertices = null;
    this._sync();
  }

  private _restore(): void {
    const shape = this._shape();
    if (this._origVertices && shape && this._zoneId && this._selectedId) {
      this._world.updateShape(this._zoneId, this._selectedId, { mesh: { ...shape.mesh!, vertices: this._origVertices } });
    }
  }

  private _cancelDrag(): void {
    this._restore();
    this._world.abortTransaction();
    this._dragging = false;
    this._origVertices = null;
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._sync();
  }
}
