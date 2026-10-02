import * as THREE from "three";
import { cutHole, fillHole, holesOf, holeAt, holeFrame, holeThickness, faceContainsPoint, type BrushMeshData } from "@/editor/brushOps";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ShapeDef, ShapeBrushMesh, HoleSpec } from "@/types";

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
    this._unsubs.push(
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
        if (id) this._openHole(p.zoneId, p.id, id); else this._close();
      }),
      this._bus.on("object:deselected", () => { this._cancelPlacing(); this._close(); }),
      this._bus.on("shape:removed", ({ id }) => {
        if (this._placing?.shapeId === id) this._cancelPlacing();
        if (this._open?.shapeId === id) this._close();
      }),
      this._bus.on("shape:rebuilt", ({ shapeId }) => {
        if (this._writing) return;
        if (this._placing?.shapeId === shapeId) this._cancelPlacing();   // undo under the ghost: its face is gone
        if (this._open?.shapeId === shapeId) this._emit();
      }),
      this._bus.on("tool:select", ({ tool }) => { if (tool !== "select-face") this._cancelPlacing(); }),
      this._bus.on("preview:start", () => { this._cancelPlacing(); this._close(); }),
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
      this._bus.on("input:keydown", ({ code }) => { if (code === "Escape" && this._placing) this._cancelPlacing(); }),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
    this._clearGhost();
    this._scene.remove(this._ghost);
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
      return;
    }
    const o = this._open;
    const mesh = o && this._shape(o.zoneId, o.shapeId)?.mesh;
    const info = mesh?.faces ? holesOf(mesh).find(h => h.id === o!.id) : undefined;
    if (!o || !info || !mesh?.faces) {
      if (o) { this._close(); return; }
      this._bus.emit("shape:hole-state", { ...base, shapeId: null, mode: null, holeId: null, note: this._note });
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
  }
}
