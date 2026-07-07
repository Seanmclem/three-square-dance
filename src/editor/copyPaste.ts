import type { WorldState } from "@/world/WorldState";
import type {
  SelectedObjectPayload, SelectedRef, EditorObjectType,
  WallDef, FloorDef, PlatformDef, StairDef, ShapeDef, WorldObject, TriggerVolume, WallNode, Vec2, Vec3,
} from "@/types";

/** Selection types that can be copied. (Openings/spawn/terrain are excluded.) */
const COPYABLE = new Set<EditorObjectType>(["wall", "floor", "platform", "stair", "object", "trigger-volume", "shape"]);

/** One copied entity, tagged with its type so paste can route per-entity. */
export interface ClipEntity {
  type: EditorObjectType;
  def:  unknown;
}

/**
 * A self-contained snapshot of a copied selection — deep-cloned so paste still works
 * after the source is moved or deleted. `entities` is a mixed-type list (single copy is
 * a 1-entry list, a wall run is one entry per segment); `nodes` are the referenced
 * corner/endpoint nodes for all node-backed entities, deduped and shared so corners
 * shared between two selected entities clone as one node.
 */
export interface Clipboard {
  zoneId:   string;
  entities: ClipEntity[];
  nodes:    WallNode[];
}

const uuid  = (): string => crypto.randomUUID();
const uuid8 = (): string => crypto.randomUUID().slice(0, 8);

/** New id matching each type's existing format (some code keys off prefixes, e.g. "vol_"). */
function newId(type: EditorObjectType): string {
  switch (type) {
    case "wall":           return `wall_${uuid8()}`;
    case "platform":       return `plat_${uuid8()}`;
    case "stair":          return `stair_${uuid8()}`;
    case "object":         return `obj_${uuid8()}`;
    case "trigger-volume": return `vol_${uuid8()}`;
    case "shape":          return `shape_${uuid8()}`;
    default:               return uuid();  // floor + nodes use full uuids
  }
}

/** Node ids referenced by a node-backed entity (empty for position-only types). */
function entityNodeIds(type: EditorObjectType, def: unknown): string[] {
  if (type === "wall")     { const w = def as WallDef;     return [w.startNodeId, w.endNodeId]; }
  if (type === "floor")    { const f = def as FloorDef;    return f.floorMesh.nodeIds ?? []; }
  if (type === "platform") { const p = def as PlatformDef; return p.nodeIds ?? []; }
  return [];
}

function cloneNodes(world: WorldState, zoneId: string, ids: string[]): WallNode[] {
  const zone = world.zones.get(zoneId);
  if (!zone) return [];
  const seen = new Set<string>();
  const out: WallNode[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const n = zone.nodes.find(nn => nn.id === id);
    if (n) { seen.add(id); out.push(structuredClone(n)); }
  }
  return out;
}

/** Look up an entity def from a selection ref. Wall runs expand to all member walls. */
function defsForRef(world: WorldState, ref: SelectedRef): ClipEntity[] {
  const zone = world.zones.get(ref.zoneId);
  if (!zone) return [];
  switch (ref.type) {
    case "wall": {
      const ids = ref.memberIds && ref.memberIds.length ? ref.memberIds : [ref.id];
      return ids
        .map(id => zone.walls.find(w => w.id === id))
        .filter((w): w is WallDef => !!w)
        .map(w => ({ type: "wall" as const, def: structuredClone(w) }));
    }
    case "floor":          { const f = zone.floors.find(x => x.id === ref.id);    return f ? [{ type: ref.type, def: structuredClone(f) }] : []; }
    case "platform":       { const p = zone.platforms.find(x => x.id === ref.id); return p ? [{ type: ref.type, def: structuredClone(p) }] : []; }
    case "stair":          { const s = zone.stairs.find(x => x.id === ref.id);    return s ? [{ type: ref.type, def: structuredClone(s) }] : []; }
    case "object":         { const o = zone.objects.find(x => x.id === ref.id);   return o ? [{ type: ref.type, def: structuredClone(o) }] : []; }
    case "trigger-volume": { const v = zone.triggerVolumes?.find(x => x.id === ref.id); return v ? [{ type: ref.type, def: structuredClone(v) }] : []; }
    case "shape":          { const s = zone.shapes?.find(x => x.id === ref.id);         return s ? [{ type: ref.type, def: structuredClone(s) }] : []; }
    default:               return [];
  }
}

const off2 = (p: Vec2, dx: number, dz: number): Vec2 => ({ x: p.x + dx, z: p.z + dz });
const off3 = (p: Vec3, dx: number, dz: number): Vec3 => ({ x: p.x + dx, y: p.y, z: p.z + dz });

