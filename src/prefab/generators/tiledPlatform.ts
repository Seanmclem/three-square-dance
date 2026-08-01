import type { PrefabTemplateEntity, PrefabVarValue, WorldObject } from "@/types";
import type { PrefabGenerator } from "@/prefab/generators";

// Tiled platform generator (Phase 44) — the DynamicPlatform reimplementation.
// Lays a width×depth grid of the Phase-43 kit tiles: corners at the 4 grid
// corners, side tiles along the edges, center tiles inside. Tiles are 2×2×2
// with the walkable top at tile-origin.y + 1, so an instance placed at ground
// level is walked on at y = origin.y + 1.
//
// Height (layers) grows DOWNWARD from the walk surface — the top stays at
// origin.y + 1 and extra 2m bands stack below it, using the kit's vertical
// set: *_tall top edges, repeating *_center_tall middle edges, *_bottom_tall
// bottom edges, flat top/underside sheets for interior cells (hollow middle —
// interior middle bands emit no member at all). Height 1 emits exactly the
// legacy single-height output, byte-identical memberKeys included.
//
// Tile orientation (measured from the models): at rotY 0 a Corner's outward
// skirt faces are −X and +Z; a Side's outward face is +Z. Rotations below point
// each tile's skirt out of the platform.

const PITCH = 2;
const LAYER = 2;   // vertical pitch — every kit piece spans 2m of height

type Band = "single" | "top" | "middle" | "bottom";

/** Kit piece for a grid role at a vertical band — null = no piece (hollow interior).
 *
 *  Both sets stack the same way; only the TOP band differs. The kit's
 *  `platform_grass_*_center_tall` / `*_bottom_tall` pieces carry no green at all
 *  (materials are Dirt_1/2/3) — they ARE the dirt body of a grass platform, and
 *  they have no top face, so they stack seamlessly. Dirt must reuse them for
 *  everything below the cap: `platform_dirt_*_tall` carries a beveled top rim
 *  meant to end a platform, so repeating it per band stacked a rounded lip and a
 *  shadow gap at every layer boundary. The interior cap is likewise a flat sheet
 *  (`platform_dirt_center`), not the `_tall` side-band piece — whose Dirt_1 is
 *  20% darker than every other tile in the kit and left a dark square mid-platform. */
function assetFor(set: "grass" | "dirt", role: "corner" | "side" | "center", band: Band): string | null {
  if (band === "single") return `platform_${set}_${role}`;
  if (set === "dirt") {
    if (role === "center") {
      if (band === "top")    return "platform_dirt_center";        // flat dirt cap
      if (band === "bottom") return "platform_grass_bottom_tall";  // flat underside sheet
      return null;
    }
    if (band === "top") return `platform_dirt_${role}_tall`;
    if (band === "bottom") return `platform_grass_${role}_bottom_tall`;
    return `platform_grass_${role}_center_tall`;
  }
  if (role === "center") {
    if (band === "top")    return "platform_grass_center_tall";   // flat grass sheet
    if (band === "bottom") return "platform_grass_bottom_tall";   // flat underside sheet
    return null;
  }
  if (band === "top")    return `platform_grass_${role}_tall`;
  if (band === "bottom") return `platform_grass_${role}_bottom_tall`;
  return `platform_grass_${role}_center_tall`;
}

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
    { name: "width",   label: "Width (tiles)",   type: "number", default: 3, min: 2, max: 32, step: 1 },
    { name: "depth",   label: "Depth (tiles)",   type: "number", default: 3, min: 2, max: 32, step: 1 },
    { name: "height",  label: "Height (layers)", type: "number", default: 1, min: 1, max: 8,  step: 1 },
    { name: "tileSet", label: "Tile set",        type: "choice", default: "grass", options: ["grass", "dirt"] },
  ],
  expand(vars: Record<string, PrefabVarValue>): PrefabTemplateEntity[] {
    const w   = Math.max(2, Math.min(32, Math.round(Number(vars.width ?? 3))));
    const d   = Math.max(2, Math.min(32, Math.round(Number(vars.depth ?? 3))));
    const h   = Math.max(1, Math.min(8,  Math.round(Number(vars.height ?? 1))));
    const set = vars.tileSet === "dirt" ? "dirt" : "grass";
    const out: PrefabTemplateEntity[] = [];
    for (let k = 0; k < h; k++) {
      const band: Band = h === 1 ? "single" : k === 0 ? "top" : k === h - 1 ? "bottom" : "middle";
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < d; j++) {
          const { role, rotY } = tileRole(i, j, w, d);
          const assetId = assetFor(set, role, band);
          if (!assetId) continue;   // hollow interior band
          // Top layer keeps the legacy key so height edits diff-update in place.
          const key = k === 0 ? `tile_${i}_${j}` : `tile_${i}_${j}_L${k}`;
          const def: WorldObject = {
            id:       key,   // template-local id; replaced on instantiation
            label:    `Tile ${i},${j}${k > 0 ? ` L${k}` : ""}`,
            assetId,
            position: { x: (i - (w - 1) / 2) * PITCH, y: -k * LAYER, z: (j - (d - 1) / 2) * PITCH },
            rotation: { x: 0, y: rotY, z: 0 },
            scale:    { x: 1, y: 1, z: 1 },
            floor:    0,
            properties: { interactable: false, npcSpawn: false, lootTableId: null, triggerEventId: null },
          };
          out.push({ memberKey: key, type: "object", def });
        }
      }
    }
    return out;
  },
};
