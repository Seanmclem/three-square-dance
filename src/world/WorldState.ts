import type { EventBus } from "@/core/EventBus";
import type { HistoryManager, Change, ChangeKind } from "@/editor/HistoryManager";
import type {
  SceneMetadata, WorldConfig, TerrainDef,
  ZoneDef, TransitionDef, FloorDef, WallDef, WallNode, PlatformDef, StairDef, WorldObject,
  SceneFile, Opening, SpawnDef, TriggerVolume, GroupDef,
} from "@/types";
import { DEFAULT_STATE_SCHEMA } from "@/scripting/GameState";

const SPAWN_ID = "__spawn__";

export class WorldState {
  metadata: SceneMetadata | null = null;
  world:    WorldConfig   | null = null;
  terrain:  TerrainDef    | null = null;

  readonly zones       = new Map<string, ZoneDef>();
  readonly transitions = new Map<string, TransitionDef>();
  activeZoneId: string | null = null;
  groups: GroupDef[] = [];

  // ── Undo journal ────────────────────────────────────────────────────────────
  private _history:  HistoryManager | null = null;
  private _journal:  Map<string, Change> | null = null;
  private _txDepth   = 0;
  private _txLabel   = "";
  private _applying  = false;

  constructor(private readonly _bus: EventBus) {}

  setHistory(h: HistoryManager): void { this._history = h; }

  // ── Transactions ────────────────────────────────────────────────────────────
  // Wrap a user gesture so every entity it touches (incl. cascades / run-mate sync)
  // becomes one undo step. Nested transactions join the outer one.

  transaction<T>(label: string, fn: () => T): T {
    this.beginTransaction(label);
    try { const r = fn(); this.commitTransaction(); return r; }
    catch (e) { this.abortTransaction(); throw e; }
  }

  beginTransaction(label: string): void {
    if (this._txDepth++ === 0) { this._txLabel = label; this._journal = new Map(); }
  }

  commitTransaction(): void {
    if (this._txDepth === 0) return;
    if (--this._txDepth > 0) return;
    const journal = this._journal;
    this._journal = null;
    if (!journal) return;
    const changes: Change[] = [];
    for (const c of journal.values()) {
      const after = this._cloneEntity(c.kind, c.zoneId, c.id);
      if (!this._eq(c.before, after)) changes.push({ ...c, after });
    }
    if (changes.length) this._history?.push({ label: this._txLabel, changes });
  }

  abortTransaction(): void { this._txDepth = 0; this._journal = null; }

  /** Capture an entity's pre-mutation state into the open journal (first touch wins). */
  private _touch(kind: ChangeKind, zoneId: string | undefined, id: string | undefined): void {
    if (!this._journal || this._applying) return;
    const key = `${kind}:${zoneId ?? ""}:${id ?? ""}`;
    if (this._journal.has(key)) return;
    this._journal.set(key, { kind, zoneId, id, before: this._cloneEntity(kind, zoneId, id), after: null });
  }

  // ── Group mutations ──────────────────────────────────────────────────────────

  addGroup(group: GroupDef): void {
    this._touch("group", undefined, group.id);
    this.groups.push(group);
    this._bus.emit("group:added", { group });
  }

  removeGroup(id: string): void {
    this._touch("group", undefined, id);
    this.groups = this.groups.filter(g => g.id !== id);
    this._bus.emit("group:removed", { id });
  }

  updateGroup(id: string, name: string): void {
    const g = this.groups.find(g => g.id === id);
    if (!g) return;
    this._touch("group", undefined, id);
    g.name = name;
    this._bus.emit("group:updated", { id, name });
  }

  // ── Zone mutations ───────────────────────────────────────────────────────────

  addZone(zone: ZoneDef): void {
    this.zones.set(zone.id, zone);
    this._bus.emit("zone:added", { zone });
  }

  setActiveZone(zoneId: string): void {
    this.activeZoneId = zoneId;
    this._bus.emit("zone:activated", { zoneId });
  }

  // ── Floor mutations ──────────────────────────────────────────────────────────

