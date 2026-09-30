import * as THREE from "three";
import { newellNormal, fanLoop, isBentQuad, loopCutRing } from "@/editor/brushOps";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ShapeDef, ToolId, LoopCutStart } from "@/types";

const SELECT_OPACITY = 0.55;
const HOVER_OPACITY  = 0.35;
const LIFT = 0.01;   // offset along the face normal so the overlay never z-fights
const EDGE_LIFT = 0.012;   // edges sit just above the face fills

/**
 * Canvas overlay for brush faces + edges (Phase 23/23b): a translucent blue polygon
 * over the SELECTED face (from object:selected.faceIndex) and a fainter one over the
 * panel-HOVERED face (shape:face-hover); in edge mode a bright blue tube over the
 * SELECTED edge (object:selected.edgeVerts). In face/edge select modes the whole
 * selected brush also gets thin black outlines around every face's edges, so the
 * pickable sub-objects read at a glance. SegmentHighlighter idiom — throwaway
 * meshes/lines, rebuilt from data on every change, disposed on clear; never pickable.
 * No per-frame work.
 */
export class BrushFaceHighlighter implements IEditorModule {
  private _tool: ToolId = "select";
  private _shape:    { zoneId: string; shapeId: string } | null = null;
  private _selected: { zoneId: string; shapeId: string; faceIndex: number } | null = null;
  private _hovered:  { zoneId: string; shapeId: string; faceIndex: number } | null = null;
  private _selEdge:  { zoneId: string; shapeId: string; edge: [number, number] } | null = null;
  private _selMesh:   THREE.Mesh | null = null;
  private _hoverMesh: THREE.Mesh | null = null;
  private _edgeLines: THREE.LineSegments | null = null;
  private _edgeTube:  THREE.Mesh | null = null;
  private _loop: { zoneId: string; shapeId: string; start: LoopCutStart } | null = null;
  private _loopObj:   THREE.Group | null = null;
  private _vset: { zoneId: string; shapeId: string; verts: number[] } | null = null;   // Phase 80
  private _setLines:  THREE.LineSegments | null = null;
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("tool:select", ({ tool }) => { this._tool = tool; this._refresh(); }),
      this._bus.on("object:selected", payload => {
        this._shape = payload.type === "shape"
          ? { zoneId: payload.zoneId, shapeId: payload.id }
          : null;
        this._selected = (payload.type === "shape" && payload.faceIndex !== undefined)
          ? { zoneId: payload.zoneId, shapeId: payload.id, faceIndex: payload.faceIndex }
          : null;
        this._selEdge = (payload.type === "shape" && payload.edgeVerts !== undefined)
          ? { zoneId: payload.zoneId, shapeId: payload.id, edge: payload.edgeVerts }
          : null;
        this._vset = (payload.type === "shape" && (payload.vertexSet?.length ?? 0) > 1)
          ? { zoneId: payload.zoneId, shapeId: payload.id, verts: payload.vertexSet! }
          : null;
        this._refresh();
      }),
      this._bus.on("object:deselected", () => {
        this._shape = null; this._selected = null; this._hovered = null; this._selEdge = null; this._loop = null; this._vset = null;
        this._refresh();
        this._refreshLoop();
      }),
      this._bus.on("shape:loop-preview", ({ zoneId, shapeId, start }) => {
        this._loop = start ? { zoneId, shapeId, start } : null;
        this._refreshLoop();
      }),
      this._bus.on("shape:face-hover", ({ zoneId, shapeId, faceIndex }) => {
        this._hovered = faceIndex === null ? null : { zoneId, shapeId, faceIndex };
        this._refresh();
      }),
      this._bus.on("shape:rebuilt", ({ shapeId }) => {
        // The cut just landed (or the mesh changed under the preview): drop it.
        if (this._loop?.shapeId === shapeId) { this._loop = null; this._refreshLoop(); }
        if (this._selected?.shapeId === shapeId || this._hovered?.shapeId === shapeId || this._shape?.shapeId === shapeId) this._refresh();
      }),
      this._bus.on("shape:removed", ({ id }) => {
        if (this._shape?.shapeId === id) this._shape = null;
        if (this._selected?.shapeId === id) this._selected = null;
        if (this._hovered?.shapeId === id) this._hovered = null;
        if (this._selEdge?.shapeId === id) this._selEdge = null;
        this._refresh();
      }),
      this._bus.on("preview:start", () => { this._loop = null; this._refreshLoop(); this._clear("sel"); this._clear("hover"); this._clearEdges(); this._clearEdgeTube(); this._clearSetLines(); }),
      this._bus.on("preview:stop",  () => this._refresh()),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
    this._clear("sel");
    this._clear("hover");
    this._clearEdges();
    this._clearEdgeTube();
    this._clearSetLines();
    this._loop = null;
    this._refreshLoop();
  }

  /**
   * LOOP CUT hover preview (Phase 79): a white dashed line across each face the ring
   * would cross (rail midpoint to rail midpoint, lifted off the face) and a red dot
   * wherever it would stop short. Rebuilt per hover event; no per-frame work.
   */
  private _refreshLoop(): void {
    if (this._loopObj) {
      this._scene.remove(this._loopObj);
      this._loopObj.traverse(o => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      this._loopObj = null;
    }
    const t = this._loop;
    if (!t) return;
    const shape = this._world.zones.get(t.zoneId)?.shapes?.find(s => s.id === t.shapeId) as ShapeDef | undefined;
    if (!shape?.mesh?.faces) return;
    const ring = loopCutRing(shape.mesh, t.start);
    if (!ring) return;

    const verts = shape.mesh.vertices;
    const pos: number[] = [];
    for (const f of ring.faces) {
      const n = newellNormal(verts, shape.mesh.faces[f.faceIdx]!.verts);
      for (const [p, q] of f.rails) {
        const a = verts[p]!, b = verts[q]!;
        pos.push((a.x + b.x) / 2 + n.x * EDGE_LIFT * 2, (a.y + b.y) / 2 + n.y * EDGE_LIFT * 2, (a.z + b.z) / 2 + n.z * EDGE_LIFT * 2);
      }
    }
    const group = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({
      color: 0xffffff, dashSize: 0.08, gapSize: 0.06, depthTest: false, transparent: true,
    }));
    lines.computeLineDistances();
    lines.renderOrder = 4;
    group.add(lines);
    for (const stop of ring.stops) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xff5a5a, depthTest: false, transparent: true }));
      dot.position.set(stop.at.x, stop.at.y, stop.at.z);
      dot.renderOrder = 5;
      group.add(dot);
    }
    const D2R = Math.PI / 180;
    group.position.set(shape.position.x, shape.position.y, shape.position.z);
    group.rotation.set(shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R);
    group.traverse(o => { o.userData = { selectable: false, editorOnly: true, hideInGame: true }; });
    this._scene.add(group);
    this._loopObj = group;
  }

  private _clearSetLines(): void {
    if (!this._setLines) return;
    this._scene.remove(this._setLines);
    this._setLines.geometry.dispose();
    (this._setLines.material as THREE.Material).dispose();
    this._setLines = null;
  }

  private _refresh(): void {
    this._clearSetLines();
    this._clear("sel");
    this._clear("hover");
    this._clearEdges();
    this._clearEdgeTube();
    if (this._selected) this._selMesh = this._buildOverlay(this._selected, SELECT_OPACITY);
    // Don't double-draw when hovering the already-selected face.
    if (this._hovered && (this._hovered.shapeId !== this._selected?.shapeId || this._hovered.faceIndex !== this._selected?.faceIndex)) {
      this._hoverMesh = this._buildOverlay(this._hovered, HOVER_OPACITY);
    }
    if ((this._tool === "select-face" || this._tool === "select-edge") && this._shape) {
      this._edgeLines = this._buildEdges(this._shape);
    }
    if (this._selEdge) this._edgeTube = this._buildEdgeTube(this._selEdge);
    if (this._vset && this._tool === "select-vertex") this._setLines = this._buildSetLines(this._vset);
  }

  /** Phase 80: cyan lines along every edge whose both ends are in the vertex set, so a
   *  selected loop reads as a ring rather than a scatter of corners. */
  private _buildSetLines(t: { zoneId: string; shapeId: string; verts: number[] }): THREE.LineSegments | null {
    const shape = this._world.zones.get(t.zoneId)?.shapes?.find(s => s.id === t.shapeId) as ShapeDef | undefined;
    if (!shape?.mesh?.faces) return null;
    const verts = shape.mesh.vertices, inSet = new Set(t.verts), seen = new Set<string>();
    const pos: number[] = [];
    for (const f of shape.mesh.faces) f.verts.forEach((a, i) => {
      const b = f.verts[(i + 1) % f.verts.length]!;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!inSet.has(a) || !inSet.has(b) || seen.has(k)) return;
      seen.add(k);
      pos.push(verts[a]!.x, verts[a]!.y, verts[a]!.z, verts[b]!.x, verts[b]!.y, verts[b]!.z);
    });
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, transparent: true }));
    lines.renderOrder = 4;
    const D2R = Math.PI / 180;
    lines.position.set(shape.position.x, shape.position.y, shape.position.z);
    lines.rotation.set(shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R);
    lines.userData = { selectable: false, editorOnly: true, hideInGame: true };
    this._scene.add(lines);
    return lines;
  }

  private _clearEdges(): void {
    if (!this._edgeLines) return;
    this._scene.remove(this._edgeLines);
    this._edgeLines.geometry.dispose();
    (this._edgeLines.material as THREE.Material).dispose();
    this._edgeLines = null;
  }

  private _clearEdgeTube(): void {
    if (!this._edgeTube) return;
    this._scene.remove(this._edgeTube);
    this._edgeTube.geometry.dispose();
    (this._edgeTube.material as THREE.Material).dispose();
    this._edgeTube = null;
  }

  private _clear(which: "sel" | "hover"): void {
    const mesh = which === "sel" ? this._selMesh : this._hoverMesh;
    if (!mesh) return;
    this._scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    for (const child of mesh.children as THREE.Line[]) {   // the fold line, if any
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    if (which === "sel") this._selMesh = null; else this._hoverMesh = null;
  }

  private _buildOverlay(target: { zoneId: string; shapeId: string; faceIndex: number }, opacity: number): THREE.Mesh | null {
    const shape = this._world.zones.get(target.zoneId)?.shapes?.find(s => s.id === target.shapeId) as ShapeDef | undefined;
    const face = shape?.mesh?.faces?.[target.faceIndex];
    if (!shape || !face) return null;

    const verts = shape.mesh!.vertices;
    const loop = fanLoop(verts, face);   // bends along the same diagonal as the brush
    const n = newellNormal(verts, loop);
    const pos: number[] = [];
    const idx: number[] = [];
    for (const vi of loop) {
      const v = verts[vi]!;
      pos.push(v.x + n.x * LIFT, v.y + n.y * LIFT, v.z + n.z * LIFT);
    }
    for (let i = 1; i < loop.length - 1; i++) idx.push(0, i, i + 1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0x4d8cff, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.renderOrder = 2;
    const D2R = Math.PI / 180;
    mesh.position.set(shape.position.x, shape.position.y, shape.position.z);
    mesh.rotation.set(shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R);
    mesh.userData = { selectable: false, editorOnly: true, hideInGame: true };

    // Selected bent quad: a dashed line along its fold (loop[0]–loop[2] after fanLoop),
    // so the FOLD button's effect is visible. Child of the overlay — shares its transform.
    if (opacity === SELECT_OPACITY && isBentQuad(verts, face)) {
      const p = (vi: number) => { const v = verts[vi]!; return [v.x + n.x * EDGE_LIFT, v.y + n.y * EDGE_LIFT, v.z + n.z * EDGE_LIFT]; };
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.Float32BufferAttribute([...p(loop[0]!), ...p(loop[2]!)], 3));
      const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({
        color: 0xffffff, dashSize: 0.08, gapSize: 0.06, depthTest: false, transparent: true,
      }));
      line.computeLineDistances();
      line.renderOrder = 4;
      line.userData = { selectable: false, editorOnly: true, hideInGame: true };
      mesh.add(line);
    }

    this._scene.add(mesh);
    return mesh;
  }

  /**
   * Thin black outlines around every face's boundary (face-select mode only). Each
   * edge is emitted once per adjacent face, lifted along that face's normal — the
   * duplicate is invisible and keeps the line off both surfaces without vertex-
   * normal math.
   */
  private _buildEdges(target: { zoneId: string; shapeId: string }): THREE.LineSegments | null {
    const shape = this._world.zones.get(target.zoneId)?.shapes?.find(s => s.id === target.shapeId) as ShapeDef | undefined;
    const faces = shape?.mesh?.faces;
    if (!shape || !faces?.length) return null;

    const verts = shape.mesh!.vertices;
    const pos: number[] = [];
    for (const face of faces) {
      const n = newellNormal(verts, face.verts);
      for (let i = 0; i < face.verts.length; i++) {
        const a = verts[face.verts[i]!]!;
        const b = verts[face.verts[(i + 1) % face.verts.length]!]!;
        pos.push(
          a.x + n.x * EDGE_LIFT, a.y + n.y * EDGE_LIFT, a.z + n.z * EDGE_LIFT,
          b.x + n.x * EDGE_LIFT, b.y + n.y * EDGE_LIFT, b.z + n.z * EDGE_LIFT,
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 }));
    lines.renderOrder = 3;
    const D2R = Math.PI / 180;
    lines.position.set(shape.position.x, shape.position.y, shape.position.z);
    lines.rotation.set(shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R);
    lines.userData = { selectable: false, editorOnly: true, hideInGame: true };
    this._scene.add(lines);
    return lines;
  }

  /**
   * Bright blue tube over the selected edge (edge mode). A thin world-space cylinder
   * reads at any zoom, unlike 1px WebGL lines; depthTest off so it's never half-buried
   * in the two faces it borders.
   */
  private _buildEdgeTube(target: { zoneId: string; shapeId: string; edge: [number, number] }): THREE.Mesh | null {
    const shape = this._world.zones.get(target.zoneId)?.shapes?.find(s => s.id === target.shapeId) as ShapeDef | undefined;
    const verts = shape?.mesh?.vertices;
    const [ia, ib] = target.edge;
    if (!shape || !verts || !verts[ia] || !verts[ib]) return null;

    const D2R = Math.PI / 180;
    const mat = new THREE.Matrix4().compose(
      new THREE.Vector3(shape.position.x, shape.position.y, shape.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ")),
      new THREE.Vector3(1, 1, 1),
    );
    const a = new THREE.Vector3(verts[ia]!.x, verts[ia]!.y, verts[ia]!.z).applyMatrix4(mat);
    const b = new THREE.Vector3(verts[ib]!.x, verts[ib]!.y, verts[ib]!.z).applyMatrix4(mat);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) return null;

    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, len, 6),
      new THREE.MeshBasicMaterial({ color: 0x4d8cff, depthTest: false, depthWrite: false }),
    );
    tube.renderOrder = 4;
    tube.position.copy(a).add(b).multiplyScalar(0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    tube.userData = { selectable: false, editorOnly: true, hideInGame: true };
    this._scene.add(tube);
    return tube;
  }
}
