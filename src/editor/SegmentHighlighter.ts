import * as THREE from "three";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { IEditorModule, WallDef, ZoneDef } from "@/types";

const HIGHLIGHT_COLOR = 0x4d8cff;

/**
 * Canvas highlights driven by PropertiesPanel row hovers:
 * - `wall:segment-hover` — translucent box over one wall segment (a box overlay is
 *   used rather than an emissive tint because a merged run renders as one mesh).
 * - `node:link-hover` — a marker on the node plus a box over every entity sharing
 *   it (walls, floors, platforms), skipping the entity the hover came from.
 */
export class SegmentHighlighter implements IEditorModule {
  private readonly _scene: THREE.Scene;
  private readonly _world: WorldState;
  private readonly _bus:   EventBus;

  private _meshes: THREE.Mesh[] = [];
  private _unsub: Array<() => void> = [];

  constructor(scene: THREE.Scene, worldState: WorldState, bus: EventBus) {
    this._scene = scene;
    this._world = worldState;
    this._bus   = bus;
  }

  init(): void {
    this._unsub.push(
      this._bus.on("wall:segment-hover", ({ zoneId, wallId }) => {
        this._clear();
        if (!wallId) return;
        const zone = this._world.zones.get(zoneId);
        const wall = zone?.walls.find(w => w.id === wallId);
        if (!zone || !wall) return;
        this._add(this._wallBox(zone, wall));
      }),
      this._bus.on("node:link-hover", ({ zoneId, nodeId, sourceId }) => {
        this._clear();
        if (nodeId) this._showNodeLinks(zoneId, nodeId, sourceId);
      }),
      this._bus.on("object:deselected", () => this._clear()),
      this._bus.on("wall:removed",      () => this._clear()),
      this._bus.on("floor:removed",     () => this._clear()),
    );
  }

  update(_dt: number): void {}

  dispose(): void {
    this._unsub.forEach(u => u());
    this._unsub = [];
    this._clear();
  }

  // ─── Overlay construction ───────────────────────────────────────────────────

  private _material(opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: HIGHLIGHT_COLOR, transparent: true, opacity, depthWrite: false,
    });
  }

  private _add(mesh: THREE.Mesh | null): void {
    if (!mesh) return;
    mesh.renderOrder = 1;
    mesh.userData = { selectable: false, editorOnly: true };
    this._scene.add(mesh);
    this._meshes.push(mesh);
  }

  /** Slightly inflated box over one wall segment so it reads through the wall's surface. */
  private _wallBox(zone: ZoneDef, wall: WallDef): THREE.Mesh | null {
    const s = zone.nodes.find(n => n.id === wall.startNodeId);
    const e = zone.nodes.find(n => n.id === wall.endNodeId);
    if (!s || !e) return null;
    const dx = e.x - s.x, dz = e.z - s.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return null;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len + 0.06, wall.height + 0.06, wall.thickness + 0.06),
      this._material(0.35),
    );
    mesh.position.set(
      (s.x + e.x) / 2,
      (wall.elevation ?? 0) + wall.height / 2,
      (s.z + e.z) / 2,
    );
    mesh.rotation.y = -Math.atan2(dz, dx);
    return mesh;
  }

  /** Thin box over an XZ point set (floor/platform footprint). */
  private _footprintBox(pts: Array<{ x: number; z: number }>, y: number): THREE.Mesh | null {
    if (pts.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    if (maxX - minX < 0.001 || maxZ - minZ < 0.001) return null;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(maxX - minX + 0.06, 0.12, maxZ - minZ + 0.06),
      this._material(0.35),
    );
    mesh.position.set((minX + maxX) / 2, y + 0.06, (minZ + maxZ) / 2);
    return mesh;
  }

  private _showNodeLinks(zoneId: string, nodeId: string, sourceId?: string): void {
    const zone = this._world.zones.get(zoneId);
    const node = zone?.nodes.find(n => n.id === nodeId);
    if (!zone || !node) return;
    const links = this._world.getNodeLinks(zoneId, nodeId);

    let markerY = 0;

    for (const id of links.wallIds) {
      const wall = zone.walls.find(w => w.id === id);
      if (!wall) continue;
      markerY = Math.max(markerY, wall.elevation ?? 0);
      if (id !== sourceId) this._add(this._wallBox(zone, wall));
    }
    for (const id of links.floorIds) {
      const floor = zone.floors.find(f => f.id === id);
      if (!floor) continue;
      markerY = Math.max(markerY, floor.elevation);
      if (id === sourceId) continue;
      const pts = floor.floorMesh.nodeIds?.length
        ? floor.floorMesh.nodeIds
            .map(nid => zone.nodes.find(n => n.id === nid))
            .filter((n): n is NonNullable<typeof n> => !!n)
        : (floor.floorMesh.points ?? []);
      this._add(this._footprintBox(pts, floor.elevation));
    }
    for (const id of links.platformIds) {
      const plat = zone.platforms.find(p => p.id === id);
      if (!plat) continue;
      markerY = Math.max(markerY, plat.position.y + plat.thickness);
      if (id === sourceId) continue;
      const pts = plat.nodeIds?.length
        ? plat.nodeIds
            .map(nid => zone.nodes.find(n => n.id === nid))
            .filter((n): n is NonNullable<typeof n> => !!n)
        : [
            { x: plat.position.x - plat.size.width / 2, z: plat.position.z - plat.size.depth / 2 },
            { x: plat.position.x + plat.size.width / 2, z: plat.position.z + plat.size.depth / 2 },
          ];
      this._add(this._footprintBox(pts, plat.position.y + plat.thickness));
    }

    // Node marker — always shown, above the tallest linked entity's base.
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._material(0.6));
    marker.position.set(node.x, markerY + 0.15, node.z);
    this._add(marker);
  }

  private _clear(): void {
    for (const mesh of this._meshes) {
      this._scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this._meshes = [];
  }
}
