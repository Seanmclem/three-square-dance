import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { DecalDef, Vec3 } from "@/types";

// Pure geometry/material helpers for OVERLAY decals (DecalGeometry meshes).
// Surface-effect decals (in-shader projection) live in surfaceDecals.ts (Phase 21).

export interface DecalTextures {
  map:           THREE.Texture;
  normalMap?:    THREE.Texture;
  roughnessMap?: THREE.Texture;
}

const _zAxis = new THREE.Vector3(0, 0, 1);

/** Default projector depth when DecalDef.depth is absent. */
export function decalDepth(def: DecalDef): number {
  return def.depth ?? Math.max(0.2, Math.max(def.size.width, def.size.height) * 0.5);
}

/**
 * Projector orientation: +Z aligned to the surface normal (DecalGeometry projects
 * along its local Z), then rolled `rollDeg` around that normal.
 */
export function decalOrientation(normal: Vec3, rollDeg: number): THREE.Euler {
  const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_zAxis, n);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(_zAxis, rollDeg * Math.PI / 180));
  return new THREE.Euler().setFromQuaternion(q);
}

/** World AABB of the decal's oriented projector box (used for target/dirty tests). */
export function decalProjectorBox(def: DecalDef): THREE.Box3 {
  const euler = decalOrientation(def.normal, def.rotation);
  const m = new THREE.Matrix4().makeRotationFromEuler(euler)
    .setPosition(def.position.x, def.position.y, def.position.z);
  const hw = def.size.width / 2, hh = def.size.height / 2, hd = decalDepth(def) / 2;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    box.expandByPoint(v.set(sx * hw, sy * hh, sz * hd).applyMatrix4(m));
  return box;
}

/**
 * Project the decal onto every target whose world AABB intersects the projector
 * box and merge the clipped results into one world-space mesh. Multi-target merge
 * is what lets one stamp wrap a mitered corner shared by two runs or bridge a
 * wall/floor junction. Returns null when no triangles were clipped (geometry moved
 * away from the anchor) — caller keeps the def and simply skips the mesh.
 */
export function buildOverlayDecalMesh(
  def:         DecalDef,
  targets:     THREE.Mesh[],
  textures:    DecalTextures,
  zoneId:      string,
  renderOrder: number,
): THREE.Mesh | null {
  const projBox = decalProjectorBox(def);
  const pos     = new THREE.Vector3(def.position.x, def.position.y, def.position.z);
  const euler   = decalOrientation(def.normal, def.rotation);
  const size    = new THREE.Vector3(def.size.width, def.size.height, decalDepth(def));

  const pieces:    THREE.BufferGeometry[] = [];
  const targetIds: string[] = [];
  const targetBox = new THREE.Box3();
  for (const target of targets) {
    target.updateWorldMatrix(true, false);
    targetBox.setFromObject(target);
    if (!projBox.intersectsBox(targetBox)) continue;
    const geo = new DecalGeometry(target, pos, euler, size);
    if (!geo.attributes["position"] || geo.attributes["position"]!.count === 0) {
      geo.dispose();
      continue;
    }
    pieces.push(geo);
    const u = target.userData as { editorId?: string; wallIds?: string[] };
    if (u.editorId) targetIds.push(u.editorId);
    if (Array.isArray(u.wallIds)) targetIds.push(...u.wallIds);
  }
  if (pieces.length === 0) return null;

  const merged = pieces.length === 1 ? pieces[0]! : mergeGeometries(pieces);
  if (pieces.length > 1) for (const p of pieces) p.dispose();
  if (!merged) return null;

  const mat = new THREE.MeshStandardMaterial({
    map:          textures.map,
    transparent:  true,
    opacity:      def.opacity,
    depthWrite:   false,
    // -4 beats the wall liner meshes' -1/-1 so decals draw over CSG passage liners too.
    polygonOffset:       true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits:  -4,
    roughness: 0.9,
    metalness: 0,
  });
  if (textures.normalMap)    mat.normalMap    = textures.normalMap;
  if (textures.roughnessMap) mat.roughnessMap = textures.roughnessMap;

  const mesh = new THREE.Mesh(merged, mat);   // DecalGeometry output is world-space
  mesh.renderOrder   = renderOrder;
  mesh.castShadow    = false;
  mesh.receiveShadow = true;
  mesh.userData = {
    editorId: def.id, editorType: "decal", zoneId,
    selectable: true, floorLevel: 0, _ownsMaterial: true,
    // Entity ids this decal projected onto — used to catch "target moved away"
    // on *:rebuilt (the new AABB no longer intersects, but the stale mesh must go).
    _decalTargets: targetIds,
  };
  return mesh;
}
