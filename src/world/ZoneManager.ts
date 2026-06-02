import * as THREE from "three";
import { FloorBuilder } from "@/builders/FloorBuilder";
import { WallBuilder } from "@/builders/WallBuilder";
import { PlatformBuilder, type CutInfo } from "@/builders/PlatformBuilder";
import { StairBuilder } from "@/builders/StairBuilder";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { groupWallRuns, buildNodesMap } from "@/utils/wallRuns";
import { assetManager } from "@/core/AssetManager";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { FloorDef, FloorMeshDef, WallDef, ZoneDef, PlatformDef, StairDef, WorldObject } from "@/types";
import type RAPIER from "@dimforge/rapier3d-compat";

// A run is one or more compatible walls merged into a single mesh.
interface RunEntry {
  mesh:       THREE.Mesh;
  colliders:  RAPIER.Collider[];
  wallIds:    string[];
  trimMeshes: THREE.Mesh[];
}

interface PlatformEntry {
  meshes:   THREE.Mesh[];
  collider: RAPIER.Collider;
}

interface StairEntry {
  group:     THREE.Group;
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];
  def:       StairDef;
}

interface ZoneEntry {
  group:          THREE.Group;
  floorsGroup:    THREE.Group;
  wallsGroup:     THREE.Group;
  platformsGroup: THREE.Group;
  stairsGroup:    THREE.Group;
  objectsGroup:   THREE.Group;
  // keyed by floor.id
  floorColliders: Map<string, RAPIER.Collider>;
  // Multiple wallIds can map to the same RunEntry (all walls in a merged run)
  wallData:       Map<string, RunEntry>;
  platformEntries: Map<string, PlatformEntry>;
  stairEntries:    Map<string, StairEntry>;
  objectMeshes:    Map<string, THREE.Object3D>;
}


