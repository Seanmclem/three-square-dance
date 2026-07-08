import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ShapeBuilder, isFaceBrush } from "@/builders/ShapeBuilder";
import type { WorldState } from "@/world/WorldState";
import type { AttachedCollider, SelectedRef, ShapeDef, Vec3 } from "@/types";

const DEG2RAD = Math.PI / 180;

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
 * Colliders: one per source shape, exact in every case (Phase 27/27b) — convex
 * hulls for parametric/cloud sources (localHullPoints through the full rotation
 * into asset space), TRIMESH for face-brush sources (parity with their live
 * collider, so carved alcoves/steps keep their concavity in the baked copy).
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

  // 4. Compound colliders (asset-local space): trimesh for face-brushes (exact
  // concave, matching their live collider), convex hull for everything else.
  const colliders = picks.map(({ shape }, i) =>
    isFaceBrush(shape) ? shapeTrimeshCollider(shape, pivot, i) : shapeHullCollider(shape, pivot, i));

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

/**
 * One convex-hull collider for a source shape, in asset-local space: the shape's
 * hull points carried through its FULL rotation + position, pivot subtracted —
 * exact for any tilt. size stores the points' AABB (panel display only).
 */
function shapeHullCollider(shape: ShapeDef, pivot: THREE.Vector3, index: number): AttachedCollider {
  const pts = ShapeBuilder.localHullPoints(shape);
  const rot = new THREE.Euler(shape.rotation.x * DEG2RAD, shape.rotation.y * DEG2RAD, shape.rotation.z * DEG2RAD, "XYZ");
  const base = new THREE.Vector3(shape.position.x, shape.position.y, shape.position.z).sub(pivot);

  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const points: Vec3[] = [];
  for (let i = 0; i < pts.length; i += 3) {
    v.set(pts[i]!, pts[i + 1]!, pts[i + 2]!).applyEuler(rot).add(base);
    box.expandByPoint(v);
    points.push({ x: round4(v.x), y: round4(v.y), z: round4(v.z) });
  }
  const size = new THREE.Vector3();
  box.getSize(size);

  return {
    id:       `col_bake_${index}`,
    shape:    "hull",
    offset:   { x: 0, y: 0, z: 0 },
    size:     { x: round4(size.x), y: round4(size.y), z: round4(size.z) },
    isSensor: false,
    points,
  };
}

/**
 * One trimesh collider for a face-brush source (Phase 27b): the brush's own
 * vertices + fan indices (ShapeBuilder.localTrimesh — the same data its live
 * collider uses) carried through the full rotation into asset space.
 */
function shapeTrimeshCollider(shape: ShapeDef, pivot: THREE.Vector3, index: number): AttachedCollider {
  const tm = ShapeBuilder.localTrimesh(shape);
  const rot = new THREE.Euler(shape.rotation.x * DEG2RAD, shape.rotation.y * DEG2RAD, shape.rotation.z * DEG2RAD, "XYZ");
  const base = new THREE.Vector3(shape.position.x, shape.position.y, shape.position.z).sub(pivot);

  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const points: Vec3[] = [];
  for (let i = 0; i < tm.vertices.length; i += 3) {
    v.set(tm.vertices[i]!, tm.vertices[i + 1]!, tm.vertices[i + 2]!).applyEuler(rot).add(base);
    box.expandByPoint(v);
    points.push({ x: round4(v.x), y: round4(v.y), z: round4(v.z) });
  }
  const size = new THREE.Vector3();
  box.getSize(size);

  return {
    id:       `col_bake_${index}`,
    shape:    "trimesh",
    offset:   { x: 0, y: 0, z: 0 },
    size:     { x: round4(size.x), y: round4(size.y), z: round4(size.z) },
    isSensor: false,
    points,
    indices:  [...tm.indices],
  };
}

const round4 = (n: number) => +n.toFixed(4);
