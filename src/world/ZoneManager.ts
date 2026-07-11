import * as THREE from "three";
import { FloorBuilder } from "@/builders/FloorBuilder";
import { WallBuilder } from "@/builders/WallBuilder";
import { PlatformBuilder, type CutInfo } from "@/builders/PlatformBuilder";
import { StairBuilder } from "@/builders/StairBuilder";
import { LadderBuilder } from "@/builders/LadderBuilder";
import { ShapeBuilder } from "@/builders/ShapeBuilder";
import { ColliderBuilder } from "@/physics/ColliderBuilder";
import { physicsWorld } from "@/physics/PhysicsWorld";
import { defaultColliderFromAABB } from "@/physics/attachedColliderMath";
import { assetManager } from "@/core/AssetManager";
import { groupWallRuns, buildNodesMap } from "@/utils/wallRuns";
import { createVolumeFillMaterial } from "@/world/volumeFillMaterial";
import { buildOverlayDecalMesh, decalProjectorBox, type DecalTextures } from "@/world/decals/DecalBuilder";
import { makeSurfaceDecalMaterial, updateSurfaceDecalUniforms, slotFromDecal, MAX_SURFACE_DECALS } from "@/world/decals/surfaceDecals";
import type { ObjectPlacer } from "@/preview/ObjectPlacer";
import type { MoverSystem } from "@/world/MoverSystem";
import type { EventBus } from "@/core/EventBus";
import type { WorldState } from "@/world/WorldState";
import type { FloorDef, FloorMeshDef, WallDef, ZoneDef, PlatformDef, StairDef, LadderDef, ShapeDef, WorldObject, TriggerVolume, DecalDef } from "@/types";
import { isGameplayMode } from "@/types";
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

interface LadderEntry {
  meshes:    THREE.Mesh[];
  colliders: RAPIER.Collider[];
  sensors:   RAPIER.Collider[];
  def:       LadderDef;
}

interface ShapeEntry {
  meshes:   THREE.Mesh[];   // [cap, side] — same transform, same editorId
  collider: RAPIER.Collider | null;
}

interface ZoneEntry {
  group:          THREE.Group;
  floorsGroup:    THREE.Group;
  wallsGroup:     THREE.Group;
  platformsGroup: THREE.Group;
  stairsGroup:    THREE.Group;
  laddersGroup:   THREE.Group;
  shapesGroup:    THREE.Group;
  objectsGroup:   THREE.Group;
  // keyed by floor.id
  floorColliders: Map<string, RAPIER.Collider>;
  // Multiple wallIds can map to the same RunEntry (all walls in a merged run)
  wallData:       Map<string, RunEntry>;
  platformEntries: Map<string, PlatformEntry>;
  stairEntries:    Map<string, StairEntry>;
  ladderEntries:   Map<string, LadderEntry>;
  shapeEntries:    Map<string, ShapeEntry>;
  objectMeshes:    Map<string, THREE.Object3D>;
  // Attached colliders per placed object (explicit colliders[] or the implicit auto-box)
  objectColliders: Map<string, RAPIER.Collider[]>;
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

// A node-backed platform's nodes are authoritative; its points/size/position are a
// derived cache that can go stale (e.g. after a node drag). Re-derive them from the
// current node positions so cold load matches the rebuild path.
function resolvePlatformNodes(platform: PlatformDef, zone: ZoneDef): PlatformDef {
  if (!platform.nodeIds?.length) return platform;
  const pts = platform.nodeIds
    .map(id => zone.nodes.find(n => n.id === id))
    .filter((n): n is NonNullable<typeof n> => n != null)
    .map(n => ({ x: n.x, z: n.z }));
  if (pts.length < 3) return platform;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
  return {
    ...platform,
    points:   pts,
    position: { ...platform.position, x: cx, z: cz },
    size: {
      width: Math.max(Math.max(...xs) - Math.min(...xs), 0.5),
      depth: Math.max(Math.max(...zs) - Math.min(...zs), 0.5),
    },
  };
}

export class ZoneManager {
  private readonly _loadedZones = new Map<string, ZoneEntry>();
  private readonly _unsubs: Array<() => void> = [];

  // Door sensor colliders for preview mode proximity detection
  private readonly _doorSensors   = new Map<number, string>();           // handle → linkedZoneId
  private readonly _doorColliders = new Map<string, RAPIER.Collider[]>(); // zoneId → colliders

  // Trigger volume sensors
  private readonly _volumeSensors   = new Map<number, string>();           // handle → volumeId
  private readonly _ladderSensors   = new Map<number, string>();           // handle → ladderId (climb column + top-lip zone)
  private readonly _volumeColliders = new Map<string, RAPIER.Collider[]>(); // zoneId → colliders
  private readonly _volumeMeshes    = new Map<string, THREE.LineSegments[]>(); // zoneId → wireframes
  private readonly _volumeFills     = new Map<string, THREE.Mesh[]>();      // zoneId → gradient fills
  private readonly _animatedVolumeMats = new Set<THREE.ShaderMaterial>();   // fills with animate on
  private readonly _hoveredVolumeId  = new Map<string, string | null>();   // zoneId → hovered id
  private readonly _selectedVolumeId = new Map<string, string | null>();   // zoneId → selected id

  // Overlay decal meshes — zoneId → decalId → world-space DecalGeometry mesh
  private readonly _decalMeshes = new Map<string, Map<string, THREE.Mesh>>();

  // Surface-effect decal patches (Phase 21) — meshes whose material is a cloned,
  // shader-patched copy of the base. `original` is restored when the last decal leaves.
  private readonly _surfacePatches = new Map<string, Map<THREE.Mesh, {
    original: THREE.Material; ownedBefore: boolean; decalIds: string[];
  }>>();

  // Non-object entities hidden by a script despawn_object this preview run; restored on preview:stop.
  private readonly _despawnedIds = new Set<string>();

  get doorSensorMap():   ReadonlyMap<number, string> { return this._doorSensors; }
  get volumeSensorMap(): Map<number, string>          { return this._volumeSensors; }
  get ladderSensorMap(): Map<number, string>          { return this._ladderSensors; }

  // Pending wall rebuild requests — coalesced per microtask to avoid concurrent async races
  private readonly _pendingRebuild = new Map<string, Set<string>>();
  private _rebuildScheduled = false;

  // Serializes _rebuildWallBatch/_removeWall: both mutate wallData/wallsGroup across
  // awaits, and two in flight at once each rebuild the same surviving run → stacked
  // duplicate meshes + an orphan (undoing a wall split emits wall:updated AND
  // wall:removed in one tick and hit exactly that).
  private _wallOpChain: Promise<void> = Promise.resolve();

