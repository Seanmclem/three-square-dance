import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule } from "@/types";

/**
 * Canvas highlight for the PropertiesPanel segment list: hovering a segment row
 * emits `wall:segment-hover`, and this module overlays a translucent box on that
 * wall segment. A box overlay is used (rather than an emissive tint) because a
 * merged run renders as one mesh — individual segments can't be tinted.
 */
export class SegmentHighlighter implements IEditorModule {
  private readonly _scene: THREE.Scene;
  private readonly _world: WorldState;
  private readonly _bus:   EventBus;

  private _mesh: THREE.Mesh | null = null;
  private _unsub: Array<() => void> = [];

  constructor(scene: THREE.Scene, worldState: WorldState, bus: EventBus) {
    this._scene = scene;
    this._world = worldState;
    this._bus   = bus;
  }

  init(): void {
    this._unsub.push(
      this._bus.on("wall:segment-hover", ({ zoneId, wallId }) => {
        if (wallId) this._show(zoneId, wallId);
        else        this._clear();
      }),
      this._bus.on("object:deselected", () => this._clear()),
      this._bus.on("wall:removed",      () => this._clear()),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsub.forEach(u => u());
    this._unsub = [];
    this._clear();
  }

  private _show(zoneId: string, wallId: string): void {
    this._clear();
    const zone = this._world.zones.get(zoneId);
    const wall = zone?.walls.find(w => w.id === wallId);
    if (!zone || !wall) return;
    const s = zone.nodes.find(n => n.id === wall.startNodeId);
    const e = zone.nodes.find(n => n.id === wall.endNodeId);
    if (!s || !e) return;

    const dx = e.x - s.x, dz = e.z - s.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return;

    // Slightly inflated so it reads through the wall's own surface.
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len + 0.06, wall.height + 0.06, wall.thickness + 0.06),
      new THREE.MeshBasicMaterial({
        color: 0x4d8cff, transparent: true, opacity: 0.35, depthWrite: false,
      }),
    );
    mesh.position.set(
      (s.x + e.x) / 2,
      (wall.elevation ?? 0) + wall.height / 2,
      (s.z + e.z) / 2,
    );
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.renderOrder = 1;
    mesh.userData = { selectable: false, editorOnly: true };
    this._scene.add(mesh);
    this._mesh = mesh;
  }

  private _clear(): void {
    if (!this._mesh) return;
    this._scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    (this._mesh.material as THREE.Material).dispose();
    this._mesh = null;
  }
}