function buildClipboard(world: WorldState, zoneId: string, entities: ClipEntity[]): Clipboard | null {
  if (entities.length === 0) return null;
  const nodeIds = entities.flatMap(e => entityNodeIds(e.type, e.def));
  return { zoneId, entities, nodes: cloneNodes(world, zoneId, nodeIds) };
}

/** Deep-clone the current single selection (entity/run + referenced nodes) into a clipboard. */
export function copySelection(world: WorldState, selected: SelectedObjectPayload | null): Clipboard | null {
  if (!selected || !selected.data || !COPYABLE.has(selected.type)) return null;
  const entities: ClipEntity[] =
    selected.type === "wall"
      ? (selected.runWalls ?? [selected.data as WallDef]).map(w => ({ type: "wall" as const, def: structuredClone(w) }))
      : [{ type: selected.type, def: structuredClone(selected.data) }];
  return buildClipboard(world, selected.zoneId, entities);
}

/** Deep-clone a multi-selection (mixed types) into one clipboard with shared, deduped nodes. */
export function copySelectionMulti(world: WorldState, refs: SelectedRef[]): Clipboard | null {
  const copyable = refs.filter(r => COPYABLE.has(r.type));
  if (copyable.length === 0) return null;
  const zoneId = copyable[0].zoneId;
  const entities = copyable.flatMap(r => defsForRef(world, r));
  return buildClipboard(world, zoneId, entities);
}

/**
 * Paste a clipboard into a zone, offset by (dx,dz). Regenerates all ids, clones referenced
 * nodes once with fresh ids and remaps references (so shared corners stay shared), regenerates
 * opening ids — all in one undoable transaction. Returns the refs of every pasted entity
 * (first = primary) for post-paste selection.
 */
export function pasteClipboard(
  world: WorldState, clip: Clipboard, zoneId: string, offset: { x: number; z: number },
): { type: EditorObjectType; id: string }[] {
  if (!clip || clip.entities.length === 0) return [];
  const dx = offset.x, dz = offset.z;
  const pasted: { type: EditorObjectType; id: string }[] = [];

  const label = clip.entities.length > 1 ? `paste ${clip.entities.length} items` : `paste ${clip.entities[0].type}`;
  world.transaction(label, () => {
    // 1) Clone referenced nodes with new ids (deduped, shared), offset.
    const nodeMap = new Map<string, string>();
    for (const n of clip.nodes) {
      const id = uuid();
      world.addNode(zoneId, { id, x: n.x + dx, z: n.z + dz });
      nodeMap.set(n.id, id);
    }
    const mapNode = (old: string): string => nodeMap.get(old) ?? old;

    // 2) Clone each entity with a new id + remapped/offset geometry.
    for (const ent of clip.entities) {
      const id = newId(ent.type);
      pasted.push({ type: ent.type, id });

      switch (ent.type) {
        case "wall": {
          const w = ent.def as WallDef;
          world.addWall(zoneId, {
            ...w, id,
            startNodeId: mapNode(w.startNodeId),
            endNodeId:   mapNode(w.endNodeId),
            openings:    w.openings.map(o => ({ ...o, id: uuid() })),
          });
          break;
        }
        case "floor": {
          const f  = ent.def as FloorDef;
          const fm = f.floorMesh;
          world.addFloor(zoneId, {
            ...f, id,
            floorMesh: {
              ...fm,
              nodeIds: fm.nodeIds ? fm.nodeIds.map(mapNode) : fm.nodeIds,
              points:  fm.points  ? fm.points.map(p => off2(p, dx, dz)) : fm.points,
            },
          });
          break;
        }
        case "platform": {
          const p = ent.def as PlatformDef;
          world.addPlatform(zoneId, {
            ...p, id,
            position: off3(p.position, dx, dz),
            nodeIds:  p.nodeIds ? p.nodeIds.map(mapNode) : p.nodeIds,
            points:   p.points  ? p.points.map(pt => off2(pt, dx, dz)) : p.points,
          });
          break;
        }
        case "stair": {
          const s = ent.def as StairDef;
          world.addStair(zoneId, { ...s, id, start: off3(s.start, dx, dz), end: off3(s.end, dx, dz) });
          break;
        }
        case "object": {
          const o = ent.def as WorldObject;
          world.addObject(zoneId, { ...o, id, position: off3(o.position, dx, dz) });
          break;
        }
        case "trigger-volume": {
          const v = ent.def as TriggerVolume;
          world.addTriggerVolume(zoneId, { ...v, id, position: off3(v.position, dx, dz) });
          break;
        }
        case "shape": {
          const s = ent.def as ShapeDef;
          world.addShape(zoneId, { ...s, id, position: off3(s.position, dx, dz) });
          break;
        }
      }
    }
  });

  return pasted;
}
