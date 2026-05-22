import * as THREE from "three";
import { FloorBuilder } from "@/builders/FloorBuilder";
import { WallBuilder } from "@/builders/WallBuilder";
import { physicsWorld } from "@/physics/PhysicsWorld";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { FloorDef, FloorMeshDef, WallDef, WallNode, ZoneDef } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

// A run is one or more compatible walls merged into a single mesh.
interface RunEntry {
  mesh:      THREE.Mesh;
  colliders: RAPIER.Collider[];
  wallIds:   string[];
}

interface ZoneEntry {
  group:          THREE.Group;
  floorsGroup:    THREE.Group;
  wallsGroup:     THREE.Group;
  // keyed by floor.id
  floorColliders: Map<string, RAPIER.Collider>;
  // Multiple wallIds can map to the same RunEntry (all walls in a merged run)
  wallData:       Map<string, RunEntry>;
}

// Groups zone walls into compatible runs for merged geometry.
// Two walls can merge when they share a node that has exactly 2 connected walls
// and the walls have matching material, exteriorMaterial, and height.
function groupWallRuns(zone: ZoneDef, _nodes: Map<string, WallNode>): WallDef[][] {
  const nodeWalls = new Map<string, string[]>();
  for (const wall of zone.walls) {
    const s = nodeWalls.get(wall.startNodeId) ?? [];
    s.push(wall.id);
    nodeWalls.set(wall.startNodeId, s);
    const e = nodeWalls.get(wall.endNodeId) ?? [];
    e.push(wall.id);
    nodeWalls.set(wall.endNodeId, e);
  }

  const wallById = new Map(zone.walls.map(w => [w.id, w]));

  function canMerge(w1: WallDef, w2: WallDef, sharedNodeId: string): boolean {
    return (
      (nodeWalls.get(sharedNodeId)?.length ?? 0) === 2 &&
      w1.material          === w2.material &&
      w1.exteriorMaterial  === w2.exteriorMaterial &&
      w1.height            === w2.height
    );
  }

  const visited = new Set<string>();
  const runs: WallDef[][] = [];

  for (const startWall of zone.walls) {
    if (visited.has(startWall.id)) continue;
    visited.add(startWall.id);

    const run: WallDef[] = [startWall];

    // Extend forward from the end node of the last wall in the run
    let forwardNode = startWall.endNodeId;
    let prevId = startWall.id;
    for (;;) {
      const neighbors = nodeWalls.get(forwardNode) ?? [];
      if (neighbors.length !== 2) break;
      const nextId = neighbors.find(id => id !== prevId);
      if (!nextId || visited.has(nextId)) break;
      const next = wallById.get(nextId);
      if (!next || !canMerge(run[run.length - 1]!, next, forwardNode)) break;
      visited.add(nextId);
      run.push(next);
      forwardNode = next.startNodeId === forwardNode ? next.endNodeId : next.startNodeId;
      prevId = nextId;
    }

    // Extend backward from the start node of the first wall in the run
    let backwardNode = startWall.startNodeId;
    prevId = startWall.id;
    for (;;) {
      const neighbors = nodeWalls.get(backwardNode) ?? [];
      if (neighbors.length !== 2) break;
      const prevWallId = neighbors.find(id => id !== prevId);
      if (!prevWallId || visited.has(prevWallId)) break;
      const prev = wallById.get(prevWallId);
      if (!prev || !canMerge(run[0]!, prev, backwardNode)) break;
      visited.add(prevWallId);
      run.unshift(prev);
      backwardNode = prev.startNodeId === backwardNode ? prev.endNodeId : prev.startNodeId;
      prevId = prevWallId;
    }

    runs.push(run);
  }

  return runs;
}

// If a floor's floorMesh has nodeIds, resolve them to current node positions.
function resolveFloorMesh(floorMesh: FloorMeshDef, zone: ZoneDef): FloorMeshDef {
  if (!floorMesh.nodeIds?.length) return floorMesh;
  const points = floorMesh.nodeIds.map(id => {
    const n = zone.nodes.find(nn => nn.id === id);
    return n ? { x: n.x, z: n.z } : { x: 0, z: 0 };
  });
  return { ...floorMesh, points };
}

