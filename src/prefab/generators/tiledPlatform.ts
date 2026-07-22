import type { PrefabTemplateEntity, PrefabVarValue, WorldObject } from "@/types";
import type { PrefabGenerator } from "@/prefab/generators";

// Tiled platform generator (Phase 44) — the DynamicPlatform reimplementation.
// Lays a width×depth grid of the Phase-43 kit tiles: corners at the 4 grid
// corners, side tiles along the edges, center tiles inside. Tiles are 2×2×2
// with the walkable top at tile-origin.y + 1, so an instance placed at ground
// level is walked on at y = origin.y + 1.
//
// Tile orientation (measured from the models): at rotY 0 a Corner's outward
// skirt faces are −X and +Z; a Side's outward face is +Z. Rotations below point
// each tile's skirt out of the platform.

const PITCH = 2;

/** Local X axis of the grid = width (i), local Z = depth (j). */
function tileRole(i: number, j: number, w: number, d: number): { role: "corner" | "side" | "center"; rotY: number } {
  const minX = i === 0, maxX = i === w - 1, minZ = j === 0, maxZ = j === d - 1;
  if (minX && maxZ) return { role: "corner", rotY: 0 };     // −X/+Z corner (natural)
  if (maxX && maxZ) return { role: "corner", rotY: 90 };    // +X/+Z
  if (maxX && minZ) return { role: "corner", rotY: 180 };   // +X/−Z
  if (minX && minZ) return { role: "corner", rotY: -90 };   // −X/−Z
  if (maxZ) return { role: "side", rotY: 0 };               // +Z edge (natural)
  if (maxX) return { role: "side", rotY: 90 };
  if (minZ) return { role: "side", rotY: 180 };
  if (minX) return { role: "side", rotY: -90 };
  return { role: "center", rotY: 0 };
}

export const tiledPlatform: PrefabGenerator = {
  id:    "tiled-platform",
  label: "Tiled Platform",
  variables: [
    { name: "width",   label: "Width (tiles)", type: "number", default: 3, min: 2, max: 32, step: 1 },
    { name: "depth",   label: "Depth (tiles)", type: "number", default: 3, min: 2, max: 32, step: 1 },
    { name: "tileSet", label: "Tile set",      type: "choice", default: "grass", options: ["grass", "dirt"] },
  ],
  expand(vars: Record<string, PrefabVarValue>): PrefabTemplateEntity[] {
    const w   = Math.max(2, Math.min(32, Math.round(Number(vars.width ?? 3))));
    const d   = Math.max(2, Math.min(32, Math.round(Number(vars.depth ?? 3))));
    const set = vars.tileSet === "dirt" ? "dirt" : "grass";
    const out: PrefabTemplateEntity[] = [];
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        const { role, rotY } = tileRole(i, j, w, d);
        const def: WorldObject = {
          id:       `tile_${i}_${j}`,   // template-local id; replaced on instantiation
          label:    `Tile ${i},${j}`,
          assetId:  `platform_${set}_${role}`,
          position: { x: (i - (w - 1) / 2) * PITCH, y: 0, z: (j - (d - 1) / 2) * PITCH },
          rotation: { x: 0, y: rotY, z: 0 },
          scale:    { x: 1, y: 1, z: 1 },
          floor:    0,
          properties: { interactable: false, npcSpawn: false, lootTableId: null, triggerEventId: null },
        };
        out.push({ memberKey: `tile_${i}_${j}`, type: "object", def });
      }
    }
    return out;
  },
};
