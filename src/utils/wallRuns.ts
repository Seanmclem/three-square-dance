import type { WallDef, ZoneDef, WallNode } from "@/types";

export function buildNodesMap(zone: ZoneDef): Map<string, WallNode> {
  return new Map((zone.nodes ?? []).map(n => [n.id, n]));
}

/** Groups zone walls into compatible runs for merged geometry rendering.
 *  Two walls merge when they share a degree-2 node and have matching
 *  material, exteriorMaterial, and height. */
export function groupWallRuns(zone: ZoneDef, nodes: Map<string, WallNode>): WallDef[][] {
  void nodes; // used only by callers that need geometry; kept for API parity
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

  const canMerge = (w1: WallDef, w2: WallDef, sharedNodeId: string): boolean => {
    if ((nodeWalls.get(sharedNodeId)?.length ?? 0) !== 2) return false;
    if (w1.material         !== w2.material)        return false;
    if (w1.exteriorMaterial !== w2.exteriorMaterial) return false;
    if (w1.height           !== w2.height)           return false;
    const ov1 = w1.materialOverrides, ov2 = w2.materialOverrides;
    if (ov1 !== ov2) {
      if (!ov1 || !ov2)                                         return false;
      if (ov1.tileScale         !== ov2.tileScale)              return false;
      if (ov1.tileScaleX        !== ov2.tileScaleX)             return false;
      if (ov1.tileScaleY        !== ov2.tileScaleY)             return false;
      if (ov1.roughnessVal      !== ov2.roughnessVal)           return false;
      if (ov1.displacementScale !== ov2.displacementScale)      return false;
      if (JSON.stringify(ov1.maps ?? null) !== JSON.stringify(ov2.maps ?? null)) return false;
    }
    return true;
  };

  const visited = new Set<string>();
  const runs: WallDef[][] = [];

  for (const startWall of zone.walls) {
    if (visited.has(startWall.id)) continue;
    visited.add(startWall.id);
    const run: WallDef[] = [startWall];

    // Extend forward from end node
    let forwardNode = startWall.endNodeId;
    let prevId      = startWall.id;
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

    // Extend backward from start node
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

/** Returns the ordered node-ID chain for a connected wall run.
 *  For a closed loop the first and last IDs are identical. */
export function resolveRunNodeIds(walls: WallDef[]): string[] | null {
  if (walls.length === 0) return null;
  if (walls.length === 1) return [walls[0]!.startNodeId, walls[0]!.endNodeId];

  const w0 = walls[0]!, w1 = walls[1]!;
  const w1Nodes = new Set([w1.startNodeId, w1.endNodeId]);

  let nodeIds: string[];
  if      (w1Nodes.has(w0.endNodeId))   nodeIds = [w0.startNodeId, w0.endNodeId];
  else if (w1Nodes.has(w0.startNodeId)) nodeIds = [w0.endNodeId,   w0.startNodeId];
  else return null;

  for (let i = 1; i < walls.length; i++) {
    const prev = nodeIds[nodeIds.length - 1]!;
    const w    = walls[i]!;
    if      (w.startNodeId === prev) nodeIds.push(w.endNodeId);
    else if (w.endNodeId   === prev) nodeIds.push(w.startNodeId);
    else return null;
  }

  return nodeIds;
}
