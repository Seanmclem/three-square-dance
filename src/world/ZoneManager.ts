import * as THREE from "three";
import { FloorBuilder } from "@/builders/FloorBuilder";
import { WallBuilder } from "@/builders/WallBuilder";
import { physicsWorld } from "@/physics/PhysicsWorld";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type RAPIER from "@dimforge/rapier3d-compat";

interface WallEntry {
  mesh:      THREE.Mesh;
  colliders: RAPIER.Collider[];
}

interface ZoneEntry {
  group:          THREE.Group;
  floorsGroup:    THREE.Group;
  wallsGroup:     THREE.Group;
  floorColliders: RAPIER.Collider[];
  wallData:       Map<string, WallEntry>;
}

export class ZoneManager {
  private readonly _loadedZones = new Map<string, ZoneEntry>();
  private readonly _unsubs: Array<() => void> = [];

  constructor(
    private readonly _scene:      THREE.Scene,
    private readonly _worldState: WorldState,
    private readonly _bus:        EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("floor:added", ({ zoneId, floor }) => {
        this._rebuildFloor(zoneId, floor.level);
      }),
      this._bus.on("floor:updated", ({ zoneId, level }) => {
        this._rebuildFloor(zoneId, level);
      }),
      this._bus.on("wall:added", ({ zoneId, wall }) => {
        this._rebuildWall(zoneId, wall.id);
      }),
      this._bus.on("wall:updated", ({ zoneId, wallId }) => {
        this._rebuildWall(zoneId, wallId);
      }),
      this._bus.on("wall:removed", ({ zoneId, wallId }) => {
        this._removeWall(zoneId, wallId);
      }),
    );
  }

  async loadZone(zoneId: string): Promise<void> {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) { console.warn(`ZoneManager: zone "${zoneId}" not found`); return; }
    if (this._loadedZones.has(zoneId)) return;

    const group       = new THREE.Group();
    group.name        = `zone_${zoneId}`;
    const floorsGroup = new THREE.Group();
    const wallsGroup  = new THREE.Group();
    group.add(floorsGroup);
    group.add(wallsGroup);

    const floorColliders: RAPIER.Collider[] = [];
    const wallData = new Map<string, WallEntry>();

    for (const floor of zone.floors) {
      const { mesh, collider } = await FloorBuilder.build(floor, zone.bounds, zoneId);
      floorsGroup.add(mesh);
      floorColliders.push(collider);
    }

    for (const wall of zone.walls) {
      const { mesh, colliders } = await WallBuilder.build(wall, zoneId);
      wallsGroup.add(mesh);
      wallData.set(wall.id, { mesh, colliders });
    }

    this._scene.add(group);
    this._loadedZones.set(zoneId, { group, floorsGroup, wallsGroup, floorColliders, wallData });
  }

  unloadZone(zoneId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;

    entry.floorColliders.forEach(c => physicsWorld.removeCollider(c));
    entry.wallData.forEach(({ colliders }) => colliders.forEach(c => physicsWorld.removeCollider(c)));

    this._scene.remove(entry.group);
    entry.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if ((child.userData as { _ownsMaterial?: boolean })._ownsMaterial)
          (child.material as THREE.Material).dispose();
      }
    });
    this._loadedZones.delete(zoneId);
  }

  private async _rebuildFloor(zoneId: string, level: number): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;

    const toRemove: THREE.Mesh[] = [];
    entry.floorsGroup.traverse(child => {
      if (child instanceof THREE.Mesh && child.userData["floorLevel"] === level)
        toRemove.push(child);
    });
    for (const mesh of toRemove) {
      mesh.geometry.dispose();
      if ((mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (mesh.material as THREE.Material).dispose();
      entry.floorsGroup.remove(mesh);
    }

    entry.floorColliders.forEach(c => physicsWorld.removeCollider(c));
    entry.floorColliders.length = 0;

    const floor = zone.floors.find(f => f.level === level);
    if (!floor) return;
    const { mesh, collider } = await FloorBuilder.build(floor, zone.bounds, zoneId);
    entry.floorsGroup.add(mesh);
    entry.floorColliders.push(collider);
  }

  private async _rebuildWall(zoneId: string, wallId: string): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;

    this._removeWallEntry(entry, wallId);

    const wall = zone.walls.find(w => w.id === wallId);
    if (!wall) return;
    const { mesh, colliders } = await WallBuilder.build(wall, zoneId);
    entry.wallsGroup.add(mesh);
    entry.wallData.set(wallId, { mesh, colliders });
    this._bus.emit("wall:rebuilt", { zoneId, wallId });
  }

  private _removeWall(zoneId: string, wallId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    this._removeWallEntry(entry, wallId);
  }

  private _removeWallEntry(entry: ZoneEntry, wallId: string): void {
    const existing = entry.wallData.get(wallId);
    if (!existing) return;
    existing.colliders.forEach(c => physicsWorld.removeCollider(c));
    existing.mesh.geometry.dispose();
    if ((existing.mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
      (existing.mesh.material as THREE.Material).dispose();
    entry.wallsGroup.remove(existing.mesh);
    entry.wallData.delete(wallId);
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    for (const zoneId of [...this._loadedZones.keys()]) this.unloadZone(zoneId);
  }
}