  // Pending polygon-platform rebuild requests — same coalescing pattern
  private readonly _pendingPlatformRebuild = new Map<string, Set<string>>();
  private _platformRebuildScheduled = false;

  // Pending floor rebuild requests — same coalescing pattern
  private readonly _pendingFloorRebuild = new Map<string, Set<string>>();
  private _floorRebuildScheduled = false;

  // Pending decal re-projections (dirty on target *:rebuilt) — same coalescing pattern
  private readonly _pendingDecalRebuild = new Map<string, Set<string>>();
  private _decalRebuildScheduled = false;

  // Cancellation tokens — increment on each new build; stale async results are discarded
  private readonly _platformBuildTokens = new Map<string, number>();
  private readonly _shapeBuildTokens    = new Map<string, number>();

  // Editor-only group visibility — group ids the user has hidden via the Groups panel
  private readonly _hiddenGroups = new Set<string>();

  // Floor dimming state
  private _activeLevel = 0;
  private readonly _dimmedMeshes = new Map<THREE.Mesh, THREE.Material>();
  private readonly _dimMaterials = new Set<THREE.Material>();

  constructor(
    private readonly _scene:        THREE.Scene,
    private readonly _worldState:   WorldState,
    private readonly _bus:          EventBus,
    private readonly _objectPlacer: ObjectPlacer,
    private readonly _movers:       MoverSystem,
  ) {}

  // ── Mover registration (Phase 31) ─────────────────────────────────────────
  // Called after a builder finished posing meshes; rest poses are captured from
  // the live transforms. `register` overwrites, so rebuild paths re-register
  // with the fresh meshes/body automatically.

