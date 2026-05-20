import * as THREE from "three";
import { FloorBuilder } from "@/builders/FloorBuilder";
import { physicsWorld } from "@/physics/PhysicsWorld";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type RAPIER from "@dimforge/rapier3d-compat";

interface ZoneEntry {
  group:       THREE.Group;
  floorsGroup: THREE.Group;
  colliders:   ZoneColliders;
}

interface ZoneColliders {
  floors: RAPIER.Collider[];
}

export class ZoneManager {
  private readonly _loadedZones = new Map<string, ZoneEntry>();

  constructor(
    private readonly _scene:      THREE.Scene,
    private readonly _worldState: WorldState,
    private readonly _bus:        EventBus,
  ) {}

  init(): void {
    this._bus.on("floor:added", ({ zoneId, floor }) => {
      this._rebuildFloor(zoneId, floor.level);
    });
  }

  async loadZone(zoneId: string): Promise<void> {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) { console.warn(`ZoneManager: zone "${zoneId}" not found`); return; }
    if (this._loadedZones.has(zoneId)) return;

    const group       = new THREE.Group();
    group.name        = `zone_${zoneId}`;
    const floorsGroup = new THREE.Group();
    group.add(floorsGroup);

    const colliders: ZoneColliders = { floors: [] };

    for (const floor of zone.floors) {
      const { mesh, collider } = await FloorBuilder.build(floor, zone.bounds, zoneId);
      floorsGroup.add(mesh);
      colliders.floors.push(collider);
    }

    this._scene.add(group);
    this._loadedZones.set(zoneId, { group, floorsGroup, colliders });
  }

  unloadZone(zoneId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;

    for (const c of entry.colliders.floors) physicsWorld.removeCollider(c);

    this._scene.remove(entry.group);
    entry.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if ((child.userData as { _ownsMaterial?: boolean })._ownsMaterial) {
          (child.material as THREE.Material).dispose();
        }
      }
    });
    this._loadedZones.delete(zoneId);
  }

  private async _rebuildFloor(zoneId: string, level: number): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;

    // Remove old meshes + colliders for this floor level
    const toRemove: THREE.Object3D[] = [];
    entry.floorsGroup.traverse(child => {
      if (child instanceof THREE.Mesh && child.userData["floorLevel"] === level)
        toRemove.push(child);
    });
    for (const m of toRemove) {
      const mesh = m as THREE.Mesh;
      mesh.geometry.dispose();
      if ((mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (mesh.material as THREE.Material).dispose();
      entry.floorsGroup.remove(mesh);
    }

    // Remove matching colliders
    const keep: RAPIER.Collider[] = [];
    for (const c of entry.colliders.floors) {
      // Rapier colliders have no level metadata — rebuild all when a floor changes
      physicsWorld.removeCollider(c);
    }
    entry.colliders.floors = keep;

    // Rebuild
    const floor = zone.floors.find(f => f.level === level);
    if (!floor) return;
    const { mesh, collider } = await FloorBuilder.build(floor, zone.bounds, zoneId);
    entry.floorsGroup.add(mesh);
    entry.colliders.floors.push(collider);
  }

  dispose(): void {
    for (const zoneId of [...this._loadedZones.keys()]) this.unloadZone(zoneId);
  }
}
