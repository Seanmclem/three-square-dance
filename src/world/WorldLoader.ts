import type { ZoneDef, WallNode } from "@/types";

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
