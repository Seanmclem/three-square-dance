import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { dragSnapStep } from "@/editor/dragSnap";
import { cutHole, fillHole, holesOf, holeAt, holeFrame, holeThickness, faceContainsPoint, type BrushMeshData } from "@/editor/brushOps";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ShapeDef, ShapeBrushMesh, HoleSpec, ToolId } from "@/types";

type Settings = Omit<HoleSpec, "c">;
const PAUSE_SOURCE = "hole";
const OVER = 0.03;   // the ghost pokes out of the surface this much (meters)

/**
 * HOLE (Phase 85). The HOLE button puts a see-through ghost of the cutter (a cylinder
 * with SIDES flat sides, or a box) on the selected face, straight in along its normal:
 * it follows the mouse over the face, a click drops it there (clicks place instead of
 * picking while it's out), the card's fields change it, and CUT makes the hole. The
 * ghost turns red, with the reason in the card, where the hole can't go.
 *
 * A hole stays editable like a curve: its faces carry a `hole` record, so picking one of
 * them (or EDIT in the HOLES list) opens it; its settings rebuild it (fill, then cut
 * again, one undo step per open), PLACE brings the ghost back to move it, FILL closes it.
 * A hole whose corners were moved by hand can only be filled.
 *
 * v4.109.2: in face mode the open hole has its own move gizmo at its centre (arrows in
 * the face's plane, in SNAP steps, Alt = free): a drag moves the whole hole, cut again at
 * every step from the brush with it filled in (one undo step per drag; a spot where it
 * can't go is skipped). Opening a hole drops the face pick, so the face gizmo that would
 * move just the clicked face stays away.
 */