export class ZoneManager {
  private readonly _loadedZones = new Map<string, ZoneEntry>();
  private readonly _unsubs: Array<() => void> = [];

  // Pending wall rebuild requests — coalesced per microtask to avoid concurrent async races
  private readonly _pendingRebuild = new Map<string, Set<string>>();
  private _rebuildScheduled = false;

  constructor(
    private readonly _scene:      THREE.Scene,
    private readonly _worldState: WorldState,
    private readonly _bus:        EventBus,
  ) {}

  init(): void {
    this._unsubs.push(
      this._bus.on("quality:changed", () => {
        const ids = [...this._loadedZones.keys()];
        for (const id of ids) this.unloadZone(id);
        void Promise.all(ids.map(id => this.loadZone(id)));
      }),
      this._bus.on("floor:added", ({ zoneId, floor }) => {
        void this._addFloor(zoneId, floor);
      }),
      this._bus.on("floor:updated", ({ zoneId, floorId }) => {
        void this._rebuildFloor(zoneId, floorId);
      }),
      this._bus.on("wall:added", ({ zoneId, wall }) => {
        this._queueRebuild(zoneId, wall.id);
      }),
      this._bus.on("wall:updated", ({ zoneId, wallId, changes }) => {
        // If a merge-criteria field changed, silently sync all run-mates so the
        // run stays together after rebuild (no extra events → no recursion).
        if (changes.material !== undefined || changes.exteriorMaterial !== undefined || changes.height !== undefined) {
          const entry = this._loadedZones.get(zoneId);
          const zone  = this._worldState.zones.get(zoneId);
          if (entry && zone) {
            const re = entry.wallData.get(wallId);
            if (re && re.wallIds.length > 1) {
              const sync: Partial<WallDef> = {};
              if (changes.material          !== undefined) sync.material          = changes.material;
              if (changes.exteriorMaterial  !== undefined) sync.exteriorMaterial  = changes.exteriorMaterial;
              if (changes.height            !== undefined) sync.height            = changes.height;
              for (const id of re.wallIds) {
                if (id === wallId) continue;
                const wall = zone.walls.find(w => w.id === id);
                if (wall) Object.assign(wall, sync);
              }
            }
          }
        }
        this._queueRebuild(zoneId, wallId);
      }),
      this._bus.on("wall:removed", ({ zoneId, wallId }) => {
        void this._removeWall(zoneId, wallId);
      }),
      this._bus.on("node:updated", ({ zoneId, nodeId }) => {
        const zone = this._worldState.zones.get(zoneId);
        if (!zone) return;
        for (const wall of zone.walls) {
          if (wall.startNodeId === nodeId || wall.endNodeId === nodeId)
            this._queueRebuild(zoneId, wall.id);
        }
        for (const floor of zone.floors) {
          if (floor.floorMesh.nodeIds?.includes(nodeId))
            void this._rebuildFloor(zoneId, floor.id);
        }
      }),
    );
  }

  private _queueRebuild(zoneId: string, wallId: string): void {
    if (!this._pendingRebuild.has(zoneId))
      this._pendingRebuild.set(zoneId, new Set());
    this._pendingRebuild.get(zoneId)!.add(wallId);

    if (!this._rebuildScheduled) {
      this._rebuildScheduled = true;
      queueMicrotask(() => {
        this._rebuildScheduled = false;
        for (const [zid, ids] of this._pendingRebuild) {
          const snapshot = [...ids];
          this._pendingRebuild.delete(zid);
          void this._rebuildWallBatch(zid, snapshot);
        }
      });
    }
  }