function makeStairGroup(stairId: string, zoneId: string): THREE.Group {
  const g = new THREE.Group();
  g.userData = { editorId: stairId, editorType: "stair", zoneId, selectable: false };
  return g;
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

  // Pending polygon-platform rebuild requests — same coalescing pattern
  private readonly _pendingPlatformRebuild = new Map<string, Set<string>>();
  private _platformRebuildScheduled = false;

  // Pending floor rebuild requests — same coalescing pattern
  private readonly _pendingFloorRebuild = new Map<string, Set<string>>();
  private _floorRebuildScheduled = false;

  // Cancellation tokens — increment on each new build; stale async results are discarded
  private readonly _platformBuildTokens = new Map<string, number>();

  // Floor dimming state
  private _activeLevel = 0;
  private readonly _dimmedMeshes = new Map<THREE.Mesh, THREE.Material>();
  private readonly _dimMaterials = new Set<THREE.Material>();

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
      this._bus.on("floor:select", ({ level }) => {
        this._activeLevel = level;
        this._applyDimming();
      }),
      this._bus.on("floor:added", ({ zoneId, floor }) => {
        void this._addFloor(zoneId, floor);
      }),
      this._bus.on("floor:updated", ({ zoneId, floorId }) => {
        void this._rebuildFloor(zoneId, floorId);
      }),
      this._bus.on("floor:removed", ({ zoneId, floorId }) => {
        this._removeFloor(zoneId, floorId);
      }),
      this._bus.on("wall:added", ({ zoneId, wall }) => {
        this._queueRebuild(zoneId, wall.id);
      }),
      this._bus.on("wall:updated", ({ zoneId, wallId, changes, segmentOnly }) => {
        // Silently sync merge-criteria fields to all run-mates so the run stays
        // together after a shared edit. Skip for per-segment updates (segmentOnly)
        // so individual walls can legitimately diverge and split from the run.
        if (!segmentOnly && (
          changes.material          !== undefined ||
          changes.exteriorMaterial  !== undefined ||
          changes.height            !== undefined ||
          changes.materialOverrides !== undefined
        )) {
          const entry = this._loadedZones.get(zoneId);
          const zone  = this._worldState.zones.get(zoneId);
          if (entry && zone) {
            const re = entry.wallData.get(wallId);
            if (re && re.wallIds.length > 1) {
              const sync: Partial<WallDef> = {};
              if (changes.material          !== undefined) sync.material          = changes.material;
              if (changes.exteriorMaterial  !== undefined) sync.exteriorMaterial  = changes.exteriorMaterial;
              if (changes.height            !== undefined) sync.height            = changes.height;
              if (changes.materialOverrides !== undefined) sync.materialOverrides = changes.materialOverrides;
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
            this._queueFloorRebuild(zoneId, floor.id);
        }
        for (const platform of zone.platforms) {
          if (platform.nodeIds?.includes(nodeId))
            this._queuePlatformRebuild(zoneId, platform.id);
        }
      }),
      this._bus.on("platform:added", ({ zoneId, platform }) => {
        void this._addPlatform(zoneId, platform);
      }),
      this._bus.on("platform:updated", ({ zoneId, id }) => {
        void this._rebuildPlatform(zoneId, id);
      }),
      this._bus.on("platform:removed", ({ zoneId, id }) => {
        this._removePlatform(zoneId, id);
      }),
      this._bus.on("stair:added", ({ zoneId, stair }) => {
        void this._addStair(zoneId, stair);
      }),
      this._bus.on("stair:updated", ({ zoneId, id }) => {
        void this._rebuildStair(zoneId, id);
      }),
      this._bus.on("stair:removed", ({ zoneId, id }) => {
        const oldDef = this._loadedZones.get(zoneId)?.stairEntries.get(id)?.def;
        this._removeStair(zoneId, id);
        if (oldDef?.csgCutter) void this._rebuildOverlapping(zoneId, oldDef);
      }),
      this._bus.on("object:added", ({ zoneId, object }) => {
        void this._addObject(zoneId, object);
      }),
      this._bus.on("object:removed", ({ zoneId, id }) => {
        this._removeObject(zoneId, id);
      }),
      this._bus.on("preview:start", () => { this._setEditorOnlyVisible(false); }),
      this._bus.on("preview:stop",  () => { this._setEditorOnlyVisible(true);  }),
      this._bus.on("history:restore", () => {
        const zoneId = this._worldState.activeZoneId;
        if (!zoneId) return;
        this.unloadZone(zoneId);
        void this.loadZone(zoneId);
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

  private _queuePlatformRebuild(zoneId: string, platformId: string): void {
    if (!this._pendingPlatformRebuild.has(zoneId))
      this._pendingPlatformRebuild.set(zoneId, new Set());
    this._pendingPlatformRebuild.get(zoneId)!.add(platformId);

    if (!this._platformRebuildScheduled) {
      this._platformRebuildScheduled = true;
      queueMicrotask(() => {
        this._platformRebuildScheduled = false;
        for (const [zid, ids] of this._pendingPlatformRebuild) {
          this._pendingPlatformRebuild.delete(zid);
          for (const pid of ids) void this._rebuildPlatform(zid, pid);
        }
      });
    }
  }

  private _queueFloorRebuild(zoneId: string, floorId: string): void {
    if (!this._pendingFloorRebuild.has(zoneId))
      this._pendingFloorRebuild.set(zoneId, new Set());
    this._pendingFloorRebuild.get(zoneId)!.add(floorId);

    if (!this._floorRebuildScheduled) {
      this._floorRebuildScheduled = true;
      queueMicrotask(() => {
        this._floorRebuildScheduled = false;
        for (const [zid, ids] of this._pendingFloorRebuild) {
          this._pendingFloorRebuild.delete(zid);
          for (const fid of ids) void this._rebuildFloor(zid, fid);
        }
      });
    }
  }

  async loadZone(zoneId: string): Promise<void> {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) { console.warn(`ZoneManager: zone "${zoneId}" not found`); return; }
    if (this._loadedZones.has(zoneId)) return;

    const group          = new THREE.Group();
    group.name           = `zone_${zoneId}`;
    const floorsGroup    = new THREE.Group();
    const wallsGroup     = new THREE.Group();
    const platformsGroup = new THREE.Group();
    const stairsGroup    = new THREE.Group();
    const objectsGroup   = new THREE.Group();
    group.add(floorsGroup, wallsGroup, platformsGroup, stairsGroup, objectsGroup);

    const floorColliders  = new Map<string, RAPIER.Collider>();
    const wallData        = new Map<string, RunEntry>();
    const platformEntries = new Map<string, PlatformEntry>();
    const stairEntries    = new Map<string, StairEntry>();
    const objectMeshes    = new Map<string, THREE.Object3D>();

    // ── Floors ────────────────────────────────────────────────────────────
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

    // ── Walls ─────────────────────────────────────────────────────────────
    const nodesMap = buildNodesMap(zone);
    const runs = groupWallRuns(zone, nodesMap);

    for (const run of runs) {
      const output = run.length > 1
        ? await WallBuilder.buildRun(run, zoneId, zone, nodesMap)
        : await WallBuilder.build(run[0]!, zoneId, zone, nodesMap);
      const entry: RunEntry = {
        mesh:       output.mesh,
        colliders:  output.colliders,
        wallIds:    run.map(w => w.id),
        trimMeshes: output.trimMeshes,
      };
      output.mesh.userData.wallIds = entry.wallIds;
      wallsGroup.add(output.mesh);
      for (const tm of output.trimMeshes) wallsGroup.add(tm);
      for (const w of run) wallData.set(w.id, entry);
    }

    // ── Platforms ─────────────────────────────────────────────────────────
    for (const platform of zone.platforms) {
      const { meshes, collider } = await PlatformBuilder.build(platform, zoneId);
      for (const m of meshes) platformsGroup.add(m);
      platformEntries.set(platform.id, { meshes, collider });
    }

    // ── Stairs ────────────────────────────────────────────────────────────
    for (const stair of zone.stairs) {
      const { meshes, colliders } = await StairBuilder.build(stair, zoneId);
      const stairGroup = makeStairGroup(stair.id, zoneId);
      for (const m of meshes) stairGroup.add(m);
      stairsGroup.add(stairGroup);
      stairEntries.set(stair.id, { group: stairGroup, meshes, colliders, def: stair });
    }

    // ── Objects ───────────────────────────────────────────────────────────
    for (const obj of zone.objects) {
      const mesh = await this._loadObjectMesh(obj, zoneId);
      if (mesh) { objectsGroup.add(mesh); objectMeshes.set(obj.id, mesh); }
    }

    this._scene.add(group);
    this._loadedZones.set(zoneId, {
      group, floorsGroup, wallsGroup, platformsGroup, stairsGroup, objectsGroup,
      floorColliders, wallData, platformEntries, stairEntries, objectMeshes,
    });

    // Second pass: apply CSG cuts from any stairs with cutters
    for (const stair of zone.stairs) {
      if (stair.csgCutter) await this._rebuildOverlapping(zoneId, stair);
    }

    // Apply current dimming level after loading
    this._applyDimming();
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

    for (const pe of entry.platformEntries.values()) {
      physicsWorld.removeCollider(pe.collider);
    }

    for (const se of entry.stairEntries.values()) {
      se.colliders.forEach(c => physicsWorld.removeCollider(c));
    }

    // Clear any dimming references for this zone's meshes
    entry.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const orig = this._dimmedMeshes.get(child);
        if (orig !== undefined) {
          // Restore before disposal to avoid leaking dim clone
          child.material = orig;
          this._dimmedMeshes.delete(child);
        }
      }
    });

    this._scene.remove(entry.group);
    entry.group.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        if ((child.userData as { _ownsMaterial?: boolean })._ownsMaterial)
          (child.material as THREE.Material).dispose();
      }
    });
    this._loadedZones.delete(zoneId);

    // Dispose any dim-cloned materials that are now orphaned
    this._pruneDimMaterials();
  }

  // ── Floor helpers ─────────────────────────────────────────────────────────

  private async _addFloor(zoneId: string, floor: FloorDef): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;

    const levelIndex = zone.floors.filter(f => f.level === floor.level).indexOf(floor);
    const resolved   = { ...floor, floorMesh: resolveFloorMesh(floor.floorMesh, zone) };
    const cutters    = this._getStairCuttersForFloor(zoneId, resolved);
    const { mesh, collider } = await FloorBuilder.build(resolved, zone.bounds, zoneId, levelIndex, cutters);
    for (const c of cutters) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    entry.floorsGroup.add(mesh);
    entry.floorColliders.set(floor.id, collider);
    this._applyDimming();
    this._bus.emit("floor:rebuilt", { zoneId, floorId: floor.id });
  }

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
      const origMat = this._dimmedMeshes.get(mesh);
      if (origMat) { mesh.material = origMat; this._dimmedMeshes.delete(mesh); }
      mesh.geometry.dispose();
      if ((mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (mesh.material as THREE.Material).dispose();
      entry.floorsGroup.remove(mesh);
    }

    const oldCollider = entry.floorColliders.get(floorId);
    if (oldCollider) { physicsWorld.removeCollider(oldCollider); entry.floorColliders.delete(floorId); }

    const floor = zone.floors.find(f => f.id === floorId);
    if (!floor) return;

    const levelIndex = zone.floors.filter(f => f.level === floor.level).indexOf(floor);
    const resolved   = { ...floor, floorMesh: resolveFloorMesh(floor.floorMesh, zone) };
    const cutters    = this._getStairCuttersForFloor(zoneId, resolved);
    const { mesh, collider } = await FloorBuilder.build(resolved, zone.bounds, zoneId, levelIndex, cutters);
    for (const c of cutters) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    entry.floorsGroup.add(mesh);
    entry.floorColliders.set(floorId, collider);
    this._applyDimming();
    this._bus.emit("floor:rebuilt", { zoneId, floorId });
  }

  private _removeFloor(zoneId: string, floorId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;

    const toRemove: THREE.Mesh[] = [];
    entry.floorsGroup.traverse(child => {
      if (child instanceof THREE.Mesh && child.userData["editorId"] === floorId)
        toRemove.push(child);
    });
    for (const mesh of toRemove) {
      const origMat = this._dimmedMeshes.get(mesh);
      if (origMat) { mesh.material = origMat; this._dimmedMeshes.delete(mesh); }
      mesh.geometry.dispose();
      if ((mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (mesh.material as THREE.Material).dispose();
      entry.floorsGroup.remove(mesh);
    }

    const oldCollider = entry.floorColliders.get(floorId);
    if (oldCollider) { physicsWorld.removeCollider(oldCollider); entry.floorColliders.delete(floorId); }

    this._applyDimming();
  }

  // ── Wall helpers ──────────────────────────────────────────────────────────

  private async _rebuildWallBatch(zoneId: string, wallIds: string[]): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;

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

    const runEntriesToRemove = new Set<RunEntry>();
    for (const wid of affectedWallIds) {
      const re = entry.wallData.get(wid);
      if (re) {
        runEntriesToRemove.add(re);
        for (const id of re.wallIds) affectedWallIds.add(id);
      }
    }

    for (const re of runEntriesToRemove) {
      re.colliders.forEach(c => physicsWorld.removeCollider(c));
      // Restore dim if needed before disposal
      const origMat = this._dimmedMeshes.get(re.mesh);
      if (origMat) { re.mesh.material = origMat; this._dimmedMeshes.delete(re.mesh); }
      re.mesh.geometry.dispose();
      if ((re.mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (re.mesh.material as THREE.Material).dispose();
      entry.wallsGroup.remove(re.mesh);
      for (const tm of re.trimMeshes) {
        const origTrim = this._dimmedMeshes.get(tm);
        if (origTrim) { tm.material = origTrim; this._dimmedMeshes.delete(tm); }
        entry.wallsGroup.remove(tm);
        tm.geometry.dispose();
        if ((tm.userData as { _ownsMaterial?: boolean })._ownsMaterial)
          (tm.material as THREE.Material).dispose();
      }
      for (const id of re.wallIds) entry.wallData.delete(id);
    }

    const nodesMap = buildNodesMap(zone);
    const allRuns  = groupWallRuns(zone, nodesMap);
    const newRuns  = allRuns.filter(r => r.some(w => affectedWallIds.has(w.id)));

    for (const run of newRuns) {
      const output = run.length > 1
        ? await WallBuilder.buildRun(run, zoneId, zone, nodesMap)
        : await WallBuilder.build(run[0]!, zoneId, zone, nodesMap);
      const newEntry: RunEntry = {
        mesh:       output.mesh,
        colliders:  output.colliders,
        wallIds:    run.map(w => w.id),
        trimMeshes: output.trimMeshes,
      };
      output.mesh.userData.wallIds = newEntry.wallIds;
      entry.wallsGroup.add(output.mesh);
      for (const tm of output.trimMeshes) entry.wallsGroup.add(tm);
      for (const w of run) entry.wallData.set(w.id, newEntry);
    }

    this._applyDimming();
    for (const wallId of wallIds) this._bus.emit("wall:rebuilt", { zoneId, wallId });
  }

  private async _removeWall(zoneId: string, wallId: string): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry) return;

    const re = entry.wallData.get(wallId);
    if (!re) return;

    const survivingIds = re.wallIds.filter(
      id => id !== wallId && (zone?.walls.some(w => w.id === id) ?? false),
    );

    re.colliders.forEach(c => physicsWorld.removeCollider(c));
    const origMat = this._dimmedMeshes.get(re.mesh);
    if (origMat) { re.mesh.material = origMat; this._dimmedMeshes.delete(re.mesh); }
    re.mesh.geometry.dispose();
    if ((re.mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
      (re.mesh.material as THREE.Material).dispose();
    entry.wallsGroup.remove(re.mesh);
    for (const tm of re.trimMeshes) {
      const origTrim = this._dimmedMeshes.get(tm);
      if (origTrim) { tm.material = origTrim; this._dimmedMeshes.delete(tm); }
      entry.wallsGroup.remove(tm);
      tm.geometry.dispose();
      if ((tm.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (tm.material as THREE.Material).dispose();
    }
    for (const id of re.wallIds) entry.wallData.delete(id);

    if (survivingIds.length > 0 && zone) {
      const nodesMap = buildNodesMap(zone);
      const allRuns  = groupWallRuns(zone, nodesMap);
      const newRuns  = allRuns.filter(r => r.some(w => survivingIds.includes(w.id)));
      for (const run of newRuns) {
        const output = run.length > 1
          ? await WallBuilder.buildRun(run, zoneId, zone, nodesMap)
          : await WallBuilder.build(run[0]!, zoneId, zone, nodesMap);
        // Stale check: walls may have been removed from WorldState while awaiting rebuild
        if (!run.some(w => zone.walls.some(zw => zw.id === w.id))) {
          output.mesh.geometry.dispose();
          if ((output.mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
            (output.mesh.material as THREE.Material).dispose();
          for (const tm of output.trimMeshes) tm.geometry.dispose();
          output.colliders.forEach(c => physicsWorld.removeCollider(c));
          continue;
        }
        const newEntry: RunEntry = {
          mesh:       output.mesh,
          colliders:  output.colliders,
          wallIds:    run.map(w => w.id),
          trimMeshes: output.trimMeshes,
        };
        entry.wallsGroup.add(output.mesh);
        for (const tm of output.trimMeshes) entry.wallsGroup.add(tm);
        for (const w of run) entry.wallData.set(w.id, newEntry);
      }
    }
    this._applyDimming();
  }

  // ── Platform helpers ──────────────────────────────────────────────────────

  private async _addPlatform(zoneId: string, platform: PlatformDef): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    const cutters = this._getStairCuttersForPlatform(zoneId, platform);
    const { meshes, collider } = await PlatformBuilder.build(platform, zoneId, cutters);
    for (const c of cutters) { c.mesh.geometry.dispose(); (c.mesh.material as THREE.Material).dispose(); }
    for (const m of meshes) entry.platformsGroup.add(m);
    entry.platformEntries.set(platform.id, { meshes, collider });
    this._applyDimming();
    this._bus.emit("platform:rebuilt", { zoneId, platformId: platform.id });
  }

  private async _rebuildPlatform(zoneId: string, platformId: string): Promise<void> {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return;

    // Claim a token — any older in-flight build for this platform is now stale
    const myToken = (this._platformBuildTokens.get(platformId) ?? 0) + 1;
    this._platformBuildTokens.set(platformId, myToken);

    const platform = zone.platforms.find(p => p.id === platformId);
    if (!platform) return;

    // Resolve polygon vertices from current node positions (synchronous, before the await)
    let resolved = platform;
    if (platform.nodeIds?.length) {
      const pts = platform.nodeIds
        .map(id => zone.nodes.find(n => n.id === id))
        .filter((n): n is NonNullable<typeof n> => n != null)
        .map(n => ({ x: n.x, z: n.z }));
      if (pts.length >= 3) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
        resolved = {
          ...platform,
          points:   pts,
          position: { ...platform.position, x: cx, z: cz },
          size: {
            width: Math.max(Math.max(...xs) - Math.min(...xs), 0.5),
            depth: Math.max(Math.max(...zs) - Math.min(...zs), 0.5),
          },
        };
      }
    }

    // Compute cutter meshes before the async gap so we read current stair state
    const cutters = this._getStairCuttersForPlatform(zoneId, resolved);

    // Build the geometry/material (potentially async due to material loading)
    const { meshes, collider } = await PlatformBuilder.build(resolved, zoneId, cutters);
    for (const c of cutters) { c.mesh.geometry.dispose(); (c.mesh.material as THREE.Material).dispose(); }

    // If a newer rebuild started while we were awaiting, discard this stale result
    if (this._platformBuildTokens.get(platformId) !== myToken) {
      for (const m of meshes) {
        m.geometry.dispose();
        if ((m.userData as { _ownsMaterial?: boolean })._ownsMaterial)
          (m.material as THREE.Material).dispose();
      }
      physicsWorld.removeCollider(collider);
      return;
    }

    // Atomically swap: remove old mesh then add the fresh one
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    this._removePlatform(zoneId, platformId);
    for (const m of meshes) entry.platformsGroup.add(m);
    entry.platformEntries.set(platformId, { meshes, collider });
    this._applyDimming();
    this._bus.emit("platform:rebuilt", { zoneId, platformId });
  }

  private _removePlatform(zoneId: string, platformId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;

    const pe = entry.platformEntries.get(platformId);
    if (!pe) return;

    physicsWorld.removeCollider(pe.collider);
    for (const mesh of pe.meshes) {
      const orig = this._dimmedMeshes.get(mesh);
      if (orig) { mesh.material = orig; this._dimmedMeshes.delete(mesh); }
      entry.platformsGroup.remove(mesh);
      mesh.geometry.dispose();
      if ((mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (mesh.material as THREE.Material).dispose();
    }
    entry.platformEntries.delete(platformId);
  }

  // ── Stair helpers ─────────────────────────────────────────────────────────

  private async _addStair(zoneId: string, stair: StairDef): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    const { meshes, colliders } = await StairBuilder.build(stair, zoneId);
    const stairGroup = makeStairGroup(stair.id, zoneId);
    for (const m of meshes) stairGroup.add(m);
    entry.stairsGroup.add(stairGroup);
    entry.stairEntries.set(stair.id, { group: stairGroup, meshes, colliders, def: stair });
    this._applyDimming();
    if (stair.csgCutter) await this._rebuildOverlapping(zoneId, stair);
  }

  private async _rebuildStair(zoneId: string, stairId: string): Promise<void> {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return;
    const oldDef = this._loadedZones.get(zoneId)?.stairEntries.get(stairId)?.def;
    this._removeStair(zoneId, stairId);
    const stair = zone.stairs.find(s => s.id === stairId);
    if (!stair) return;
    await this._addStair(zoneId, stair);  // handles new csgCutter
    // If old cutter existed but new one doesn't (or moved), rebuild what old cutter covered
    if (oldDef?.csgCutter) await this._rebuildOverlapping(zoneId, oldDef);
    this._bus.emit("stair:rebuilt", { zoneId, stairId });
  }

  private _removeStair(zoneId: string, stairId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;

    const se = entry.stairEntries.get(stairId);
    if (!se) return;

    se.colliders.forEach(c => physicsWorld.removeCollider(c));
    for (const mesh of se.meshes) {
      const orig = this._dimmedMeshes.get(mesh);
      if (orig) { mesh.material = orig; this._dimmedMeshes.delete(mesh); }
      mesh.geometry.dispose();
      if ((mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (mesh.material as THREE.Material).dispose();
    }
    entry.stairsGroup.remove(se.group);
    entry.stairEntries.delete(stairId);
  }

  // ── Object helpers ────────────────────────────────────────────────────────

  private async _loadObjectMesh(obj: WorldObject, zoneId: string): Promise<THREE.Object3D | null> {
    try {
      const mesh = await assetManager.loadModel(obj.assetId);
      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      const DEG2RAD = Math.PI / 180;
      mesh.rotation.set(obj.rotation.x * DEG2RAD, obj.rotation.y * DEG2RAD, obj.rotation.z * DEG2RAD);
      mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
      mesh.userData = { editorId: obj.id, editorType: "object", zoneId, selectable: true, floorLevel: obj.floor };
      mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.userData = { ...mesh.userData };
          child.castShadow    = true;
          child.receiveShadow = true;
        }
      });
      return mesh;
    } catch (err) {
      console.warn(`ZoneManager: failed to load model for asset "${obj.assetId}"`, err);
      // Fallback placeholder box
      const geo  = new THREE.BoxGeometry(1, 1, 1);
      const mat  = new THREE.MeshStandardMaterial({ color: 0xff6600, wireframe: true });
      const box  = new THREE.Mesh(geo, mat);
      box.position.set(obj.position.x, obj.position.y, obj.position.z);
      box.userData = { editorId: obj.id, editorType: "object", zoneId, selectable: true, floorLevel: obj.floor, _ownsMaterial: true };
      return box;
    }
  }

  private async _addObject(zoneId: string, obj: WorldObject): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    const mesh = await this._loadObjectMesh(obj, zoneId);
    if (!mesh) return;
    entry.objectsGroup.add(mesh);
    entry.objectMeshes.set(obj.id, mesh);
  }

  private _removeObject(zoneId: string, objectId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    const mesh = entry.objectMeshes.get(objectId);
    if (!mesh) return;
    entry.objectsGroup.remove(mesh);
    mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if ((child.userData as { _ownsMaterial?: boolean })._ownsMaterial)
          (child.material as THREE.Material).dispose();
      }
    });
    entry.objectMeshes.delete(objectId);
  }

  // ── CSG cutter helpers ────────────────────────────────────────────────────

  private _createCutterMesh(stair: StairDef): THREE.Mesh | null {
    if (!stair.csgCutter) return null;
    const { offset, width, depth, height, rotation } = stair.csgCutter;
    const DEG2RAD = Math.PI / 180;
    const geo  = new THREE.BoxGeometry(width + 0.05, height + 0.05, depth + 0.05);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.position.set(stair.end.x + offset.x, stair.end.y + offset.y, stair.end.z + offset.z);
    mesh.rotation.set(
      (rotation?.x ?? 0) * DEG2RAD,
      (rotation?.y ?? 0) * DEG2RAD,
      (rotation?.z ?? 0) * DEG2RAD,
    );
    mesh.updateMatrixWorld();
    return mesh;
  }

  private _getStairCuttersForFloor(zoneId: string, floor: FloorDef): THREE.Mesh[] {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return [];
    const pts  = floor.floorMesh.points ?? [];
    let fMinX: number, fMaxX: number, fMinZ: number, fMaxZ: number;
    if (pts.length > 0) {
      fMinX = Math.min(...pts.map(p => p.x)); fMaxX = Math.max(...pts.map(p => p.x));
      fMinZ = Math.min(...pts.map(p => p.z)); fMaxZ = Math.max(...pts.map(p => p.z));
    } else {
      fMinX = zone.bounds.x;                  fMaxX = zone.bounds.x + zone.bounds.width;
      fMinZ = zone.bounds.z;                  fMaxZ = zone.bounds.z + zone.bounds.depth;
    }
    const fY = floor.elevation;
    const result: THREE.Mesh[] = [];
    for (const stair of zone.stairs) {
      if (!stair.csgCutter) continue;
      const { offset, width, depth, height } = stair.csgCutter;
      const cx = stair.end.x + offset.x, cy = stair.end.y + offset.y, cz = stair.end.z + offset.z;
      if (cx + width / 2  < fMinX || cx - width / 2  > fMaxX) continue;
      if (cy - height / 2 > fY + 0.1 || cy + height / 2 < fY - 0.1) continue;
      if (cz + depth / 2  < fMinZ || cz - depth / 2  > fMaxZ) continue;
      result.push(this._createCutterMesh(stair)!);
    }
    return result;
  }

  private _getStairCuttersForPlatform(zoneId: string, platform: PlatformDef): CutInfo[] {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return [];
    const pMinX = platform.position.x - platform.size.width  / 2;
    const pMaxX = platform.position.x + platform.size.width  / 2;
    const pMinY = platform.position.y;
    const pMaxY = platform.position.y + platform.thickness;
    const pMinZ = platform.position.z - platform.size.depth  / 2;
    const pMaxZ = platform.position.z + platform.size.depth  / 2;
    const DEG2RAD = Math.PI / 180;
    const result: CutInfo[] = [];
    for (const stair of zone.stairs) {
      if (!stair.csgCutter) continue;
      const { offset, width, depth, height, rotation } = stair.csgCutter;
      const cx = stair.end.x + offset.x, cy = stair.end.y + offset.y, cz = stair.end.z + offset.z;
      if (cx + width / 2 < pMinX || cx - width / 2 > pMaxX) continue;
      if (cy + height / 2 < pMinY || cy - height / 2 > pMaxY) continue;
      if (cz + depth / 2 < pMinZ || cz - depth / 2 > pMaxZ) continue;
      result.push({
        mesh:       this._createCutterMesh(stair)!,
        worldX:     cx,
        worldZ:     cz,
        width,
        depth,
        rotX:       (rotation?.x ?? 0) * DEG2RAD,
        rotY:       (rotation?.y ?? 0) * DEG2RAD,
        rotZ:       (rotation?.z ?? 0) * DEG2RAD,
        innerTileH:      stair.csgCutter.innerTileH ?? 1,
        innerTileV:      stair.csgCutter.innerTileV ?? 1,
        innerFaceHeight: platform.thickness,
      });
    }
    return result;
  }

  private async _rebuildOverlapping(zoneId: string, stair: StairDef): Promise<void> {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone || !stair.csgCutter) return;
    const { offset, width, depth, height } = stair.csgCutter;
    const cx = stair.end.x + offset.x, cy = stair.end.y + offset.y, cz = stair.end.z + offset.z;
    const cMinX = cx - width / 2, cMaxX = cx + width / 2;
    const cMinY = cy - height / 2, cMaxY = cy + height / 2;
    const cMinZ = cz - depth / 2, cMaxZ = cz + depth / 2;

    for (const floor of zone.floors) {
      const resolved = resolveFloorMesh(floor.floorMesh, zone);
      const pts = resolved.points ?? [];
      let fMinX: number, fMaxX: number, fMinZ: number, fMaxZ: number;
      if (pts.length > 0) {
        fMinX = Math.min(...pts.map(p => p.x)); fMaxX = Math.max(...pts.map(p => p.x));
        fMinZ = Math.min(...pts.map(p => p.z)); fMaxZ = Math.max(...pts.map(p => p.z));
      } else {
        fMinX = zone.bounds.x;                  fMaxX = zone.bounds.x + zone.bounds.width;
        fMinZ = zone.bounds.z;                  fMaxZ = zone.bounds.z + zone.bounds.depth;
      }
      if (cMaxX < fMinX || cMinX > fMaxX) continue;
      if (cMaxY < floor.elevation - 0.1 || cMinY > floor.elevation + 0.1) continue;
      if (cMaxZ < fMinZ || cMinZ > fMaxZ) continue;
      await this._rebuildFloor(zoneId, floor.id);
    }

    for (const platform of zone.platforms) {
      const pMinX = platform.position.x - platform.size.width  / 2;
      const pMaxX = platform.position.x + platform.size.width  / 2;
      const pMinY = platform.position.y;
      const pMaxY = platform.position.y + platform.thickness;
      const pMinZ = platform.position.z - platform.size.depth  / 2;
      const pMaxZ = platform.position.z + platform.size.depth  / 2;
      if (cMaxX < pMinX || cMinX > pMaxX) continue;
      if (cMaxY < pMinY || cMinY > pMaxY) continue;
      if (cMaxZ < pMinZ || cMinZ > pMaxZ) continue;
      await this._rebuildPlatform(zoneId, platform.id);
    }
  }

  private _setEditorOnlyVisible(visible: boolean): void {
    for (const [, zone] of this._loadedZones) {
      for (const [, se] of zone.stairEntries) {
        for (const mesh of se.meshes) {
          if ((mesh.userData as { editorOnly?: boolean }).editorOnly)
            mesh.visible = visible;
        }
      }
    }
  }

  // ── Floor dimming ─────────────────────────────────────────────────────────

  private _applyDimming(): void {
    // Restore all previously dimmed meshes to their original materials
    for (const [mesh, origMat] of this._dimmedMeshes) {
      mesh.material = origMat;
    }
    this._dimmedMeshes.clear();
    this._pruneDimMaterials();

    for (const [, zoneEntry] of this._loadedZones) {
      zoneEntry.group.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        const ud    = child.userData as { floorLevel?: number; _ownsMaterial?: boolean };
        const level = ud.floorLevel;
        if (level === undefined || level === this._activeLevel) return;

        // Don't re-dim something that's already a dim clone
        if (this._dimMaterials.has(child.material as THREE.Material)) return;

        const origMat = child.material as THREE.Material;
        const dimMat  = origMat.clone() as THREE.MeshStandardMaterial;
        dimMat.transparent = true;
        dimMat.opacity     = 0.15;
        dimMat.depthWrite  = false;
        this._dimMaterials.add(dimMat);
        this._dimmedMeshes.set(child, origMat);
        child.material = dimMat;
      });
    }
  }

  private _pruneDimMaterials(): void {
    // Remove dim clones that are no longer referenced by any mesh
    const inUse = new Set<THREE.Material>(this._dimmedMeshes.values() as unknown as Iterable<THREE.Material>);
    // Actually: values() are the ORIGINAL mats; dim clones are in _dimMaterials
    // Rebuild inUse from current mesh materials
    const usedDimMats = new Set<THREE.Material>();
    for (const [mesh] of this._dimmedMeshes) {
      usedDimMats.add(mesh.material as THREE.Material);
    }
    for (const dimMat of this._dimMaterials) {
      if (!usedDimMats.has(dimMat)) {
        dimMat.dispose();
        this._dimMaterials.delete(dimMat);
      }
    }
    void inUse; // suppress unused warning
  }

  dispose(): void {
    this._unsubs.forEach(u => u());
    for (const zoneId of [...this._loadedZones.keys()]) this.unloadZone(zoneId);
    // Dispose remaining dim clones
    for (const mat of this._dimMaterials) mat.dispose();
    this._dimMaterials.clear();
    this._dimmedMeshes.clear();
  }
}