  addFloor(zoneId: string, floor: FloorDef): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("floor", zoneId, floor.id);
    zone.floors.push(floor);
    this._bus.emit("floor:added", { zoneId, floor });
  }

  updateFloor(zoneId: string, floorId: string, changes: Partial<FloorDef>): void {
    const zone  = this.zones.get(zoneId);
    const floor = zone?.floors.find(f => f.id === floorId);
    if (!floor) return;
    this._touch("floor", zoneId, floorId);
    if (changes.floorMesh) Object.assign(floor.floorMesh, changes.floorMesh);
    if (changes.elevation          !== undefined) floor.elevation          = changes.elevation;
    if (changes.ceilingHeight      !== undefined) floor.ceilingHeight      = changes.ceilingHeight;
    if ('materialOverrides' in changes)           floor.materialOverrides  = changes.materialOverrides;
    this._bus.emit("floor:updated", { zoneId, floorId, changes });
  }

  removeFloor(zoneId: string, floorId: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("floor", zoneId, floorId);
    zone.floors = zone.floors.filter(f => f.id !== floorId);
    this._pruneOrphanNodes(zone, zoneId);  // drop the deleted polygon floor's now-unreferenced nodes
    this._bus.emit("floor:removed", { zoneId, floorId });
  }

  // ── Node mutations ───────────────────────────────────────────────────────────

  addNode(zoneId: string, node: WallNode): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("node", zoneId, node.id);
    zone.nodes.push(node);
  }

  updateNode(zoneId: string, nodeId: string, pos: { x: number; z: number }): void {
    const zone = this.zones.get(zoneId);
    const node = zone?.nodes.find(n => n.id === nodeId);
    if (!node) return;
    this._touch("node", zoneId, nodeId);
    node.x = pos.x;
    node.z = pos.z;
    this._bus.emit("node:updated", { zoneId, nodeId, pos });
  }

  removeNode(zoneId: string, nodeId: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    const hasWalls = zone.walls.some(w => w.startNodeId === nodeId || w.endNodeId === nodeId);
    if (hasWalls) return;
    this._touch("node", zoneId, nodeId);
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

  // ── Wall mutations ───────────────────────────────────────────────────────────

  addWall(zoneId: string, wall: WallDef): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("wall", zoneId, wall.id);
    zone.walls.push(wall);
    this._bus.emit("wall:added", { zoneId, wall });
  }

  updateWall(zoneId: string, wallId: string, changes: Partial<WallDef>): void {
    const zone = this.zones.get(zoneId);
    const wall = zone?.walls.find(w => w.id === wallId);
    if (!wall) return;
    this._touch("wall", zoneId, wallId);
    Object.assign(wall, changes);
    this._bus.emit("wall:updated", { zoneId, wallId, changes });
  }

  /** Like updateWall but marks the change as per-segment — skips run-mate sync in ZoneManager. */
  updateWallSegment(zoneId: string, wallId: string, changes: Partial<WallDef>): void {
    const zone = this.zones.get(zoneId);
    const wall = zone?.walls.find(w => w.id === wallId);
    if (!wall) return;
    this._touch("wall", zoneId, wallId);
    Object.assign(wall, changes);
    this._bus.emit("wall:updated", { zoneId, wallId, changes, segmentOnly: true });
  }

  removeWall(zoneId: string, wallId: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("wall", zoneId, wallId);
    zone.walls = zone.walls.filter(w => w.id !== wallId);
    this._bus.emit("wall:removed", { zoneId, wallId });
  }

  updateOpening(zoneId: string, wallId: string, openingId: string, changes: Partial<Opening>): void {
    const zone    = this.zones.get(zoneId);
    const wall    = zone?.walls.find(w => w.id === wallId);
    const opening = wall?.openings.find(o => o.id === openingId);
    if (!opening || !wall) return;
    this._touch("wall", zoneId, wallId);  // openings live on the wall
    Object.assign(opening, changes);
    this._bus.emit("wall:updated", { zoneId, wallId, changes: { openings: wall.openings } });
  }

  addOpening(zoneId: string, wallId: string, opening: Opening): void {
    const zone = this.zones.get(zoneId);
    const wall = zone?.walls.find(w => w.id === wallId);
    if (!wall) return;
    this._touch("wall", zoneId, wallId);
    wall.openings.push(opening);
    this._bus.emit("wall:updated", { zoneId, wallId, changes: { openings: wall.openings } });
  }

  removeOpening(zoneId: string, wallId: string, openingId: string): void {
    const zone = this.zones.get(zoneId);
    const wall = zone?.walls.find(w => w.id === wallId);
    if (!wall) return;
    this._touch("wall", zoneId, wallId);
    wall.openings = wall.openings.filter(o => o.id !== openingId);
    this._bus.emit("wall:updated", { zoneId, wallId, changes: { openings: wall.openings } });
  }

  // ── Platform mutations ───────────────────────────────────────────────────────

  addPlatform(zoneId: string, platform: PlatformDef): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("platform", zoneId, platform.id);
    zone.platforms.push(platform);
    this._bus.emit("platform:added", { zoneId, platform });
  }

  updatePlatform(zoneId: string, id: string, changes: Partial<PlatformDef>): void {
    const zone     = this.zones.get(zoneId);
    const platform = zone?.platforms.find(p => p.id === id);
    if (!platform) return;
    this._touch("platform", zoneId, id);
    Object.assign(platform, changes);
    this._bus.emit("platform:updated", { zoneId, id, changes });
  }

  removePlatform(zoneId: string, id: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("platform", zoneId, id);
    zone.platforms = zone.platforms.filter(p => p.id !== id);
    this._pruneOrphanNodes(zone, zoneId);  // drop the deleted polygon platform's now-unreferenced nodes
    this._bus.emit("platform:removed", { zoneId, id });
  }

  // ── Stair mutations ──────────────────────────────────────────────────────────

  addStair(zoneId: string, stair: StairDef): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("stair", zoneId, stair.id);
    zone.stairs.push(stair);
    this._bus.emit("stair:added", { zoneId, stair });
  }

  updateStair(zoneId: string, id: string, changes: Partial<StairDef>): void {
    const zone = this.zones.get(zoneId);
    const stair = zone?.stairs.find(s => s.id === id);
    if (!stair) return;
    this._touch("stair", zoneId, id);
    Object.assign(stair, changes);
    this._bus.emit("stair:updated", { zoneId, id, changes });
  }

  removeStair(zoneId: string, id: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("stair", zoneId, id);
    zone.stairs = zone.stairs.filter(s => s.id !== id);
    this._bus.emit("stair:removed", { zoneId, id });
  }

  // ── Object mutations ─────────────────────────────────────────────────────────

  addObject(zoneId: string, object: WorldObject): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("object", zoneId, object.id);
    zone.objects.push(object);
    this._bus.emit("object:added", { zoneId, object });
  }

  updateObject(zoneId: string, id: string, changes: Partial<WorldObject>): void {
    const zone = this.zones.get(zoneId);
    const obj  = zone?.objects.find(o => o.id === id);
    if (!obj) return;
    this._touch("object", zoneId, id);
    Object.assign(obj, changes);
    this._bus.emit("object:updated", { id, zoneId, changes });
  }

  removeObject(zoneId: string, id: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("object", zoneId, id);
    zone.objects = zone.objects.filter(o => o.id !== id);
    this._bus.emit("object:removed", { zoneId, id });
  }

  setDefaultSpawn(spawn: SpawnDef): void {
    if (!this.world) {
      this.world = {
        size: { width: 200, depth: 200 },
        ambientLight: { color: "#aabbcc", intensity: 1.2 },
        sunLight: { color: "#fff4e0", intensity: 3.0, position: { x: 30, y: 50, z: 20 } },
        skybox: "sky", fogColor: "#1a1f2e", fogDensity: 0.012,
        playerSettings: { cameraMode: "fps", moveSpeed: 6, jumpHeight: 1.2, fov: 75, thirdPersonDistance: 4, thirdPersonHeight: 2, jumpAnimSpeed: 1, characterScale: 1 },
      };
    }
    this._touch("spawn", undefined, SPAWN_ID);
    this.world.defaultSpawn = spawn;
  }

  // ── Trigger volume mutations ─────────────────────────────────────────────────

  addTriggerVolume(zoneId: string, volume: TriggerVolume): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    if (!zone.triggerVolumes) zone.triggerVolumes = [];
    this._touch("triggerVolume", zoneId, volume.id);
    zone.triggerVolumes.push(volume);
    this._bus.emit("triggervolume:added", { zoneId, volume });
  }

  updateTriggerVolume(zoneId: string, id: string, changes: Partial<TriggerVolume>): void {
    const zone   = this.zones.get(zoneId);
    const volume = zone?.triggerVolumes?.find(v => v.id === id);
    if (!volume) return;
    this._touch("triggerVolume", zoneId, id);
    Object.assign(volume, changes);
    this._bus.emit("triggervolume:updated", { zoneId, id, changes });
  }

  removeTriggerVolume(zoneId: string, id: string): void {
    const zone = this.zones.get(zoneId);
    if (!zone) return;
    this._touch("triggerVolume", zoneId, id);
    zone.triggerVolumes = (zone.triggerVolumes ?? []).filter(v => v.id !== id);
    this._bus.emit("triggervolume:removed", { zoneId, id });
  }

  // ── Transition mutations ─────────────────────────────────────────────────────

  addTransition(transition: TransitionDef): void {
    this._touch("transition", undefined, transition.id);
    this.transitions.set(transition.id, transition);
    this._bus.emit("transition:added", { transition });
  }

  // ── Undo/redo apply (called by HistoryManager) ───────────────────────────────

  /** Replay a transaction's per-entity diffs. dir "before" = undo, "after" = redo. */
  _applyChanges(changes: Change[], dir: "before" | "after"): void {
    this._applying = true;
    // Phase 1 — set all data first so events read a consistent world.
    for (const c of changes) {
      const v = dir === "before" ? c.before : c.after;
      this._setEntity(c.kind, c.zoneId, c.id, v == null ? null : structuredClone(v));
    }
    // Phase 2 — emit the existing per-entity events so ZoneManager rebuilds only what changed.
    for (const c of changes) this._emitChange(c, dir);
    this._bus.emit("object:deselected", {});
    this._applying = false;
  }

  private _emitChange(c: Change, dir: "before" | "after"): void {
    const target = dir === "before" ? c.before : c.after;
    const source = dir === "before" ? c.after  : c.before;
    const state: "added" | "removed" | "updated" =
      target == null ? "removed" : source == null ? "added" : "updated";
    const z = c.zoneId as string;
    const id = c.id as string;
    switch (c.kind) {
      case "floor":
        if (state === "added")        this._bus.emit("floor:added", { zoneId: z, floor: target as FloorDef });
        else if (state === "removed") this._bus.emit("floor:removed", { zoneId: z, floorId: id });
        else                          this._bus.emit("floor:updated", { zoneId: z, floorId: id, changes: target as Partial<FloorDef> });
        break;
      case "wall":
        if (state === "added")        this._bus.emit("wall:added", { zoneId: z, wall: target as WallDef });
        else if (state === "removed") this._bus.emit("wall:removed", { zoneId: z, wallId: id });
        else                          this._bus.emit("wall:updated", { zoneId: z, wallId: id, changes: target as Partial<WallDef> });
        break;
      case "node":
        // Only position changes have an event; add/remove rely on the co-changed wall/floor.
        if (state === "updated") { const n = target as WallNode; this._bus.emit("node:updated", { zoneId: z, nodeId: id, pos: { x: n.x, z: n.z } }); }
        break;
      case "platform":
        if (state === "added")        this._bus.emit("platform:added", { zoneId: z, platform: target as PlatformDef });
        else if (state === "removed") this._bus.emit("platform:removed", { zoneId: z, id });
        else                          this._bus.emit("platform:updated", { zoneId: z, id, changes: target as Partial<PlatformDef> });
        break;
      case "stair":
        if (state === "added")        this._bus.emit("stair:added", { zoneId: z, stair: target as StairDef });
        else if (state === "removed") this._bus.emit("stair:removed", { zoneId: z, id });
        else                          this._bus.emit("stair:updated", { zoneId: z, id, changes: target as Partial<StairDef> });
        break;
      case "object":
        if (state === "added")        this._bus.emit("object:added", { zoneId: z, object: target as WorldObject });
        else if (state === "removed") this._bus.emit("object:removed", { zoneId: z, id });
        else                          this._bus.emit("object:updated", { id, zoneId: z, changes: target as Partial<WorldObject> });
        break;
      case "triggerVolume":
        if (state === "added")        this._bus.emit("triggervolume:added", { zoneId: z, volume: target as TriggerVolume });
        else if (state === "removed") this._bus.emit("triggervolume:removed", { zoneId: z, id });
        else                          this._bus.emit("triggervolume:updated", { zoneId: z, id, changes: target as Partial<TriggerVolume> });
        break;
      case "group":
        if (state === "added")        this._bus.emit("group:added", { group: target as GroupDef });
        else if (state === "removed") this._bus.emit("group:removed", { id });
        else                          this._bus.emit("group:updated", { id, name: (target as GroupDef).name });
        break;
      case "spawn":
        if (target) this._bus.emit("spawn:updated", { position: (target as SpawnDef).position });
        break;
      case "transition":
        if (state !== "removed") this._bus.emit("transition:added", { transition: target as TransitionDef });
        break;
    }
  }

  // ── Journal helpers ──────────────────────────────────────────────────────────

  private _eq(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

  private _cloneEntity(kind: ChangeKind, zoneId: string | undefined, id: string | undefined): unknown | null {
    const e = this._findEntity(kind, zoneId, id);
    return e == null ? null : structuredClone(e);
  }

  private _findEntity(kind: ChangeKind, zoneId: string | undefined, id: string | undefined): unknown | undefined {
    if (kind === "group")      return this.groups.find(g => g.id === id);
    if (kind === "spawn")      return this.world?.defaultSpawn;
    if (kind === "transition") return this.transitions.get(id!);
    return this._zoneArr(kind, zoneId)?.find(e => (e as { id: string }).id === id);
  }

  private _setEntity(kind: ChangeKind, zoneId: string | undefined, id: string | undefined, value: unknown | null): void {
    if (kind === "group") {
      this.groups = this.groups.filter(g => g.id !== id);
      if (value) this.groups.push(value as GroupDef);
      return;
    }
    if (kind === "spawn") {
      if (this.world && value) this.world.defaultSpawn = value as SpawnDef;
      return;
    }
    if (kind === "transition") {
      if (value) this.transitions.set(id!, value as TransitionDef);
      else this.transitions.delete(id!);
      return;
    }
    const arr = this._zoneArr(kind, zoneId);
    if (!arr) return;
    const idx = arr.findIndex(e => (e as { id: string }).id === id);
    if (value == null) { if (idx >= 0) arr.splice(idx, 1); }
    else if (idx >= 0)   arr[idx] = value;
    else                 arr.push(value);
  }

  private _zoneArr(kind: ChangeKind, zoneId: string | undefined): unknown[] | null {
    const zone = zoneId ? this.zones.get(zoneId) : undefined;
    if (!zone) return null;
    switch (kind) {
      case "floor":         return zone.floors;
      case "wall":          return zone.walls;
      case "node":          return zone.nodes;
      case "platform":      return zone.platforms;
      case "stair":         return zone.stairs;
      case "object":        return zone.objects;
      case "triggerVolume": return (zone.triggerVolumes ??= []);
      default:              return null;
    }
  }

  /** Journaled version of WorldLoader.pruneOrphanNodes — captures each removed node first. */
  private _pruneOrphanNodes(zone: ZoneDef, zoneId: string): void {
    if (!zone.nodes?.length) return;
    const ref = new Set<string>();
    for (const w of zone.walls)     { ref.add(w.startNodeId); ref.add(w.endNodeId); }
    for (const f of zone.floors)    f.floorMesh.nodeIds?.forEach(id => ref.add(id));
    for (const p of zone.platforms) p.nodeIds?.forEach(id => ref.add(id));
    for (const n of zone.nodes) if (!ref.has(n.id)) this._touch("node", zoneId, n.id);
    zone.nodes = zone.nodes.filter(n => ref.has(n.id));
  }

  // ── Serialization ────────────────────────────────────────────────────────────

  toJSON(): SceneFile {
    return {
      metadata:    { ...(this.metadata ?? { name: "Untitled", version: "1", author: "", created: new Date().toISOString(), lastModified: new Date().toISOString() }), uvVersion: 1 },  // Phase 10.8: every save is world-space-UV
      world:       this.world    ?? { size: { width: 200, depth: 200 }, ambientLight: { color: "#aabbcc", intensity: 1.2 }, sunLight: { color: "#fff4e0", intensity: 3.0, position: { x: 30, y: 50, z: 20 } }, skybox: "sky", fogColor: "#1a1f2e", fogDensity: 0.012, playerSettings: { cameraMode: "fps", moveSpeed: 5, jumpHeight: 1.2, fov: 75, thirdPersonDistance: 4, thirdPersonHeight: 2, jumpAnimSpeed: 1, characterScale: 1 }, stateSchema: DEFAULT_STATE_SCHEMA },
      terrain:     this.terrain  ?? null,
      zones:       [...this.zones.values()],
      transitions: [...this.transitions.values()],
      groups:      this.groups,
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
    this.groups       = file.groups ?? [];
    this.activeZoneId = file.zones[0]?.id ?? null;
    this._bus.emit("world:loaded", { metadata: file.metadata });
  }
}