  private _buildNodesMap(zone: ZoneDef): Map<string, WallNode> {
    return new Map((zone.nodes ?? []).map(n => [n.id, n]));
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

    const floorColliders = new Map<string, RAPIER.Collider>();
    const wallData = new Map<string, RunEntry>();

    // Group floors by level so we can pass levelIndex for Z-fighting prevention
    const floorsByLevel = new Map<number, typeof zone.floors>();
    for (const floor of zone.floors) {
      if (!floorsByLevel.has(floor.level)) floorsByLevel.set(floor.level, []);
      floorsByLevel.get(floor.level)!.push(floor);
    }
    for (const levFloors of floorsByLevel.values()) {
      for (let i = 0; i < levFloors.length; i++) {
        const floor    = levFloors[i]!;
        const resolved = { ...floor, floorMesh: resolveFloorMesh(floor.floorMesh, zone) };
        const { mesh, collider } = await FloorBuilder.build(resolved, zone.bounds, zoneId, i);
        floorsGroup.add(mesh);
        floorColliders.set(floor.id, collider);
      }
    }

    const nodesMap = this._buildNodesMap(zone);
    const runs = groupWallRuns(zone, nodesMap);

    for (const run of runs) {
      const output = run.length > 1
        ? await WallBuilder.buildRun(run, zoneId, zone, nodesMap)
        : await WallBuilder.build(run[0]!, zoneId, zone, nodesMap);
      const entry: RunEntry = {
        mesh:      output.mesh,
        colliders: output.colliders,
        wallIds:   run.map(w => w.id),
      };
      wallsGroup.add(output.mesh);
      for (const w of run) wallData.set(w.id, entry);
    }

    this._scene.add(group);
    this._loadedZones.set(zoneId, { group, floorsGroup, wallsGroup, floorColliders, wallData });
  }

  unloadZone(zoneId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;

    entry.floorColliders.forEach(c => physicsWorld.removeCollider(c));
    entry.floorColliders.clear();

    // Use Set to avoid double-disposing shared RunEntry instances
    const uniqueRuns = new Set(entry.wallData.values());
    for (const re of uniqueRuns) {
      re.colliders.forEach(c => physicsWorld.removeCollider(c));
    }

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

  // Called when a brand-new floor is added — just build and append it.
  private async _addFloor(zoneId: string, floor: FloorDef): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;

    const levelIndex = zone.floors.filter(f => f.level === floor.level).indexOf(floor);
    const resolved   = { ...floor, floorMesh: resolveFloorMesh(floor.floorMesh, zone) };
    const { mesh, collider } = await FloorBuilder.build(resolved, zone.bounds, zoneId, levelIndex);
    entry.floorsGroup.add(mesh);
    entry.floorColliders.set(floor.id, collider);
  }

  // Called when an existing floor's material/overrides changed — replace just that floor.
  private async _rebuildFloor(zoneId: string, floorId: string): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;

