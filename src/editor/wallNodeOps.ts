import type { WorldState } from "@/world/WorldState";
import type { Opening, WallDef } from "@/types";

type MergePlan =
  | { a: WallDef; b: WallDef; farB: string }
  | { reason: string };

/**
 * Can this corner be removed, merging its two walls into one? Only a node joining
 * exactly two walls, used by no floor or platform outline, whose far ends differ.
 * `a` is the wall that keeps its id and settings (the one ending at the node when
 * there is one, so the merged wall keeps the run's direction).
 */
export function nodeMergePlan(world: WorldState, zoneId: string, nodeId: string): MergePlan {
  const zone = world.zones.get(zoneId);
  if (!zone) return { reason: "No zone" };
  const links = world.getNodeLinks(zoneId, nodeId);
  if (links.floorIds.length || links.platformIds.length)
    return { reason: "A floor or platform outline uses this corner" };
  const walls = links.wallIds.map(id => zone.walls.find(w => w.id === id)!).filter(Boolean);
  if (walls.length !== 2) return { reason: `This corner joins ${walls.length} walls; only one between two walls can be removed` };
  const a = walls.find(w => w.endNodeId === nodeId) ?? walls[0];
  const b = walls.find(w => w !== a)!;
  const farA = a.startNodeId === nodeId ? a.endNodeId : a.startNodeId;
  const farB = b.startNodeId === nodeId ? b.endNodeId : b.startNodeId;
  if (farA === farB) return { reason: "The two walls meet at both ends" };
  return { a, b, farB };
}

/**
 * Remove a corner between two walls: wall `a` now runs to `b`'s far end, `b` and the
 * node are deleted, and every door / window keeps its place along the merged wall
 * (re-measured from the merged wall's start; exact when the walls were in line).
 * One undo step. Returns the merged wall's id, or the reason it can't be done.
 */
export function mergeWallsAtNode(world: WorldState, zoneId: string, nodeId: string): { wallId: string } | { reason: string } {
  const plan = nodeMergePlan(world, zoneId, nodeId);
  if ("reason" in plan) return plan;
  const { a, b, farB } = plan;
  const zone = world.zones.get(zoneId)!;
  const pos = (id: string) => zone.nodes.find(n => n.id === id)!;

  const merged = a.endNodeId === nodeId
    ? { startNodeId: a.startNodeId, endNodeId: farB }
    : { startNodeId: farB, endNodeId: a.endNodeId };
  const s = pos(merged.startNodeId), e = pos(merged.endNodeId);
  const len = Math.hypot(e.x - s.x, e.z - s.z);
  const ux = (e.x - s.x) / (len || 1), uz = (e.z - s.z) / (len || 1);

  // Each opening's centre in world XZ, projected onto the merged wall.
  const reMeasure = (w: WallDef, o: Opening): Opening => {
    const ws = pos(w.startNodeId), we = pos(w.endNodeId);
    const wl = Math.hypot(we.x - ws.x, we.z - ws.z) || 1;
    const c = o.offsetAlongWall + o.width / 2;
    const cx = ws.x + (we.x - ws.x) / wl * c, cz = ws.z + (we.z - ws.z) / wl * c;
    const t = (cx - s.x) * ux + (cz - s.z) * uz;
    return { ...o, offsetAlongWall: Math.max(0, Math.min(len - o.width, t - o.width / 2)) };
  };
  const openings = [...a.openings.map(o => reMeasure(a, o)), ...b.openings.map(o => reMeasure(b, o))];

  world.transaction("remove wall node", () => {
    world.updateWallSegment(zoneId, a.id, { ...merged, openings });
    world.removeWall(zoneId, b.id);
    world.removeNode(zoneId, nodeId);
  });
  return { wallId: a.id };
}
