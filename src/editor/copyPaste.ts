import type { WorldState } from "@/world/WorldState";
import type {
  SelectedObjectPayload, EditorObjectType,
  WallDef, FloorDef, PlatformDef, StairDef, WorldObject, TriggerVolume, WallNode, Vec2, Vec3,
} from "@/types";

/** Selection types that can be copied. (Openings/spawn/terrain are excluded.) */
const COPYABLE = new Set<EditorObjectType>(["wall", "floor", "platform", "stair", "object", "trigger-volume"]);

/**
 * A self-contained snapshot of a copied selection — deep-cloned so paste still works
 * after the source is moved or deleted. `entities` is the run (walls) or a single entity;
 * `nodes` are the referenced corner/endpoint nodes (deduped) for node-backed types.
 */
export interface Clipboard {
  type:     EditorObjectType;
  zoneId:   string;
  entities: unknown[];
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
    default:               return uuid();  // floor + nodes use full uuids
  }
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

const off2 = (p: Vec2, dx: number, dz: number): Vec2 => ({ x: p.x + dx, z: p.z + dz });
const off3 = (p: Vec3, dx: number, dz: number): Vec3 => ({ x: p.x + dx, y: p.y, z: p.z + dz });

/** Deep-clone the current selection (entity/run + referenced nodes) into a clipboard. */
export function copySelection(world: WorldState, selected: SelectedObjectPayload | null): Clipboard | null {
  if (!selected || !selected.data || !COPYABLE.has(selected.type)) return null;
  const zoneId = selected.zoneId;

  if (selected.type === "wall") {
    const walls = (selected.runWalls ?? [selected.data as WallDef]).map(w => structuredClone(w));
    const nodeIds = walls.flatMap(w => [w.startNodeId, w.endNodeId]);
    return { type: "wall", zoneId, entities: walls, nodes: cloneNodes(world, zoneId, nodeIds) };
  }
  if (selected.type === "floor") {
    const floor = structuredClone(selected.data as FloorDef);
    const nodes = floor.floorMesh.nodeIds ? cloneNodes(world, zoneId, floor.floorMesh.nodeIds) : [];
    return { type: "floor", zoneId, entities: [floor], nodes };
  }
  if (selected.type === "platform") {
    const plat = structuredClone(selected.data as PlatformDef);
    const nodes = plat.nodeIds ? cloneNodes(world, zoneId, plat.nodeIds) : [];
    return { type: "platform", zoneId, entities: [plat], nodes };
  }
  // stair / object / trigger-volume — position-only, no nodes
  return { type: selected.type, zoneId, entities: [structuredClone(selected.data)], nodes: [] };
}

/**
 * Paste a clipboard into a zone, offset by (dx,dz). Regenerates all ids, clones referenced
 * nodes with fresh ids and remaps references, regenerates opening ids — all in one undoable
 * transaction. Returns the primary new entity's {type,id} for post-paste selection.
 */
export function pasteClipboard(
  world: WorldState, clip: Clipboard, zoneId: string, offset: { x: number; z: number },
): { type: EditorObjectType; id: string } | null {
  if (!clip || clip.entities.length === 0) return null;
  const dx = offset.x, dz = offset.z;
  let primaryId: string | null = null;

  world.transaction(`paste ${clip.type}`, () => {
    // 1) Clone referenced nodes with new ids (deduped), offset.
    const nodeMap = new Map<string, string>();
    for (const n of clip.nodes) {
      const id = uuid();
      world.addNode(zoneId, { id, x: n.x + dx, z: n.z + dz });
      nodeMap.set(n.id, id);
    }
    const mapNode = (old: string): string => nodeMap.get(old) ?? old;

    // 2) Clone each entity with a new id + remapped/offset geometry.
    for (const ent of clip.entities) {
      const id = newId(clip.type);
      if (primaryId === null) primaryId = id;

      switch (clip.type) {
        case "wall": {
          const w = ent as WallDef;
          world.addWall(zoneId, {
            ...w, id,
            startNodeId: mapNode(w.startNodeId),
            endNodeId:   mapNode(w.endNodeId),
            openings:    w.openings.map(o => ({ ...o, id: uuid() })),
          });
          break;
        }
        case "floor": {
          const f  = ent as FloorDef;
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
          const p = ent as PlatformDef;
          world.addPlatform(zoneId, {
            ...p, id,
            position: off3(p.position, dx, dz),
            nodeIds:  p.nodeIds ? p.nodeIds.map(mapNode) : p.nodeIds,
            points:   p.points  ? p.points.map(pt => off2(pt, dx, dz)) : p.points,
          });
          break;
        }
        case "stair": {
          const s = ent as StairDef;
          world.addStair(zoneId, { ...s, id, start: off3(s.start, dx, dz), end: off3(s.end, dx, dz) });
          break;
        }
        case "object": {
          const o = ent as WorldObject;
          world.addObject(zoneId, { ...o, id, position: off3(o.position, dx, dz) });
          break;
        }
        case "trigger-volume": {
          const v = ent as TriggerVolume;
          world.addTriggerVolume(zoneId, { ...v, id, position: off3(v.position, dx, dz) });
          break;
        }
      }
    }
  });

  return primaryId ? { type: clip.type, id: primaryId } : null;
}