export class BrushHoleController implements IEditorModule {
  private _settings: Settings = { shape: "round", sides: 24, w: 0.5, h: 0.5, depth: null };
  private _placing: {
    zoneId: string; shapeId: string; base: BrushMeshData; face: number; holeId: string | null;
    c: THREE.Vector3; pinned: boolean; note: string | null;
  } | null = null;
  private _open: { zoneId: string; shapeId: string; id: string; key: string } | null = null;
  private _note: string | null = null;
  private _writing = false;
  private readonly _ghost = new THREE.Group();
  private readonly _ray = new THREE.Raycaster();
  private _tool: ToolId = "select";
  private _previewing = false;
  private _controls: TransformControls | null = null;
  private readonly _proxy = new THREE.Group();
  private _drag: { base: BrushMeshData; entry: number; spec: HoleSpec; startC: THREE.Vector3; startWorld: THREE.Vector3; orig: ShapeBrushMesh } | null = null;
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _world: WorldState,
    private readonly _bus: EventBus,
    private readonly _camera: THREE.PerspectiveCamera,
    private readonly _canvas: HTMLCanvasElement,
  ) {}

  init(): void {
    this._ghost.visible = false;
    this._ghost.userData = { hideInGame: true, editorOnly: true, selectable: false };
    this._scene.add(this._ghost);
    this._scene.add(this._proxy);
    this._controls = new TransformControls(this._camera, this._canvas);
    this._controls.setMode("translate");
    this._controls.setSpace("local");
    this._controls.showZ = false;   // the proxy's z is the face normal: the hole slides on the face
    this._controls.setSize(0.6);
    this._controls.setTranslationSnap(dragSnapStep() || null);
    this._controls.visible = false;
    this._scene.add(this._controls);
    this._controls.addEventListener("dragging-changed", e => {
      const on = (e as unknown as { value: boolean }).value;
      this._bus.emit("gizmo:dragging", { isDragging: on });
      if (on) this._beginDrag(); else this._endDrag();
    });
    this._controls.addEventListener("objectChange", () => this._onDrag());
    this._unsubs.push(
      this._bus.on("brush:snap-changed", () => this._controls?.setTranslationSnap(dragSnapStep() || null)),
      this._bus.on("input:keyup", ({ code }) => { if (code === "AltLeft" || code === "AltRight") this._controls?.setTranslationSnap(dragSnapStep() || null); }),
      this._bus.on("preview:stop", () => { this._previewing = false; this._syncGizmo(); }),
      this._bus.on("object:selected", p => {
        if (this._writing) return;
        if (this._placing && (p.type !== "shape" || p.id !== this._placing.shapeId)) this._cancelPlacing();
        if (p.type !== "shape") { this._close(); return; }
        if (this._open && p.id !== this._open.shapeId) this._close();
        if (this._placing) return;
        const mesh = this._shape(p.zoneId, p.id)?.mesh;
        if (!mesh?.faces || p.faceIndex === undefined) return;
        // A pick on a hole's face opens it; a pick on any other face closes the open one.
        const id = holeAt(mesh, p.faceIndex);
        if (!id) { this._close(); return; }
        this._openHole(p.zoneId, p.id, id);
        // The hole is the selection now, not the clicked face (its gizmo would move just
        // that face). After this dispatch, so every listener sees the pick first.
        queueMicrotask(() => {
          if (this._open?.id === id) this._bus.emit("shape:sub-select", { zoneId: p.zoneId, shapeId: p.id, faceIndex: null, vertexIndex: null });
        });
      }),
      this._bus.on("object:deselected", () => { this._cancelPlacing(); this._close(); }),
      this._bus.on("shape:removed", ({ id }) => {
        if (this._placing?.shapeId === id) this._cancelPlacing();
        if (this._open?.shapeId === id) this._close();
      }),
      this._bus.on("shape:rebuilt", ({ shapeId }) => {
        if (this._writing || this._drag) return;
        if (this._placing?.shapeId === shapeId) this._cancelPlacing();   // undo under the ghost: its face is gone
        if (this._open?.shapeId === shapeId) this._emit();
      }),
      this._bus.on("tool:select", ({ tool }) => { this._tool = tool; if (tool !== "select-face") this._cancelPlacing(); this._syncGizmo(); }),
      this._bus.on("preview:start", () => { this._previewing = true; this._cancelPlacing(); this._close(); }),
      this._bus.on("shape:hole-start", ({ zoneId, shapeId, face, holeId }) => this._startPlacing(zoneId, shapeId, face, holeId)),
      this._bus.on("shape:hole-settings", s => this._changeSettings(s)),
      this._bus.on("shape:hole-cut", () => this._cut()),
      this._bus.on("shape:hole-open", ({ zoneId, shapeId, holeId }) => { this._cancelPlacing(); this._openHole(zoneId, shapeId, holeId); }),
      this._bus.on("shape:hole-done", () => { if (this._placing) this._cancelPlacing(); else this._close(); }),
      this._bus.on("shape:hole-fill", ({ zoneId, shapeId, holeId }) => this._fill(zoneId, shapeId, holeId)),
      this._bus.on("input:mousemove", ({ screenPos }) => { if (this._placing && !this._placing.pinned) this._follow(screenPos); }),
      this._bus.on("input:click", ({ screenPos, button }) => {
        if (!this._placing || button !== 0) return;
        if (this._follow(screenPos, true)) this._placing.pinned = true;
        this._emit();
      }),
      this._bus.on("input:keydown", ({ code }) => {
        if (code === "Escape" && this._drag) this._cancelDrag();
        else if (code === "Escape" && this._placing) this._cancelPlacing();
        if (code === "AltLeft" || code === "AltRight") this._controls?.setTranslationSnap(null);
      }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
    this._clearGhost();
    this._scene.remove(this._ghost);
    if (this._controls) {
      this._controls.detach();
      this._scene.remove(this._controls);
      this._controls.dispose();
      this._controls = null;
    }
    this._scene.remove(this._proxy);
  }

  private _shape(zoneId: string, shapeId: string): ShapeDef | undefined {
    return this._world.zones.get(zoneId)?.shapes?.find(s => s.id === shapeId);
  }

  private _shapeMatrix(shape: ShapeDef): THREE.Matrix4 {
    const D2R = Math.PI / 180;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(shape.position.x, shape.position.y, shape.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ")),
      new THREE.Vector3(1, 1, 1),
    );
  }

  private _write(zoneId: string, shapeId: string, mesh: ShapeBrushMesh, label: string, key?: string): void {
    const shape = this._shape(zoneId, shapeId);
    if (!shape) return;
    this._writing = true;
    try {
      this._world.transaction(label, () => this._world.updateShape(zoneId, shapeId, { mesh: { ...shape.mesh!, vertices: mesh.vertices, faces: mesh.faces } }), key);
      this._bus.emit("selection:check-sub", {});   // the cut renumbers faces: drop stale picks
    } finally { this._writing = false; }
  }

  // ── Placing the ghost ───────────────────────────────────────────────────────

  private _startPlacing(zoneId: string, shapeId: string, face?: number, holeId?: string): void {
    this._cancelPlacing();
    const mesh = this._shape(zoneId, shapeId)?.mesh;
    if (!mesh?.faces) return;
    let base: BrushMeshData = { vertices: mesh.vertices, faces: mesh.faces }, at = face ?? -1, c: THREE.Vector3 | null = null;
    if (holeId) {
      // Moving a hole: the ghost works on the brush with this hole filled in.
      const f = fillHole(base, holeId);
      if ("refused" in f) { this._note = f.refused; this._emit(); return; }
      base = f.mesh; at = f.entry;
      const { c: hc, ...rest } = f.spec;
      this._settings = rest; c = new THREE.Vector3(hc.x, hc.y, hc.z);
    } else this._close();
    const src = base.faces[at];
    if (!src) return;
    if (src.hole || src.round) { this._note = "Holes go in flat faces, not in a curve or another hole's faces."; this._emit(); return; }
    this._placing = { zoneId, shapeId, base, face: at, holeId: holeId ?? null, c: c ?? holeFrame(base.vertices, src.verts).O, pinned: !!holeId, note: null };
    this._note = null;
    this._bus.emit("selection:pause", { source: PAUSE_SOURCE, paused: true });
    this._refreshGhost();
    this._emit();
  }

  private _cancelPlacing(): void {
    if (!this._placing) return;
    this._placing = null;
    this._clearGhost();
    this._bus.emit("selection:pause", { source: PAUSE_SOURCE, paused: false });
    this._emit();   // a hole being moved stays open, unchanged
  }

  /** Mouse over the face: move the ghost there. Returns whether the mouse is on the face. */
  private _follow(screenPos: { x: number; y: number }, force = false): boolean {
    const pl = this._placing;
    const shape = pl && this._shape(pl.zoneId, pl.shapeId);
    if (!pl || !shape) return false;
    const rect = this._canvas.getBoundingClientRect();
    this._ray.setFromCamera(new THREE.Vector2(((screenPos.x - rect.left) / rect.width) * 2 - 1, -((screenPos.y - rect.top) / rect.height) * 2 + 1), this._camera);
    const local = this._ray.ray.clone().applyMatrix4(this._shapeMatrix(shape).invert());
    const loop = pl.base.faces[pl.face]!.verts;
    const fr = holeFrame(pl.base.vertices, loop);
    const hit = local.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(fr.n, fr.O), new THREE.Vector3());
    if (!hit || !faceContainsPoint(pl.base.vertices, loop, hit)) return false;
    if (!force && hit.distanceTo(pl.c) < 1e-4) return true;
    pl.c.copy(hit);
    this._refreshGhost();
    this._emit();
    return true;
  }

  private _spec(c: THREE.Vector3): HoleSpec {
    return { ...this._settings, c: { x: c.x, y: c.y, z: c.z } };
  }

  /** Rebuild the ghost for the current spot and settings, and check the hole fits. */
  private _refreshGhost(): void {
    this._clearGhost();
    const pl = this._placing;
    const shape = pl && this._shape(pl.zoneId, pl.shapeId);
    if (!pl || !shape) return;
    const r = cutHole(pl.base, pl.face, this._spec(pl.c), pl.holeId ?? "preview");
    pl.note = "refused" in r ? r.refused : null;
    const fr = holeFrame(pl.base.vertices, pl.base.faces[pl.face]!.verts);
    const through = this._settings.depth === null;
    const deep = this._settings.depth ?? holeThickness(pl.base, pl.face, pl.c) ?? 0.5;
    const s = this._settings;
    const outline = s.shape === "square"
      ? [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => new THREE.Vector2(a! * s.w / 2, b! * s.h / 2))
      : Array.from({ length: s.sides }, (_, k) => { const t = 2 * Math.PI * (k + 0.5) / s.sides; return new THREE.Vector2(Math.cos(t) * s.w / 2, Math.sin(t) * s.w / 2); });
    const len = deep + OVER + (through ? OVER : 0);
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: len, bevelEnabled: false });
    const color = pl.note ? 0xff5a5a : 0xffa040;
    const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: pl.note ? 0xff9b8a : 0xffd08a, transparent: true, depthTest: false }));
    body.renderOrder = 7; lines.renderOrder = 8;
    // Shape space (u, v across the face, extruded along n), starting `deep` inside.
    const m = new THREE.Matrix4().makeBasis(fr.u, fr.v, fr.n).setPosition(pl.c.clone().addScaledVector(fr.n, -(deep + (through ? OVER : 0))));
    for (const o of [body, lines]) { o.applyMatrix4(m); o.userData = { hideInGame: true, editorOnly: true, selectable: false }; o.raycast = () => {}; }
    this._ghost.matrixAutoUpdate = false;
    this._ghost.matrix.copy(this._shapeMatrix(shape));
    this._ghost.add(body, lines);
    this._ghost.visible = true;
  }

  private _clearGhost(): void {
    for (const o of [...this._ghost.children]) {
      this._ghost.remove(o);
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    }
    this._ghost.visible = false;
  }

  private _changeSettings(s: Settings & { x?: number; y?: number }): void {
    const { x, y, ...settings } = s;
    this._settings = { ...settings, sides: Math.max(3, Math.min(64, Math.round(settings.sides))) };
    const pl = this._placing;
    if (pl) {
      if (x !== undefined && y !== undefined) {
        const fr = holeFrame(pl.base.vertices, pl.base.faces[pl.face]!.verts);
        pl.c = fr.O.clone().addScaledVector(fr.u, x).addScaledVector(fr.v, y);
        pl.pinned = true;
      }
      this._refreshGhost();
      this._emit();
      return;
    }
    const o = this._open;
    const mesh = o && this._shape(o.zoneId, o.shapeId)?.mesh;
    if (!o || !mesh?.faces) return;
    const info = holesOf(mesh).find(h => h.id === o.id);
    if (!info || info.edited) return;
    const f = fillHole({ vertices: mesh.vertices, faces: mesh.faces }, o.id);
    if ("refused" in f) { this._note = f.refused; this._emit(); return; }
    let c = new THREE.Vector3(info.spec.c.x, info.spec.c.y, info.spec.c.z);
    if (x !== undefined && y !== undefined) {
      const fr = holeFrame(f.mesh.vertices, f.mesh.faces[f.entry]!.verts);
      c = fr.O.clone().addScaledVector(fr.u, x).addScaledVector(fr.v, y);
    }
    const r = cutHole(f.mesh, f.entry, this._spec(c), o.id);
    if ("refused" in r) { this._note = r.refused; this._emit(); return; }
    this._note = null;
    this._write(o.zoneId, o.shapeId, r.mesh, "change hole", o.key);
    this._emit();
  }

  private _cut(): void {
    const pl = this._placing;
    if (!pl) return;
    const id = pl.holeId ?? `h${Date.now().toString(36)}`;
    const r = cutHole(pl.base, pl.face, this._spec(pl.c), id);
    if ("refused" in r) { pl.note = r.refused; this._emit(); return; }
    const { zoneId, shapeId } = pl;
    this._placing = null;
    this._clearGhost();
    this._bus.emit("selection:pause", { source: PAUSE_SOURCE, paused: false });
    this._open = { zoneId, shapeId, id, key: `hole:${shapeId}:${id}:${Date.now()}` };
    this._note = null;
    this._write(zoneId, shapeId, r.mesh, pl.holeId ? "move hole" : "cut hole", this._open.key);
    this._emit();
  }

  // ── Open holes ──────────────────────────────────────────────────────────────

  private _openHole(zoneId: string, shapeId: string, id: string): void {
    if (this._open?.shapeId === shapeId && this._open.id === id) { this._emit(); return; }
    this._open = { zoneId, shapeId, id, key: `hole:${shapeId}:${id}:${Date.now()}` };
    const info = holesOf(this._shape(zoneId, shapeId)?.mesh ?? { vertices: [] }).find(h => h.id === id);
    if (info) { const { c: _c, ...rest } = info.spec; this._settings = rest; }
    this._note = null;
    this._emit();
  }

  private _fill(zoneId: string, shapeId: string, id: string): void {
    const mesh = this._shape(zoneId, shapeId)?.mesh;
    if (!mesh?.faces) return;
    const r = fillHole({ vertices: mesh.vertices, faces: mesh.faces }, id);
    if ("refused" in r) { this._note = r.refused; this._emit(); return; }
    if (this._open?.id === id) this._close();
    this._write(zoneId, shapeId, r.mesh, "fill hole");
  }

  private _close(): void {
    if (!this._open) return;
    const { zoneId, shapeId } = this._open;
    this._open = null;
    this._bus.emit("shape:faces-highlight", { zoneId, shapeId, faces: null, channel: "round" });
    this._emit();
  }

  /** The card: placing (ghost out) or an open hole; x / y = its centre from the face's middle. */
  private _emit(): void {
    const base = { ...this._settings, x: 0, y: 0, pinned: false, edited: false };
    const pl = this._placing;
    if (pl) {
      const fr = holeFrame(pl.base.vertices, pl.base.faces[pl.face]!.verts);
      const d = pl.c.clone().sub(fr.O);
      this._bus.emit("shape:hole-state", { ...base, shapeId: pl.shapeId, mode: "placing", holeId: pl.holeId, x: d.dot(fr.u), y: d.dot(fr.v), pinned: pl.pinned, note: pl.note ?? this._note });
      this._syncGizmo();
      return;
    }
    const o = this._open;
    const mesh = o && this._shape(o.zoneId, o.shapeId)?.mesh;
    const info = mesh?.faces ? holesOf(mesh).find(h => h.id === o!.id) : undefined;
    if (!o || !info || !mesh?.faces) {
      if (o) { this._close(); return; }
      this._bus.emit("shape:hole-state", { ...base, shapeId: null, mode: null, holeId: null, note: this._note });
      this._syncGizmo();
      return;
    }
    let x = 0, y = 0;
    const f = fillHole({ vertices: mesh.vertices, faces: mesh.faces }, o.id);
    if (!("refused" in f)) {
      const fr = holeFrame(f.mesh.vertices, f.mesh.faces[f.entry]!.verts);
      const d = new THREE.Vector3(info.spec.c.x, info.spec.c.y, info.spec.c.z).sub(fr.O);
      x = d.dot(fr.u); y = d.dot(fr.v);
    }
    this._bus.emit("shape:faces-highlight", { zoneId: o.zoneId, shapeId: o.shapeId, faces: null, channel: "round", round: { id: o.id } });
    const { c: _c, ...spec } = info.spec;
    this._bus.emit("shape:hole-state", { ...base, ...spec, shapeId: o.shapeId, mode: "open", holeId: o.id, x, y, edited: info.edited, note: this._note });
    this._syncGizmo();
  }

  // ── Move gizmo (v4.109.2) ───────────────────────────────────────────────────

  /** Gizmo on the open hole's centre, in face mode, unless it was edited by hand. */
  private _syncGizmo(): void {
    const c = this._controls;
    if (!c || this._drag) return;
    const o = this._open;
    const shape = o && this._shape(o.zoneId, o.shapeId);
    const info = shape?.mesh?.faces ? holesOf(shape.mesh).find(h => h.id === o!.id) : undefined;
    const f = info && !info.edited && !this._placing && !this._previewing && this._tool === "select-face"
      ? fillHole({ vertices: shape!.mesh!.vertices, faces: shape!.mesh!.faces! }, o!.id) : null;
    if (!f || "refused" in f || !info || !shape) { c.detach(); c.visible = false; return; }
    const fr = holeFrame(f.mesh.vertices, f.mesh.faces[f.entry]!.verts);
    const m = this._shapeMatrix(shape);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fr.u, fr.v, fr.n));
    this._proxy.position.set(info.spec.c.x, info.spec.c.y, info.spec.c.z).applyMatrix4(m);
    this._proxy.quaternion.setFromRotationMatrix(m).multiply(q);
    c.attach(this._proxy);
    c.visible = true;
  }

  private _beginDrag(): void {
    const o = this._open;
    const mesh = o && this._shape(o.zoneId, o.shapeId)?.mesh;
    const info = mesh?.faces ? holesOf(mesh).find(h => h.id === o!.id) : undefined;
    const f = info ? fillHole({ vertices: mesh!.vertices, faces: mesh!.faces! }, o!.id) : null;
    if (!o || !mesh || !info || !f || "refused" in f) return;
    this._drag = {
      base: f.mesh, entry: f.entry, spec: { ...info.spec },
      startC: new THREE.Vector3(info.spec.c.x, info.spec.c.y, info.spec.c.z),
      startWorld: this._proxy.position.clone(), orig: structuredClone(mesh),
    };
    this._world.beginTransaction("move hole");
  }

  private _onDrag(): void {
    const d = this._drag, o = this._open;
    const shape = o && this._shape(o.zoneId, o.shapeId);
    if (!d || !o || !shape) return;
    // World move → brush space, kept in the face's plane.
    const D2R = Math.PI / 180;
    const inv = new THREE.Quaternion().setFromEuler(new THREE.Euler(shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ")).invert();
    const delta = this._proxy.position.clone().sub(d.startWorld).applyQuaternion(inv);
    const n = holeFrame(d.base.vertices, d.base.faces[d.entry]!.verts).n;
    delta.addScaledVector(n, -delta.dot(n));
    const c = d.startC.clone().add(delta);
    const r = cutHole(d.base, d.entry, { ...d.spec, c: { x: c.x, y: c.y, z: c.z } }, o.id);
    if ("refused" in r) return;   // can't go there: the hole stays at the last good spot
    this._world.updateShape(o.zoneId, o.shapeId, { mesh: { ...shape.mesh!, vertices: r.mesh.vertices, faces: r.mesh.faces } });
  }

  private _endDrag(): void {
    if (!this._drag) return;
    this._drag = null;
    this._world.commitTransaction();
    this._writing = true;
    try { this._bus.emit("selection:check-sub", {}); } finally { this._writing = false; }
    this._emit();   // card X / Y, highlight, gizmo back on the hole's actual centre
  }

  private _cancelDrag(): void {
    const d = this._drag, o = this._open;
    if (!d || !o) return;
    this._drag = null;
    const shape = this._shape(o.zoneId, o.shapeId);
    if (shape) this._world.updateShape(o.zoneId, o.shapeId, { mesh: { ...shape.mesh!, vertices: d.orig.vertices, faces: d.orig.faces } });
    this._world.abortTransaction();
    this._controls?.detach();   // ends TransformControls' own drag
    this._bus.emit("gizmo:dragging", { isDragging: false });
    this._emit();
  }
}
