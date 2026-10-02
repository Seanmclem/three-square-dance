import { roundEdges, unroundEdges, roundsOf, roundAt, splitRound } from "@/editor/brushOps";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ShapeDef, ShapeBrushMesh } from "@/types";

/**
 * ROUND curves (Phases 83 and 84). A curve's faces carry a `round` tag, so a curve can
 * be opened again any time: by ROUND itself, by picking one of its faces or edges in
 * face / edge mode, or from the CURVES list. While a curve is open its faces are lit
 * green and the panel's STEPS / SIZE rebuild it (make sharp, then round again with the
 * same id), merged into one undo step per open. MAKE SHARP and SPLIT work on any curve.
 * A curve edited by hand can't be rebuilt, only made sharp.
 */
export class BrushRoundController implements IEditorModule {
  private _open: { zoneId: string; shapeId: string; id: string; key: string } | null = null;
  private _note: string | null = null;
  private _writing = false;   // our own write re-announces the selection; don't let stale picks close the curve
  private readonly _unsubs: Array<() => void> = [];

  constructor(private readonly _world: WorldState, private readonly _bus: EventBus) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("object:selected", p => {
        if (this._writing) return;
        if (p.type !== "shape") { this._close(); return; }
        if (this._open && p.id !== this._open.shapeId) this._close();
        const mesh = this._shape(p.zoneId, p.id)?.mesh;
        if (!mesh?.faces) return;
        // A pick on a curve opens it; a pick on any other face / edge closes the open one.
        const id = p.faceIndex !== undefined ? roundAt(mesh, { face: p.faceIndex })
          : p.edgeVerts ? roundAt(mesh, { edge: p.edgeVerts }) : undefined;
        if (id) this._openRound(p.zoneId, p.id, id);
        else if (id === null) this._close();
      }),
      this._bus.on("object:deselected", () => this._close()),
      this._bus.on("shape:removed", ({ id }) => { if (this._open?.shapeId === id) this._close(); }),
      this._bus.on("shape:rebuilt", ({ shapeId }) => { if (this._open?.shapeId === shapeId) this._emit(); }),   // undo, hand edits
      this._bus.on("shape:round-edges", ({ zoneId, shapeId, edges, steps, size }) => this._round(zoneId, shapeId, edges, steps, size)),
      this._bus.on("shape:round-open", ({ zoneId, shapeId, roundId }) => this._openRound(zoneId, shapeId, roundId)),
      this._bus.on("shape:round-adjust", ({ steps, size }) => this._adjust(steps, size)),
      this._bus.on("shape:round-done", () => this._close()),
      this._bus.on("shape:round-sharp", ({ zoneId, shapeId, roundId }) => this._sharp(zoneId, shapeId, roundId)),
      this._bus.on("shape:round-split", ({ zoneId, shapeId, roundId, part }) => this._split(zoneId, shapeId, roundId, part)),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
  }

  private _shape(zoneId: string, shapeId: string): ShapeDef | undefined {
    return this._world.zones.get(zoneId)?.shapes?.find(s => s.id === shapeId);
  }

  private _write(zoneId: string, shapeId: string, mesh: ShapeBrushMesh, label: string, key?: string): void {
    const shape = this._shape(zoneId, shapeId);
    if (!shape) return;
    this._writing = true;
    try {
      this._world.transaction(label, () => this._world.updateShape(zoneId, shapeId, { mesh: { ...shape.mesh!, vertices: mesh.vertices, faces: mesh.faces } }), key);
      // ROUND / MAKE SHARP renumber corners and faces: drop picks made on the old layout
      // (they'd point at some other edge or corner and grab a gizmo).
      this._bus.emit("selection:check-sub", {});
    } finally { this._writing = false; }
  }

  private _round(zoneId: string, shapeId: string, edges: Array<[number, number]>, steps: number, size: number): void {
    this._close();
    const shape = this._shape(zoneId, shapeId);
    if (!shape?.mesh) return;
    const id = `r${Date.now().toString(36)}`;
    const r = roundEdges(shape.mesh, edges, size, steps, id);
    if ("refused" in r) { this._note = r.refused; this._emitClosed(shapeId); return; }
    this._open = { zoneId, shapeId, id, key: `round:${shapeId}:${id}:${Date.now()}` };
    this._note = null;
    this._write(zoneId, shapeId, r.mesh, "round edges", this._open.key);   // same key: later adjustments merge into this step
    this._emit();
  }

  private _openRound(zoneId: string, shapeId: string, id: string): void {
    if (this._open?.shapeId === shapeId && this._open.id === id) return;
    this._open = { zoneId, shapeId, id, key: `round:${shapeId}:${id}:${Date.now()}` };
    this._note = null;
    this._emit();
  }

  private _adjust(steps: number, size: number): void {
    const o = this._open;
    const mesh = o && this._shape(o.zoneId, o.shapeId)?.mesh;
    if (!o || !mesh?.faces) return;
    const info = roundsOf(mesh).find(r => r.id === o.id);
    if (!info || info.edited) return;
    const sharp = unroundEdges({ vertices: mesh.vertices, faces: mesh.faces }, o.id);
    const r = "refused" in sharp ? sharp : roundEdges(sharp.mesh, sharp.edges, size, steps, o.id);
    if ("refused" in r) { this._note = r.refused; this._emit(); return; }
    this._note = null;
    this._write(o.zoneId, o.shapeId, r.mesh, "round edges", o.key);
    this._emit();
  }

  private _sharp(zoneId: string, shapeId: string, id: string): void {
    const mesh = this._shape(zoneId, shapeId)?.mesh;
    if (!mesh?.faces) return;
    const r = unroundEdges({ vertices: mesh.vertices, faces: mesh.faces }, id);
    if ("refused" in r) { this._note = r.refused; this._emit(); return; }
    if (this._open?.id === id) this._close();
    this._write(zoneId, shapeId, r.mesh, "make edge sharp");
  }

  private _split(zoneId: string, shapeId: string, id: string, part?: number): void {
    const mesh = this._shape(zoneId, shapeId)?.mesh;
    if (!mesh?.faces) return;
    if (this._open?.id === id && part === undefined) this._close();
    this._write(zoneId, shapeId, splitRound({ vertices: mesh.vertices, faces: mesh.faces }, id, part), "split curve");
  }

  private _close(): void {
    if (!this._open) return;
    const { zoneId, shapeId } = this._open;
    this._open = null;
    this._bus.emit("shape:faces-highlight", { zoneId, shapeId, faces: null, channel: "round" });
    this._emitClosed(shapeId);
  }

  private _emitClosed(shapeId: string): void {
    this._bus.emit("shape:round-state", { shapeId, roundId: null, open: false, count: 0, steps: 0, size: 0, edited: false, note: this._note });
  }

  /** Panel card + green faces for the open curve; closes it if it's gone (undo, sharp). */
  private _emit(): void {
    const o = this._open;
    if (!o) return;
    const mesh = this._shape(o.zoneId, o.shapeId)?.mesh;
    const info = mesh ? roundsOf(mesh).find(r => r.id === o.id) : undefined;
    if (!info) { this._close(); return; }
    this._bus.emit("shape:faces-highlight", { zoneId: o.zoneId, shapeId: o.shapeId, faces: info.faces, channel: "round" });
    this._bus.emit("shape:round-state", {
      shapeId: o.shapeId, roundId: o.id, open: true, count: info.parts.length,
      steps: info.steps, size: info.size, edited: info.edited, note: this._note,
    });
  }
}