  private _syncPlatformMover(platform: PlatformDef, meshes: THREE.Mesh[], moverBody?: RAPIER.RigidBody): void {
    // moverBody absent = mover disabled, or a CSG-cut/polygon platform (world-
    // space-baked geometry — excluded from movers, see PlatformBuilder).
    if (!moverBody || !platform.mover) return;
    const a = ((platform.rotation?.y ?? 0) * Math.PI) / 180;
    this._movers.register(platform.id, platform.mover, meshes, moverBody,
      platform.position, { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
  }

  private _syncShapeMover(shape: ShapeDef, meshes: THREE.Mesh[], moverBody?: RAPIER.RigidBody): void {
    if (!shape.mover?.enabled) return;
    const D2R = Math.PI / 180;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      shape.rotation.x * D2R, shape.rotation.y * D2R, shape.rotation.z * D2R, "XYZ",
    ));
    // moverBody may be null (degenerate hull) — the mesh still animates.
    this._movers.register(shape.id, shape.mover, meshes, moverBody ?? null, shape.position, q);
  }

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
                // Route through updateWallSegment (segmentOnly) so the run-mate edit is
                // captured by the open undo transaction; segmentOnly skips re-syncing here.
                if (zone.walls.some(w => w.id === id)) this._worldState.updateWallSegment(zoneId, id, sync);
              }
            }
          }
        }
        this._queueRebuild(zoneId, wallId);
      }),
      this._bus.on("wall:removed", ({ zoneId, wallId }) => {
        this._enqueueWallOp(() => this._removeWall(zoneId, wallId));
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
      this._bus.on("shape:added", ({ zoneId, shape }) => {
        void this._addShape(zoneId, shape);
      }),
      this._bus.on("shape:updated", ({ zoneId, id }) => {
        void this._rebuildShape(zoneId, id);
      }),
      this._bus.on("shape:removed", ({ zoneId, id }) => {
        this._removeShape(zoneId, id);
      }),
      this._bus.on("ladder:added", ({ zoneId, ladder }) => {
        void this._addLadder(zoneId, ladder);
      }),
      this._bus.on("ladder:updated", ({ zoneId, id }) => {
        void this._rebuildLadder(zoneId, id);
      }),
      this._bus.on("ladder:removed", ({ zoneId, id }) => {
        this._removeLadder(zoneId, id);
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
      // Script-driven despawn_object for NON-object entities (platforms, stairs, walls,
      // floors, trigger volumes). Objects are handled by ObjectPlacer; a group target is
      // already fanned out to member ids by ScriptEngine before this fires.
      this._bus.on("object:despawn", ({ id }) => {
        this._despawnEntity(id);
      }),
      this._bus.on("object:updated", ({ id, zoneId, changes }) => {
        // Script move_object targeting a SHAPE (runtime-only, like object moves):
        // local-space geometry means repositioning is a pure transform update on
        // mesh + collider — no rebuild, and WorldState stays untouched by design.
        // Skipped for mover shapes: their collider is parented to a kinematic
        // body (setTranslation would fight it) and the mover owns the transform.
        if (changes.position && !this._movers.has(id)) {
          const she = this._loadedZones.get(zoneId)?.shapeEntries.get(id);
          if (she) {
            const p = changes.position;
            for (const m of she.meshes) m.position.set(p.x, p.y, p.z);
            she.collider?.setTranslation({ x: p.x, y: p.y, z: p.z });
            return;
          }
        }
        if (changes.position || changes.rotation || changes.scale || changes.colliders || changes.mover) {
          const entry = this._loadedZones.get(zoneId);
          const obj   = this._worldState.zones.get(zoneId)?.objects.find(o => o.id === id);
          if (entry && obj) {
            this._removeObjectColliders(entry, id);
            // Merge changes over the data so script-driven moves (runtime-only,
            // data untouched) still carry their colliders along.
            this._buildObjectColliders(zoneId, { ...obj, ...changes }, entry);
          }
        }
        if (!changes.properties) return;
        const mesh = this._loadedZones.get(zoneId)?.objectMeshes.get(id);
        if (!mesh) return;
        const interactable = changes.properties.interactable;
        const interactLabel = changes.properties.interactLabel ?? "Interact";
        mesh.userData["interactable"] = interactable;
        mesh.userData["interactLabel"] = interactLabel;
        mesh.traverse(child => {
          child.userData["interactable"] = interactable;
          child.userData["interactLabel"] = interactLabel;
        });
      }),
      this._bus.on("triggervolume:added", ({ zoneId, volume }) => {
        this._addTriggerVolume(zoneId, volume);
      }),
      this._bus.on("triggervolume:updated", ({ zoneId, id, changes }) => {
        this._updateTriggerVolume(zoneId, id, changes);
      }),
      this._bus.on("triggervolume:removed", ({ zoneId, id }) => {
        this._removeSingleVolume(zoneId, id);
      }),
      this._bus.on("triggervolume:hover",  ({ zoneId, id }) => {
        this._hoveredVolumeId.set(zoneId, id);
        this._refreshVolumeHighlights(zoneId);
      }),
      this._bus.on("triggervolume:select", ({ zoneId, id }) => {
        this._selectedVolumeId.set(zoneId, id);
        this._refreshVolumeHighlights(zoneId);
      }),
      this._bus.on("decal:added", ({ zoneId, decal }) => {
        this._enqueueWallOp(() => this._rebuildDecal(zoneId, decal.id));
      }),
      this._bus.on("decal:updated", ({ zoneId, id }) => {
        this._enqueueWallOp(() => this._rebuildDecal(zoneId, id));
      }),
      this._bus.on("decal:removed", ({ zoneId, id }) => {
        // _rebuildDecal with no surviving def = remove the overlay mesh AND reconcile
        // surface patches (restores the shared material when the last stain leaves).
        this._enqueueWallOp(() => this._rebuildDecal(zoneId, id));
      }),
      // Re-project decals whose footprint touches a rebuilt entity. Regens run
      // through _wallOpChain so they never observe a half-rebuilt run.
      this._bus.on("wall:rebuilt",     ({ zoneId, wallId })     => this._markDecalsDirty(zoneId, wallId)),
      this._bus.on("floor:rebuilt",    ({ zoneId, floorId })    => this._markDecalsDirty(zoneId, floorId)),
      this._bus.on("platform:rebuilt", ({ zoneId, platformId }) => this._markDecalsDirty(zoneId, platformId)),
      this._bus.on("stair:rebuilt",    ({ zoneId, stairId })    => this._markDecalsDirty(zoneId, stairId)),
      this._bus.on("shape:rebuilt",    ({ zoneId, shapeId })    => this._markDecalsDirty(zoneId, shapeId)),
      this._bus.on("group:visibility", ({ groupId, visible }) => {
        if (visible) this._hiddenGroups.delete(groupId);
        else this._hiddenGroups.add(groupId);
        this._applyGroupVisibility();
      }),
      this._bus.on("preview:start", ({ mode }) => {
        this._setEditorOnlyVisible(false);
        this._setHiddenWallGhostsVisible(false);
        if (isGameplayMode(mode)) this._setHideInGameVisible(false);
      }),
      this._bus.on("preview:stop",  () => {
        this._restoreDespawned();
        this._setEditorOnlyVisible(true);
        this._setHiddenWallGhostsVisible(true);
        this._setHideInGameVisible(true);
      }),
      this._bus.on("history:restore", () => {
        const zoneId = this._worldState.activeZoneId;
        if (!zoneId) return;
        this.unloadZone(zoneId);
        void this.loadZone(zoneId);
      }),
      this._bus.on("zone:enter", ({ zoneId }) => {
        const current = this._worldState.activeZoneId;
        if (zoneId === current) return;
        if (current) this.unloadZone(current);
        this._worldState.setActiveZone(zoneId);
        void this.loadZone(zoneId);
        const zone = this._worldState.zones.get(zoneId);
        if (zone) this._bus.emit("preview:zone-entered", { zoneName: zone.name });
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
          this._enqueueWallOp(() => this._rebuildWallBatch(zid, snapshot));
        }
      });
    }
  }

  /** Run wall mesh ops strictly one at a time (see _wallOpChain). */
  private _enqueueWallOp(op: () => Promise<void>): void {
    this._wallOpChain = this._wallOpChain
      .then(() => op())
      .catch(err => { console.error("[ZoneManager] wall op failed", err); });
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
    const laddersGroup   = new THREE.Group();
    const shapesGroup    = new THREE.Group();
    const objectsGroup   = new THREE.Group();
    group.add(floorsGroup, wallsGroup, platformsGroup, stairsGroup, laddersGroup, shapesGroup, objectsGroup);

    const floorColliders  = new Map<string, RAPIER.Collider>();
    const wallData        = new Map<string, RunEntry>();
    const platformEntries = new Map<string, PlatformEntry>();
    const stairEntries    = new Map<string, StairEntry>();
    const ladderEntries   = new Map<string, LadderEntry>();
    const shapeEntries    = new Map<string, ShapeEntry>();
    const objectMeshes    = new Map<string, THREE.Object3D>();
    const objectColliders = new Map<string, RAPIER.Collider[]>();

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
      const resolved = resolvePlatformNodes(platform, zone);
      const { meshes, collider, moverBody } = await PlatformBuilder.build(resolved, zoneId);
      for (const m of meshes) platformsGroup.add(m);
      platformEntries.set(platform.id, { meshes, collider });
      this._syncPlatformMover(resolved, meshes, moverBody);
    }

    // ── Stairs ────────────────────────────────────────────────────────────
    for (const stair of zone.stairs) {
      const { meshes, colliders } = await StairBuilder.build(stair, zoneId);
      const stairGroup = makeStairGroup(stair.id, zoneId);
      for (const m of meshes) stairGroup.add(m);
      stairsGroup.add(stairGroup);
      stairEntries.set(stair.id, { group: stairGroup, meshes, colliders, def: stair });
    }

    // ── Ladders ───────────────────────────────────────────────────────────
    for (const ladder of zone.ladders ?? []) {
      const { meshes, colliders, sensors } = await LadderBuilder.build(ladder, zoneId);
      for (const m of meshes) laddersGroup.add(m);
      ladderEntries.set(ladder.id, { meshes, colliders, sensors, def: ladder });
      for (const s of sensors) this._ladderSensors.set(s.handle, ladder.id);
    }

    // ── Shapes ────────────────────────────────────────────────────────────
    for (const shape of zone.shapes ?? []) {
      const { meshes, collider, moverBody } = await ShapeBuilder.build(shape, zoneId);
      for (const m of meshes) shapesGroup.add(m);
      shapeEntries.set(shape.id, { meshes, collider });
      this._syncShapeMover(shape, meshes, moverBody);
    }

    // ── Objects ───────────────────────────────────────────────────────────
    for (const obj of zone.objects) {
      const mesh = await this._objectPlacer.build(obj, zoneId);
      objectsGroup.add(mesh); objectMeshes.set(obj.id, mesh);
    }

    this._scene.add(group);
    const zoneEntry: ZoneEntry = {
      group, floorsGroup, wallsGroup, platformsGroup, stairsGroup, laddersGroup, shapesGroup, objectsGroup,
      floorColliders, wallData, platformEntries, stairEntries, ladderEntries, shapeEntries, objectMeshes, objectColliders,
    };
    this._loadedZones.set(zoneId, zoneEntry);
    for (const obj of zone.objects) this._buildObjectColliders(zoneId, obj, zoneEntry);

    this._registerDoorSensors(zoneId);
    this._buildTriggerVolumes(zoneId, zone, group);

    // Second pass: apply CSG cuts from any stairs with cutters
    for (const stair of zone.stairs) {
      if (stair.csgCutter) await this._rebuildOverlapping(zoneId, stair);
    }

    // Decals project onto the final (CSG-cut) geometry, so build them last.
    await this._buildDecals(zoneId, zone);
    await this._refreshSurfaceDecals(zoneId);

    // Apply current dimming level after loading
    this._applyDimming();
    if (this._hiddenGroups.size > 0) this._applyGroupVisibility();

    // Zone geometry is now in the scene — let editor helpers (node dots / edge lines)
    // build themselves. _buildZone emits no per-entity rebuild event, so without this
    // NodeDragger never refreshes on a cold load.
    this._bus.emit("zone:loaded", { zoneId });
  }

  unloadZone(zoneId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;

    // Movers first — their kinematic bodies are freed by the collider removals below.
    for (const id of entry.platformEntries.keys()) this._movers.unregister(id);
    for (const id of entry.shapeEntries.keys())    this._movers.unregister(id);
    for (const id of entry.objectMeshes.keys())    this._movers.unregister(id);

    this._removeDoorSensors(zoneId);
    this._removeTriggerVolumes(zoneId);

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

    for (const le of entry.ladderEntries.values()) {
      for (const s of le.sensors) this._ladderSensors.delete(s.handle);
      [...le.colliders, ...le.sensors].forEach(c => physicsWorld.removeCollider(c));
    }

    for (const she of entry.shapeEntries.values()) {
      if (she.collider) physicsWorld.removeCollider(she.collider);
    }

    for (const id of entry.objectMeshes.keys()) {
      this._objectPlacer.remove(id);
    }
    for (const id of [...entry.objectColliders.keys()]) {
      this._removeObjectColliders(entry, id);
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
    // Decal meshes live in entry.group (disposed by the traverse above) — just drop the map.
    // Surface-patched clones are _ownsMaterial:true, so the traverse disposed them too.
    this._decalMeshes.delete(zoneId);
    this._surfacePatches.delete(zoneId);
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

    this._registerDoorSensors(zoneId);
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
    const { meshes, collider, moverBody } = await PlatformBuilder.build(platform, zoneId, cutters);
    for (const c of cutters) { c.mesh.geometry.dispose(); (c.mesh.material as THREE.Material).dispose(); }
    for (const m of meshes) entry.platformsGroup.add(m);
    entry.platformEntries.set(platform.id, { meshes, collider });
    this._syncPlatformMover(platform, meshes, moverBody);
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
    const resolved = resolvePlatformNodes(platform, zone);

    // Compute cutter meshes before the async gap so we read current stair state
    const cutters = this._getStairCuttersForPlatform(zoneId, resolved);

    // Build the geometry/material (potentially async due to material loading)
    const { meshes, collider, moverBody } = await PlatformBuilder.build(resolved, zoneId, cutters);
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
    this._syncPlatformMover(resolved, meshes, moverBody);
    this._applyDimming();
    this._bus.emit("platform:rebuilt", { zoneId, platformId });
  }

  private _removePlatform(zoneId: string, platformId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;

    const pe = entry.platformEntries.get(platformId);
    if (!pe) return;

    this._movers.unregister(platformId);
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

  // ── Shape helpers ─────────────────────────────────────────────────────────

  private async _addShape(zoneId: string, shape: ShapeDef): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    const { meshes, collider, moverBody } = await ShapeBuilder.build(shape, zoneId);
    for (const m of meshes) entry.shapesGroup.add(m);
    entry.shapeEntries.set(shape.id, { meshes, collider });
    this._syncShapeMover(shape, meshes, moverBody);
    this._applyDimming();
    this._bus.emit("shape:rebuilt", { zoneId, shapeId: shape.id });
  }

  private async _rebuildShape(zoneId: string, shapeId: string): Promise<void> {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return;

    // Claim a token — any older in-flight build for this shape is now stale
    const myToken = (this._shapeBuildTokens.get(shapeId) ?? 0) + 1;
    this._shapeBuildTokens.set(shapeId, myToken);

    const shape = zone.shapes?.find(s => s.id === shapeId);
    if (!shape) return;

    const { meshes, collider, moverBody } = await ShapeBuilder.build(shape, zoneId);

    // If a newer rebuild started while we were awaiting, discard this stale result
    if (this._shapeBuildTokens.get(shapeId) !== myToken) {
      for (const m of meshes) {
        m.geometry.dispose();
        if ((m.userData as { _ownsMaterial?: boolean })._ownsMaterial)
          (m.material as THREE.Material).dispose();
      }
      if (collider) physicsWorld.removeCollider(collider);
      return;
    }

    // Atomically swap: remove old meshes then add the fresh ones
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    this._removeShape(zoneId, shapeId);
    for (const m of meshes) entry.shapesGroup.add(m);
    entry.shapeEntries.set(shapeId, { meshes, collider });
    this._syncShapeMover(shape, meshes, moverBody);
    this._applyDimming();
    this._bus.emit("shape:rebuilt", { zoneId, shapeId });
  }

  private _removeShape(zoneId: string, shapeId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;

    const she = entry.shapeEntries.get(shapeId);
    if (!she) return;

    this._movers.unregister(shapeId);
    if (she.collider) physicsWorld.removeCollider(she.collider);
    for (const m of she.meshes) {
      const orig = this._dimmedMeshes.get(m);
      if (orig) { m.material = orig; this._dimmedMeshes.delete(m); }
      entry.shapesGroup.remove(m);
      m.geometry.dispose();
      if ((m.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (m.material as THREE.Material).dispose();
    }
    entry.shapeEntries.delete(shapeId);
  }

  // ── Ladder helpers (Phase 34) ─────────────────────────────────────────────

  private async _addLadder(zoneId: string, ladder: LadderDef): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    const { meshes, colliders, sensors } = await LadderBuilder.build(ladder, zoneId);
    for (const m of meshes) entry.laddersGroup.add(m);
    entry.ladderEntries.set(ladder.id, { meshes, colliders, sensors, def: ladder });
    for (const s of sensors) this._ladderSensors.set(s.handle, ladder.id);
    this._applyDimming();
  }

  private async _rebuildLadder(zoneId: string, ladderId: string): Promise<void> {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return;
    this._removeLadder(zoneId, ladderId);
    const ladder = zone.ladders?.find(l => l.id === ladderId);
    if (!ladder) return;
    await this._addLadder(zoneId, ladder);
  }

  private _removeLadder(zoneId: string, ladderId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    const le = entry.ladderEntries.get(ladderId);
    if (!le) return;
    for (const s of le.sensors) this._ladderSensors.delete(s.handle);
    [...le.colliders, ...le.sensors].forEach(c => physicsWorld.removeCollider(c));
    for (const mesh of le.meshes) {
      const orig = this._dimmedMeshes.get(mesh);
      if (orig) { mesh.material = orig; this._dimmedMeshes.delete(mesh); }
      entry.laddersGroup.remove(mesh);
      mesh.geometry.dispose();
      if ((mesh.userData as { _ownsMaterial?: boolean })._ownsMaterial)
        (mesh.material as THREE.Material).dispose();
    }
    entry.ladderEntries.delete(ladderId);
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

  private async _addObject(zoneId: string, obj: WorldObject): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    const mesh = await this._objectPlacer.build(obj, zoneId);
    entry.objectsGroup.add(mesh);
    entry.objectMeshes.set(obj.id, mesh);
    this._buildObjectColliders(zoneId, obj, entry);
  }

  /**
   * Register an object's attached colliders: explicit colliders[] when set,
   * else the asset's preset colliders (baked assets ship compound boxes,
   * Phase 26), else the implicit auto-fit box from the model's local AABB when
   * the asset is collidable ([] = explicitly none). Sensor colliders join
   * _volumeSensors so TriggerSystem fires on_player_enter/exit keyed to the
   * object id.
   */
  private _buildObjectColliders(zoneId: string, obj: WorldObject, entry: ZoneEntry): void {
    let effective = obj.colliders;
    if (effective === undefined) {
      const def  = assetManager.getAssetDef(obj.assetId);
      const aabb = this._objectPlacer.getLocalAABB(obj.id);
      effective = def?.colliders
        ?? (def?.collidable && aabb ? [defaultColliderFromAABB(aabb.center, aabb.size)] : []);
    }
    // Mover path (Phase 31): solid colliders parent to one kinematic body; the
    // mesh root animates even when the object has no colliders at all. The
    // unconditional unregister clears a stale entry when the mover was just
    // disabled (no-op otherwise).
    this._movers.unregister(obj.id);
    let moverBody: RAPIER.RigidBody | undefined;
    const mesh = entry.objectMeshes.get(obj.id);
    if (obj.mover?.enabled && mesh) {
      if (effective.some(c => !c.isSensor)) {
        const D2R = Math.PI / 180;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          obj.rotation.x * D2R, obj.rotation.y * D2R, obj.rotation.z * D2R, "XYZ",
        ));
        moverBody = physicsWorld.createKinematicBody(obj.position, { x: q.x, y: q.y, z: q.z, w: q.w });
      }
      this._movers.register(obj.id, obj.mover, [mesh], moverBody ?? null, obj.position);
    }
    if (!effective.length) return;
    const colliders = ColliderBuilder.registerAttachedColliders(obj, effective, moverBody);
    colliders.forEach((c, i) => {
      if (effective![i]!.isSensor) this._volumeSensors.set(c.handle, obj.id);
    });
    entry.objectColliders.set(obj.id, colliders);
  }

  private _removeObjectColliders(entry: ZoneEntry, objectId: string): void {
    const cols = entry.objectColliders.get(objectId);
    if (!cols) return;
    for (const c of cols) {
      this._volumeSensors.delete(c.handle);
      physicsWorld.removeCollider(c);
    }
    entry.objectColliders.delete(objectId);
  }

  private _removeObject(zoneId: string, objectId: string): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    const mesh = entry.objectMeshes.get(objectId);
    if (!mesh) return;
    this._movers.unregister(objectId);
    this._removeObjectColliders(entry, objectId);
    this._objectPlacer.remove(objectId);
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

  /**
   * Runtime-only despawn for a non-object entity (platform / stair / wall / floor /
   * trigger volume). Hides the mesh(es) and disables the collider(s) so it's both
   * invisible and non-interacting — a disabled sensor also stops firing enter/exit
   * triggers. Objects are despawned by ObjectPlacer; this covers everything else.
   * Script actions never touch WorldState, so the effect is purely visual/physical:
   * the ids are tracked and restored on preview:stop (exiting preview does NOT rebuild
   * the zone), so a despawned entity reappears in the editor rather than vanishing.
   */
  private _despawnEntity(id: string): void {
    if (this._setEntityHidden(id, true)) this._despawnedIds.add(id);
  }

  /** Re-show + re-enable everything despawned during this preview run. */
  private _restoreDespawned(): void {
    for (const id of this._despawnedIds) this._setEntityHidden(id, false);
    this._despawnedIds.clear();
  }

  /**
   * Toggle a non-object entity's visibility + collider across all loaded zones (the
   * despawn event carries no zoneId). Returns true if a matching entity was found.
   */
  private _setEntityHidden(id: string, hidden: boolean): boolean {
    const visible = !hidden;
    for (const [zoneId, entry] of this._loadedZones) {
      const pe = entry.platformEntries.get(id);
      if (pe) { for (const m of pe.meshes) m.visible = visible; pe.collider.setEnabled(visible); return true; }

      const se = entry.stairEntries.get(id);
      if (se) { se.group.visible = visible; for (const c of se.colliders) c.setEnabled(visible); return true; }

      const she = entry.shapeEntries.get(id);
      if (she) { for (const m of she.meshes) m.visible = visible; she.collider?.setEnabled(visible); return true; }

      const fc = entry.floorColliders.get(id);
      if (fc) {
        fc.setEnabled(visible);
        entry.floorsGroup.children.forEach(m => { if (m.userData["editorId"] === id) m.visible = visible; });
        return true;
      }

      // Object: colliders only — ObjectPlacer owns the mesh hide/show for despawns.
      const oc = entry.objectColliders.get(id);
      if (oc) { for (const c of oc) c.setEnabled(visible); return true; }

      // A wall id may share a merged RunEntry with other walls — despawning one hides the run.
      const re = entry.wallData.get(id);
      if (re) {
        re.mesh.visible = visible;
        for (const t of re.trimMeshes) t.visible = visible;
        for (const c of re.colliders) c.setEnabled(visible);
        return true;
      }

      // Trigger volume: wireframe + optional fill + sensor (disabling the sensor stops triggers).
      let found = false;
      for (const m of this._volumeMeshes.get(zoneId) ?? [])
        if (m.userData["editorId"] === id) { m.visible = visible; found = true; }
      for (const f of this._volumeFills.get(zoneId) ?? [])
        if (f.userData["editorId"] === id) { f.visible = visible; found = true; }
      for (const c of this._volumeColliders.get(zoneId) ?? [])
        if (this._volumeSensors.get(c.handle) === id) { c.setEnabled(visible); found = true; }
      if (found) return true;
    }
    return false;
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

  // ── Group visibility (editor-only) ─────────────────────────────────────────

  private _isHidden(groupIds: string[] | undefined): boolean {
    return groupIds?.some(g => this._hiddenGroups.has(g)) ?? false;
  }

  /** Recompute mesh visibility for all loaded entities from the hidden-group set. */
  private _applyGroupVisibility(): void {
    for (const [zoneId, entry] of this._loadedZones) {
      const zone = this._worldState.zones.get(zoneId);
      if (!zone) continue;

      for (const obj of zone.objects) {
        const mesh = entry.objectMeshes.get(obj.id);
        if (mesh) mesh.visible = !this._isHidden(obj.groupIds);
      }

      for (const floor of zone.floors) {
        const hidden = this._isHidden(floor.groupIds);
        entry.floorsGroup.traverse(child => {
          if (child instanceof THREE.Mesh && child.userData["editorId"] === floor.id)
            child.visible = !hidden;
        });
      }

      for (const platform of zone.platforms) {
        const pe = entry.platformEntries.get(platform.id);
        if (pe) { const v = !this._isHidden(platform.groupIds); for (const m of pe.meshes) m.visible = v; }
      }

      for (const stair of zone.stairs) {
        const se = entry.stairEntries.get(stair.id);
        if (se) se.group.visible = !this._isHidden(stair.groupIds);
      }

      for (const shape of zone.shapes ?? []) {
        const she = entry.shapeEntries.get(shape.id);
        if (she) { const v = !this._isHidden(shape.groupIds); for (const m of she.meshes) m.visible = v; }
      }

      // A merged wall run spans multiple walls — hide it only when every wall in the run is hidden.
      const seenRuns = new Set<RunEntry>();
      for (const re of entry.wallData.values()) {
        if (seenRuns.has(re)) continue;
        seenRuns.add(re);
        const hidden = re.wallIds.every(id => this._isHidden(zone.walls.find(w => w.id === id)?.groupIds));
        re.mesh.visible = !hidden;
        for (const tm of re.trimMeshes) tm.visible = !hidden;
      }
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
      for (const [, le] of zone.ladderEntries) {
        for (const mesh of le.meshes) {
          if ((mesh.userData as { editorOnly?: boolean }).editorOnly)
            mesh.visible = visible;
        }
      }
    }
  }

  // Hidden-wall ghosts (userData.hiddenWall) are an editor-only visual — invisible in
  // both preview and game mode.
  private _setHiddenWallGhostsVisible(visible: boolean): void {
    for (const [, entry] of this._loadedZones) {
      entry.wallsGroup.traverse(o => {
        if ((o.userData as { hiddenWall?: boolean }).hiddenWall) o.visible = visible;
      });
    }
  }

  // Game mode only: hide editor helpers that stay visible in Preview (grid, trigger
  // wireframes, node dots, edge lines — anything tagged userData.hideInGame).
  private _setHideInGameVisible(visible: boolean): void {
    this._scene.traverse(o => {
      if ((o.userData as { hideInGame?: boolean }).hideInGame) o.visible = visible;
    });
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

  // ── Trigger volume helpers ────────────────────────────────────────────────

  // ── Decals (overlay kind — Phase 20) ─────────────────────────────────────────

  private async _buildDecals(zoneId: string, zone: ZoneDef): Promise<void> {
    for (const decal of zone.decals ?? []) {
      if (decal.kind !== "overlay") continue;   // surface kind lands in Phase 21
      await this._buildDecalMesh(zoneId, decal);
    }
  }

  /** Static geometry a decal can project onto (excludes objects, trims, ghost walls). */
  private _collectDecalTargets(entry: ZoneEntry): THREE.Mesh[] {
    const targets: THREE.Mesh[] = [];
    entry.group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const u = child.userData as { editorType?: string; selectable?: boolean; ghostPick?: boolean };
      if (!u.selectable || u.ghostPick) return;
      if (u.editorType === "wall" || u.editorType === "floor" || u.editorType === "platform" || u.editorType === "stair" || u.editorType === "shape")
        targets.push(child);
    });
    return targets;
  }

  private async _loadDecalTextures(textureId: string): Promise<DecalTextures | null> {
    const texDef = assetManager.getDecalDef(textureId);
    if (!texDef) {
      console.info(`ZoneManager: decal texture "${textureId}" not in registry — decal hidden`);
      return null;
    }
    const textures: DecalTextures = { map: await assetManager.loadTexture(texDef.path) };
    if (texDef.maps?.normal)    textures.normalMap    = await assetManager.loadTexture(texDef.maps.normal, THREE.NoColorSpace);
    if (texDef.maps?.roughness) textures.roughnessMap = await assetManager.loadTexture(texDef.maps.roughness, THREE.NoColorSpace);
    return textures;
  }

  private async _buildDecalMesh(zoneId: string, decal: DecalDef): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;

    const textures = await this._loadDecalTextures(decal.textureId);
    if (!textures) return;

    const renderOrder = 10 + (zone.decals?.findIndex(d => d.id === decal.id) ?? 0);
    const mesh = buildOverlayDecalMesh(decal, this._collectDecalTargets(entry), textures, zoneId, renderOrder);
    if (!mesh) {
      console.info(`ZoneManager: decal "${decal.id}" projects onto nothing — def kept, mesh skipped`);
      return;
    }
    entry.group.add(mesh);
    const map = this._decalMeshes.get(zoneId) ?? new Map<string, THREE.Mesh>();
    map.set(decal.id, mesh);
    this._decalMeshes.set(zoneId, map);
  }

  /** Remove (if present) and re-project a decal. Also handles decal:added / removal of a stale mesh. */
  private async _rebuildDecal(zoneId: string, decalId: string): Promise<void> {
    this._removeDecalMesh(zoneId, decalId);
    const decal = this._worldState.zones.get(zoneId)?.decals?.find(d => d.id === decalId);
    if (decal?.kind === "overlay") await this._buildDecalMesh(zoneId, decal);
    // Any decal change may add/remove/move a surface-effect patch (no-op for overlay-only zones).
    await this._refreshSurfaceDecals(zoneId);
    this._bus.emit("decal:rebuilt", { zoneId, decalId });
  }

  private _removeDecalMesh(zoneId: string, decalId: string): void {
    const mesh = this._decalMeshes.get(zoneId)?.get(decalId);
    if (!mesh) return;
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();   // decal materials are always owned; textures stay cached
    this._decalMeshes.get(zoneId)!.delete(decalId);
  }

  /**
   * Surface-effect decals (Phase 21): reconcile every mesh's material against the
   * zone's `kind: "surface"` decals. A mesh whose bounds intersect a decal's projector
   * gets a CLONED, shader-patched material (never the shared cache instance); an
   * already-patched mesh gets a uniform-only update (no recompile, material.uuid
   * stable); a mesh whose last decal left gets its original material restored and the
   * clone disposed. Called from loadZone, on every decal change, and (via the dirty
   * queue) after target rebuilds — always through _wallOpChain.
   */
  private async _refreshSurfaceDecals(zoneId: string): Promise<void> {
    const entry = this._loadedZones.get(zoneId);
    const zone  = this._worldState.zones.get(zoneId);
    if (!entry || !zone) return;
    const surfaceDecals = (zone.decals ?? []).filter(d => d.kind === "surface");
    const patches = this._surfacePatches.get(zoneId) ?? new Map<THREE.Mesh, { original: THREE.Material; ownedBefore: boolean; decalIds: string[] }>();
    if (surfaceDecals.length === 0 && patches.size === 0) return;

    // Desired per-mesh decal lists (projector AABB ∩ mesh AABB, capped at MAX).
    const desired = new Map<THREE.Mesh, Array<{ decal: DecalDef; texture: THREE.Texture }>>();
    const targets = this._collectDecalTargets(entry);
    const targetBox = new THREE.Box3();
    for (const d of surfaceDecals) {
      const textures = await this._loadDecalTextures(d.textureId);
      if (!textures) continue;
      const projBox = decalProjectorBox(d);
      for (const t of targets) {
        t.updateWorldMatrix(true, false);
        targetBox.setFromObject(t);
        if (!projBox.intersectsBox(targetBox)) continue;
        const arr = desired.get(t) ?? [];
        if (arr.length >= MAX_SURFACE_DECALS) {
          console.warn(`ZoneManager: more than ${MAX_SURFACE_DECALS} surface decals on one mesh — "${d.id}" dropped there`);
          continue;
        }
        arr.push({ decal: d, texture: textures.map });
        desired.set(t, arr);
      }
    }

    // Unpatch meshes that no longer need decals (or whose mesh was disposed by a rebuild).
    for (const [mesh, rec] of patches) {
      if (desired.has(mesh) && mesh.parent) continue;
      if (mesh.parent) {
        (mesh.material as THREE.Material).dispose();
        mesh.material = rec.original;
        mesh.userData["_ownsMaterial"] = rec.ownedBefore;
      }
      patches.delete(mesh);
    }

    // Patch new meshes / update uniforms on already-patched ones.
    for (const [mesh, list] of desired) {
      const slots = list.map(({ decal, texture }) => slotFromDecal(decal, texture));
      const rec = patches.get(mesh);
      if (rec) {
        updateSurfaceDecalUniforms(mesh.material as THREE.MeshStandardMaterial, slots);
        rec.decalIds = list.map(l => l.decal.id);
      } else {
        const base = mesh.material as THREE.MeshStandardMaterial;
        mesh.material = makeSurfaceDecalMaterial(base, slots);
        patches.set(mesh, {
          original:    base,
          ownedBefore: !!mesh.userData["_ownsMaterial"],
          decalIds:    list.map(l => l.decal.id),
        });
        mesh.userData["_ownsMaterial"] = true;
      }
    }
    this._surfacePatches.set(zoneId, patches);
  }

  /**
   * A target entity's mesh was rebuilt — re-project any decal whose projector box
   * intersects the entity's NEW bounds, or that previously projected onto it
   * (userData._decalTargets — catches "target moved away", where the stale mesh
   * would otherwise float in the air).
   */
  private _markDecalsDirty(zoneId: string, entityId: string): void {
    const zone = this._worldState.zones.get(zoneId);
    const entry = this._loadedZones.get(zoneId);
    if (!zone?.decals?.length || !entry) return;
    const entityBox = this._entityAABB(entry, entityId);
    for (const d of zone.decals) {
      if (d.kind === "overlay") {
        const prevTargets = this._decalMeshes.get(zoneId)?.get(d.id)?.userData["_decalTargets"] as string[] | undefined;
        const dirty = prevTargets?.includes(entityId)
          || (entityBox !== null && decalProjectorBox(d).intersectsBox(entityBox));
        if (dirty) this._queueDecalRebuild(zoneId, d.id);
      } else {
        // Surface kind: the rebuilt entity's old mesh (possibly patched) is disposed;
        // re-resolve + re-patch when the projector touches the entity's new bounds.
        if (entityBox !== null && decalProjectorBox(d).intersectsBox(entityBox))
          this._queueDecalRebuild(zoneId, d.id);
      }
    }
  }

  private _entityAABB(entry: ZoneEntry, entityId: string): THREE.Box3 | null {
    const box = new THREE.Box3();
    let found = false;
    entry.group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const u = child.userData as { editorId?: string; wallIds?: string[] };
      if (u.editorId === entityId || (Array.isArray(u.wallIds) && u.wallIds.includes(entityId))) {
        box.expandByObject(child);
        found = true;
      }
    });
    return found ? box : null;
  }

  private _queueDecalRebuild(zoneId: string, decalId: string): void {
    if (!this._pendingDecalRebuild.has(zoneId))
      this._pendingDecalRebuild.set(zoneId, new Set());
    this._pendingDecalRebuild.get(zoneId)!.add(decalId);

    if (!this._decalRebuildScheduled) {
      this._decalRebuildScheduled = true;
      queueMicrotask(() => {
        this._decalRebuildScheduled = false;
        for (const [zid, ids] of this._pendingDecalRebuild) {
          this._pendingDecalRebuild.delete(zid);
          for (const did of ids) this._enqueueWallOp(() => this._rebuildDecal(zid, did));
        }
      });
    }
  }

  private _buildTriggerVolumes(zoneId: string, zone: ZoneDef, group: THREE.Group): void {
    for (const vol of zone.triggerVolumes ?? []) {
      this._buildVolumeMesh(zoneId, vol, group);
      this._buildVolumeCollider(zoneId, vol);
    }
  }

  private _buildVolumeMesh(zoneId: string, vol: TriggerVolume, group: THREE.Group): void {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(vol.size.x, vol.size.y, vol.size.z));
    const mat = new THREE.LineBasicMaterial({ color: 0xffbb33, transparent: true, opacity: 0.8 });
    const wire = new THREE.LineSegments(geo, mat);
    wire.position.set(vol.position.x, vol.position.y + vol.size.y / 2, vol.position.z);
    wire.rotation.y = vol.rotation?.y ? vol.rotation.y * Math.PI / 180 : 0;
    wire.userData = { editorId: vol.id, editorType: "trigger-volume", zoneId, selectable: false, editorOnly: false, hideInGame: true };
    group.add(wire);
    const arr = this._volumeMeshes.get(zoneId) ?? [];
    arr.push(wire);
    this._volumeMeshes.set(zoneId, arr);
    if (vol.visual?.enabled && vol.visual.style === "gradient") this._buildVolumeFill(zoneId, vol, group);
  }

  // Optional decorative fill — a sibling of the wireframe (NOT a child), with no
  // `hideInGame` tag so it renders in preview AND game while the wireframe is hidden.
  private _buildVolumeFill(zoneId: string, vol: TriggerVolume, group: THREE.Group): void {
    const mat  = createVolumeFillMaterial(vol.visual!, vol.size.y);
    const fill = new THREE.Mesh(new THREE.BoxGeometry(vol.size.x, vol.size.y, vol.size.z), mat);
    fill.position.set(vol.position.x, vol.position.y + vol.size.y / 2, vol.position.z);
    fill.rotation.y = vol.rotation?.y ? vol.rotation.y * Math.PI / 180 : 0;
    fill.userData = { editorId: vol.id, editorType: "trigger-volume", zoneId, selectable: false };
    group.add(fill);
    const arr = this._volumeFills.get(zoneId) ?? [];
    arr.push(fill);
    this._volumeFills.set(zoneId, arr);
    if (vol.visual!.animate) this._animatedVolumeMats.add(mat);
  }

  // Per-frame: advance the pulse on animated fills. Called from App's scene.onUpdate.
  updateVolumeVisuals(dt: number): void {
    if (this._animatedVolumeMats.size === 0) return;
    for (const mat of this._animatedVolumeMats) mat.uniforms["uTime"]!.value += dt;
  }

  private _disposeFill(fill: THREE.Mesh): void {
    fill.parent?.remove(fill);
    fill.geometry.dispose();
    const mat = fill.material as THREE.ShaderMaterial;
    this._animatedVolumeMats.delete(mat);
    mat.dispose();
  }

  private _buildVolumeCollider(zoneId: string, vol: TriggerVolume): void {
    const collider = ColliderBuilder.registerVolumeSensor(vol);
    this._volumeSensors.set(collider.handle, vol.id);
    const arr = this._volumeColliders.get(zoneId) ?? [];
    arr.push(collider);
    this._volumeColliders.set(zoneId, arr);
  }

  private _removeTriggerVolumes(zoneId: string): void {
    const colliders = this._volumeColliders.get(zoneId);
    if (colliders) {
      for (const c of colliders) {
        this._volumeSensors.delete(c.handle);
        physicsWorld.removeCollider(c);
      }
      this._volumeColliders.delete(zoneId);
    }
    const meshes = this._volumeMeshes.get(zoneId);
    if (meshes) {
      for (const m of meshes) {
        m.parent?.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      this._volumeMeshes.delete(zoneId);
    }
    const fills = this._volumeFills.get(zoneId);
    if (fills) {
      for (const f of fills) this._disposeFill(f);
      this._volumeFills.delete(zoneId);
    }
    this._hoveredVolumeId.delete(zoneId);
    this._selectedVolumeId.delete(zoneId);
  }

  private _removeSingleVolume(zoneId: string, volumeId: string): void {
    // Remove wireframe
    const meshArr = this._volumeMeshes.get(zoneId) ?? [];
    const idx = meshArr.findIndex(m => m.userData["editorId"] === volumeId);
    if (idx !== -1) {
      const m = meshArr[idx]!;
      m.parent?.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      meshArr.splice(idx, 1);
    }
    // Remove fill
    const fillArr = this._volumeFills.get(zoneId) ?? [];
    const fIdx = fillArr.findIndex(f => f.userData["editorId"] === volumeId);
    if (fIdx !== -1) {
      this._disposeFill(fillArr[fIdx]!);
      fillArr.splice(fIdx, 1);
    }
    // Remove collider
    const colArr = this._volumeColliders.get(zoneId) ?? [];
    const cIdx = colArr.findIndex(c => this._volumeSensors.get(c.handle) === volumeId);
    if (cIdx !== -1) {
      const c = colArr[cIdx]!;
      this._volumeSensors.delete(c.handle);
      physicsWorld.removeCollider(c);
      colArr.splice(cIdx, 1);
    }
  }

  private _addTriggerVolume(zoneId: string, vol: TriggerVolume): void {
    const entry = this._loadedZones.get(zoneId);
    if (!entry) return;
    this._buildVolumeMesh(zoneId, vol, entry.group);
    this._buildVolumeCollider(zoneId, vol);
  }

  private _updateTriggerVolume(zoneId: string, volumeId: string, changes: Partial<TriggerVolume>): void {
    // Rebuild mesh: remove + re-add with updated data
    const zone = this._worldState.zones.get(zoneId);
    const vol  = zone?.triggerVolumes?.find(v => v.id === volumeId);
    if (!vol) return;
    this._removeSingleVolume(zoneId, volumeId);
    this._addTriggerVolume(zoneId, vol);
  }

  private _refreshVolumeHighlights(zoneId: string): void {
    const meshes     = this._volumeMeshes.get(zoneId);
    if (!meshes) return;
    const hoveredId  = this._hoveredVolumeId.get(zoneId)  ?? null;
    const selectedId = this._selectedVolumeId.get(zoneId) ?? null;
    for (const m of meshes) {
      const mat = m.material as THREE.LineBasicMaterial;
      const id  = m.userData["editorId"] as string;
      if (id === selectedId) {
        mat.color.setHex(0x00ffff); // cyan — selected
        mat.opacity = 1.0;
      } else if (id === hoveredId) {
        mat.color.setHex(0xffdd44); // light yellow — hover
        mat.opacity = 1.0;
      } else {
        mat.color.setHex(0xffbb33); // amber — idle
        mat.opacity = 0.45;
      }
    }
  }

  // ── Door sensor helpers ───────────────────────────────────────────────────

  private _registerDoorSensors(zoneId: string): void {
    const zone = this._worldState.zones.get(zoneId);
    if (!zone) return;
    this._removeDoorSensors(zoneId);
    const colliders: RAPIER.Collider[] = [];
    for (const wall of zone.walls) {
      if (wall.hidden) continue;  // hidden segments have no rendered openings
      const startNode = zone.nodes.find(n => n.id === wall.startNodeId);
      const endNode   = zone.nodes.find(n => n.id === wall.endNodeId);
      if (!startNode || !endNode) continue;
      for (const opening of wall.openings) {
        if (!opening.linkedZoneId) continue;
        if (opening.type !== "door" && opening.type !== "arch") continue;
        const c = ColliderBuilder.registerDoorSensor(
          wall, opening, wall.elevation ?? 0,
          { x: startNode.x, z: startNode.z },
          { x: endNode.x, z: endNode.z },
        );
        this._doorSensors.set(c.handle, opening.linkedZoneId);
        colliders.push(c);
      }
    }
    if (colliders.length > 0) this._doorColliders.set(zoneId, colliders);
  }

  private _removeDoorSensors(zoneId: string): void {
    const colliders = this._doorColliders.get(zoneId);
    if (!colliders) return;
    for (const c of colliders) {
      this._doorSensors.delete(c.handle);
      physicsWorld.removeCollider(c);
    }
    this._doorColliders.delete(zoneId);
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
