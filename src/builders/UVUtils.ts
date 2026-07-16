import * as THREE from "three";

/**
 * Phase 10.8 — World-Space UV convention.
 *
 * Every builder bakes UVs proportional to physical size (meters), so texture
 * density is consistent regardless of face size. The single convention is
 * DIVISION: `UV = meters / tileScale`, i.e. tileScale means "meters per repeat".
 *
 *   tileScale 1.0 → one repeat per meter (default)
 *   tileScale 2.0 → one repeat per 2 meters (texture appears larger)
 *   tileScale 0.5 → two repeats per meter (texture appears smaller/denser)
 *
 * Tiling is never applied via `texture.repeat` — it is baked into UV
 * coordinates at build time. `wrapS/wrapT` are RepeatWrapping (set in
 * AssetManager) so baked UVs > 1 tile correctly.
 */

/** Meters → UV repeats under the world-space division convention. */
export function worldUV(meters: number, tileScale: number): number {
  return meters / tileScale;
}

/**
 * Generate world-space UVs for arbitrary geometry by projecting vertex
 * positions onto a plane and dividing by tileScale. Used for polygon floors,
 * polygon platform caps, and other projection-friendly faces.
 *
 * @param axis  plane to project onto: 'xz' (floors/caps), 'xy' or 'zy' (walls)
 */
export function applyProjectedUVs(
  geometry: THREE.BufferGeometry,
  axis: "xz" | "xy" | "zy",
  tileScaleX = 1.0,
  tileScaleY = tileScaleX,
): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u: number, v: number;
    if (axis === "xz") { u = x / tileScaleX; v = z / tileScaleY; }
    else if (axis === "xy") { u = x / tileScaleX; v = y / tileScaleY; }
    else { u = z / tileScaleX; v = y / tileScaleY; }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/**
 * Deterministic [0,1) from a string key + integer lanes (FNV-1a + avalanche).
 * Builders must never use Math.random — editor and runtime rebuild geometry
 * independently and must produce identical UVs.
 */
export function hash01(key: string, ...lanes: number[]): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (const n of lanes) {
    h ^= (n + 0x9e3779b9) >>> 0;
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Shift all UV coordinates by (offsetX, offsetY). Offsets are in repeat units —
 * 0.5 is half a texture tile, values wrap (1.1 ≡ 0.1), negatives work.
 * All maps share UV channel 0, so one offset shifts every map in sync.
 * No-op when both offsets are 0.
 */
export function applyUVOffset(
  geometry: THREE.BufferGeometry,
  offsetX: number,
  offsetY: number,
): void {
  if (offsetX === 0 && offsetY === 0) return;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) + offsetX, uv.getY(i) + offsetY);
  }
  uv.needsUpdate = true;
}
