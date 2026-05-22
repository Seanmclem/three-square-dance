import type { EventBus } from "@/core/EventBus";
import type {
  SceneMetadata, WorldConfig, TerrainDef,
  ZoneDef, TransitionDef, FloorDef, WallDef, WallNode, PlatformDef, StairDef, WorldObject,
  SceneFile,
} from "@/types";

export class WorldState {
  metadata: SceneMetadata | null = null;
  world:    WorldConfig   | null = null;
  terrain:  TerrainDef    | null = null;

  readonly zones       = new Map<string, ZoneDef>();
  readonly transitions = new Map<string, TransitionDef>();
  activeZoneId: string | null = null;

  constructor(private readonly _bus: EventBus) {}

  // ─── Zone mutations ───────────────────────────────────────────────────────

  addZone(zone: ZoneDef): void {
    this.zones.set(zone.id, zone);
    this._bus.emit("zone:added", { zone });
  }

  setActiveZone(zoneId: string): void {
    this.activeZoneId = zoneId;
    this._bus.emit("zone:activated", { zoneId });
  }

  // ─── Floor mutations ──────────────────────────────────────────────────────

  addFloor(zoneId: string, floor: FloorDef): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.floors.push(floor);
    this._bus.emit("floor:added", { zoneId, floor });
  }

  updateFloor(zoneId: string, floorId: string, changes: Partial<FloorDef>): void {
    const zone  = this.zones.get(zoneId);
    const floor = zone?.floors.find(f => f.id === floorId);
    if (!floor) return;
    if (changes.floorMesh) Object.assign(floor.floorMesh, changes.floorMesh);
    if (changes.elevation          !== undefined) floor.elevation          = changes.elevation;
    if (changes.ceilingHeight      !== undefined) floor.ceilingHeight      = changes.ceilingHeight;
    if ('materialOverrides' in changes)           floor.materialOverrides  = changes.materialOverrides;
    this._bus.emit("floor:updated", { zoneId, floorId, changes });
  }

  // ─── Node mutations ───────────────────────────────────────────────────────

  addNode(zoneId: string, node: WallNode): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.nodes.push(node);
  }

  updateNode(zoneId: string, nodeId: string, pos: { x: number; z: number }): void {
    const zone = this.zones.get(zoneId);
    const node = zone?.nodes.find(n => n.id === nodeId);
    if (!node) return;
    node.x = pos.x;
    node.z = pos.z;
    this._bus.emit("node:updated", { zoneId, nodeId, pos });
  }

  removeNode(zoneId: string, nodeId: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    const hasWalls = zone.walls.some(w => w.startNodeId === nodeId || w.endNodeId === nodeId);
    if (hasWalls) return;
    zone.nodes = zone.nodes.filter(n => n.id !== nodeId);
  }

  getNode(zoneId: string, nodeId: string): WallNode | undefined {
    return this.zones.get(zoneId)?.nodes.find(n => n.id === nodeId);
  }

  getWallsAtNode(zoneId: string, nodeId: string): WallDef[] {
    const zone = this.zones.get(zoneId);
    if (!zone) return [];
    return zone.walls.filter(w => w.startNodeId === nodeId || w.endNodeId === nodeId);
  }

  // ─── Wall mutations ───────────────────────────────────────────────────────

  addWall(zoneId: string, wall: WallDef): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.walls.push(wall);
    this._bus.emit("wall:added", { zoneId, wall });
  }

  updateWall(zoneId: string, wallId: string, changes: Partial<WallDef>): void {
    const zone = this.zones.get(zoneId);
    const wall = zone?.walls.find(w => w.id === wallId);
    if (!wall) return;
    Object.assign(wall, changes);
    this._bus.emit("wall:updated", { zoneId, wallId, changes });
  }

  removeWall(zoneId: string, wallId: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.walls = zone.walls.filter(w => w.id !== wallId);
    this._bus.emit("wall:removed", { zoneId, wallId });
  }

  // ─── Platform mutations ───────────────────────────────────────────────────

  addPlatform(zoneId: string, platform: PlatformDef): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.platforms.push(platform);
    this._bus.emit("platform:added", { zoneId, platform });
  }

  removePlatform(zoneId: string, id: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.platforms = zone.platforms.filter(p => p.id !== id);
    this._bus.emit("platform:removed", { zoneId, id });
  }

  // ─── Stair mutations ──────────────────────────────────────────────────────

  addStair(zoneId: string, stair: StairDef): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.stairs.push(stair);
    this._bus.emit("stair:added", { zoneId, stair });
  }

  removeStair(zoneId: string, id: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.stairs = zone.stairs.filter(s => s.id !== id);
    this._bus.emit("stair:removed", { zoneId, id });
  }

  // ─── Object mutations ─────────────────────────────────────────────────────

  addObject(zoneId: string, object: WorldObject): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.objects.push(object);
    this._bus.emit("object:added", { zoneId, object });
  }

  removeObject(zoneId: string, id: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    zone.objects = zone.objects.filter(o => o.id !== id);
    this._bus.emit("object:removed", { zoneId, id });
  }

  // ─── Transition mutations ─────────────────────────────────────────────────

  addTransition(transition: TransitionDef): void {
    this.transitions.set(transition.id, transition);
    this._bus.emit("transition:added", { transition });
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  toJSON(): SceneFile {
    return {
      metadata:    this.metadata ?? { name: "Untitled", version: "1", author: "", created: new Date().toISOString(), lastModified: new Date().toISOString() },
      world:       this.world    ?? { size: { width: 200, depth: 200 }, ambientLight: { color: "#aabbcc", intensity: 1.2 }, sunLight: { color: "#fff4e0", intensity: 3.0, position: { x: 30, y: 50, z: 20 } }, skybox: "sky", fogColor: "#1a1f2e", fogDensity: 0.012, playerSettings: { cameraMode: "fps", moveSpeed: 5, jumpHeight: 1.2, fov: 75, thirdPersonDistance: 4, thirdPersonHeight: 2 } },
      terrain:     this.terrain  ?? null,
      zones:       [...this.zones.values()],
      transitions: [...this.transitions.values()],
    };
  }

  loadFromJSON(file: SceneFile): void {
    this.metadata = file.metadata;
    this.world    = file.world;
    this.terrain  = file.terrain;
    this.zones.clear();
    this.transitions.clear();
    for (const zone of file.zones)        this.zones.set(zone.id, zone);
    for (const trans of file.transitions) this.transitions.set(trans.id, trans);
    this.activeZoneId = file.zones[0]?.id ?? null;
    this._bus.emit("world:loaded", { metadata: file.metadata });
  }
}
