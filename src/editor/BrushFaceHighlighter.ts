import * as THREE from "three";
import { newellNormal } from "@/editor/brushOps";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, ShapeDef } from "@/types";

const SELECT_OPACITY = 0.55;
const HOVER_OPACITY  = 0.35;
const LIFT = 0.01;   // offset along the face normal so the overlay never z-fights

/**
 * Canvas overlay for brush faces (Phase 23): a translucent blue polygon over the
 * SELECTED face (from object:selected.faceIndex) and a fainter one over the panel-
 * HOVERED face (shape:face-hover). SegmentHighlighter idiom — throwaway
 * MeshBasicMaterial meshes, rebuilt from data on every change, disposed on clear;
 * never pickable. No per-frame work.
 */
export class BrushFaceHighlighter implements IEditorModule {
  private _selected: { zoneId: string; shapeId: string; faceIndex: number } | null = null;
  private _hovered:  { zoneId: string; shapeId: string; faceIndex: number } | null = null;
  private _selMesh:   THREE.Mesh | null = null;
  private _hoverMesh: THREE.Mesh | null = null;
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _world: WorldState,
    private readonly _bus:   EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("object:selected", payload => {
        this._selected = (payload.type === "shape" && payload.faceIndex !== undefined)
          ? { zoneId: payload.zoneId, shapeId: payload.id, faceIndex: payload.faceIndex }
          : null;
        this._refresh();
      }),
      this._bus.on("object:deselected", () => { this._selected = null; this._hovered = null; this._refresh(); }),
      this._bus.on("shape:face-hover", ({ zoneId, shapeId, faceIndex }) => {
        this._hovered = faceIndex === null ? null : { zoneId, shapeId, faceIndex };
        this._refresh();
      }),
      this._bus.on("shape:rebuilt", ({ shapeId }) => {
        if (this._selected?.shapeId === shapeId || this._hovered?.shapeId === shapeId) this._refresh();
      }),
      this._bus.on("shape:removed", ({ id }) => {
        if (this._selected?.shapeId === id) this._selected = null;
        if (this._hovered?.shapeId === id) this._hovered = null;
        this._refresh();
      }),
      this._bus.on("preview:start", () => { this._clear("sel"); this._clear("hover"); }),
      this._bus.on("preview:stop",  () => this._refresh()),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsubs.forEach(u => u());
    this._unsubs.length = 0;
    this._clear("sel");
    this._clear("hover");
  }

  private _refresh(): void {
    this._clear("sel");
    this._clear("hover");
    if (this._selected) this._selMesh = this._buildOverlay(this._selected, SELECT_OPACITY);
    // Don't double-draw when hovering the already-selected face.
    if (this._hovered && (this._hovered.shapeId !== this._selected?.shapeId || this._hovered.faceIndex !== this._selected?.faceIndex)) {
      this._hoverMesh = this._buildOverlay(this._hovered, HOVER_OPACITY);
    }
  }

  private _clear(which: "sel" | "hover"): void {
    const mesh = which === "sel" ? this._selMesh : this._hoverMesh;
    if (!mesh) return;
    this._scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    if (which === "sel") this._selMesh = null; else this._hoverMesh = null;
  }

  private _buildOverlay(target: { zoneId: string; shapeId: string; faceIndex: number }, opacity: number): THREE.Mesh | null {
    const shape = this._world.zones.get(target.zoneId)?.shapes?.find(s => s.id === target.shapeId) as ShapeDef | undefined;
    const face = shape?.mesh?.faces?.[target.faceIndex];
    if (!shape || !face) return null;

    const verts = shape.mesh!.vertices;
    const n = newellNormal(verts, face.verts);
    const pos: number[] = [];
    const idx: number[] = [];
    for (const vi of face.verts) {
      const v = verts[vi]!;
      pos.push(v.x + n.x * LIFT, v.y + n.y * LIFT, v.z + n.z * LIFT);
    }
    for (let i = 1; i < face.verts.length - 1; i++) idx.push(0, i, i + 1);

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
    this._scene.add(mesh);
    return mesh;
  }
}