    // Remove old mesh
    const toRemove: THREE.Mesh[] = [];
    entry.floorsGroup.traverse(child => {
      if (child instanceof THREE.Mesh && child.userData["editorId"] === floorId)
        toRemove.push(child);
    });
    for (const mesh of toRemove) {
      mesh.geometry.dispose();
      if ((mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (mesh.material as THREE.Material).dispose();
      entry.floorsGroup.remove(mesh);
    }

    // Remove old collider
    const oldCollider = entry.floorColliders.get(floorId);
    if (oldCollider) { physicsWorld.removeCollider(oldCollider); entry.floorColliders.delete(floorId); }

    const floor = zone.floors.find(f => f.id === floorId);
    if (!floor) return;

    const levelIndex = zone.floors.filter(f => f.level === floor.level).indexOf(floor);
    const resolved   = { ...floor, floorMesh: resolveFloorMesh(floor.floorMesh, zone) };
    const { mesh, collider } = await FloorBuilder.build(resolved, zone.bounds, zoneId, levelIndex);
    entry.floorsGroup.add(mesh);
    entry.floorColliders.set(floorId, collider);
  }

  // Processes a batch of wall IDs that need rebuilding in a single async pass.
  // All IDs are computed before any await, so there are no concurrent mutation races.
  private async _rebuildWallBatch(zoneId: string, wallIds: string[]): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;

    // Expand seed IDs to all walls that share endpoint nodes with any seed wall.
    const affectedWallIds = new Set<string>(wallIds);
    for (const wallId of wallIds) {
      const w = zone.walls.find(w => w.id === wallId);
      if (!w) continue;
      for (const other of zone.walls) {
        if (other.id === wallId) continue;
        if (
          other.startNodeId === w.startNodeId || other.endNodeId === w.startNodeId ||
          other.startNodeId === w.endNodeId   || other.endNodeId === w.endNodeId
        ) affectedWallIds.add(other.id);
      }
    }

    // Expand again to include all walls already in the same RunEntry.
    const runEntriesToRemove = new Set<RunEntry>();
    for (const wid of affectedWallIds) {
      const re = entry.wallData.get(wid);
      if (re) {
        runEntriesToRemove.add(re);
        for (const id of re.wallIds) affectedWallIds.add(id);
      }
    }

    // Dispose old run meshes + colliders (sync, before any await).
    for (const re of runEntriesToRemove) {
      re.colliders.forEach(c => physicsWorld.removeCollider(c));
      re.mesh.geometry.dispose();
      if ((re.mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (re.mesh.material as THREE.Material).dispose();
      entry.wallsGroup.remove(re.mesh);
      for (const id of re.wallIds) entry.wallData.delete(id);
    }

    // Rebuild the runs that intersect the affected set.
    const nodesMap = this._buildNodesMap(zone);
    const allRuns  = groupWallRuns(zone, nodesMap);
    const newRuns  = allRuns.filter(r => r.some(w => affectedWallIds.has(w.id)));

    for (const run of newRuns) {
      const output = run.length > 1
        ? await WallBuilder.buildRun(run, zoneId, zone, nodesMap)
        : await WallBuilder.build(run[0]!, zoneId, zone, nodesMap);
      const newEntry: RunEntry = {
        mesh:      output.mesh,
        colliders: output.colliders,
        wallIds:   run.map(w => w.id),
      };
      entry.wallsGroup.add(output.mesh);
      for (const w of run) entry.wallData.set(w.id, newEntry);
    }

    for (const wallId of wallIds) this._bus.emit("wall:rebuilt", { zoneId, wallId });
  }

  private async _removeWall(zoneId: string, wallId: string): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry) return;

    const re = entry.wallData.get(wallId);
    if (!re) return;

    // Walls in the same run that still exist in the zone need to be rebuilt
    const survivingIds = re.wallIds.filter(
      id => id !== wallId && (zone?.walls.some(w => w.id === id) ?? false),
    );

    // Remove the old run
    re.colliders.forEach(c => physicsWorld.removeCollider(c));
    re.mesh.geometry.dispose();
    if ((re.mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
      (re.mesh.material as THREE.Material).dispose();
    entry.wallsGroup.remove(re.mesh);
    for (const id of re.wallIds) entry.wallData.delete(id);

    // Rebuild runs for surviving walls from the old run
    if (survivingIds.length > 0 && zone) {
      const nodesMap = this._buildNodesMap(zone);
      const allRuns  = groupWallRuns(zone, nodesMap);
      const newRuns  = allRuns.filter(r => r.some(w => survivingIds.includes(w.id)));
      for (const run of newRuns) {
        const output = run.length > 1
          ? await WallBuilder.buildRun(run, zoneId, zone, nodesMap)
          : await WallBuilder.build(run[0]!, zoneId, zone, nodesMap);
        const newEntry: RunEntry = {
          mesh:      output.mesh,
          colliders: output.colliders,
          wallIds:   run.map(w => w.id),
        };
        entry.wallsGroup.add(output.mesh);
        for (const w of run) entry.wallData.set(w.id, newEntry);
      }
    }
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    for (const zoneId of [...this._loadedZones.keys()]) this.unloadZone(zoneId);
  }
}
