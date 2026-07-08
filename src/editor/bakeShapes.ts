import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ShapeBuilder } from "@/builders/ShapeBuilder";
import type { WorldState } from "@/world/WorldState";
import type { AttachedCollider, SelectedRef, ShapeDef, Vec3 } from "@/types";

const DEG2RAD = Math.PI / 180;
/** Rotations within this many degrees of upright count as yaw-only (exact box collider). */
const TILT_EPS_DEG = 0.01;

export interface BakeResult {
  glb:       ArrayBuffer;
  /** The merged render group (pivot at base center) — render a thumbnail from it, then dispose via disposeBakeGroup. */
  group:     THREE.Group;
  /** Compound colliders in asset-local space, one box per source shape. */
  colliders: AttachedCollider[];
  /** Asset-local AABB size (for callers that want the auto-box fallback). */
  size:      Vec3;
}

/**
 * Bake a selection of shapes/brushes into a single GLB (Phase 26).
 *
 * Geometry: fresh ShapeBuilder.buildMeshes() output (pristine registry materials —
 * never the selection-tinted scene clones), each mesh's transform baked into a
 * geometry clone, everything re-pivoted to the selection's base center
 * (bbox centerX/minY/centerZ) so the asset sits on surfaces, then merged by
 * material reference — the draw-call win: one mesh per distinct material.
 *
 * Colliders: one box per source shape. Yaw-only shapes get an exact local box
 * with rotationY; tilted shapes fall back to their asset-space AABB
 * (AttachedCollider can't express XZ tilt — "hull" stays reserved).
 *
 * Material fidelity: albedo/normal/roughness/metalness/AO and the baked metric
 * UVs survive export; displacement maps have no glTF 2.0 slot and are dropped
 * (visually negligible on low-poly brush geometry).
 */
export async function bakeShapes(world: WorldState, refs: SelectedRef[]): Promise<BakeResult> {
  const picks: Array<{ shape: ShapeDef; zoneId: string }> = [];
  for (const ref of refs) {
    if (ref.type !== "shape") continue;
    const shape = world.zones.get(ref.zoneId)?.shapes?.find(s => s.id === ref.id);
    if (shape) picks.push({ shape, zoneId: ref.zoneId });
  }
  if (picks.length === 0) throw new Error("bakeShapes: selection contains no shapes");

  // 1. Build meshes and bake each mesh's world transform into a geometry clone.
  const parts: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }> = [];
  for (const { shape, zoneId } of picks) {
    const meshes = await ShapeBuilder.buildMeshes(shape, zoneId);
    for (const mesh of meshes) {
      if (!mesh.geometry.getAttribute("position")?.count) continue;   // empty split half
      mesh.updateMatrix();
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      parts.push({ geo, mat: mesh.material as THREE.Material });
    }
  }
  if (parts.length === 0) throw new Error("bakeShapes: no geometry produced");

  // 2. Pivot: combined AABB → origin at base center.
  const bounds = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    bounds.union(p.geo.boundingBox!);
  }
  const pivot = new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    bounds.min.y,
    (bounds.min.z + bounds.max.z) / 2,
  );
  for (const p of parts) p.geo.translate(-pivot.x, -pivot.y, -pivot.z);

  // 3. Merge by material reference. Registry materials are shared instances, so
  // same-material shapes collapse into one mesh; per-shape override materials are
  // distinct instances and correctly stay separate. Normalize to non-indexed
  // position/normal/uv so mergeGeometries never hits an attribute mismatch.
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) {
    const geo = normalizeForMerge(p.geo);
    const list = byMat.get(p.mat) ?? [];
    list.push(geo);
    byMat.set(p.mat, list);
  }

  const group = new THREE.Group();
  group.name = "baked-shapes";
  for (const [mat, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) throw new Error("bakeShapes: geometry merge failed (attribute mismatch)");
    if (geos.length > 1) geos.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // 4. Compound colliders (asset-local space, one box per source shape).
  const colliders = picks.map(({ shape }, i) => shapeBoxCollider(shape, pivot, i));

  // 5. Export binary glTF. Textures embed; RepeatWrapping samplers preserve tiling.
  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(group, { binary: true })) as ArrayBuffer;

  const size = new THREE.Vector3();
  bounds.getSize(size);
  return { glb, group, colliders, size: { x: size.x, y: size.y, z: size.z } };
}

/** Dispose the merged geometries (materials are shared registry instances — leave them). */
export function disposeBakeGroup(group: THREE.Group): void {
  group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
}

/** Drop non-standard attributes and de-index so any mix of shape geometries merges. */
function normalizeForMerge(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.index ? geo.toNonIndexed() : geo;
  if (out !== geo) geo.dispose();
  for (const name of Object.keys(out.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") out.deleteAttribute(name);
  }
  out.morphAttributes = {};
  return out;
}

/** One box collider for a source shape, in asset-local space (pivot subtracted). */
function shapeBoxCollider(shape: ShapeDef, pivot: THREE.Vector3, index: number): AttachedCollider {
  const pts = ShapeBuilder.localHullPoints(shape);
  const yawOnly = Math.abs(shape.rotation.x) < TILT_EPS_DEG && Math.abs(shape.rotation.z) < TILT_EPS_DEG;

  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  if (yawOnly) {
    // Local AABB of the shape's own geometry — exact under yaw (rotationY carries it).
    for (let i = 0; i < pts.length; i += 3) box.expandByPoint(v.set(pts[i]!, pts[i + 1]!, pts[i + 2]!));
  } else {
    // Tilted: conservative AABB of the fully rotated points in asset space.
    const rot = new THREE.Euler(shape.rotation.x * DEG2RAD, shape.rotation.y * DEG2RAD, shape.rotation.z * DEG2RAD, "XYZ");
    for (let i = 0; i < pts.length; i += 3) box.expandByPoint(v.set(pts[i]!, pts[i + 1]!, pts[i + 2]!).applyEuler(rot));
  }
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  // Offset = shape origin in asset space + the box center carried through the
  // shape's yaw (yaw-only case; tilted centers are already in asset orientation).
  const offset = yawOnly
    ? center.applyEuler(new THREE.Euler(0, shape.rotation.y * DEG2RAD, 0))
    : center;
  offset.add(new THREE.Vector3(shape.position.x, shape.position.y, shape.position.z)).sub(pivot);

  return {
    id:       `col_bake_${index}`,
    shape:    "box",
    offset:   { x: round4(offset.x), y: round4(offset.y), z: round4(offset.z) },
    size:     { x: round4(size.x),   y: round4(size.y),   z: round4(size.z) },
    ...(yawOnly && Math.abs(shape.rotation.y) > 1e-4 ? { rotationY: shape.rotation.y } : {}),
    isSensor: false,
  };
}

const round4 = (n: number) => +n.toFixed(4);
