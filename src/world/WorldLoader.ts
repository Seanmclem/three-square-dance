import type { ZoneDef, WallNode } from "@/types";

/**
 * Remove nodes not referenced by any wall, floor, or platform. Returns count pruned.
 *
 * Polygon platforms/floors are node-backed (corners live in `zone.nodes`), but
 * `removePlatform`/`removeFloor` only drop the entity — their nodes are orphaned and
 * `NodeDragger` keeps drawing a dot + edge line for each. This reaps those orphans;
 * shared nodes (still referenced elsewhere) are kept.
 */
export function pruneOrphanNodes(zone: ZoneDef): number {
  if (!zone.nodes?.length) return 0;
  const ref = new Set<string>();
  for (const w of zone.walls)     { ref.add(w.startNodeId); ref.add(w.endNodeId); }
  for (const f of zone.floors)    f.floorMesh.nodeIds?.forEach(id => ref.add(id));
  for (const p of zone.platforms) p.nodeIds?.forEach(id => ref.add(id));
  const before = zone.nodes.length;
  zone.nodes = zone.nodes.filter(n => ref.has(n.id));
  return before - zone.nodes.length;
}

/** Migrates a parsed scene JSON from old `start`/`end` wall format to node-based. */
export function migrateWallNodes(zones: ZoneDef[]): void {
  for (const zone of zones) {
    if (!zone.nodes) zone.nodes = [];

    for (const wall of zone.walls) {
      const legacy = wall as unknown as Record<string, unknown>;
      if (!("startNodeId" in wall) && "start" in legacy && "end" in legacy) {
        const s = legacy["start"] as { x: number; z: number };
        const e = legacy["end"]   as { x: number; z: number };

        const findOrCreate = (x: number, z: number): WallNode => {
          const existing = zone.nodes.find(
            n => Math.abs(n.x - x) < 0.001 && Math.abs(n.z - z) < 0.001,
          );
          if (existing) return existing;
          const node: WallNode = { id: crypto.randomUUID(), x, z };
          zone.nodes.push(node);
          return node;
        };

        const startNode = findOrCreate(s.x, s.z);
        const endNode   = findOrCreate(e.x, e.z);

        (wall as unknown as Record<string, unknown>)["startNodeId"] = startNode.id;
        (wall as unknown as Record<string, unknown>)["endNodeId"]   = endNode.id;
        delete legacy["start"];
        delete legacy["end"];
      }
    }
  }
}
